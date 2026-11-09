/**
 * Генерация маскота через kie.ai. Модель выбирает оператор на экране
 * настройки (см. MODELS), по умолчанию — DEFAULT_MODEL.
 *
 * Порядок: загрузить фото на временное хранилище → создать задачу →
 * опрашивать её до готовности → забрать картинку себе.
 */

const UPLOAD_HOST = 'https://kieai.redpandaai.co'
const API_HOST = 'https://api.kie.ai'

import { RELAY, relayHeaders } from '../relay'

/** Модель, пока оператор не выбрал другую на экране настройки. */
export const DEFAULT_MODEL = import.meta.env.VITE_KIE_MODEL ?? 'nano-banana-2'
const RESOLUTION = import.meta.env.VITE_KIE_RESOLUTION ?? '2K'
/**
 * jpg вместо png: тот же кадр весит 1.3 МБ против 4.4 МБ, скачивание на
 * панель падает с ~3.6 до ~1.5 с, а на телефон посетителя — втрое.
 * Артефактов на чёрном фоне не видно, проверено кропом 1:1. Прозрачность
 * здесь не нужна: фон чёрный, а бот «Стикеры в MAX» принимает jpg.
 * Сервис принимает ровно 'jpg' и 'png' — 'jpeg' и 'webp' отклоняет.
 */
const OUTPUT_FORMAT = import.meta.env.VITE_KIE_OUTPUT_FORMAT ?? 'jpg'
const API_KEY = import.meta.env.VITE_KIE_API_KEY ?? ''

/**
 * Сколько задач запускаем на один кадр. Отрисовка у сервиса гуляет от 26 до
 * 200 секунд на одном и том же кадре — это его нагрузка, повлиять нельзя.
 * Зато можно взять минимум из двух независимых попыток: ждём ту, что
 * пришла первой, вторую бросаем. Платим за обе, время сокращаем заметно.
 * Поставить 1 — вернуться к одной попытке.
 */
const ATTEMPTS = Math.max(1, Number(import.meta.env.VITE_KIE_ATTEMPTS ?? 2))

/** Референсы в макете — квадратные 2048 × 2048. */
const ASPECT_RATIO = '1:1'

/**
 * Модели на выбор. У kie.ai у каждого семейства свой формат запроса: у Nano
 * Banana кадр едет в `image_input` и размер задаётся разрешением, у GPT
 * Image — в `input_urls`, у Grok Imagine — в `image_urls`, а размера нет
 * вовсе (кадр там упоминают в промпте как @image1), у Seedream — тоже
 * `image_urls`, а размер задаёт `quality` (basic — 2K). Nano Banana получает
 * отлаженный русский промпт, остальные — английский (MASCOT_PROMPT_EN).
 *
 * Скорость у всех упирается в очередь kie.ai и гуляет от 20 секунд до двух
 * минут — модель тут почти ничего не решает. Сравнивать их удобнее по
 * статистике: там у каждой генерации записана модель.
 */
type ModelSpec = {
  label: string
  input: (imageUrl: string) => Record<string, unknown>
}

const nanoBananaInput = (imageUrl: string) => ({
  prompt: MASCOT_PROMPT,
  image_input: [imageUrl],
  aspect_ratio: ASPECT_RATIO,
  resolution: RESOLUTION,
  output_format: OUTPUT_FORMAT,
})

export const MODELS: Record<string, ModelSpec> = {
  'nano-banana-2': { label: 'Nano Banana 2', input: nanoBananaInput },
  'nano-banana-2-1': { label: 'Nano Banana 2.1', input: nanoBananaInput },
  'nano-banana-pro': { label: 'Nano Banana Pro', input: nanoBananaInput },
  'gpt-image-2-image-to-image': {
    label: 'GPT Image 2',
    input: (imageUrl) => ({ prompt: MASCOT_PROMPT_EN, input_urls: [imageUrl], aspect_ratio: ASPECT_RATIO, resolution: RESOLUTION }),
  },
  'grok-imagine/image-to-image': {
    label: 'Grok Imagine',
    input: (imageUrl) => ({ prompt: `@image1 ${MASCOT_PROMPT_EN}`, image_urls: [imageUrl] }),
  },
  'seedream/4.5-edit': {
    label: 'Seedream 4.5',
    input: (imageUrl) => ({ prompt: MASCOT_PROMPT_EN, image_urls: [imageUrl], aspect_ratio: ASPECT_RATIO, quality: 'basic' }),
  },
}

/** Имя модели для людей; незнакомую показываем как есть. */
export const modelLabel = (id: string) => MODELS[id]?.label ?? id

/** Дольше этого не ждём — на панели человек не должен зависнуть. */
const HARD_TIMEOUT_MS = 240_000

/**
 * Предел на один запрос. Без него зависший fetch висел вечно: `HARD_TIMEOUT`
 * проверяется только в цикле опроса и загрузку кадра не покрывал. Из-за
 * этого шкала намертво вставала на 12% — на асимптоте этапа «загрузка».
 */
const REQUEST_TIMEOUT_MS = 30_000

/**
 * Первую попытку идём напрямую и ждём недолго: если `api.kie.ai` заблокирован,
 * платить за это тридцатью секундами на каждом запросе нельзя.
 */
const DIRECT_PROBE_MS = 8000

/**
 * Куда ходим за API. Пока `api.kie.ai` открыт — напрямую, без лишнего звена.
 * Как только он перестал отвечать, переключаемся на прокси у себя на сервере
 * и до конца сеанса ходим уже туда: два других домена kie.ai с панели уже
 * недоступны, и API вполне может стать третьим.
 */
let route: 'direct' | 'proxy' = 'direct'
/** Пока не переключились, первый сбой прямого пути ещё можно исправить. */
let directTried = false

/** Сигнал «отмена ИЛИ таймаут». AbortSignal.any есть не во всех webview. */
function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms)
  if (!signal) return timeout
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : signal
}

/**
 * Шаг опроса. Раньше был один на всё время — 1500 мс, и первый запрос уходил
 * только после паузы, то есть полторы секунды терялись всегда. Теперь
 * спрашиваем сразу и каждую секунду первую минуту — быстрая отрисовка
 * (20–25 с) ловится почти без задержки. Дальше реже: на долгом прогоне
 * секунда роли не играет.
 */
const POLL_FAST_MS = 1000
const POLL_SLOW_MS = 2000
/** После этого момента переходим на редкий шаг. */
const POLL_RAMP_MS = 60_000

/**
 * Промпт собран по схеме из avatar/Frame 2147239707.png (40 МБ, в git не
 * входит — лежит только локально): там у всех шестнадцати референсов
 * одинаковая обёртка, меняется только описание человека — его мы берём
 * с фотографии.
 */
export const MASCOT_PROMPT = [
  // --- Что делаем -------------------------------------------------------
  '3d стилизованное изображение в стилистике 3d мультфильма.',
  'Преврати человека с фотографии в персонажа. Главное — узнаваемость:',
  'персонаж должен быть похож на этого человека, а не на кого-то вообще.',

  // --- Внешность. Здесь были все промахи, поэтому разобрано по признакам.
  // Раньше это была одна общая строка «сохрани пол, возраст, тон кожи, форму
  // и цвет причёски, черты лица и одежду» — формально всё покрывала, но
  // модель меняла и длину волос, и их цвет, и цвет глаз.
  'Ничего не меняй во внешности: пол, возраст, тон кожи, форму лица, черты лица.',
  'Волосы повтори точно — длину, цвет, пробор и укладку.',
  'Длинные волосы остаются длинными, короткие короткими; светлые не темнеют,',
  'тёмные не светлеют. Не стриги и не перекрашивай.',
  'Цвет глаз тот же, что на фотографии.',
  'Одежду повтори: тип, крой и цвет.',
  'Очки, усы, бороду, серьги и головные уборы бери только с фотографии:',
  'нет их там — не добавляй, есть — не убирай.',

  // --- Глаза: отдельный дефект, модель заливала часть радужки тёмным.
  'Оба глаза одинаковые и чистые: радужка целиком видна, зрачки на месте,',
  'без чёрных пятен, теней и затемнений на глазном яблоке.',

  'Персонаж улыбается и смотрит в камеру.',

  // --- Кадр: по эталонам из avatar/.
  'Кадр по пояс: нижний край на уровне пояса, голова целиком в кадре,',
  'над макушкой остаётся воздух, плечи помещаются полностью.',

  // --- Поза. Здесь стояло «руки скрещены на груди» — так у всех эталонов,
  // и скрещенные руки получали все подряд, включая снятых с руками вдоль тела.
  'Позу рук повтори с фотографии: скрестил — оставь скрещёнными,',
  'держит вдоль тела — оставь вдоль тела.',
  'Если рук в кадре не видно, они опущены и в кадр не попадают.',
  'Не поднимай руки к лицу и к шее и не скрещивай их по своей воле.',

  // --- Фильтр на жесты: без него модель послушно перерисовывает показанное.
  'Не изображай жестов, знаков пальцами и поднятых рук:',
  'если на фотографии есть жест, опусти руки вдоль тела.',

  'Не переноси на персонажа надписи, логотипы и рисунки с одежды.',

  // --- Фон последней строкой. Стоял первой — и на выросшем промпте модель
  // про него забывала, возвращая белый.
  'Фон замени на сплошной чёрный: ровный чистый #000000, без предметов,',
  'без теней, без градиента, без переноса обстановки с фотографии.',
].join(' ')

/**
 * Тот же промпт по-английски — для моделей не от Google (GPT Image, Grok,
 * Seedream). Русский они понимают хуже: замер 9 ноября на фото двух
 * несуществующих людей — с русским промптом GPT Image 2 и Grok почти не
 * стилизовали (выходило фото на чёрном), а Seedream не убрала фон зала.
 *
 * Отличия от русского — только там, где этим моделям нужно сказать прямо:
 * стиль назван явно (современная 3D-анимация Disney/Pixar, «это мультфильм,
 * не фото»), а в фоне — «без других людей»: в том же замере за спиной
 * оставались посетители зала. Остальное — дословно: каждое правило там
 * закрывает реальный промах, см. комментарии к MASCOT_PROMPT.
 *
 * Фон — первой строкой И последней. Эти модели — редакторы: что не велено
 * менять, они оставляют, и требование только в конце Seedream пропускала —
 * фон зала оставался у двух кадров из двух. С первой строкой — чистый
 * чёрный у обоих. Nano Banana наоборот забывала фон, стоявший первым, —
 * поэтому у русского промпта он только в конце.
 */
export const MASCOT_PROMPT_EN = [
  'First remove the entire original background, including all other people,',
  'and put the character on a solid flat black #000000 background.',

  'Turn the person in the photo into a stylized 3D animated character in the style',
  'of a modern Disney / Pixar animated feature film: soft rounded shapes, expressive',
  'eyes, smooth stylized skin, soft cinematic lighting, high-quality 3D render.',
  'It must clearly be a cartoon character, not a photo.',
  'The most important thing is recognizability: the character must look like this',
  'particular person, not like someone generic.',

  'Do not change their appearance: keep gender, age, skin tone, face shape and facial features.',
  'Copy the hair exactly: length, color, parting and styling.',
  'Long hair stays long, short hair stays short; light hair does not get darker,',
  'dark hair does not get lighter. Do not cut or recolor it.',
  'Keep the same eye color as in the photo.',
  'Copy the clothing: type, cut and color.',
  'Take glasses, mustache, beard, earrings and headwear only from the photo:',
  'if they are not there, do not add them; if they are, do not remove them.',

  'Both eyes are identical and clean: the iris is fully visible, pupils in place,',
  'no black spots, shadows or darkening on the eyeballs.',

  'The character smiles and looks into the camera.',

  'Framing: waist-up, the bottom edge at the waist, the whole head in frame',
  'with some space above it, shoulders fully visible.',

  'Copy the arm pose from the photo: crossed arms stay crossed,',
  'arms along the body stay along the body.',
  'If the arms are not visible, they are lowered and out of frame.',
  'Do not raise the hands to the face or neck and do not cross the arms on your own.',

  'Do not depict gestures, finger signs or raised hands:',
  'if there is a gesture in the photo, put the arms down along the body.',

  'Do not transfer text, logos or prints from the clothing onto the character.',

  'Replace the background with solid black: flat clean #000000, no objects,',
  'no other people, no shadows, no gradient, nothing from the original surroundings.',
].join(' ')


export type FailureReason =
  | 'config' // не задан ключ
  | 'network' // сеть или сервис недоступны
  | 'policy' // кадр отклонён фильтром модели
  | 'gesture' // кадр отклонён нашей проверкой: жест или надпись
  | 'timeout' // не дождались
  | 'api' // сервис ответил ошибкой

export class GenerationError extends Error {
  constructor(
    public reason: FailureReason,
    message: string,
  ) {
    super(message)
    this.name = 'GenerationError'
  }
}

type Options = {
  signal?: AbortSignal
  /** id модели на kie.ai, см. MODELS. */
  model?: string
  /**
   * Кадр загружен на хранилище. Даём ссылку наружу сразу, чтобы проверку
   * можно было запустить параллельно с отрисовкой и не грузить фото дважды.
   */
  onUpload?: (imageUrl: string) => void
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })

/** Адрес и заголовки под выбранный маршрут. */
function routed(url: string): { url: string; headers: HeadersInit } {
  if (route === 'direct' || !RELAY) {
    return { url, headers: { Authorization: `Bearer ${API_KEY}` } }
  }
  // Через прокси: authorization занят токеном сервера, ключ kie.ai едет рядом.
  return {
    url: url.replace(`${API_HOST}/`, `${RELAY}/kie/`),
    headers: { ...relayHeaders(), 'x-kie-key': API_KEY },
  }
}

async function callJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  let response: Response
  try {
    const direct = route === 'direct'
    const target = routed(url)
    response = await fetch(target.url, {
      ...init,
      // Прямой путь проверяем коротким пределом, дальше работаем обычным.
      signal: withTimeout(init.signal ?? undefined, direct && !directTried ? DIRECT_PROBE_MS : REQUEST_TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json', ...target.headers, ...init.headers },
    })
    directTried = true
  } catch (error) {
    // TimeoutError от AbortSignal.timeout — это не отмена пользователем,
    // а «сервис не ответил»: показываем как сетевую ошибку, с ней можно
    // попробовать ещё раз.
    if (error instanceof DOMException && error.name === 'AbortError' && route !== 'direct') throw error

    // Прямой путь не отозвался — уходим на прокси и повторяем запрос там же.
    // Переключаемся один раз за сеанс: если API заблокирован, он заблокирован
    // до конца, и дёргать его на каждом кадре незачем.
    if (route === 'direct' && RELAY) {
      route = 'proxy'
      console.warn('[kie] api.kie.ai не отвечает, переходим на прокси через свой сервер')
      return callJson(url, init)
    }

    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new GenerationError('network', `Сервис не ответил за ${REQUEST_TIMEOUT_MS / 1000} с`)
    }
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new GenerationError('network', `Сеть недоступна: ${String(error)}`)
  }
  const text = await response.text()
  let json: Record<string, unknown>
  try {
    json = JSON.parse(text)
  } catch {
    throw new GenerationError('api', `Неожиданный ответ ${response.status}: ${text.slice(0, 200)}`)
  }
  if (!response.ok) throw new GenerationError('api', `HTTP ${response.status}: ${text.slice(0, 200)}`)
  return json
}

/** Фильтр модели иногда отклоняет кадр — это не наша ошибка и её стоит переспросить. */
function isPolicyFailure(message: string) {
  return /policy|filtered|prohibited/i.test(message)
}

/**
 * Кладём кадр на свой сервер и получаем публичную ссылку.
 * `null` — сервер не ответил, пробуем хранилище kie.ai.
 */
async function uploadToRelay(dataUrl: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const response = await fetch(`${RELAY}/upload`, {
      method: 'POST',
      signal: withTimeout(signal, REQUEST_TIMEOUT_MS),
      headers: relayHeaders(),
      body: JSON.stringify({ dataUrl }),
    })
    if (!response.ok) return null
    const { url } = (await response.json()) as { url?: string | null }
    return url ?? null
  } catch {
    return null
  }
}

async function uploadPhoto(dataUrl: string, signal?: AbortSignal): Promise<string> {
  // Сначала свой сервер: хранилище kie.ai с панели недоступно, а до нашего
  // домена она достучится. Если своего нет — работаем как раньше.
  const own = await uploadToRelay(dataUrl, signal)
  if (own) return own

  const json = await callJson(`${UPLOAD_HOST}/api/file-base64-upload`, {
    method: 'POST',
    signal,
    body: JSON.stringify({
      base64Data: dataUrl,
      uploadPath: 'images/max-mascot',
      fileName: `shot-${Date.now()}.jpg`,
    }),
  })
  const url = (json.data as { downloadUrl?: string } | undefined)?.downloadUrl
  if (!url) throw new GenerationError('api', `Не пришла ссылка на загруженное фото: ${JSON.stringify(json).slice(0, 200)}`)
  return url
}

async function createTask(imageUrl: string, model: string, signal?: AbortSignal): Promise<string> {
  // Незнакомую модель (задали через VITE_KIE_MODEL) зовём в формате Nano
  // Banana — так устроено большинство моделей kie.ai с параметром resolution.
  const input = (MODELS[model]?.input ?? nanoBananaInput)(imageUrl)
  const json = await callJson(`${API_HOST}/api/v1/jobs/createTask`, {
    method: 'POST',
    signal,
    body: JSON.stringify({ model, input }),
  })
  const taskId = (json.data as { taskId?: string } | undefined)?.taskId
  if (!taskId) throw new GenerationError('api', `Задача не создана: ${JSON.stringify(json).slice(0, 200)}`)
  return taskId
}

async function awaitResult(taskId: string, deadline: number, signal?: AbortSignal): Promise<string> {
  const started = Date.now()
  let first = true

  while (Date.now() < deadline) {
    // Первый запрос — без паузы: задача иногда готова раньше, чем мы ждём,
    // и платить за это фиксированной задержкой незачем.
    if (first) first = false
    else await sleep(Date.now() - started < POLL_RAMP_MS ? POLL_FAST_MS : POLL_SLOW_MS, signal)
    const json = await callJson(`${API_HOST}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      method: 'GET',
      signal,
    })
    const data = (json.data ?? {}) as { state?: string; resultJson?: string; failMsg?: string }

    if (data.state === 'success') {
      const urls = data.resultJson ? (JSON.parse(data.resultJson) as { resultUrls?: string[] }).resultUrls : undefined
      if (!urls?.[0]) throw new GenerationError('api', 'Задача успешна, но картинки нет')
      return urls[0]
    }
    if (data.state === 'fail') {
      const message = data.failMsg ?? 'Задача завершилась ошибкой'
      throw new GenerationError(isPolicyFailure(message) ? 'policy' : 'api', message)
    }
  }
  throw new GenerationError('timeout', 'Генерация не уложилась в отведённое время')
}

/**
 * Гонка задач: запускаем ATTEMPTS сразу, берём первую готовую картинку,
 * остальных бросаем — своим контроллером, не трогая сигнал вызывающего.
 *
 * Каждая задача идёт сама по себе: не создалась одна — ждём другую, а не
 * роняем весь прогон. Проваливается гонка, только когда провалились все.
 */
function race(imageUrl: string, model: string, deadline: number, signal?: AbortSignal): Promise<string> {
  const losers = new AbortController()
  const stop = withTimeout(signal, Math.max(deadline - Date.now(), 1))
  const onStop = () => losers.abort()
  stop.addEventListener('abort', onStop, { once: true })

  return new Promise<string>((resolve, reject) => {
    let running = ATTEMPTS
    let settled = false
    const errors: unknown[] = []

    const settle = (done: () => void) => {
      if (settled) return
      settled = true
      stop.removeEventListener('abort', onStop)
      losers.abort()
      done()
    }

    for (let i = 0; i < ATTEMPTS; i++) {
      createTask(imageUrl, model, signal)
        .then((taskId) => awaitResult(taskId, deadline, losers.signal))
        .then(
          (url) => settle(() => resolve(url)),
          (error) => {
            errors.push(error)
            if (--running > 0) return
            // Причину берём осмысленную: отказ фильтра важнее сетевой
            // ошибки — его внешний цикл переспросит.
            const policy = errors.find((e) => e instanceof GenerationError && e.reason === 'policy')
            settle(() => reject(policy ?? errors.find((e) => e instanceof GenerationError) ?? errors[0]))
          },
        )
    }
  })
}

/** Забираем картинку себе: ссылка на хранилище временная, да и сеть может отвалиться. */
/** Дольше этого картинку не ждём: 1.3 МБ даже на плохом канале приходят быстрее. */
const DOWNLOAD_TIMEOUT_MS = 45_000

async function download(url: string, signal?: AbortSignal): Promise<string> {
  try {
    // Единственный запрос в цепочке, который раньше шёл без предела. Если
    // хост результата с панели недоступен, он висел вечно: картинка уже
    // готова, шкала упирается в 99% и дальше не двигается никогда.
    const response = await fetch(url, { signal: withTimeout(signal, DOWNLOAD_TIMEOUT_MS) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return URL.createObjectURL(await response.blob())
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    // kie.ai кладёт результат на два разных хоста, и один из них
    // (img-relay.kieops.com) не отдаёт CORS-заголовки — fetch там запрещён
    // браузером. Показу это не мешает: <img> ходит на кросс-домен свободно.
    // Остаёмся без локальной копии, но экран результата не срываем.
    return url
  }
}

export type Mascot = {
  /** Локальная blob-ссылка для показа на панели. Освобождать через revokeObjectURL. */
  blobUrl: string
  /** Публичная ссылка на картинку — её кодируем в QR для телефона. */
  remoteUrl: string
}

/**
 * Фото → маскот.
 *
 * Отдаём обе ссылки: панель показывает скачанный blob (не зависит от сети),
 * а в QR уходит публичный адрес. Важно, что картинка-результат лежит на
 * img-relay.kieops.com и отдаётся без `content-disposition: attachment` —
 * значит на телефоне она открывается как картинка, и её можно сохранить
 * долгим нажатием. Отдельный хостинг для этого не нужен.
 */
export async function generateMascot(
  photoDataUrl: string,
  { signal, onUpload, model = DEFAULT_MODEL }: Options = {},
): Promise<Mascot> {
  if (!API_KEY) throw new GenerationError('config', 'Не задан VITE_KIE_API_KEY')

  const deadline = Date.now() + HARD_TIMEOUT_MS

  const imageUrl = await uploadPhoto(photoDataUrl, signal)
  onUpload?.(imageUrl)

  // Фильтр модели срабатывает через раз на одном и том же кадре,
  // поэтому один повторный заход делаем молча.
  let resultUrl: string | undefined
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      resultUrl = await race(imageUrl, model, deadline, signal)
      break
    } catch (error) {
      const retriable = error instanceof GenerationError && error.reason === 'policy'
      if (!retriable || attempt === 1 || Date.now() > deadline) throw error
    }
  }

  return { blobUrl: await download(resultUrl!, signal), remoteUrl: resultUrl! }
}

/**
 * Вырезает фон — для стикера нужен PNG с прозрачностью.
 *
 * Просить прозрачный фон у самой модели бесполезно: она рисует
 * шахматку вместо альфы. Поэтому отдельным проходом.
 */
export async function removeBackground(imageUrl: string, signal?: AbortSignal): Promise<string> {
  if (!API_KEY) throw new GenerationError('config', 'Не задан VITE_KIE_API_KEY')

  const json = await callJson(`${API_HOST}/api/v1/jobs/createTask`, {
    method: 'POST',
    signal,
    body: JSON.stringify({ model: 'recraft/remove-background', input: { image: imageUrl } }),
  })
  const taskId = (json.data as { taskId?: string } | undefined)?.taskId
  if (!taskId) throw new GenerationError('api', `Вырезка не создана: ${JSON.stringify(json).slice(0, 200)}`)

  return awaitResult(taskId, Date.now() + HARD_TIMEOUT_MS, signal)
}

/** Каким путём панель сейчас ходит за API — видно в диагностике. */
export const apiRoute = () => route

export const generationConfig = { defaultModel: DEFAULT_MODEL, resolution: RESOLUTION, format: OUTPUT_FORMAT, attempts: ATTEMPTS, hasKey: Boolean(API_KEY) }
