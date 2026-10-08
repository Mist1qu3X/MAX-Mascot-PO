import { useEffect, useRef, useState } from 'react'

type UseCountdownOptions = {
  /** С какой цифры считаем. */
  from: number
  /** Пока false — отсчёт не идёт и стоит на исходной цифре. */
  active: boolean
  /** Шаг отсчёта, мс. */
  stepMs?: number
  /** Вызывается один раз, когда отсчёт дошёл до нуля. */
  onDone: () => void
}

/**
 * Обратный отсчёт для съёмки. Считает только пока active — то есть
 * не начинает, пока камера не отдала первый кадр.
 */
export function useCountdown({ from, active, stepMs = 1000, onDone }: UseCountdownOptions) {
  const [value, setValue] = useState(from)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    // Останавливаемся молча: цифру не сбрасываем, иначе после съёмки
    // кружок мигнёт исходным числом.
    if (!active) return

    setValue(from)
    let current = from
    const timer = setInterval(() => {
      current -= 1
      setValue(current)
      if (current <= 0) {
        clearInterval(timer)
        onDoneRef.current()
      }
    }, stepMs)

    return () => clearInterval(timer)
  }, [active, from, stepMs])

  return value
}
