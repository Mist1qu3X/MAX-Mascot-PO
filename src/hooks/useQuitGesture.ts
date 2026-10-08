import { useEffect } from 'react'

/** Доля экрана в углу, которая считается «секретной» зоной. */
const CORNER = 0.08
/** Сколько касаний подряд закрывают приложение. */
const TAPS = 5
/** Не дольше этого между касаниями, иначе счёт сбрасывается. */
const GAP_MS = 600

/**
 * Пять быстрых касаний в правом верхнем углу закрывают приложение.
 *
 * На панели нет ни клавиатуры, ни рамки окна, а само окно висит поверх
 * всего — выйти из него иначе нечем. Угол выбран правый верхний, чтобы
 * не путаться с левым: там долгое удержание открывает настройку.
 *
 * Пять касаний, а не одно: случайно попасть в угол легко, попасть пять
 * раз подряд быстрее чем за полсекунды — уже нет.
 */
export function useQuitGesture(onQuit: () => void) {
  useEffect(() => {
    let taps = 0
    let last = 0

    const onDown = (event: PointerEvent) => {
      const inCorner =
        event.clientX > window.innerWidth * (1 - CORNER) && event.clientY < window.innerHeight * CORNER

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
