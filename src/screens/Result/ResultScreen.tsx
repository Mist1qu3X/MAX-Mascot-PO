import logoSrc from '../../assets/max-logo.png'
import { MascotImage } from '../../components/MascotImage/MascotImage'
import { QrCode } from '../../components/QrCode/QrCode'
import type { Format } from '../../format'
import { ResultLandscape } from './ResultLandscape'
import { useFitText } from '../../hooks/useFitText'
import { useTexts } from '../../i18n'
import styles from './ResultScreen.module.css'

type ResultScreenProps = {
  format: Format
  /** Готовый маскот. Пока нейросети нет — сюда приходит снятый кадр. */
  mascot?: string | null
  /** Тот же маскот с другого адреса: пробуем, если первый не загрузился. */
  mascotBackup?: string | null
  /** Ссылка, которую кодируем в QR. */
  qrValue?: string
  /** Ведёт ли QR на страницу с кнопкой «Сохранить» — от этого зависит подпись. */
  viaPage?: boolean
  /** Касание экрана — начать сначала. */
  onRestart?: () => void
}

export function ResultScreen({ format, mascot, mascotBackup, qrValue, viaPage, onRestart }: ResultScreenProps) {
  const t = useTexts()
  // Текст у кода — единственное место, где строка вплотную подходит к краю
  // плашки. Если шрифт подставился другой, «MAX» уезжает за границу.
  const qrText = useFitText<HTMLParagraphElement>([t])
  if (format === 'landscape') {
    return (
      <ResultLandscape
        mascot={mascot}
        mascotBackup={mascotBackup}
        qrValue={qrValue}
        viaPage={viaPage}
        onRestart={onRestart}
      />
    )
  }

  return (
    <div
      className={styles.screen}
      role="button"
      tabIndex={0}
      aria-label={t.resultAria}
      onClick={onRestart}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onRestart?.()
        }
      }}
    >
      <div className={styles.sky} />

      <div className={styles.copy}>
        <img className={styles.logo} src={logoSrc} alt="MAX" draggable={false} />
        <h1 className={styles.title}>
          {t.resultTitle.map((line) => <span className={styles.line} key={line}>{line}</span>)}
        </h1>
      </div>

      <div className={styles.card}>
        <div className={styles.inner}>
          {mascot && (
            <MascotImage
              className={styles.mascot}
              src={mascot}
              backup={mascotBackup}
              alt={t.mascotAlt}
            />
          )}

          <div className={styles.qrCard}>
            <QrCode className={styles.qr} value={qrValue ?? ''} />
            <p className={styles.qrText} ref={qrText}>
              {t.resultQr.map((line) => <span className={styles.line} key={line}>{line}</span>)}
            </p>
          </div>
        </div>
      </div>

      <footer className={styles.footer}>
        <p className={styles.steps}>{(viaPage ? t.resultStepsPage : t.resultStepsRaw).map((line) => (
          <span className={styles.line} key={line}>{line}</span>
        ))}</p>
        <p className={styles.cta}>
          {t.resultCta.map((line) => <span className={styles.line} key={line}>{line}</span>)}
        </p>
      </footer>
    </div>
  )
}
