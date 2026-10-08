import cardsSrc from '../../assets/mascot-cards.png'
import logoSrc from '../../assets/max-logo.png'
import type { Format } from '../../format'
import { WelcomeLandscape } from './WelcomeLandscape'
import { LangToggle } from '../../components/LangToggle/LangToggle'
import { useTexts } from '../../i18n'
import styles from './WelcomeScreen.module.css'

type WelcomeScreenProps = {
  format: Format
  /** Вызывается по касанию экрана — точка входа в сценарий. */
  onStart?: () => void
  /** Смена языка круглой кнопкой в углу. */
  onToggleLanguage?: () => void
}

/**
 * Приветствие — экран ожидания. Висит в режиме заставки, пока
 * посетитель не коснётся панели.
 */
export function WelcomeScreen({ format, onStart, onToggleLanguage }: WelcomeScreenProps) {
  const t = useTexts()

  if (format === 'landscape') {
    return <WelcomeLandscape onStart={onStart} onToggleLanguage={onToggleLanguage} />
  }

  return (
    <div
      className={styles.screen}
      role="button"
      tabIndex={0}
      aria-label={t.welcomeAria}
      onClick={onStart}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onStart?.()
        }
      }}
    >
      {onToggleLanguage && <LangToggle onToggle={onToggleLanguage} />}

      <div className={styles.hero}>
        <div className={styles.copy}>
          <img className={styles.logo} src={logoSrc} alt="MAX" draggable={false} />

          <h1 className={styles.title}>
            {t.welcomeTitle.map((line) => <span className={styles.line} key={line}>{line}</span>)}
            <span className={styles.accent}>
              {t.welcomeAccent.map((line) => <span className={styles.line} key={line}>{line}</span>)}
            </span>
          </h1>

          <p className={styles.subtitle}>
            {t.welcomeLead.map((line) => <span className={styles.line} key={line}>{line}</span>)}
          </p>
        </div>

        <img className={styles.cards} src={cardsSrc} alt="" draggable={false} />
      </div>

      <footer className={styles.footer}>
        <p className={styles.cta}>
          {t.welcomeCta.map((line) => <span className={styles.line} key={line}>{line}</span>)}
        </p>
      </footer>
    </div>
  )
}
