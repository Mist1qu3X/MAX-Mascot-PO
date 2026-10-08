/**
 * Режим киоска: глушим всё, чем посетитель может сдвинуть или увеличить
 * картинку. Часть закрыта в `reset.css` (`touch-action: none`, запрет
 * выделения и системного меню по долгому нажатию), но CSS не умеет
 * отменять то, что ниже — этим занимается этот модуль.
 *
 * Каждый обработчик пассивным быть не может: смысл именно в
 * `preventDefault`, а пассивным слушателям он запрещён.
 */

/** Щипок трекпадом и Ctrl+колесо — это браузерный зум, а не прокрутка. */
function blockWheelZoom(event: WheelEvent) {
  if (event.ctrlKey || event.metaKey) event.preventDefault()
}

/** Зум с клавиатуры: Ctrl/Cmd и +, -, 0, а также цифровая клавиатура. */
function blockKeyZoom(event: KeyboardEvent) {
  if (!event.ctrlKey && !event.metaKey) return
  if (['+', '-', '=', '_', '0'].includes(event.key)) event.preventDefault()
}

/** Два и больше пальцев — щипок. Одиночное касание не трогаем. */
function blockMultiTouch(event: TouchEvent) {
  if (event.touches.length > 1) event.preventDefault()
}

const stop = (event: Event) => event.preventDefault()

/**
 * Вызывается один раз при старте. Снимать обработчики некому и незачем:
 * приложение живёт до выключения панели.
 */
export function lockKiosk() {
  window.addEventListener('wheel', blockWheelZoom, { passive: false })
  window.addEventListener('keydown', blockKeyZoom)
  window.addEventListener('touchstart', blockMultiTouch, { passive: false })
  window.addEventListener('touchmove', blockMultiTouch, { passive: false })

  // Жесты WebKit: щипок в Safari и в системном webview на macOS приходит
  // отдельными событиями, к touch-эмуляции они не сводятся.
  for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
    window.addEventListener(name, stop as EventListener, { passive: false })
  }

  // Меню по правой кнопке и долгому нажатию, перетаскивание картинок.
  window.addEventListener('contextmenu', stop)
  window.addEventListener('dragstart', stop)

  // Двойной тап по-прежнему может масштабировать там, где touch-action
  // не сработал: ловим второе касание в пределах трети секунды.
  let lastTouch = 0
  window.addEventListener('touchend', (event) => {
    const now = Date.now()
    if (now - lastTouch < 330) event.preventDefault()
    lastTouch = now
  }, { passive: false })
}
