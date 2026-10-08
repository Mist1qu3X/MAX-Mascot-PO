import cardsSrc from '../../assets/mascot-cards-h.png'
import logoSrc from '../../assets/max-logo.png'
import { LangToggle } from '../../components/LangToggle/LangToggle'
import { useTexts } from '../../i18n'
import styles from './WelcomeLandscape.module.css'

type WelcomeLandscapeProps = {
  onStart?: () => void
  /** Смена языка круглой кнопкой в углу. */
  onToggleLanguage?: () => void
}

export function WelcomeLandscape({ onStart, onToggleLanguage }: WelcomeLandscapeProps) {
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

      {onToggleLanguage && <LangToggle onToggle={onToggleLanguage} />}

      <div className={styles.panel}>
        <img className={styles.logo} src={logoSrc} alt="MAX" draggable={false} />

        <h1 className={styles.title}>
          {t.welcomeTitle.map((line) => <span className={styles.line} key={line}>{line}</span>)}
          <span className={styles.accent}>
            {t.welcomeAccent.map((line) => <span className={styles.line} key={line}>{line}</span>)}
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
