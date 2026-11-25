/**
 * Служебные углы экрана. В левом верхнем удержание открывает настройку,
 * в правом верхнем пять касаний закрывают приложение.
 *
 * Границы одни на всех: жесты их слушают, а экраны с «коснитесь, чтобы
 * начать» в этих углах касание пропускают. Иначе выйти было нельзя:
 * первое же касание в углу запускало съёмку, и жест до конца не доходил.
 */

/** Сторона угла — доля меньшей стороны окна: квадрат, а не полоса во весь заголовок. */
const CORNER = 0.15

const side = () => Math.min(window.innerWidth, window.innerHeight) * CORNER

export function inSetupCorner(x: number, y: number) {
  return x < side() && y < side()
}

export function inQuitCorner(x: number, y: number) {
  return x > window.innerWidth - side() && y < side()
}

/** Обработчик касания, который не срабатывает в служебных углах. */
export function outsideCorners(handler?: () => void) {
  return (event: { clientX: number; clientY: number }) => {
    if (inSetupCorner(event.clientX, event.clientY) || inQuitCorner(event.clientX, event.clientY)) return
    handler?.()
  }
}
