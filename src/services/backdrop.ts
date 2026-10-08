/**
 * Починка фона: маскот должен быть на чёрном, а модель иногда отдаёт белый.
 *
 * Промптом это не лечится. Замер на реалистичном исходнике (человек в
 * помещении): из трёх прогонов два вернулись с чёрным фоном, один с белым —
 * примерно каждый третий кадр. Требование «фон чёрный» стоит в промпте
 * дважды, в начале и последней строкой, и всё равно не держится: модель
 * иногда просто оставляет светлый фон исходной фотографии.
 *
 * Поэтому проверяем результат сами и чиним только когда надо:
 *   1. смотрим четыре угла картинки — это бесплатно и мгновенно;
 *   2. если они светлые, вырезаем фон (`recraft/remove-background`) и берём
 *      вырезку: прозрачный PNG на чёрной карточке и есть чёрный фон.
 *
 * Плата — 14 с и 1 кредит, и только на том кадре, где фон подвёл. Остальные
 * проходят мимо, не заметив. Вырезка вдобавок лучше как стикер: прозрачный
 * PNG в MAX смотрится аккуратнее квадрата с фоном.
 */
import { removeBackground, type Mascot } from './kie'

/** Выше этого угол считаем светлым. Чёрный фон даёт 0–1, белый — 255. */
const DARK_LIMIT = 60
/** Отступ от края: у самой кромки бывает кайма от сжатия. */
const INSET = 1
/**
 * Картинку ужимаем до этого размера перед чтением. Ради четырёх пикселей
 * держать canvas 2048x2048 (это 16 МБ) незачем, а усреднение по блоку даже
 * надёжнее одиночного пикселя: случайная светлая крапина не собьёт решение.
 */
const PROBE = 32

/**
 * Яркость четырёх углов. `null` — прочитать не вышло: картинка чужая и без
 * CORS-заголовков, canvas от такой «пачкается» и пиксели читать не даёт.
 * Тогда чинить не беремся: лучше показать как есть, чем сорвать результат.
 */
async function cornerLuma(src: string): Promise<number[] | null> {
  const image = new Image()
  // Для blob: атрибут не нужен и даже мешает; для чужой ссылки — обязателен.
  if (!src.startsWith('blob:')) image.crossOrigin = 'anonymous'

  const loaded = await new Promise<boolean>((resolve) => {
    image.onload = () => resolve(true)
    image.onerror = () => resolve(false)
    image.src = src
  })
  if (!loaded || !image.naturalWidth) return null

  const canvas = document.createElement('canvas')
  canvas.width = PROBE
  canvas.height = PROBE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(image, 0, 0, PROBE, PROBE)

  const w = PROBE
  const h = PROBE
  const points = [[INSET, INSET], [w - INSET, INSET], [INSET, h - INSET], [w - INSET, h - INSET]]
  try {
    return points.map(([x, y]) => {
      const [r, g, b] = ctx.getImageData(x, y, 1, 1).data
      // Веса как в BT.601: глаз к зелёному чувствительнее, чем к синему.
      return 0.299 * r + 0.587 * g + 0.114 * b
    })
  } catch {
    return null // tainted canvas
  }
}

/**
 * Возвращает маскота с гарантированно тёмным фоном. Если чинить не нужно
 * или не получилось — отдаёт исходный, не роняя готовый результат.
 */
export async function ensureDarkBackdrop(
  mascot: Mascot,
  { signal }: { signal?: AbortSignal } = {},
): Promise<Mascot> {
  const corners = await cornerLuma(mascot.blobUrl)
  if (!corners) return mascot

  // Одного светлого угла мало: за плечом человека вполне может быть светлый
  // элемент. Чиним, когда светлые все четыре — это уже фон, а не деталь.
  if (corners.some((luma) => luma <= DARK_LIMIT)) return mascot

  try {
    const cutout = await removeBackground(mascot.remoteUrl, signal)
    // Обе ссылки меняем на вырезку: панель покажет её на чёрной карточке,
    // а на телефон по QR уедет прозрачный PNG — как раз то, что нужно стикеру.
    return { blobUrl: cutout, remoteUrl: cutout }
  } catch {
    return mascot
  }
}
