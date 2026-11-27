import cardsSrc from '../../assets/mascot-cards.png'
import dobroSrc from '../../assets/partners/dobro.svg'
import myvmesteSrc from '../../assets/partners/myvmeste.svg'
import rosmolodezhSrc from '../../assets/partners/rosmolodezh.svg'
import type { Format } from '../../format'
import { WelcomeLandscape } from './WelcomeLandscape'
import { useTexts } from '../../i18n'
import styles from './WelcomeScreen.module.css'
import { outsideCorners } from '../../corners'

/** Партнёры форума — строка над заголовком, только в вертикали. */
const PARTNERS = [
  { src: myvmesteSrc, name: '#МЫВМЕСТЕ' },
  { src: rosmolodezhSrc, name: 'Росмолодёжь' },
  { src: dobroSrc, name: 'Добро.рф' },
]

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
      onClick={outsideCorners(onStart)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onStart?.()
        }
      }}
    >
      <div className={styles.hero}>
        <div className={styles.partners}>
          {PARTNERS.map((partner) => (
            <img key={partner.name} src={partner.src} alt={partner.name} draggable={false} />
          ))}
        </div>

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
