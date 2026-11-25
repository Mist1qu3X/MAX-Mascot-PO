import { useEffect } from 'react'

import { inQuitCorner } from '../corners'

/** Сколько касаний подряд закрывают приложение. */
const TAPS = 5
/**
 * Не дольше этого между касаниями, иначе счёт сбрасывается. Секунда, а не
 * полсекунды: сенсорная рамка зеркала отдаёт касания медленнее планшета.
 */
const GAP_MS = 1000

/**
 * Пять быстрых касаний в правом верхнем углу закрывают приложение.
 *
 * На панели нет ни клавиатуры, ни рамки окна, а само окно висит поверх
 * всего — выйти из него иначе нечем. Угол выбран правый верхний, чтобы
 * не путаться с левым: там долгое удержание открывает настройку.
 *
 * Пять касаний, а не одно: случайно попасть в угол легко, попасть пять
 * раз подряд — уже нет. Экраны ожидания касание в этом углу пропускают
 * (см. corners.ts), так что съёмка от жеста не запускается.
 */
export function useQuitGesture(onQuit: () => void) {
  useEffect(() => {
    let taps = 0
    let last = 0

    const onDown = (event: PointerEvent) => {
      const inCorner = inQuitCorner(event.clientX, event.clientY)

      // Касание мимо угла сбивает счёт: иначе редкие попадания за день
      // накопились бы в пятёрку и закрыли приложение посреди смены.
      if (!inCorner) {
        taps = 0
        return
      }

      const now = Date.now()
      taps = now - last > GAP_MS ? 1 : taps + 1
      last = now

      if (taps >= TAPS) {
        taps = 0
        onQuit()
      }
    }

    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [onQuit])
}
