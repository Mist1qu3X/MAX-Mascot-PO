import arrowSrc from '../../assets/arrow-up.png'
import logoSrc from '../../assets/max-logo.png'
import type { CameraViewProps } from './CameraView'
import { useTexts } from '../../i18n'
import styles from './CameraPortrait.module.css'

export function CameraPortrait({ videoRef, mirrored, videoTransform, live, shot, message, count }: CameraViewProps) {
  const t = useTexts()

  return (
    <div className={styles.screen}>
      <img className={styles.arrow} src={arrowSrc} alt="" draggable={false} />

      <div className={styles.copy}>
        <img className={styles.logo} src={logoSrc} alt="MAX" draggable={false} />
        <h1 className={styles.title}>
          {t.cameraLook.map((line) => <span className={styles.line} key={line}>{line}</span>)}
        </h1>
      </div>

      <div className={styles.preview}>
        <div className={styles.viewport}>
          <video
            ref={videoRef}
            className={styles.video}
            style={{ transform: videoTransform }}
            data-mirrored={mirrored || undefined}
            data-visible={live ? '' : undefined}
            autoPlay
            playsInline
            muted
          />
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
