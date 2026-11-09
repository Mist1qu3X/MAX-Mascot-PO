/** Ориентация панели. Выбирается один раз при первом запуске. */
export type Format = 'portrait' | 'landscape'

/**
 * Размеры макета для каждого формата, в пикселях макета.
 * `ready` — свёрстаны ли под этот формат экраны сценария.
 */
export const FORMATS: Record<Format, { w: number; h: number; label: string; ready: boolean }> = {
  portrait: { w: 2160, h: 3840, label: 'Вертикальный', ready: true },
  landscape: { w: 3840, h: 2160, label: 'Горизонтальный', ready: true },
}

export type Language = 'ru' | 'en'

export const LANGUAGES: Record<Language, string> = {
  ru: 'Русский',
  en: 'English',
}

/**
 * Масштаб камеры: 1 — весь кадр, больше — ближе (по бокам и снизу режется
 * лишнее, сверху — нет: голова в верхней части кадра). Раньше был зашит
 * ×1,67 под широкоугольную камеру; теперь оператор подбирает его на месте,
 * на экране настройки, глядя на живое превью.
 */
export const CAMERA_ZOOM = { min: 1, max: 2, step: 0.1, initial: 1 }

export function clampZoom(value: unknown): number {
  const zoom = Number(value)
  if (!Number.isFinite(zoom)) return CAMERA_ZOOM.initial
  // Округляем до шага: из хранилища не должно приезжать ×1,2999999.
  const stepped = Math.round(zoom / CAMERA_ZOOM.step) * CAMERA_ZOOM.step
  return Math.min(Math.max(Number(stepped.toFixed(2)), CAMERA_ZOOM.min), CAMERA_ZOOM.max)
}

export type Settings = {
  format: Format
  language: Language
  cameraZoom: number
  /** Выбранная камера: id от браузера и имя устройства — на случай, если id сменится. */
  cameraId?: string
  cameraLabel?: string
}

const KEY = 'max.settings'

/** Что сохранено, без оглядки на адрес — чтобы подставить в форму настройки. */
export function readSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Settings>
    if (!parsed.format || !FORMATS[parsed.format]?.ready) return null
    return {
      format: parsed.format,
      language: parsed.language ?? 'ru',
      cameraZoom: clampZoom(parsed.cameraZoom),
      cameraId: typeof parsed.cameraId === 'string' ? parsed.cameraId : undefined,
      cameraLabel: typeof parsed.cameraLabel === 'string' ? parsed.cameraLabel : undefined,
    }
  } catch {
    return null
  }
}

/**
 * Настройки для запуска.
 *
 * Возвращает null — значит показать экран настройки. Так и происходит при
 * каждом запуске: оператор сверяет ориентацию и язык перед сменой.
 * Сохранённый выбор при этом подставляется в форму (см. readSettings в
 * App), так что обычно достаточно нажать «Запустить».
 *
 * Исключение — ?format=landscape и ?lang=en в адресе: ими смотрят все
 * четыре сочетания подряд в браузере, и останавливаться на настройке
 * там незачем. Сохранённый выбор эти параметры не трогают.
 */
export function loadSettings(): Settings | null {
  if (window.location.hash === '#setup') return null

  const params = new URLSearchParams(window.location.search)
  const forcedFormat = params.get('format') as Format | null
  const forcedLang = params.get('lang') as Language | null
  if (!forcedFormat && !forcedLang) return null

  const saved = readSettings()
  const format = forcedFormat && FORMATS[forcedFormat]?.ready ? forcedFormat : saved?.format
  const language = forcedLang && LANGUAGES[forcedLang] ? forcedLang : saved?.language ?? 'ru'

  if (!format) return null
  return {
    format,
    language,
    cameraZoom: saved?.cameraZoom ?? CAMERA_ZOOM.initial,
    cameraId: saved?.cameraId,
    cameraLabel: saved?.cameraLabel,
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // Хранилище недоступно — переживём, спросим при следующем запуске.
  }
}

/** Формат влияет на размер макета, поэтому живёт на корневом элементе. */
export function applyFormat(format: Format) {
  document.documentElement.dataset.format = format
}
