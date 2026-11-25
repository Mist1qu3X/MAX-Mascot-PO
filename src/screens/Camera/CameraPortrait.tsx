import arrowSrc from '../../assets/arrow-up.png'
import type { CameraViewProps } from './CameraView'
import { useTexts } from '../../i18n'
import styles from './CameraPortrait.module.css'

export function CameraPortrait({ renderFeed, shot, message, count }: CameraViewProps) {
  const t = useTexts()

  return (
    <div className={styles.screen}>
      <img className={styles.arrow} src={arrowSrc} alt="" draggable={false} />

      <div className={styles.copy}>
        <h1 className={styles.title}>
          {t.cameraLook.map((line) => <span className={styles.line} key={line}>{line}</span>)}
        </h1>
      </div>

      <div className={styles.preview}>
        <div className={styles.viewport}>
          {renderFeed(styles.video)}
          {shot && <img className={styles.shot} src={shot} alt="Снятый кадр" />}
          {message && <p className={styles.message}>{message}</p>}
        </div>

        <div className={styles.badge} aria-live="polite">
          <span className={styles.count}>{count}</span>
        </div>
      </div>
    </div>
  )
}
