/**
 * Ссылка, которую кодируем в QR.
 *
 * Основной путь — страница, которую раздаёт `server/index.mjs`: он забирает
 * картинку себе и отдаёт адрес для QR. Сервер живёт либо на самой панели
 * (тогда телефон обязан быть в том же Wi-Fi), либо на хостинге с доменом
 * (тогда телефон доходит и по мобильному интернету) — см. README.
 *
 * Запасной путь — прямая ссылка на картинку у kie.ai. Включается сам, если
 * сервер не поднят. Работает хуже: часть хостов kie.ai отдаёт файл с
 * `content-disposition: attachment`, и телефон скачивает его вместо показа.
 */
import { RELAY, relayHeaders } from './relay'

/**
 * Сервер отвечает за десятки миллисекунд — он лишь заводит место под
 * картинку, а качает её фоном. Но между панелью и сервером ещё сеть: на
 * замерах десять запросов из десяти прошли, и один из них занял 5.9 с.
 * С прежним пределом в 8 с такие всплески срывались в запасной вариант,
 * и в QR уезжала ссылка на kie.ai — а её телефон толком и не откроет.
 */
const TIMEOUT_MS = 20_000
/** Одна тихая повторная попытка: разовый сбой не должен портить QR. */
const RETRIES = 1

export type StickerLink = {
  /** Что закодировать в QR. */
  value: string
  /** Ведёт ли код на нашу страницу с кнопкой «Сохранить» и инструкцией. */
  viaPage: boolean
  /**
   * Копия картинки на нашем сервере. Панель показывает именно её: до хостов
   * kie.ai она не всегда достаёт, а до своего домена достаёт всегда.
   */
  image?: string
}

export async function stickerLink(imageUrl: string, signal?: AbortSignal): Promise<StickerLink> {
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const link = await askRelay(imageUrl, signal)
    if (link) return link
    if (signal?.aborted) break
  }
  return { value: imageUrl, viaPage: false }
}

/** `null` — не получилось; решение о запасном пути принимает вызывающий. */
async function askRelay(imageUrl: string, signal?: AbortSignal): Promise<StickerLink | null> {
  // AbortSignal.any есть не во всех webview — см. пояснение в moderation.ts.
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const abort = !signal ? timeout
    : typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout])
    : signal

  try {
    const response = await fetch(`${RELAY}/shot`, {
      method: 'POST',
      headers: relayHeaders(),
      body: JSON.stringify({ url: imageUrl }),
      signal: abort,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const { page, image } = (await response.json()) as { page?: string | null; image?: string }
    if (page) return { value: page, viaPage: true, image: image ? `${RELAY}${image}` : undefined }
  } catch (error) {
    // Ронять готовый результат из-за страницы-посредника незачем, но и молчать
    // нельзя: именно из-за тихого отката незамеченным осталось то, что панели
    // не прописали VITE_STICKER_RELAY, и QR месяц вёл бы прямо на kie.ai.
    console.warn(
      `[sticker] ${RELAY} недоступен, QR ведёт прямо на картинку. ` +
      `Проверьте VITE_STICKER_RELAY и VITE_STICKER_TOKEN.`, error,
    )
  }
  return null
}

/**
 * Досылает на сервер копию картинки, которая у панели уже есть.
 *
 * Панель скачала её у kie.ai, чтобы показать на экране, — эти байты просто
 * лежат в памяти, пока сервер тянет тот же файл второй раз. Отдаём их ему:
 * кто дойдёт первым, тот запись и заполнит. Если наш канал до kie.ai
 * медленный или хост оттуда недоступен, копия приедет с панели, и телефону
 * посетителя ждать будет нечего.
 *
 * Зовётся фоном, уже после показа экрана результата: на скорость появления
 * QR не влияет, а провал ничего не ломает — сервер качает ту же картинку
 * сам, и запасной путь на первоисточник тоже никуда не делся.
 */
export async function pushCopy(imageUrl: string, blobUrl: string, signal?: AbortSignal) {
  try {
    const blob = await (await fetch(blobUrl, { signal })).blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })

    const response = await fetch(imageUrl, {
      method: 'POST',
      headers: relayHeaders(),
      body: JSON.stringify({ dataUrl }),
      signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
  } catch (error) {
    if (signal?.aborted) return
    console.warn('[sticker] копию дослать не удалось, сервер качает сам', error)
  }
}
