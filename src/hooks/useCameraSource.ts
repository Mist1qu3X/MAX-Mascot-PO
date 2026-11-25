import { useCallback } from 'react'

import type { CameraSource, Rotation } from '../format'
import { useCamera } from './useCamera'
import { useCanon } from './useCanon'

type Options = {
  source: CameraSource
  /** Веб-камера из настроек; для зеркалки не используется. */
  deviceId?: string
  deviceLabel?: string
}

/**
 * Камера панели, какой бы она ни была. Экранам съёмки и настройки всё равно,
 * откуда картинка: статус, превью (`CameraFeed`) и снимок выглядят одинаково.
 *
 * Оба хука вызываются всегда — так требует React, — но работает один:
 * второй не открывает поток и не трогает устройство. Это важно: веб-камера
 * EOS Webcam Utility и прямое подключение делят одну и ту же зеркалку.
 */
export function useCameraSource({ source, deviceId, deviceLabel }: Options) {
  const canonOn = source === 'canon'
  const webcam = useCamera({ autoStart: !canonOn, deviceId, deviceLabel })
  const canon = useCanon(canonOn)

  const webcamCapture = webcam.capture
  const canonCapture = canon.capture
  const capture = useCallback(
    (aspect: number, mirrored: boolean, zoom: number, rotation: Rotation, save = false): Promise<string | null> =>
      canonOn
        ? canonCapture(aspect, mirrored, zoom, rotation, save)
        : Promise.resolve(webcamCapture(aspect, mirrored, zoom, rotation)),
    [canonOn, canonCapture, webcamCapture],
  )

  return {
    source,
    videoRef: webcam.videoRef,
    imgRef: canon.imgRef,
    liveUrl: canon.liveUrl,
    status: canonOn ? canon.status : webcam.status,
    error: canonOn ? canon.error : webcam.error,
    /** Веб-камеры системы — список нужен и при зеркалке, чтобы к ним вернуться. */
    devices: webcam.devices,
    activeLabel: webcam.activeLabel,
    /** Что сообщает помощник Canon: модель, размер превью, последний снимок. */
    canon: canon.info,
    restart: canonOn ? canon.restart : webcam.start,
    capture,
    /** Начать наводку резкости заранее. У веб-камеры наводить нечего. */
    focus: canon.focus,
  }
}

export type CameraState = ReturnType<typeof useCameraSource>
