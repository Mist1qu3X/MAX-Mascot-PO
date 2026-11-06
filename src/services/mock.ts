/**
 * Режим без генерации — для работы над интерфейсом: `npm run dev:mock`.
 *
 * Сценарий идёт как на панели: камера, отсчёт, шкала, результат с QR. Но
 * кадр никуда не уходит — ни на kie.ai, ни на проверку, ни на сервер
 * стикеров. Вместо маскота показывается случайный референс из `avatar/`,
 * QR ведёт на страницу стикера с этой же картинкой.
 *
 * Модуль подгружается динамически и только в этом режиме, поэтому в
 * обычную сборку не попадают ни он, ни картинки из `avatar/`.
 *
 * Параметры адреса:
 * - `?delay=20` — сколько секунд «рисуется» маскот (по умолчанию 8).
 *   Больше 60 — появится подпись «Осталось совсем немного…»;
 * - `?fail=gesture` — вместо результата ошибка с этой причиной:
 *   config, network, policy, gesture, timeout, api;
 * - `?mascot=Rectangle-7` — всегда эта картинка (по части имени файла).
 */
import { GenerationError, type FailureReason } from './kie'
import type { StickerLink } from '../sticker'

const DEFAULT_DELAY_S = 8

const REASONS: FailureReason[] = ['config', 'network', 'policy', 'gesture', 'timeout', 'api']

/** `?url` — только адреса: картинки по 2–3 МБ, грузит их сам `<img>`. */
const MASCOTS = Object.values(
  import.meta.glob<string>('/avatar/Rectangle*.png', { eager: true, query: '?url', import: 'default' }),
)

/** `?mascot=` закрепляет картинку по части имени файла, иначе — случайная. */
function pickMascot(wanted: string | null) {
  const pinned = wanted && MASCOTS.find((url) => decodeURIComponent(url).normalize('NFC').includes(wanted.normalize('NFC')))
  return pinned || MASCOTS[Math.floor(Math.random() * MASCOTS.length)]
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    const timer = window.setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer)
      reject(signal.reason)
    }, { once: true })
  })
}

/**
 * Ссылка для QR — на ту же страницу стикера, что раздаёт сервер
 * (`sticker/index.html`), только с дев-сервера и с картинкой-заглушкой.
 * Открыли панель по адресу из локальной сети, а не по localhost, — код
 * можно отсканировать телефоном в том же Wi-Fi и увидеть страницу.
 */
function previewLink(mascot: string) {
  return `${window.location.origin}/sticker/index.html?i=${encodeURIComponent(mascot)}`
}

export async function fakeGeneration(
  photo: string,
  signal: AbortSignal,
): Promise<{ mascot: string; sticker: StickerLink }> {
  const params = new URLSearchParams(window.location.search)
  const seconds = Number(params.get('delay') ?? DEFAULT_DELAY_S)
  // Без кадра ждать нечего: так `#result` сразу открывается с картинкой.
  const ms = photo && Number.isFinite(seconds) ? Math.max(seconds, 0) * 1000 : 0
  await wait(ms, signal)

  const fail = params.get('fail') as FailureReason | null
  if (fail && REASONS.includes(fail)) {
    throw new GenerationError(fail, `Ошибка по ?fail=${fail} (режим без генерации)`)
  }

  const mascot = pickMascot(params.get('mascot'))
  return { mascot, sticker: { value: previewLink(mascot), viaPage: true } }
}
