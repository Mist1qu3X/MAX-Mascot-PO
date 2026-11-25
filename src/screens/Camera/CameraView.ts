import type { ReactNode } from 'react'

/** Что раскладке нужно от экрана съёмки — логика живёт в CameraScreen. */
export type CameraViewProps = {
  /**
   * Живая картинка камеры. Раскладка задаёт только класс окна; зеркало,
   * обрезку и поворот кадр несёт сам — теми же числами, что у снимка,
   * так что превью и фотография не могут разойтись.
   */
  renderFeed: (className: string) => ReactNode
  shot: string | null
  message?: string
  count: number
}
