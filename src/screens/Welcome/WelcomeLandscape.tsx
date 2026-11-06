import cardsSrc from '../../assets/mascot-cards-h.png'
import { useTexts } from '../../i18n'
import styles from './WelcomeLandscape.module.css'

type WelcomeLandscapeProps = {
  onStart?: () => void
}

export function WelcomeLandscape({ onStart }: WelcomeLandscapeProps) {
  const t = useTexts()

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
      {/* Карточки лежат под панелью — слева она их перекрывает. */}
      <img className={styles.cards} src={cardsSrc} alt="" draggable={false} />

      <div className={styles.panel}>
        <h1 className={styles.title}>
          {t.welcomeTitle.map((line) => <span className={styles.line} key={line}>{line}</span>)}
          <span className={styles.accent}>
            {t.welcomeAccentWide.map((line) => <span className={styles.line} key={line}>{line}</span>)}
          </span>
        </h1>

        <p className={styles.subtitle}>
          {t.welcomeLeadWide.map((line) => <span className={styles.line} key={line}>{line}</span>)}
        </p>
      </div>

      <p className={styles.cta}>
        {t.welcomeCta.map((line) => <span className={styles.line} key={line}>{line}</span>)}
      </p>
    </div>
  )
}
