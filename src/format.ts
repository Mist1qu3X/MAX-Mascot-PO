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

export type Settings = { format: Format; language: Language }

const KEY = 'max.settings'

/** Что сохранено, без оглядки на адрес — чтобы подставить в форму настройки. */
export function readSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Settings>
    if (!parsed.format || !FORMATS[parsed.format]?.ready) return null
    return { format: parsed.format, language: parsed.language ?? 'ru' }
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
  return { format, language }
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
