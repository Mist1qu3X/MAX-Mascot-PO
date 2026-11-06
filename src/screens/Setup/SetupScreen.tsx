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
 * Первый запуск: выбираем ориентацию панели и язык.
 *
 * Макета на этот экран нет — свёрстан в той же фирменной палитре, но
 * без привязки к сетке 2160 × 3840: формат ещё не выбран, так что
 * размеры считаются от меньшей стороны окна.
 */
export function SetupScreen({ initial, onDone, onDiagnostics }: SetupScreenProps) {
  const [format, setFormat] = useState<Format>(initial?.format ?? 'portrait')
  const [language, setLanguage] = useState<Language>(initial?.language ?? 'ru')

  return (
    <div className={styles.screen}>
      <div className={styles.sheet}>
        <h1 className={styles.title}>Настройка панели</h1>

        <section className={styles.section}>
          <h2 className={styles.label}>Ориентация экрана</h2>
          <div className={styles.options}>
            {(Object.keys(FORMATS) as Format[]).map((key) => (
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
            {(Object.keys(LANGUAGES) as Language[]).map((key) => (
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
          <p className={styles.hint}>Язык можно сменить круглой кнопкой в углу приветствия.</p>
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
