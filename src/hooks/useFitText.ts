import { useLayoutEffect, useRef } from 'react'

/**
 * Ужимает текст, если он не влез в свою колонку.
 *
 * Зачем. Все размеры в макете заданы в его же пикселях и рассчитаны на
 * VK Sans Display. Стоит подставиться другому шрифту — например, когда
 * файл не догрузился и webview взял системный, — и строка становится шире
 * на несколько процентов. Этого хватает, чтобы «MAX» уехало за край плашки.
 *
 * Пока текст помещается, хук не делает ничего и вёрстка остаётся ровно
 * такой, как в макете. Ужимает только по необходимости и не ниже `min`:
 * лучше чуть мельче, чем срезанная буква.
 */
export function useFitText<T extends HTMLElement>(deps: unknown[] = [], min = 0.8) {
  const ref = useRef<T>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    element.style.removeProperty('font-size')
    const base = Number.parseFloat(getComputedStyle(element).fontSize)
    if (!Number.isFinite(base) || base <= 0) return

    const fits = () => element.scrollWidth <= element.clientWidth + 1

    // Шаг в один процент: незаметно на глаз и сходится за десяток проходов.
    let scale = 1
    while (!fits() && scale > min) {
      scale -= 0.01
      element.style.fontSize = `${base * scale}px`
    }
    if (scale >= 1) element.style.removeProperty('font-size')

    // Шрифт приезжает позже первой отрисовки — после него меряем заново.
    let alive = true
    void document.fonts?.ready.then(() => {
      if (!alive || !ref.current) return
      ref.current.style.removeProperty('font-size')
      let again = 1
      while (ref.current.scrollWidth > ref.current.clientWidth + 1 && again > min) {
        again -= 0.01
        ref.current.style.fontSize = `${base * again}px`
      }
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return ref
}
