/**
 * Статистика генераций: одна строка на одну генерацию маскота — номер,
 * начало, конец, длительность и чем кончилось.
 *
 * Пишется в два места:
 *   - `generations.csv` рядом с приложением (только под Neutralino) — его
 *     можно забрать с панели флешкой и открыть в Excel;
 *   - в MySQL через наш сервер (`POST /stats/generations`): сама база
 *     доступна только из контейнеров на хостинге, панель до неё не достаёт.
 *
 * Строка сначала ложится в очередь в localStorage и только потом уходит в
 * сеть: нет интернета — очередь копится и уходит пачкой, когда связь
 * вернётся. Повторная отправка строку не задвоит: у каждой свой uid, и
 * сервер второй раз её не вставит.
 */

import { desktop, filesystem } from './desktop'
import { RELAY, relayHeaders } from '../relay'
import { modelLabel, type FailureReason } from './kie'

export type GenerationStatus = 'success' | 'cancelled' | `error:${FailureReason}`

type GenerationRow = {
  uid: string
  /** `panel` — приложение на панели, `web` — веб-версия в браузере. */
  source: 'panel' | 'web'
  number: number
  /** ISO, UTC. */
  startedAt: string
  finishedAt: string
  status: GenerationStatus
  /** id модели на kie.ai, см. MODELS в kie.ts. */
  model?: string
}

const ENDPOINT = `${RELAY}/stats/generations`
/**
 * Заглушка (`npm run dev:mock`) ничего не отправляет: прогоны при правке
 * вёрстки — не посетители.
 */
const SEND = import.meta.env.MODE !== 'mock'

const COUNTER_KEY = 'max.generations.counter'
const QUEUE_KEY = 'max.generations.queue'
const BATCH_SIZE = 50
/** Больше не копим: если сервер молчит неделями, старое не так ценно, как память. */
const QUEUE_LIMIT = 5000
const FLUSH_INTERVAL_MS = 60_000

/*
 * CSV — под Excel с русскими настройками: разделитель «;», дробная часть
 * через запятую и BOM в начале, иначе Excel сваливает всё в один столбец
 * и путает кодировку. Время в файле местное — его читают люди на месте;
 * в базу уходит UTC.
 */
const CSV_FILE = 'generations.csv'
const CSV_HEADER = '﻿номер;начало;конец;длительность, с;статус;модель\r\n'
/**
 * Заголовок файла до выбора модели. Такой файл переписываем: новый
 * заголовок, а старым строкам — их модель. До выбора модели генерировала
 * только Nano Banana 2: переопределения нигде не было.
 */
const OLD_HEADER = 'номер;начало;конец;длительность, с;статус'
const OLD_MODEL = 'nano-banana-2'

const STATUS_LABELS: Record<GenerationStatus, string> = {
  success: 'успех',
  cancelled: 'прервана',
  'error:config': 'ошибка: сервис не настроен',
  'error:network': 'ошибка: нет связи',
  'error:policy': 'ошибка: кадр отклонён моделью',
  'error:gesture': 'ошибка: жест на кадре',
  'error:timeout': 'ошибка: не уложились по времени',
  'error:api': 'ошибка: сбой сервиса',
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
    // Хранилище переполнено или недоступно — экран из-за этого не роняем.
  }
}

let lastNumber = read<number>(COUNTER_KEY, 0)
let csvExists = false

/**
 * Номер берём больший из двух: счётчика в localStorage и последней строки
 * CSV. Хранилище webview могут сбросить при переустановке, файл — нет,
 * и нумерация продолжится, а не начнётся с единицы.
 */
const ready: Promise<void> = (async () => {
  const fs = await filesystem()
  if (!fs) return
  let text: string
  try {
    text = await fs.readFile(CSV_FILE)
    csvExists = true
  } catch {
    return // файла ещё нет — первая генерация его создаст
  }
  const last = text.trim().split(/\r?\n/).pop() ?? ''
  const number = Number.parseInt(last.split(';')[0], 10)
  if (Number.isFinite(number)) lastNumber = Math.max(lastNumber, number)

  // Файл от версии без колонки «модель» — дописываем её. Это до первой
  // новой строки: запись ждёт `ready`, так что дописать посреди не успеют.
  const [head, ...rows] = text.split(/\r?\n/)
  if (head.replace(/^﻿/, '') === OLD_HEADER && fs.writeFile) {
    const old = modelLabel(OLD_MODEL)
    const body = rows.map((row) => (row.trim() ? `${row};${old}` : row)).join('\r\n')
    await fs.writeFile(CSV_FILE, CSV_HEADER + body).catch(() => undefined)
  }
})()

function newUid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // randomUUID есть только в защищённом контексте; панель, открытая по
  // адресу из локальной сети, им не считается.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`
}

const pad = (n: number) => String(n).padStart(2, '0')
function localTime(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
    + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Строка CSV — отдельно, чтобы формат можно было проверить без Neutralino. */
export function csvRow(row: GenerationRow) {
  const seconds = (Date.parse(row.finishedAt) - Date.parse(row.startedAt)) / 1000
  return [
    row.number,
    localTime(row.startedAt),
    localTime(row.finishedAt),
    seconds.toFixed(1).replace('.', ','),
    STATUS_LABELS[row.status] ?? row.status,
    row.model ? modelLabel(row.model) : '',
  ].join(';') + '\r\n'
}

/**
 * Пишем строго по одной строке за раз: иначе генерации, закончившиеся
 * почти одновременно (отмена и тут же новый кадр), дописывались бы
 * наперегонки.
 */
let writing: Promise<void> = Promise.resolve()

function appendToCsv(row: GenerationRow) {
  writing = writing.then(async () => {
    const fs = await filesystem()
    if (!fs) return
    if (!csvExists) {
      await fs.appendFile(CSV_FILE, CSV_HEADER)
      csvExists = true
    }
    await fs.appendFile(CSV_FILE, csvRow(row))
  }).catch(() => {
    // Диск недоступен — строка всё равно уйдёт на сервер.
  })
}

let flushing = false

async function flush(): Promise<void> {
  if (flushing || !SEND) return
  flushing = true
  try {
    for (;;) {
      const batch = read<GenerationRow[]>(QUEUE_KEY, []).slice(0, BATCH_SIZE)
      if (batch.length === 0) return
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: relayHeaders(),
        body: JSON.stringify({ rows: batch }),
        signal: AbortSignal.timeout(15_000),
      })
      // 400 — сервер счёл строки негодными; повторять бессмысленно, иначе
      // очередь встанет навсегда. Остальное (401, 404 у старого сервера,
      // 503 без базы, сеть) — оставляем до следующей попытки.
      if (!response.ok && response.status !== 400) return
      // Снимаем по uid, а не срезом: пока шёл запрос, в очередь могли дописать.
      const sent = new Set(batch.map((row) => row.uid))
      write(QUEUE_KEY, read<GenerationRow[]>(QUEUE_KEY, []).filter((row) => !sent.has(row.uid)))
      if (!response.ok) return
    }
  } catch {
    // Сети нет — разберём в следующий раз.
  } finally {
    flushing = false
  }
}

async function record(startedAt: Date, finishedAt: Date, status: GenerationStatus, model?: string) {
  await ready
  const row: GenerationRow = {
    uid: newUid(),
    source: (await desktop) ? 'panel' : 'web',
    number: ++lastNumber,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    status,
    ...(model ? { model } : {}),
  }
  write(COUNTER_KEY, lastNumber)
  appendToCsv(row)

  if (!SEND) {
    console.info('[generations] заглушка, на сервер не уходит:', csvRow(row).trim())
    return
  }
  write(QUEUE_KEY, [...read<GenerationRow[]>(QUEUE_KEY, []), row].slice(-QUEUE_LIMIT))
  void flush()
}

let current: { startedAt: Date; model?: string } | null = null

function finish(status: GenerationStatus) {
  if (!current) return
  const { startedAt, model } = current
  current = null
  void record(startedAt, new Date(), status, model)
}

/**
 * Кадр снят, генерация пошла — на модели `model`. Незакрытая прежняя
 * считается прерванной.
 */
export function beginGeneration(model?: string) {
  finish('cancelled')
  current = { startedAt: new Date(), model }
}

/** Генерация закончилась: результат на экране или ошибка. */
export function endGeneration(status: GenerationStatus) {
  finish(status)
}

/**
 * Ушли с генерации, не дождавшись конца: возврат на приветствие, настройки,
 * выход. Если генерация уже закрыта, ничего не делает.
 */
export function cancelGeneration() {
  finish('cancelled')
}

/** Сколько строк ждёт отправки — для экрана проверки. */
export function pendingGenerations() {
  return read<GenerationRow[]>(QUEUE_KEY, []).length
}

let timer: number | undefined

export function startGenerationStats() {
  if (timer !== undefined) return
  void flush()
  timer = window.setInterval(() => void flush(), FLUSH_INTERVAL_MS)
  window.addEventListener('online', () => void flush())
}
