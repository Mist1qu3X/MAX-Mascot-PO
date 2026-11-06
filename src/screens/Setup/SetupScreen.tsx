import { useState } from 'react'

import { FORMATS, LANGUAGES, type Format, type Language, type Settings } from '../../format'
import styles from './SetupScreen.module.css'

type SetupScreenProps = {
  initial?: Settings
  onDone: (settings: Settings) => void
  /** Открыть служебную проверку связи. */
  onDiagnostics?: () => void
}

/**
 * Что предлагаем на экране. Сейчас панель одна — вертикальная и на русском,
 * поэтому выбор сведён к одному варианту. Горизонтальные экраны и английский
 * в коде остались: вернуть их на экран — дописать сюда. Разово их можно
 * открыть и сейчас: ?format=landscape, ?lang=en в адресе.
 */
const OFFERED_FORMATS: Format[] = ['portrait']
const OFFERED_LANGUAGES: Language[] = ['ru']

/**
 * Первый запуск: выбираем ориентацию панели и язык.
 *
 * Макета на этот экран нет — свёрстан в той же фирменной палитре, но
 * без привязки к сетке 2160 × 3840: формат ещё не выбран, так что
 * размеры считаются от меньшей стороны окна.
 */
export function SetupScreen({ initial, onDone, onDiagnostics }: SetupScreenProps) {
  // Сохранённый выбор подставляем, только если он есть на экране: иначе
  // «Запустить» молча включил бы вариант, которого оператор не видит.
  const [format, setFormat] = useState<Format>(
    initial && OFFERED_FORMATS.includes(initial.format) ? initial.format : OFFERED_FORMATS[0],
  )
  const [language, setLanguage] = useState<Language>(
    initial && OFFERED_LANGUAGES.includes(initial.language) ? initial.language : OFFERED_LANGUAGES[0],
  )

  return (
    <div className={styles.screen}>
      <div className={styles.sheet}>
        <h1 className={styles.title}>Настройка панели</h1>

        <section className={styles.section}>
          <h2 className={styles.label}>Ориентация экрана</h2>
          <div className={styles.options}>
            {OFFERED_FORMATS.map((key) => (
              <button
                key={key}
                type="button"
                className={styles.option}
                aria-pressed={format === key}
                disabled={!FORMATS[key].ready}
                onClick={() => setFormat(key)}
              >
                <span className={styles.preview} data-format={key} />
                <span className={styles.optionName}>{FORMATS[key].label}</span>
                <span className={styles.optionNote}>
                  {FORMATS[key].ready ? `${FORMATS[key].w} × ${FORMATS[key].h}` : 'Экраны ещё не свёрстаны'}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.label}>Язык</h2>
          <div className={styles.options}>
            {OFFERED_LANGUAGES.map((key) => (
              <button
                key={key}
                type="button"
                className={`${styles.option} ${styles.optionSlim}`}
                aria-pressed={language === key}
                onClick={() => setLanguage(key)}
              >
                <span className={styles.optionName}>{LANGUAGES[key]}</span>
              </button>
            ))}
          </div>
        </section>

        <div className={styles.buttons}>
          <button type="button" className={styles.start} onClick={() => onDone({ format, language })}>
            Запустить
          </button>

          {/* Единственный путь к диагностике на панели: адресной строки там нет,
              а сюда пускает удержание левого верхнего угла. */}
          <button type="button" className={styles.secondary} onClick={onDiagnostics}>
            Проверить связь
          </button>
        </div>

        <p className={styles.hint}>
          Чтобы вернуться сюда — удержите левый верхний угол три секунды или откройте
          приложение с #setup в адресе.
        </p>
      </div>
    </div>
  )
}
