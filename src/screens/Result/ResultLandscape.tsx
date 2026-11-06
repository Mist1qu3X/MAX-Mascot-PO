import { MascotImage } from '../../components/MascotImage/MascotImage'
import { QrCode } from '../../components/QrCode/QrCode'
import { useFitText } from '../../hooks/useFitText'
import { useTexts } from '../../i18n'
import styles from './ResultLandscape.module.css'

type ResultLandscapeProps = {
  mascot?: string | null
  /** Тот же маскот с другого адреса: пробуем, если первый не загрузился. */
  mascotBackup?: string | null
  /** Ссылка, которую кодируем в QR. */
  qrValue?: string
  /** Ведёт ли QR на страницу с кнопкой «Сохранить» — от этого зависит подпись. */
  viaPage?: boolean
  onRestart?: () => void
}

export function ResultLandscape({ mascot, mascotBackup, qrValue, viaPage, onRestart }: ResultLandscapeProps) {
  const t = useTexts()
  // Текст у кода — единственное место, где строка вплотную подходит к краю
  // плашки. Если шрифт подставился другой, «MAX» уезжает за границу.
  const qrText = useFitText<HTMLParagraphElement>([t])
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
      <div className={styles.panel}>
        <h1 className={styles.title}>
          {t.resultTitle.map((line) => <span className={styles.line} key={line}>{line}</span>)}
        </h1>

        <p className={styles.cta}>
          {t.resultCta.map((line) => <span className={styles.line} key={line}>{line}</span>)}
        </p>
      </div>

      {/* Плашка с QR — соседка круга, а не вложена в него: круглая маска
          обрезала бы её по дуге. */}
      <div className={styles.ring}>
        <div className={styles.circle}>
          {mascot && (
            <MascotImage
              className={styles.mascot}
              src={mascot}
              backup={mascotBackup}
              alt={t.mascotAlt}
            />
          )}
        </div>
      </div>

      <div className={styles.qrCard}>
        <QrCode className={styles.qr} value={qrValue ?? ''} />
        <p className={styles.qrText} ref={qrText}>
          {t.resultQr.map((line) => <span className={styles.line} key={line}>{line}</span>)}
        </p>
      </div>

      <p className={styles.caption}>{(viaPage ? t.resultStepsPage : t.resultStepsRaw).map((line) => (
        <span className={styles.line} key={line}>{line}</span>
      ))}</p>
    </div>
  )
}
