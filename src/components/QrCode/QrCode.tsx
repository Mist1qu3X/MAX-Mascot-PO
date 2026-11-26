import { useEffect, useState } from 'react'

import QRCode from 'qrcode'

import maxIcon from '../../assets/max-icon.png'

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
 * Поле вокруг кода, в модулях. У картинки из макета оно было вшито в файл,
 * повторяем, иначе код распирает плашку и наезжает на текст.
 */
const MARGIN = 3
/** Пикселей на модуль: картинка с запасом крупнее, чем окно на экране. */
const SCALE = 12
/**
 * Доля стороны кода под цветной знак MAX в центре. Код собирается с
 * уровнем коррекции H: он переживает потерю до 30% данных, а знак
 * закрывает около 6% модулей — запас остаётся и на блики стекла зеркала.
 */
const LOGO_SHARE = 0.24
/** Отступ знака от края выреза — чтобы он не слипался с модулями. */
const LOGO_INSET = 0.08

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`не загрузилась картинка ${src}`))
    image.src = src
  })
}

/**
 * Рисуем код сами, а не берём готовую картинку у библиотеки: под знак в
 * центре нужен вырез ровно по сетке модулей. Знак поверх целых модулей
 * сканер прочитал бы хуже, чем честную дыру в них.
 */
async function render(value: string): Promise<string> {
  const qr = QRCode.create(value, { errorCorrectionLevel: 'H' })
  const n = qr.modules.size
  // Вырез — квадрат из целых модулей точно по центру: у нечётной стороны
  // кода и вырез нечётный, иначе он сместится на полмодуля.
  let hole = Math.round(n * LOGO_SHARE)
  if ((n - hole) % 2) hole += 1
  const from = (n - hole) / 2
  const to = from + hole

  const side = (n + MARGIN * 2) * SCALE
  const canvas = document.createElement('canvas')
  canvas.width = side
  canvas.height = side
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('нет canvas')

  // Светлые модули прозрачные: под кодом белая плашка экрана.
  ctx.fillStyle = '#000000'
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (row >= from && row < to && col >= from && col < to) continue
      if (qr.modules.get(row, col)) ctx.fillRect((col + MARGIN) * SCALE, (row + MARGIN) * SCALE, SCALE, SCALE)
    }
  }

  const logo = await loadImage(maxIcon)
  const box = hole * SCALE
  const inset = box * LOGO_INSET
  const at = (from + MARGIN) * SCALE + inset
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(logo, at, at, box - inset * 2, box - inset * 2)

  return canvas.toDataURL('image/png')
}

/**
 * QR рисуется на месте, из ссылки на готового маскота, с цветным знаком
 * MAX в центре.
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
    render(value)
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
