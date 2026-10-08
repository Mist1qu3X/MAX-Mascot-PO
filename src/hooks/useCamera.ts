import { useCallback, useEffect, useRef, useState } from 'react'

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
}

/**
 * Живой поток с камеры. Отдаёт ref для <video>, статус и функцию
 * захвата кадра. Треки останавливаются при размонтировании — иначе
 * на панели останется гореть индикатор камеры.
 */
/**
 * Полезная часть кадра. Камера на панели широкоугольная и захватывает лишнее:
 * по бокам попадают прохожие, снизу — стойка и руки. Оставляем центральную
 * половину по ширине (то есть срезаем по 25% слева и справа) и верхнюю
 * половину по высоте.
 *
 * Числа живут здесь одни на всех: снимок режет по ним `capture()`, превью —
 * `cropTransform()`. Разъехаться они не могут, иначе человек видел бы одно,
 * а снимался бы другой кадр.
 *
 * ВАЖНО: доли по горизонтали и по вертикали должны совпадать —
 * `left + right` равно `top + bottom`. Кадр после обрезки обязан остаться
 * квадратным: карточка квадратная, а превью масштабируется одним числом по
 * обеим осям. Тронуть только низ нельзя — картинка растянется по вертикали.
 *
 * Сейчас остаётся 60% кадра: срез проходит чуть ниже груди, длинные волосы
 * в кадр помещаются. Было 50% — резало по грудь, и модель дорисовывала
 * короткую стрижку, потому что длины волос на входе просто не видела.
 */
/**
 * Какую долю кадра оставляем. Одно число на обе оси — так квадрат нельзя
 * сломать по невнимательности: тронешь только низ, и превью растянется.
 * 0.6 — срез чуть ниже груди; 0.5 резало по грудь и съедало длинные волосы.
 */
const KEEP = 0.6
/** Сверху не режем: голова всегда в верхней части кадра. */
const KEEP_X = KEEP
const KEEP_Y = KEEP

export const CAMERA_CROP = {
  left: (1 - KEEP) / 2,
  right: (1 - KEEP) / 2,
  top: 0,
  bottom: 1 - KEEP,
}

/**
 * То же самое для `<video>`: увеличиваем и сдвигаем так, чтобы в окне
 * осталась ровно нужная часть. Порядок важен — translate считается до
 * масштаба, поэтому сдвиг задаётся в долях исходного размера.
 */
export function cropTransform(mirrored: boolean): string {
  // Центр нужной области в долях кадра и насколько он смещён от середины.
  const shiftX = (0.5 - (CAMERA_CROP.left + KEEP_X / 2)) * 100
  const shiftY = (0.5 - (CAMERA_CROP.top + KEEP_Y / 2)) * 100
  const zoom = `scale(${(1 / KEEP_X).toFixed(4)}, ${(1 / KEEP_Y).toFixed(4)})`
  const move = `translate(${shiftX.toFixed(4)}%, ${shiftY.toFixed(4)}%)`
  return `${mirrored ? 'scaleX(-1) ' : ''}${zoom} ${move}`
}

/**
 * Просим у камеры побольше: обрезка широкого угла оставляет четверть площади
 * кадра. С 1920 на выходе было бы ~540 px по стороне — маловато для модели,
 * которая рисует в 2K. `ideal` не требование: камера послабее просто отдаст
 * что может, ничего не сломается.
 */
export function useCamera({ autoStart = true, width = 3840, height = 3840 }: UseCameraOptions = {}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>('idle')

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const start = useCallback(async () => {
    if (streamRef.current) return
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('notfound')
      return
    }

    setStatus('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          // ideal, а не exact: на панели камера обычно одна и без facingMode
          facingMode: { ideal: 'user' },
          width: { ideal: width },
          height: { ideal: height },
        },
      })

      streamRef.current = stream
      const video = videoRef.current
      if (!video) {
        // Экран успел размонтироваться, пока ждали разрешение.
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        return
      }

      video.srcObject = stream
      await video.play().catch(() => undefined)
      setStatus('ready')
    } catch (error) {
      const name = error instanceof DOMException ? error.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError') setStatus('denied')
      else if (name === 'NotFoundError' || name === 'OverconstrainedError') setStatus('notfound')
      else setStatus('error')
    }
  }, [height, width])

  useEffect(() => {
    if (autoStart) void start()
    return stop
  }, [autoStart, start, stop])

  /**
   * Снимок текущего кадра. Кадрируется под заданное соотношение сторон
   * так же, как object-fit: cover в превью, — чтобы фото совпало с тем,
   * что человек видел на экране.
   */
  const capture = useCallback(
    (aspect: number, mirrored: boolean): string | null => {
      const video = videoRef.current
      if (!video || !video.videoWidth || !video.videoHeight) return null

      const { videoWidth: vw, videoHeight: vh } = video
      // Сперва как object-fit: cover — приводим к нужному соотношению сторон.
      const fitW = Math.min(vw, vh * aspect)
      const fitH = Math.min(vh, vw / aspect)
      const fitX = (vw - fitW) / 2
      const fitY = (vh - fitH) / 2

      // Затем отрезаем лишнее, что нахватала широкоугольная оптика.
      // Соотношение сторон при этом сохраняется: режем обе стороны поровну.
      const srcW = fitW * KEEP_X
      const srcH = fitH * KEEP_Y
      const srcX = fitX + fitW * CAMERA_CROP.left
      const srcY = fitY + fitH * CAMERA_CROP.top

      const canvas = document.createElement('canvas')
      canvas.width = Math.round(srcW)
      canvas.height = Math.round(srcH)
      const ctx = canvas.getContext('2d')
      if (!ctx) return null

      if (mirrored) {
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
      }
      ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/jpeg', 0.92)
    },
    [],
  )

  return { videoRef, status, start, stop, capture }
}
