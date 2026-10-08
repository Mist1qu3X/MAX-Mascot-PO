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
  welcomeLead: string[]
  /**
   * В горизонтали подводка своя: и переносы другие, и обращение на «вы»
   * вместо «ты». Так в макетах — не выдумка, поэтому держим обе версии.
   */
  welcomeLeadWide: string[]
  welcomeCta: string[]
  welcomeAria: string

  cameraLook: string[]
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
  welcomeTitle: ['Создайте', 'своего'],
  welcomeAccent: ['цифрового', 'маскота'],
  welcomeLead: ['Сделай фото — а нейросеть', 'MAX превратит тебя', 'в фирменного персонажа'],
  welcomeLeadWide: ['Сделайте фото — а нейросеть', 'MAX превратит вас в фирменного', 'персонажа'],
  welcomeCta: ['Коснитесь экрана,', 'чтобы начать'],
  welcomeAria: 'Коснитесь экрана, чтобы начать',

  cameraLook: ['Смотрите', 'в камеру'],
  cameraStarting: 'Включаем камеру…',
  cameraDenied: 'Нет доступа к камере.\nРазрешите съёмку в настройках панели.',
  cameraMissing: 'Камера не найдена.\nПроверьте подключение.',
  cameraBroken: 'Камера недоступна.\nПопробуйте ещё раз.',

  loadingCaption: 'Анализируем\nчерты лица…',
  loadingOverdue: 'Осталось совсем\nнемного…',

  resultTitle: ['Ваш маскот', 'готов!'],
  resultQr: ['Сканируйте, чтобы', 'скачать стикер в MAX'],
  resultStepsPage: ['На странице — кнопка «Сохранить»', 'и пошаговая инструкция для бота'],
  resultStepsRaw: ['Удерживайте картинку, чтобы сохранить.', 'Затем загрузите её в бот «Стикеры в MAX»'],
  resultCta: ['Коснитесь экрана,', 'чтобы начать снова'],
  resultAria: 'Коснитесь экрана, чтобы начать снова',
  mascotAlt: 'Ваш маскот',

  errors: {
    config: 'Сервис не настроен.\nСообщите администратору',
    network: 'Нет связи с сервисом.\nПопробуйте ещё раз',
    policy: 'Не получилось обработать кадр.\nПопробуйте ещё раз',
    gesture: 'Давайте без жестов.\nПопробуйте ещё раз',
    timeout: 'Обработка затянулась.\nПопробуйте ещё раз',
    api: 'Что-то пошло не так.\nПопробуйте ещё раз',
  },
}

const en: Texts = {
  // Тексты и переносы сверены с английскими макетами.
  // и число строк: у английского оно другое, чем у русского. Кавычки в
  // «Stickers in MAX» тоже как в макете — типографские, не прямые.
  welcomeTitle: ['Create your'],
  welcomeAccent: ['digital mascot'],
  welcomeLead: ['Take a photo — and the MAX neural', 'network will turn you into a brand', 'character'],
  welcomeLeadWide: ['Take a photo — and the MAX neural', 'network will turn you into a brand', 'character'],
  welcomeCta: ['Tap the screen to start'],
  welcomeAria: 'Tap the screen to start',

  cameraLook: ['Look at the', 'camera'],
  cameraStarting: 'Starting the camera…',
  cameraDenied: 'No access to the camera.\nAllow it in the panel settings.',
  cameraMissing: 'Camera not found.\nCheck the connection.',
  cameraBroken: 'Camera unavailable.\nPlease try again.',

  loadingCaption: 'Analyzing facial features…',
  loadingOverdue: 'Almost there…',

  resultTitle: ['Your mascot', 'is ready!'],
  resultQr: ['Scan to download', 'the sticker in MAX'],
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
