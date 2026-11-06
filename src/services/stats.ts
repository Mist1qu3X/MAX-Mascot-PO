/**
 * Статистика: пишем локально и отправляем на сервер.
 *
 * Локальная запись первична — событие сначала ложится в очередь в
 * localStorage и только потом уходит в сеть. Если интернета нет,
 * очередь копится и разбирается пачкой, когда связь вернётся.
 *
 * Это события сценария (запуск, съёмка, экраны). Сводка по генерациям —
 * номер, время, статус — ведётся отдельно, в CSV и в нашей базе:
 * см. `generations.ts`.
 */

const ENDPOINT = import.meta.env.VITE_STATS_ENDPOINT ?? 'https://event-stats.alavenir.tech/api'
/**
 * В режиме без генерации (`npm run dev:mock`) на сервер ничего не уходит:
 * прогоны при правке вёрстки — не посетители. Локальный журнал остаётся.
 */
const API_KEY = import.meta.env.MODE === 'mock' ? '' : (import.meta.env.VITE_STATS_API_KEY ?? '')

const ZONE = 'max_digital_maskot'
const ZONE_NUMBER = 1

const QUEUE_KEY = 'max.stats.queue'
const LOG_KEY = 'max.stats.log'

/** Сколько событий уходит одним запросом. */
const BATCH_SIZE = 50
/** Сколько последних событий держим в локальном журнале. */
const LOG_LIMIT = 2000
/** Как часто пробуем разобрать очередь. */
const FLUSH_INTERVAL_MS = 30_000

type QueuedEvent = {
  zone: string
  zone_number: number
  question: string
  answer: string
  user_id: string
  meta?: Record<string, unknown>
  /** Время события на панели — сервер ставит своё, но нам важно и наше. */
  at: string
}

/** Одна сессия = один посетитель, по нему события и группируются. */
let sessionId = newSessionId()

function newSessionId() {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Новая сессия — вызывать при возврате на приветствие. */
export function startSession() {
  sessionId = newSessionId()
  return sessionId
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Хранилище переполнено или недоступно — не роняем из-за этого экран.
  }
}

let flushing = false
let timer: number | undefined

async function flush(): Promise<void> {
  if (flushing) return
  const queue = read<QueuedEvent[]>(QUEUE_KEY, [])
  if (queue.length === 0 || !API_KEY) return

  flushing = true
  try {
    const batch = queue.slice(0, BATCH_SIZE)
    const response = await fetch(`${ENDPOINT}/events/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: API_KEY,
        events: batch.map(({ at: _at, ...event }) => event),
      }),
    })

    if (response.ok) {
      // Пачка вставляется целиком либо никак, так что снимаем ровно её.
      const rest = read<QueuedEvent[]>(QUEUE_KEY, []).slice(batch.length)
      write(QUEUE_KEY, rest)
      if (rest.length > 0) void flush()
      return
    }

    // 4xx — событие серверу не нравится, повторять бессмысленно: выкидываем,
    // иначе очередь встанет навсегда. 5xx и сеть — оставляем на потом.
    if (response.status >= 400 && response.status < 500) {
      write(QUEUE_KEY, read<QueuedEvent[]>(QUEUE_KEY, []).slice(batch.length))
    }
  } catch {
    // Сети нет — очередь остаётся, разберём в следующий раз.
  } finally {
    flushing = false
  }
}

/**
 * Записать событие. В `question` — шаг сценария, в `answer` — что произошло.
 */
export function track(question: string, answer: string, meta?: Record<string, unknown>) {
  const event: QueuedEvent = {
    zone: ZONE,
    zone_number: ZONE_NUMBER,
    question: question.slice(0, 200),
    answer,
    user_id: sessionId,
    ...(meta ? { meta } : {}),
    at: new Date().toISOString(),
  }

  const log = read<QueuedEvent[]>(LOG_KEY, [])
  log.push(event)
  write(LOG_KEY, log.slice(-LOG_LIMIT))

  write(QUEUE_KEY, [...read<QueuedEvent[]>(QUEUE_KEY, []), event])
  void flush()
}

/** Сколько событий ждёт отправки — удобно показать в отладке. */
export function pendingCount() {
  return read<QueuedEvent[]>(QUEUE_KEY, []).length
}

/** Весь локальный журнал — на случай, если статистику собирают руками. */
export function localLog() {
  return read<QueuedEvent[]>(LOG_KEY, [])
}

export function startStats() {
  if (timer !== undefined) return
  void flush()
  timer = window.setInterval(() => void flush(), FLUSH_INTERVAL_MS)
  window.addEventListener('online', () => void flush())
}
