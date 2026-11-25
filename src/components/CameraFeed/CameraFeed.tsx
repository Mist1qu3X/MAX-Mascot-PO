import { useEffect, type CSSProperties, type RefObject } from 'react'

import type { Rotation } from '../../format'
import { cropTransform } from '../../hooks/useCamera'
import type { CameraState } from '../../hooks/useCameraSource'

type CameraFeedProps = {
  camera: CameraState
  /** Класс окна: размер и место задаёт раскладка экрана. */
  className?: string
  /** Показывать картинку. До первого кадра окно остаётся тёмным. */
  visible?: boolean
  /**
   * Держать ли поток превью открытым. После снимка он не нужен, а пока
   * открыт, зеркалка не выходит из Live View — зря греется сенсор.
   */
  streaming?: boolean
  mirrored: boolean
  zoom: number
  rotation: Rotation
  /** Соотношение сторон окна — нужно, чтобы повернуть кадр боком без искажений. */
  aspect: number
}

/**
 * Сам кадр внутри окна. Повёрнутый на четверть оборота элемент кладём с
 * переставленными сторонами: ширина — высота окна и наоборот. Тогда после
 * поворота он ложится в окно ровно, и object-fit: cover обрезает его так же,
 * как обрезается снимок (см. renderShot).
 */
function mediaStyle(rotation: Rotation, aspect: number): CSSProperties {
  if (rotation === 90 || rotation === 270) {
    return {
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: `${100 / aspect}%`,
      height: `${100 * aspect}%`,
      // В reset.css у картинок max-width: 100%, а повёрнутый кадр шире окна.
      maxWidth: 'none',
      objectFit: 'cover',
      transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
    }
  }
  return {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform: rotation === 180 ? 'rotate(180deg)' : undefined,
  }
}

/**
 * Поток кадров зеркалки. Отдельным компонентом ради одной вещи: уходя с
 * экрана, поток надо оборвать самим. Браузер продолжает качать его и для
 * картинки, которую уже убрали со страницы, — до сборки мусора, то есть
 * неизвестно сколько. А пока поток открыт, камера не выходит из Live View.
 */
function LiveImage({ imgRef, src, style }: { imgRef: RefObject<HTMLImageElement | null>; src: string; style: CSSProperties }) {
  useEffect(() => {
    const img = imgRef.current
    // Адрес ставим и здесь, не только в разметке: уборка ниже его снимает, а
    // React после неё атрибут сам не возвращает (смена адреса, StrictMode).
    if (img && img.getAttribute('src') !== src) img.src = src
    return () => img?.removeAttribute('src')
  }, [imgRef, src])

  return <img ref={imgRef} src={src} style={style} alt="" draggable={false} />
}

/**
 * Живая картинка камеры: `<video>` для веб-камеры, `<img>` с потоком кадров
 * для зеркалки. Снаружи — обёртка с зеркалом и приближением (те же числа,
 * что у снимка), внутри — кадр с поворотом. Порядок важен: зеркалится уже
 * повёрнутая картинка, как её видит человек.
 */
export function CameraFeed({
  camera, className, visible = true, streaming = true, mirrored, zoom, rotation, aspect,
}: CameraFeedProps) {
  const style = mediaStyle(rotation, aspect)

  return (
    <div
      className={className}
      style={{ transform: cropTransform(mirrored, zoom) }}
      data-visible={visible ? '' : undefined}
    >
      {camera.source === 'canon' ? (
        // Пустой src браузер читает как адрес страницы — до первого адреса <img> не ставим.
        streaming && camera.liveUrl && <LiveImage imgRef={camera.imgRef} src={camera.liveUrl} style={style} />
      ) : (
        <video ref={camera.videoRef} style={style} autoPlay playsInline muted />
      )}
    </div>
  )
}
