import { useEffect, useState } from 'react'

import QRCode from 'qrcode'

type QrCodeProps = {
  /** Что кодируем — ссылка на картинку маскота. */
  value: string
  className?: string
  /**
   * Запасная картинка. Осознанно не используется на экране результата:
   * ссылка приходит на долю секунды позже самого экрана, и всё это время
   * посетитель видел бы QR из макета — вполне сканируемый и ведущий не туда.
   * Пустое место честнее.
   */
  fallback?: string
}

/**
 * QR рисуется на месте, из ссылки на готового маскота.
 *
 * Библиотека работает офлайн и попадает в бандл — панели не нужен
 * ни интернет для отрисовки кода, ни сторонний сервис.
 */
export function QrCode({ value, className, fallback }: QrCodeProps) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!value) {
      setSrc(null)
      return
    }
    let alive = true
    QRCode.toDataURL(value, {
      errorCorrectionLevel: 'M',
      // Поле вокруг кода: у картинки из макета оно было вшито в файл,
      // повторяем, иначе код распирает плашку и наезжает на текст.
      margin: 3,
      scale: 12,
      color: { dark: '#000000ff', light: '#00000000' },
    })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null))
    return () => {
      alive = false
    }
  }, [value])

  const shown = src ?? fallback
  if (!shown) return <span className={className} aria-hidden />
  return <img className={className} src={shown} alt="" draggable={false} />
}
