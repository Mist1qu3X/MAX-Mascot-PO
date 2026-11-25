/**
 * Копия кадра, ушедшего в обработку, — в папку shots рядом с программой.
 *
 * Включается галочкой на экране настройки и нужна при наладке: по этим
 * файлам видно, что на самом деле сняла камера — резкость, кадрирование,
 * поворот. На мероприятии галочку стоит снять: это лица посетителей.
 * В браузере писать некуда, там функция ничего не делает.
 */

import { appPath, filesystem } from './desktop'

const pad = (value: number) => String(value).padStart(2, '0')

function stamp(date: Date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
    + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

export async function saveShot(dataUrl: string): Promise<void> {
  const fs = await filesystem()
  const home = appPath()
  if (!fs?.writeBinaryFile || !home) return

  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  const dir = `${home}/shots`
  // Папка уже есть — это ошибка только для createDirectory, не для нас.
  await fs.createDirectory?.(dir).catch(() => undefined)
  try {
    await fs.writeBinaryFile(`${dir}/sent-${stamp(new Date())}.jpg`, bytes.buffer)
  } catch (error) {
    console.warn('[shots] кадр не сохранён', error)
  }
}
