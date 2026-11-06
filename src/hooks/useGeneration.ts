import { useCallback, useEffect, useRef, useState } from 'react'

import { GenerationError, generateMascot, type FailureReason } from '../services/kie'
import { ensureDarkBackdrop } from '../services/backdrop'
import { checkPhoto, type Verdict } from '../services/moderation'
import { pushCopy, stickerLink, type StickerLink } from '../sticker'

export type GenerationState = 'idle' | 'running' | 'done' | 'error'

/**
 * Сервис не отдаёт настоящий прогресс — только «в очереди / готово».
 * Раньше шкала считалась по этапам, у каждого свой отрезок процентов. Модель
 * была честнее, но ломалась заметнее: если запрос подвисал, шкала намертво
 * вставала на асимптоте своего этапа — те самые 12% на загрузке кадра.
 *
 * Теперь проще и предсказуемее: шкала едет по времени и доходит до конца за
 * минуту. Успели раньше — прыгает в 100% и уходит на результат. Не успели —
 * замирает у края, а подпись меняется на «осталось совсем немного», потому
 * что честнее сказать это словами, чем делать вид, что проценты ещё идут.
 */
/**
 * Общий предел на весь цикл. У каждого запроса свой таймаут, но в сумме они
 * дают до десяти минут: загрузка, создание задачи, отрисовка, скачивание,
 * починка фона. Панель стоит без присмотра — если что-то пошло не так,
 * лучше честно сказать «попробуйте ещё раз», чем держать человека.
 */
const DEADLINE_MS = 180_000

const FILL_MS = 60_000
/** Выше этого без готовой картинки не поднимаемся: 100% значит «готово». */
const CAP = 0.99
/** Постоянная сглаживания показываемого значения. */
const SMOOTH_MS = 220

export function useGeneration() {
  const [state, setState] = useState<GenerationState>('idle')
  const [progress, setProgress] = useState(0)
  /** Минута вышла, а картинки нет — подпись на экране меняется. */
  const [overdue, setOverdue] = useState(false)
  const [mascot, setMascot] = useState<string | null>(null)
  /** Второй источник той же картинки — на случай, если первый не отдастся. */
  const [mascotBackup, setMascotBackup] = useState<string | null>(null)
  const [sticker, setSticker] = useState<StickerLink | null>(null)
  const [error, setError] = useState<{ reason: FailureReason; message: string } | null>(null)

  const abort = useRef<AbortController | null>(null)
  const mascotRef = useRef<string | null>(null)
  const finished = useRef(false)
  const startedAt = useRef(0)
  /** Чтобы не дёргать setState шестьдесят раз в секунду после минуты. */
  const overdueSet = useRef(false)

  const reset = useCallback(() => {
    abort.current?.abort()
    abort.current = null
    if (mascotRef.current) URL.revokeObjectURL(mascotRef.current)
    mascotRef.current = null
    finished.current = false
    overdueSet.current = false
    setMascot(null)
    setMascotBackup(null)
    setSticker(null)
    setError(null)
    setProgress(0)
    setOverdue(false)
    setState('idle')
  }, [])

  const start = useCallback(
    async (photoDataUrl: string, onFinish?: (r: { ok: boolean; ms: number; reason?: FailureReason }) => void) => {
      abort.current?.abort()
      const controller = new AbortController()
      abort.current = controller
      finished.current = false
      overdueSet.current = false
      setError(null)
      setProgress(0)
      setOverdue(false)
      setState('running')

      const started = Date.now()
      startedAt.current = started

      // Сторож: обрывает всё, что не уложилось в общий предел.
      let expired = false
      const watchdog = window.setTimeout(() => {
        expired = true
        controller.abort()
      }, DEADLINE_MS)

      // Проверка кадра идёт своим ходом, параллельно отрисовке. Если она
      // забракует кадр — обрываем генерацию, не дожидаясь картинки: так
      // человек не стоит полминуты ради результата, который мы выбросим.
      let verdict: Verdict = 'unknown'
      // Через функцию, а не напрямую: значение присваивается из колбэка,
      // и при прямом сравнении TypeScript сужает тип до 'unknown'.
      const rejected = () => verdict === 'reject'

      try {
        // Режим без генерации (`npm run dev:mock`): кадр никуда не уходит.
        // Сравнение с MODE сборщик вычисляет сам, и в обычной сборке ветка
        // вместе с импортом выпадает целиком.
        if (import.meta.env.MODE === 'mock') {
          const { fakeGeneration } = await import('../services/mock')
          const fake = await fakeGeneration(photoDataUrl, controller.signal)
          if (controller.signal.aborted) return
          setMascot(fake.mascot)
          setSticker(fake.sticker)
          finished.current = true
          setState('done')
          onFinish?.({ ok: true, ms: Date.now() - started })
          return
        }

        const { blobUrl, remoteUrl } = await generateMascot(photoDataUrl, {
          signal: controller.signal,
          onUpload: (imageUrl) => {
            void checkPhoto(imageUrl, controller.signal).then((result) => {
              verdict = result
              if (result === 'reject') controller.abort()
            })
          },
        })

        // Сюда попадаем, если проверка не успела до конца отрисовки.
        if (rejected()) {
          URL.revokeObjectURL(blobUrl)
          throw new GenerationError('gesture', 'Кадр отклонён проверкой')
        }
        if (controller.signal.aborted) {
          URL.revokeObjectURL(blobUrl)
          return
        }
        // Фон бывает белым примерно на каждом третьем кадре. Проверка углов
        // бесплатна, починка запускается только когда фон действительно подвёл.
        const mascot = await ensureDarkBackdrop({ blobUrl, remoteUrl }, { signal: controller.signal })
        if (controller.signal.aborted) {
          URL.revokeObjectURL(mascot.blobUrl)
          return
        }

        // Ссылку для QR берём до показа экрана, чтобы код был на месте с
        // первого кадра. Ждать почти нечего: сервер отвечает сразу, а
        // картинку докачивает фоном. На случай, если он не ответит вовсе,
        // у запроса свой таймаут — экран результата он не задержит.
        const sticker = await stickerLink(mascot.remoteUrl, controller.signal)
        if (controller.signal.aborted) {
          URL.revokeObjectURL(mascot.blobUrl)
          return
        }

        /*
         * Что показать. Сначала то, что уже есть у панели, потом копию с
         * нашего сервера — MascotImage сам переключится, если первое не
         * доедет за пару секунд.
         *
         * Свою скачанную копию blob рисует мгновенно и ни от чьей сети не
         * зависит. Скачать не вышло — показываем прямую ссылку на kie.ai:
         * fetch туда запрещён (хост результатов без CORS-заголовков), но в
         * <img> кросс-домен грузится свободно, так что картинка появится.
         *
         * Раньше в этом случае первой ставилась серверная копия — и вот она
         * как раз тормозила: сервер к этому моменту ещё качал её у kie.ai,
         * и панель ждала чужое скачивание, имея рабочую ссылку под рукой.
         */
        const own = mascot.blobUrl.startsWith('blob:')
        mascotRef.current = mascot.blobUrl
        setMascot(own ? mascot.blobUrl : mascot.remoteUrl)
        setMascotBackup(sticker.image ?? null)
        setSticker(sticker)
        finished.current = true
        setState('done')
        onFinish?.({ ok: true, ms: Date.now() - started })

        // Экран уже на месте — теперь фоном отдаём серверу свою копию, чтобы
        // телефон посетителя не ждал, пока тот выкачает её у kie.ai сам.
        if (own && sticker.image) void pushCopy(sticker.image, mascot.blobUrl, controller.signal)
      } catch (caught) {
        // Истёкший общий предел — это не отмена, а «не дождались».
        if (expired) {
          setError({ reason: 'timeout', message: `Не уложились в ${DEADLINE_MS / 1000} с` })
          setState('error')
          onFinish?.({ ok: false, ms: Date.now() - started, reason: 'timeout' })
          return
        }
        // Свою отмену по вердикту разбираем раньше общей: для человека это
        // не «отменено», а «переснимите», и ему надо это показать.
        if (!rejected() && (controller.signal.aborted || (caught instanceof DOMException && caught.name === 'AbortError'))) return
        const reason: FailureReason =
          rejected() ? 'gesture' : caught instanceof GenerationError ? caught.reason : 'api'
        setError({ reason, message: caught instanceof Error ? caught.message : String(caught) })
        setState('error')
        onFinish?.({ ok: false, ms: Date.now() - started, reason })
      } finally {
        window.clearTimeout(watchdog)
      }
    },
    [],
  )

  // Шкала: цель считаем от времени, показываем сглаженно и только вперёд.
  useEffect(() => {
    if (state !== 'running' && state !== 'done') return
    let raf = 0
    let last = performance.now()

    const tick = (now: number) => {
      const dt = Math.max(now - last, 0)
      last = now

      const elapsed = Date.now() - startedAt.current
      const target = finished.current ? 1 : Math.min(elapsed / FILL_MS, CAP)
      if (!finished.current && elapsed > FILL_MS && !overdueSet.current) {
        overdueSet.current = true
        setOverdue(true)
      }

      setProgress((shown) => {
        if (shown >= target) return shown
        const eased = shown + (target - shown) * (1 - Math.exp(-dt / SMOOTH_MS))
        return target - eased < 0.0005 ? target : eased
      })

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [state])

  useEffect(() => () => {
    abort.current?.abort()
    if (mascotRef.current) URL.revokeObjectURL(mascotRef.current)
  }, [])

  return { state, progress, overdue, mascot, mascotBackup, sticker, error, start, reset }
}
