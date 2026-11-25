import { useCallback, useEffect, useRef, useState } from 'react'

import { CameraFeed } from '../../components/CameraFeed/CameraFeed'
import type { CameraSource, Format, Rotation } from '../../format'
import { MIRRORED, PREVIEW_ASPECT } from '../../hooks/useCamera'
import { useCameraSource } from '../../hooks/useCameraSource'
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

/**
 * Зеркалка снимает не мгновенно: наводка, затвор и передача файла занимают
 * секунду-другую. Поэтому резкость наводим заранее, на счёт «три», а затвор
 * жмём на счёт «один» — человек ещё стоит в позе, а готовый кадр приезжает
 * как раз к нулю. Веб-камера по-прежнему снимает на ноль.
 */
const CANON_FOCUS_AT = 3
const CANON_SHOOT_AT = 1

/** Сколько висит «камера недоступна», прежде чем вернуться к началу. */
const FAIL_HOLD_MS = 4000

type CameraScreenProps = {
  format: Format
  /** Масштаб камеры из настроек: 1 — весь кадр. */
  zoom: number
  /** Поворот кадра из настроек — если камера стоит боком. */
  rotation: Rotation
  /** Веб-камера или зеркалка Canon напрямую. */
  source: CameraSource
  /** Камера из настроек; не задана или не нашлась — любая рабочая. */
  cameraId?: string
  cameraLabel?: string
  /** Сохранять оригинал снимка с зеркалки в папку shots. */
  saveOriginals?: boolean
  /** Готовый кадр в формате data:image/jpeg. */
  onCapture?: (photo: string) => void
  /** Снять не удалось — вернуться к началу. */
  onFail?: () => void
}

export function CameraScreen({
  format, zoom, rotation, source, cameraId, cameraLabel, saveOriginals = false, onCapture, onFail,
}: CameraScreenProps) {
  const t = useTexts()
  const camera = useCameraSource({ source, deviceId: cameraId, deviceLabel: cameraLabel })
  const { status, capture, focus } = camera

  // Внутри компонента, а не константой модуля: тексты зависят от языка.
  const statusMessage: Record<string, string> = {
    starting: t.cameraStarting,
    denied: t.cameraDenied,
    notfound: t.cameraMissing,
    error: t.cameraBroken,
  }
  const [shot, setShot] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  /** Снимок зеркалки, начатый до конца отсчёта. */
  const early = useRef<Promise<string | null> | null>(null)

  const take = useCallback(
    () => capture(PREVIEW_ASPECT[format], MIRRORED, zoom, rotation, saveOriginals),
    [capture, format, rotation, saveOriginals, zoom],
  )

  const handleDone = useCallback(() => {
    void (early.current ?? take()).then((photo) => {
      if (!photo) {
        setFailed(true)
        return
      }
      setShot(photo)
      onCapture?.(photo)
    })
  }, [onCapture, take])

  // Отсчёт стартует только когда пошёл живой кадр, а не при открытии экрана.
  const counting = status === 'ready' && shot === null && !failed
  const count = useCountdown({
    from: COUNTDOWN_FROM,
    active: counting,
    onDone: handleDone,
  })

  useEffect(() => {
    if (source !== 'canon' || !counting) return
    if (count === CANON_FOCUS_AT) focus()
    if (count === CANON_SHOOT_AT && !early.current) early.current = take()
  }, [count, counting, focus, source, take])

  // Снять не вышло: говорим об этом и уходим на приветствие, а не висим на «1».
  useEffect(() => {
    if (!failed) return
    const timer = window.setTimeout(() => onFail?.(), FAIL_HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [failed, onFail])

  const live = counting
  const view = {
    renderFeed: (className: string) => (
      <CameraFeed
        camera={camera}
        className={className}
        visible={live}
        streaming={shot === null && !failed}
        mirrored={MIRRORED}
        zoom={zoom}
        rotation={rotation}
        aspect={PREVIEW_ASPECT[format]}
      />
    ),
    shot,
    message: failed ? t.cameraBroken : statusMessage[status],
    count: Math.max(count, 1),
  }

  return format === 'landscape' ? <CameraLandscape {...view} /> : <CameraPortrait {...view} />
}
