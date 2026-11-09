import { useCallback, useEffect, useRef, useState } from 'react'

import { clampZoom, type Format } from '../format'

export type CameraStatus =
  | 'idle' // ещё не запрашивали
  | 'starting' // ждём разрешение / прогрев камеры
  | 'ready' // поток идёт, кадры есть
  | 'denied' // пользователь запретил доступ
  | 'notfound' // камеры в системе нет
  | 'error' // всё остальное

type UseCameraOptions = {
  /** Запрашивать ли поток сразу при монтировании. */
  autoStart?: boolean
  /** Желаемое разрешение — камера подберёт ближайшее. */
  width?: number
  height?: number
  /** Камера, выбранная в настройках. Не нашлась — берём любую рабочую. */
  deviceId?: string
  /**
   * Имя той же камеры. id выдаёт браузер, и после сброса хранилища webview
   * он другой, а имя устройства остаётся прежним — по нему и находим.
   */
  deviceLabel?: string
}

/** Источник видео в системе: веб-камера, карта захвата, виртуальная камера. */
export type CameraDevice = { deviceId: string; label: string }

/**
 * Все источники видео. Имена браузер открывает только после того, как
 * доступ к камере уже дали, — до этого `label` пустой.
 */
async function listCameras(): Promise<CameraDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  try {
    const all = await navigator.mediaDevices.enumerateDevices()
    return all
      .filter((device) => device.kind === 'videoinput' && device.deviceId)
      .map((device) => ({ deviceId: device.deviceId, label: device.label }))
  } catch {
    return []
  }
}

/** Причина отказа словами — её показывает экран настройки. */
function describe(error: unknown): string {
  if (error instanceof DOMException) return `${error.name}: ${error.message}`
  return error instanceof Error ? error.message : String(error)
}

/** Соотношение сторон окна превью в каждом формате — по нему кадрируется снимок. */
export const PREVIEW_ASPECT: Record<Format, number> = {
  portrait: 1712 / 1848,
  landscape: 2102 / 1664,
}

/** Превью зеркалим — так привычнее; кадр снимаем таким же, каким его видели. */
export const MIRRORED = true

/**
 * Больше этого по длинной стороне снимок не отправляем. Модель всё равно
 * ужимает вход, а лишние мегабайты — это лишние секунды загрузки с площадки,
 * где сеть обычно так себе. 1600 с запасом хватает на черты лица.
 */
const MAX_SIDE = 1600

/**
 * Полезная часть кадра при масштабе `zoom` (настройка оператора, см.
 * CAMERA_ZOOM в format.ts). Оставляем долю 1/zoom по обеим осям: по
 * ширине — середину, по высоте — верх (голова всегда в верхней части
 * кадра, режем низ: стойку, руки, пояс).
 *
 * Числа одни на всех: снимок режет по ним `capture()`, превью —
 * `cropTransform()`. Разъехаться они не могут, иначе человек видел бы
 * одно, а снимался бы другой кадр.
 *
 * Доля по обеим осям одна: окно превью масштабируется одним числом, и
 * разные доли растянули бы картинку.
 */
function cropFor(zoom: number) {
  const keep = 1 / clampZoom(zoom)
  return { keep, left: (1 - keep) / 2, top: 0 }
}

/**
 * То же самое для `<video>`: увеличиваем и сдвигаем так, чтобы в окне
 * осталась ровно нужная часть. Порядок важен — translate считается до
 * масштаба, поэтому сдвиг задаётся в долях исходного размера.
 */
export function cropTransform(mirrored: boolean, zoom: number): string {
  const { keep, left, top } = cropFor(zoom)
  // Центр нужной области в долях кадра и насколько он смещён от середины.
  const shiftX = (0.5 - (left + keep / 2)) * 100
  const shiftY = (0.5 - (top + keep / 2)) * 100
  const scale = `scale(${(1 / keep).toFixed(4)})`
  const move = `translate(${shiftX.toFixed(4)}%, ${shiftY.toFixed(4)}%)`
  return `${mirrored ? 'scaleX(-1) ' : ''}${scale} ${move}`
}

/**
 * Живой поток с камеры. Отдаёт ref для <video>, статус и функцию
 * захвата кадра. Треки останавливаются при размонтировании — иначе
 * на панели останется гореть индикатор камеры.
 */

/**
 * Просим у камеры побольше: при сильном приближении от кадра остаётся
 * малая часть, и с 1920 на входе на ×2 вышло бы ~540 px по стороне —
 * маловато для лица. Лишнее потом ужимается до MAX_SIDE. `ideal` не
 * требование: камера послабее просто отдаст что может, ничего не сломается.
 */
export function useCamera({
  autoStart = true, width = 3840, height = 3840, deviceId, deviceLabel,
}: UseCameraOptions = {}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  /** Номер запуска: запуск, который обогнали, свой поток выбрасывает. */
  const runRef = useRef(0)
  const [status, setStatus] = useState<CameraStatus>('idle')
  /** Почему камера не включилась — дословно, для экрана настройки. */
  const [error, setError] = useState('')
  const [devices, setDevices] = useState<CameraDevice[]>([])
  /** Имя камеры, которая реально работает сейчас. */
  const [activeLabel, setActiveLabel] = useState('')

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  /**
   * Включить камеру. Повторный вызов перезапускает её с нуля — так
   * работает кнопка «Обновить список камер».
   *
   * Пробуем по очереди, от строгого к простому: выбранная камера в высоком
   * разрешении → она же как есть → любая в высоком разрешении → любое видео.
   * Камера по умолчанию бывает нерабочей (виртуальная, ИК-датчик Windows
   * Hello, занятая карта захвата), а иная камера отказывает на большом
   * разрешении, хотя на своём работает, — лесенка переживает и то и другое.
   */
  const start = useCallback(async () => {
    const run = ++runRef.current
    stop()
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('notfound')
      setError('Окно не даёт доступа к камерам (нет navigator.mediaDevices)')
      return
    }

    setStatus('starting')
    setError('')
    const found = await listCameras()
    const chosen = (deviceId && found.find((d) => d.deviceId === deviceId))
      || (deviceLabel && found.find((d) => d.label === deviceLabel))
      || null

    const size = { width: { ideal: width }, height: { ideal: height } }
    const attempts: (MediaTrackConstraints | true)[] = [
      ...(chosen ? [{ deviceId: { exact: chosen.deviceId }, ...size }, { deviceId: { exact: chosen.deviceId } }] : []),
      { facingMode: { ideal: 'user' }, ...size },
      true,
    ]

    let stream: MediaStream | null = null
    let failure: unknown = null
    for (const video of attempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video })
        break
      } catch (caught) {
        failure = caught
        // Запрет доступа другим вариантом не обойти — дальше не пробуем.
        const name = caught instanceof DOMException ? caught.name : ''
        if (name === 'NotAllowedError' || name === 'SecurityError') break
      }
    }

    // Пока ждали, камеру перезапустили или экран ушёл — этот поток лишний.
    if (run !== runRef.current) {
      stream?.getTracks().forEach((track) => track.stop())
      return
    }

    if (!stream) {
      const name = failure instanceof DOMException ? failure.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError') setStatus('denied')
      else if (name === 'NotFoundError' || name === 'OverconstrainedError') setStatus('notfound')
      else setStatus('error')
      setError(describe(failure))
      setDevices(await listCameras())
      return
    }

    const video = videoRef.current
    if (!video) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }
    streamRef.current = stream
    video.srcObject = stream
    await video.play().catch(() => undefined)
    setActiveLabel(stream.getVideoTracks()[0]?.label ?? '')
    setStatus('ready')
    // Теперь доступ есть — список придёт уже с именами камер.
    setDevices(await listCameras())
  }, [deviceId, deviceLabel, height, width, stop])

  useEffect(() => {
    if (autoStart) void start()
    return () => {
      runRef.current++
      stop()
    }
  }, [autoStart, start, stop])

  // Камеру подключили или отключили — обновляем список. Если до этого
  // включить ничего не удалось, пробуем снова: возможно, это та самая.
  const statusRef = useRef(status)
  statusRef.current = status
  useEffect(() => {
    const media = navigator.mediaDevices
    if (!media?.addEventListener) return
    const onChange = () => {
      void listCameras().then(setDevices)
      if (autoStart && statusRef.current !== 'ready' && statusRef.current !== 'starting') void start()
    }
    media.addEventListener('devicechange', onChange)
    return () => media.removeEventListener('devicechange', onChange)
  }, [autoStart, start])

  /**
   * Снимок текущего кадра. Кадрируется под заданное соотношение сторон
   * так же, как object-fit: cover в превью, — чтобы фото совпало с тем,
   * что человек видел на экране.
   */
  const capture = useCallback(
    (aspect: number, mirrored: boolean, zoom: number): string | null => {
      const video = videoRef.current
      if (!video || !video.videoWidth || !video.videoHeight) return null

      const { videoWidth: vw, videoHeight: vh } = video
      // Сперва как object-fit: cover — приводим к нужному соотношению сторон.
      const fitW = Math.min(vw, vh * aspect)
      const fitH = Math.min(vh, vw / aspect)
      const fitX = (vw - fitW) / 2
      const fitY = (vh - fitH) / 2

      // Затем приближаем по настройке масштаба. Соотношение сторон при этом
      // сохраняется: режем обе оси в одну долю.
      const { keep, left, top } = cropFor(zoom)
      const srcW = fitW * keep
      const srcH = fitH * keep
      const srcX = fitX + fitW * left
      const srcY = fitY + fitH * top

      const scale = Math.min(1, MAX_SIDE / Math.max(srcW, srcH))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(srcW * scale)
      canvas.height = Math.round(srcH * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return null

      if (mirrored) {
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
      }
      ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/jpeg', 0.9)
    },
    [],
  )

  return { videoRef, status, error, devices, activeLabel, start, stop, capture }
}
