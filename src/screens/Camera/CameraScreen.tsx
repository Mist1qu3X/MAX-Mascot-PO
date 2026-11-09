import { useCallback, useState } from 'react'

import type { Format } from '../../format'
import { MIRRORED, PREVIEW_ASPECT, cropTransform, useCamera } from '../../hooks/useCamera'
import { useTexts } from '../../i18n'
import { useCountdown } from '../../hooks/useCountdown'
import { CameraLandscape } from './CameraLandscape'
import { CameraPortrait } from './CameraPortrait'

/**
 * Пять секунд, а не три как в макете: посетителю нужно успеть встать в кадр
 * и перестать смотреть на экран. Число в кружке рисуется само, менять
 * вёрстку не потребовалось.
 */
const COUNTDOWN_FROM = 5

type CameraScreenProps = {
  format: Format
  /** Масштаб камеры из настроек: 1 — весь кадр. */
  zoom: number
  /** Камера из настроек; не задана или не нашлась — любая рабочая. */
  cameraId?: string
  cameraLabel?: string
  /** Готовый кадр в формате data:image/jpeg. */
  onCapture?: (photo: string) => void
}

export function CameraScreen({ format, zoom, cameraId, cameraLabel, onCapture }: CameraScreenProps) {
  const t = useTexts()
  const { videoRef, status, capture } = useCamera({ deviceId: cameraId, deviceLabel: cameraLabel })

  // Внутри компонента, а не константой модуля: тексты зависят от языка.
  const statusMessage: Record<string, string> = {
    starting: t.cameraStarting,
    denied: t.cameraDenied,
    notfound: t.cameraMissing,
    error: t.cameraBroken,
  }
  const [shot, setShot] = useState<string | null>(null)

  const handleDone = useCallback(() => {
    const photo = capture(PREVIEW_ASPECT[format], MIRRORED, zoom)
    if (!photo) return
    setShot(photo)
    onCapture?.(photo)
  }, [capture, format, onCapture, zoom])

  // Отсчёт стартует только когда пошёл живой кадр, а не при открытии экрана.
  const count = useCountdown({
    from: COUNTDOWN_FROM,
    active: status === 'ready' && shot === null,
    onDone: handleDone,
  })

  const view = {
    videoRef,
    mirrored: MIRRORED,
    videoTransform: cropTransform(MIRRORED, zoom),
    live: status === 'ready' && shot === null,
    shot,
    message: statusMessage[status],
    count: Math.max(count, 1),
  }

  return format === 'landscape' ? <CameraLandscape {...view} /> : <CameraPortrait {...view} />
}
