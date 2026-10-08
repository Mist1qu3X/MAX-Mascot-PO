/**
 * Предварительная проверка кадра — отдельным взглядом, до показа результата.
 *
 * Зачем она нужна поверх промпта. В `MASCOT_PROMPT` есть запрет рисовать
 * жесты, и на тестах он держался 6 раз из 6. Но это просьба, а не запрет:
 * модель выполняет её, пока согласна. Проверка смотрит на исходный кадр
 * другой моделью и даёт панели право отказаться самой.
 *
 * Почему это ничего не стоит по времени. Проверка идёт параллельно с
 * генерацией и укладывается в ~8–12 с, а отрисовка занимает 30 с и больше.
 * На чистом кадре — а это почти всегда — посетитель не ждёт ни секунды
 * лишней. Спорный кадр отсеивается на десятой секунде, и человек не стоит
 * полминуты ради картинки, которую всё равно выбросят.
 *
 * Почему именно gemini-2.5-flash. Замеры на кадре с жестом и без:
 *   gemini-2.5-flash  оба верно, 8–12 с   ← берём
 *   gemini-3-flash    оба верно, 10–17 с
 *   gemini-2.5-pro    оба верно, 23–29 с
 *   gemini-3-pro      жест НЕ ЗАМЕТИЛ, плюс таймаут
 *   gpt-4o, 4o-mini   на этом эндпоинте недоступны
 * Старшая модель оказалась хуже младшей — брать «которая мощнее» нельзя.
 *
 * Расход: 1131 токен на запрос (из них ~1090 — сама картинка) и 0.02
 * кредита. Генерация стоит 12 кредитов, то есть проверка дешевле в 600 раз.
 */

const API_HOST = 'https://api.kie.ai'
const MODEL = import.meta.env.VITE_KIE_MODERATION_MODEL ?? 'gemini-2.5-flash'
const API_KEY = import.meta.env.VITE_KIE_API_KEY ?? ''

/** Сколько ждём ответа. Дольше — просто пропускаем кадр: см. `unknown`. */
const TIMEOUT_MS = 25_000

const QUESTION = [
  'На фото есть оскорбительный жест, средний палец, неприличный знак пальцами',
  'или оскорбительная надпись? Ответь ровно одним словом: ДА или НЕТ.',
].join(' ')

export type Verdict =
  | 'ok' // ничего не нашли
  | 'reject' // нашли жест или надпись
  | 'unknown' // проверить не вышло: сеть, таймаут, невнятный ответ

/**
 * `unknown` намеренно не блокирует генерацию. Панель стоит на мероприятии,
 * и отказать живому человеку из-за того, что моргнула сеть, — хуже, чем
 * пропустить спорный кадр: на такой случай остаётся запрет в промпте.
 */
export async function checkPhoto(imageUrl: string, signal?: AbortSignal): Promise<Verdict> {
  if (!API_KEY) return 'unknown'

  // AbortSignal.any появился недавно (Chrome 116, Safari 17.4). Панель под
  // Neutralino работает в системном webview, а он бывает старым — поэтому
  // с запасным путём: там просто теряется таймаут, но не падает всё.
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const abort = !signal ? timeout
    : typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout])
    : signal

  let text: string
  try {
    const response = await fetch(`${API_HOST}/${MODEL}/v1/chat/completions`, {
      method: 'POST',
      signal: abort,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: QUESTION },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        }],
      }),
    })
    if (!response.ok) return 'unknown'

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    text = json.choices?.[0]?.message?.content ?? ''
  } catch {
    // Сеть, таймаут или отмена — пропускаем, решение за промптом.
    return 'unknown'
  }

  // Модель просили ответить одним словом, но подстраховаться дешевле,
  // чем разбираться потом, почему фильтр молчит.
  const answer = text.trim().toUpperCase()
  if (answer.startsWith('ДА') || answer.startsWith('YES')) return 'reject'
  if (answer.startsWith('НЕТ') || answer.startsWith('NO')) return 'ok'
  return 'unknown'
}
