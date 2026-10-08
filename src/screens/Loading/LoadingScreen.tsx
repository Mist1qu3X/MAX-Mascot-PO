import { ProgressArc } from '../../components/ProgressArc/ProgressArc'
import type { Format } from '../../format'
import { useTexts } from '../../i18n'
import styles from './LoadingScreen.module.css'

type LoadingScreenProps = {
  format: Format
  /** 0…1 */
  progress: number
  caption?: string
}

/**
 * Панель прогресса поверх предыдущего экрана. Само размытие фона
 * делает App — так экран съёмки не размонтируется и в подложке
 * остаётся снятый кадр.
 *
 * Содержимое в обоих форматах одинаковое, меняется только геометрия
 * панели: снизу в вертикали, слева в горизонтали.
 */
export function LoadingScreen({ format, progress, caption }: LoadingScreenProps) {
  const t = useTexts()
  const text = caption ?? t.loadingCaption

  return (
    <div className={styles.sheet} data-format={format}>
      <div className={styles.gauge}>
        <ProgressArc value={progress} />
        <span className={styles.percent}>{Math.round(progress * 100)}%</span>
      </div>
      <p className={styles.caption}>{text}</p>
    </div>
  )
}
