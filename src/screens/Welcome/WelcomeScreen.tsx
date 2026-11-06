import cardsSrc from '../../assets/mascot-cards.png'
import type { Format } from '../../format'
import { WelcomeLandscape } from './WelcomeLandscape'
import { useTexts } from '../../i18n'
import styles from './WelcomeScreen.module.css'

type WelcomeScreenProps = {
  format: Format
  /** Вызывается по касанию экрана — точка входа в сценарий. */
  onStart?: () => void
}

/**
 * Приветствие — экран ожидания. Висит в режиме заставки, пока
 * посетитель не коснётся панели.
 */
export function WelcomeScreen({ format, onStart }: WelcomeScreenProps) {
  const t = useTexts()

  if (format === 'landscape') {
    return <WelcomeLandscape onStart={onStart} />
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
      <div className={styles.hero}>
        <div className={styles.copy}>
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
