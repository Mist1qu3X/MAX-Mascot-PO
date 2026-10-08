import { useEffect } from 'react'

/** Доля экрана в углу, которая считается «секретной» зоной. */
const CORNER = 0.08
/** Сколько держать палец, чтобы открылась настройка. */
const HOLD_MS = 3000
/** Насколько можно сместить палец, не отменяя удержание. */
const SLACK_PX = 40

/**
 * Долгое удержание в левом верхнем углу открывает настройку панели.
 *
 * В упакованном приложении адресной строки нет, так что #setup туда не
 * ввести — жест остаётся единственным способом переиграть ориентацию
 * и язык, не переустанавливая приложение.
 *
 * Слушаем на документе, а не отдельным элементом: так обычное касание
 * экрана в этом углу продолжает работать как раньше.
 */
export function useSetupGesture(onTrigger: () => void) {
  useEffect(() => {
    let timer: number | undefined
    let origin: { x: number; y: number } | null = null

    const cancel = () => {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      origin = null
    }

    const onDown = (event: PointerEvent) => {
      const inCorner = event.clientX < window.innerWidth * CORNER && event.clientY < window.innerHeight * CORNER
      if (!inCorner) return
      origin = { x: event.clientX, y: event.clientY }
      timer = window.setTimeout(() => {
        cancel()
        onTrigger()
      }, HOLD_MS)
    }

    const onMove = (event: PointerEvent) => {
      if (!origin) return
      if (Math.abs(event.clientX - origin.x) > SLACK_PX || Math.abs(event.clientY - origin.y) > SLACK_PX) cancel()
    }

    document.addEventListener('pointerdown', onDown)
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', cancel)
    document.addEventListener('pointercancel', cancel)
    return () => {
      cancel()
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', cancel)
      document.removeEventListener('pointercancel', cancel)
    }
  }, [onTrigger])
}
