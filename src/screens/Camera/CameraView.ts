import type { RefObject } from 'react'

/** Что раскладке нужно от экрана съёмки — логика живёт в CameraScreen. */
export type CameraViewProps = {
  videoRef: RefObject<HTMLVideoElement | null>
  mirrored: boolean
  /**
   * Готовая трансформация для <video>: зеркало и обрезка широкого угла.
   * Считается в useCamera теми же числами, что и обрезка снимка, — так
   * превью и фотография не могут разойтись.
   */
  videoTransform: string
  /** Показывать живое видео (камера отдала кадр и снимок ещё не сделан). */
  live: boolean
  shot: string | null
  message?: string
  count: number
}
