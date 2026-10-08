import { useEffect, useRef, useState } from 'react'

/**
 * Сколько ждём основной адрес, прежде чем переключиться на запасной.
 * Не по onError: если хост не отвечает вовсе, ошибки можно ждать десятки
 * секунд, и всё это время в рамке пусто.
 */
const FALLBACK_MS = 2500

type MascotImageProps = {
  className: string
  src: string
  /** Второй адрес той же картинки — копия на нашем сервере. */
  backup?: string | null
  alt: string
}

/**
 * Маскот на экране результата: два адреса одной картинки, показываем тот,
 * что доедет первым.
 *
 * Основной — то, что уже есть у панели: своя скачанная копия, а если
 * скачать не вышло, прямая ссылка на kie.ai. Второе стоит пояснить: fetch
 * туда запрещён браузером (хост результатов не отдаёт CORS-заголовки), но
 * <img> кросс-домен грузит свободно — то есть картинка показывается, хотя
 * скопировать её себе панель и не смогла.
 *
 * Запасной — копия на нашем сервере. Она приезжает позже: сервер к этому
 * моменту ещё качает её у kie.ai. Поэтому первой её ставить не стоит, а
 * второй — в самый раз: она выручает, когда до kie.ai панель не достаёт.
 */
export function MascotImage({ className, src, backup, alt }: MascotImageProps) {
  const [source, setSource] = useState(src)
  const [failed, setFailed] = useState(false)
  const loaded = useRef(false)

  useEffect(() => {
    loaded.current = false
    setFailed(false)
    setSource(src)
  }, [src])

  useEffect(() => {
    if (!backup || source === backup) return
    const timer = setTimeout(() => {
      if (!loaded.current) setSource(backup)
    }, FALLBACK_MS)
    return () => clearTimeout(timer)
  }, [source, backup])

  // Битая картинка с подписью выглядит хуже пустой рамки: оба адреса
  // подвели — убираем её вовсе.
  if (failed) return null

  return (
    <img
      className={className}
      src={source}
      alt={alt}
      onLoad={() => {
        loaded.current = true
      }}
      onError={() => {
        if (backup && source !== backup) setSource(backup)
        else setFailed(true)
      }}
    />
  )
}
