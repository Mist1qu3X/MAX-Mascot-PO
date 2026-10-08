import type { ReactNode } from 'react'

import styles from './Stage.module.css'

type StageProps = {
  children: ReactNode
}

/**
 * Сцена — «панель» с пропорциями макета. Размер макета берётся из
 * --design-w / --design-h: их переключает выбранная ориентация
 * (см. src/format.ts).
 *
 * На панели нужной пропорции сцена занимает весь экран. На другой
 * пропорции (и в окне браузера при разработке) масштабируется целиком
 * и встаёт по центру, чтобы вёрстка не разъезжалась.
 */
export function Stage({ children }: StageProps) {
  return <div className={styles.stage}>{children}</div>
}
