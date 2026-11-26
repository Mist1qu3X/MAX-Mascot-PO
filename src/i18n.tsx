/**
 * Тексты экранов на двух языках.
 *
 * Строки лежат массивами, а не одной строкой с переносами: в макете каждая
 * строка — отдельный `<span>`, и переносы расставлены вручную, а не по
 * ширине. Значит и в словаре разбивка должна быть явной, иначе английский
 * поедет по-своему и разъедется с сеткой.
 *
 * Английский сверен с оригинальными макетами, которые хранятся локально
 * отдельно от репозитория. Они только горизонтальные (3840 × 2160). Для
 * вертикали взяты те же формулировки, но переносы могли лечь иначе, чем
 * задумано. Строки, которых в макетах нет (ошибки, статус камеры, запасной
 * текст под кодом), написаны отдельно.
 */
import { createContext, useContext, type ReactNode } from 'react'

import type { Language } from './format'

type Texts = {
  welcomeTitle: string[]
  welcomeAccent: string[]
  /**
   * Заголовки в вертикали крупнее (256 против 220), и английские строки
   * там переносятся чаще. В горизонтали они сверены со своими макетами —
   * поэтому у горизонтали свои версии, с суффиксом Wide.
   */
  welcomeAccentWide: string[]
  welcomeLead: string[]
  /** В горизонтали подводка своя: переносы там другие. */
  welcomeLeadWide: string[]
  welcomeCta: string[]
  welcomeAria: string

  cameraLook: string[]
  cameraLookWide: string[]
  cameraStarting: string
  cameraDenied: string
  cameraMissing: string
  cameraBroken: string

  loadingCaption: string
  loadingOverdue: string

  resultTitle: string[]
  resultQr: string[]
  resultStepsPage: string[]
  resultStepsRaw: string[]
  resultCta: string[]
  resultAria: string
  mascotAlt: string

  errors: Record<string, string>
}

const ru: Texts = {
  welcomeTitle: ['Создай', 'своего'],
  welcomeAccent: ['цифрового', 'маскота'],
  welcomeAccentWide: ['цифрового', 'маскота'],
  welcomeLead: ['Сделай фото и получи свой', 'образ в виде фирменного', 'персонажа'],
  welcomeLeadWide: ['Сделай фото и получи свой', 'образ в виде фирменного', 'персонажа'],
  welcomeCta: ['Коснись экрана, чтобы', 'начать'],
  welcomeAria: 'Коснись экрана, чтобы начать',

  cameraLook: ['Смотри', 'в камеру'],
  cameraLookWide: ['Смотри', 'в камеру'],
  cameraStarting: 'Включаем камеру…',
  cameraDenied: 'Нет доступа к камере.\nРазреши съёмку в настройках панели.',
  cameraMissing: 'Камера не найдена.\nПроверь подключение.',
  cameraBroken: 'Камера недоступна.\nПопробуй ещё раз.',

  loadingCaption: 'Анализирую\nчерты лица…',
  loadingOverdue: 'Осталось совсем\nнемного…',

  resultTitle: ['Твой маскот', 'готов!'],
  resultQr: ['Сканируй, чтобы', 'скачать маскота', 'и установить аватар', 'для мессенджера MAX'],
  resultStepsPage: ['На странице — кнопка «Сохранить»', 'и пошаговая инструкция для бота'],
  resultStepsRaw: ['Удерживай картинку, чтобы сохранить.', 'Затем загрузи её в бот «Стикеры в MAX»'],
  resultCta: ['Коснись экрана, чтобы', 'начать снова'],
  resultAria: 'Коснись экрана, чтобы начать снова',
  mascotAlt: 'Твой маскот',

  errors: {
    config: 'Сервис не настроен.\nСообщи администратору',
    network: 'Нет связи с сервисом.\nПопробуй ещё раз',
    policy: 'Не получилось обработать кадр.\nПопробуй ещё раз',
    gesture: 'Давай без жестов.\nПопробуй ещё раз',
    timeout: 'Обработка затянулась.\nПопробуй ещё раз',
    api: 'Что-то пошло не так.\nПопробуй ещё раз',
  },
}

const en: Texts = {
  // Тексты и переносы сверены с английскими макетами.
  // и число строк: у английского оно другое, чем у русского. Кавычки в
  // «Stickers in MAX» тоже как в макете — типографские, не прямые.
  welcomeTitle: ['Create your'],
  welcomeAccent: ['digital', 'mascot'],
  welcomeAccentWide: ['digital mascot'],
  welcomeLead: ['Take a photo and get your own', 'look as a brand character'],
  welcomeLeadWide: ['Take a photo and get your own', 'look as a brand character'],
  welcomeCta: ['Tap the screen to start'],
  welcomeAria: 'Tap the screen to start',

  // В три строки: «Look at the» на 256 наезжала на стрелку к камере.
  cameraLook: ['Look', 'at the', 'camera'],
  cameraLookWide: ['Look at the', 'camera'],
  cameraStarting: 'Starting the camera…',
  cameraDenied: 'No access to the camera.\nAllow it in the panel settings.',
  cameraMissing: 'Camera not found.\nCheck the connection.',
  cameraBroken: 'Camera unavailable.\nPlease try again.',

  loadingCaption: 'Analyzing facial features…',
  loadingOverdue: 'Almost there…',

  resultTitle: ['Your mascot', 'is ready!'],
  resultQr: ['Scan to download', 'your mascot and set', 'it as your avatar', 'in the MAX messenger'],
  resultStepsPage: ['Create a sticker via the \u201cStickers in', 'MAX\u201d bot'],
  // Запасной путь макетом не покрыт: он включается, только когда недоступна
  // страница-посредник. Здесь важнее сказать, что делать, чем совпасть.
  resultStepsRaw: ['Press and hold the image to save it,', 'then upload it to the \u201cStickers in MAX\u201d bot'],
  resultCta: ['Tap the screen', 'to start again'],
  resultAria: 'Tap the screen to start again',
  mascotAlt: 'Your mascot',

  errors: {
    config: 'Service is not configured.\nPlease tell the staff',
    network: 'No connection to the service.\nPlease try again',
    policy: 'Could not process the photo.\nPlease try again',
    gesture: 'No rude gestures, please.\nTry again',
    timeout: 'This is taking too long.\nPlease try again',
    api: 'Something went wrong.\nPlease try again',
  },
}

export const TEXTS: Record<Language, Texts> = { ru, en }

const LanguageContext = createContext<Language>('ru')

export function LanguageProvider({ value, children }: { value: Language; children: ReactNode }) {
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

/** Тексты текущего языка. */
export function useTexts(): Texts {
  return TEXTS[useContext(LanguageContext)]
}

/** Сам язык — нужен кнопке переключения. */
export function useLanguage(): Language {
  return useContext(LanguageContext)
}
