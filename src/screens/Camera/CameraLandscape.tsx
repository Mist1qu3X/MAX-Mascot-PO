import type { CameraViewProps } from './CameraView'
import { useTexts } from '../../i18n'
import styles from './CameraLandscape.module.css'

/** В горизонтальном макете стрелки к камере нет — объектив прямо над экраном. */
export function CameraLandscape({ videoRef, mirrored, videoTransform, live, shot, message, count }: CameraViewProps) {
  const t = useTexts()

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>
        {t.cameraLookWide.map((line) => <span className={styles.line} key={line}>{line}</span>)}
      </h1>

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
