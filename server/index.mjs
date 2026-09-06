/**
 * Локальный сервер панели: раздаёт страницу стикера и картинки маскотов.
 *
 * Зачем он вообще. Посетителю нужна веб-страница с кнопкой «Сохранить» —
 * значит, телефон должен куда-то сходить. Вместо внешнего хостинга страницу
 * раздаёт сама панель по локальной сети: телефон и панель в одном Wi-Fi.
 *
 * Что это даёт сверх «просто заменили хостинг»:
 *   - картинка лежит на панели, а не на kie.ai — ссылки не протухают
 *     через трое суток и не зависят от того, какой из двух хостов kie.ai
 *     выдал результат в этот раз;
 *   - страница и картинка на одном origin, поэтому CORS вообще не при чём
 *     и кнопка «Сохранить» работает всегда;
 *   - картинку с kie.ai скачивает Node, а не браузер, — на CORS ему всё равно.
 *
 * Два режима.
 *   Локально  — адрес страницы собирается из IP панели в домашней сети.
 *               Телефон обязан быть в том же Wi-Fi.
 *   На хостинге — задайте PUBLIC_URL, и адрес берётся из домена. Тогда
 *               телефон доходит и по мобильному интернету.
 *
 * Переменные:
 *   PORT        порт, по умолчанию 8787
 *   PUBLIC_URL  публичный адрес, например https://sticker.example.ru
 *   SHOT_TOKEN  пароль для POST /shot. На публичном хостинге обязателен:
 *               без него любой желающий заставит сервер качать что угодно
 *               и забьёт ему память.
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

const PORT = Number(process.env.PORT ?? 8787)
/** Задан — значит сервер публичный и адреса строим от домена, а не от IP. */
const PUBLIC_URL = (process.env.PUBLIC_URL ?? '').replace(/\/+$/, '')
const SHOT_TOKEN = process.env.SHOT_TOKEN ?? ''
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PAGE = join(ROOT, 'sticker', 'index.html')

/**
 * Сколько памяти отдаём под картинки. Считать штуками оказалось плохо:
 * маскот весит 1.3 МБ в jpg, но после вырезания фона это png на ~3 МБ,
 * и две сотни таких — уже под 600 МБ. На небольшом VPS это верный OOM.
 * Поэтому предел в байтах, а счётчик штук остаётся вторым ограничителем.
 */
const BUDGET_BYTES = Number(process.env.BUDGET_MB ?? 150) * 1024 * 1024
const KEEP = Number(process.env.KEEP ?? (PUBLIC_URL ? 200 : 24))
/** Сколько байт сейчас занято — пересчитывать Map на каждый запрос дорого. */
let held = 0
/**
 * id -> { pending }, где pending — обещание с телом и типом картинки.
 * Храним именно обещание, а не готовые байты: /shot обязан отвечать сразу,
 * иначе QR появляется на экране панели через 10–15 секунд после самого
 * маскота. Скачивание идёт фоном, а запрос картинки его дожидается.
 * В памяти: панель перезапускается, чистить нечего.
 */
const shots = new Map()

/** Домашние сети: 10/8, 172.16/12, 192.168/16. Только сюда попадёт телефон. */
function isLan(ip) {
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31
}

/**
 * Адрес панели в локальной сети — его увидит телефон.
 *
 * Просто «первый непетлевой IPv4» брать нельзя: VPN и всякие служебные
 * туннели тоже непетлевые, а до них с телефона не достучаться. Поэтому
 * отсеиваем туннельные интерфейсы по имени и берём только адрес из
 * домашнего диапазона. Порядок интерфейсов системой не гарантирован,
 * так что полагаться на него нельзя.
 */
function lanHost() {
  const skip = /^(utun|tun|tap|ppp|awdl|llw|ipsec)/
  for (const [name, list] of Object.entries(networkInterfaces())) {
    if (skip.test(name)) continue
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal && isLan(net.address)) return net.address
    }
  }
  return null
}

/** Откуда телефон возьмёт страницу: домен на хостинге или IP в локальной сети. */
function publicOrigin() {
  if (PUBLIC_URL) return PUBLIC_URL
  const host = lanHost()
  return host ? `http://${host}:${PORT}` : null
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'access-control-allow-origin': '*', ...headers })
  res.end(body)
}

/**
 * Заводим место под картинку и сразу отдаём id — качаем фоном.
 * Node ходит на kie.ai без оглядки на CORS.
 */
function keep(url) {
  // 12 символов, а не 8: это фотографии живых людей, и хотя перебрать
  // 32 бита ради чужого маскота никто не станет, лишние 16 бит бесплатны —
  // на плотность QR четыре знака не влияют.
  const id = randomUUID().replace(/-/g, '').slice(0, 12)

  const entry = { size: 0 }
  entry.pending = (async () => {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = Buffer.from(await response.arrayBuffer())
    // Вес записываем в саму запись, чтобы вытеснение могло вычесть его
    // синхронно. Раньше вычитание шло через .then, held внутри цикла не
    // менялся, и while выгребал Map до дна вместе со свежей картинкой.
    entry.size = body.length
    held += body.length
    evict()
    return { body, type: (response.headers.get('content-type') ?? 'image/jpeg').split(';')[0] }
  })()
  // Ошибку разберём при запросе картинки; здесь глушим, чтобы Node не ругался
  // на необработанное отклонение и не валил процесс.
  entry.pending.catch(() => {})

  shots.set(id, entry)
  evict()
  return id
}

/**
 * Выбрасываем самые старые, пока не уложимся в оба предела.
 * Map хранит порядок вставки, поэтому первый ключ — самый давний.
 */
function evict() {
  // Последнюю запись не трогаем: даже если одна картинка не влезает в
  // бюджет целиком, выбрасывать её сразу после создания бессмысленно.
  while (shots.size > 1 && (shots.size > KEEP || held > BUDGET_BYTES)) {
    const oldest = shots.keys().next().value
    const shot = shots.get(oldest)
    shots.delete(oldest)
    held -= shot?.size ?? 0
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')

  if (req.method === 'OPTIONS') {
    return send(res, 204, '', {
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization',
    })
  }

  // Панель отдаёт ссылку на свежий результат, получает адрес для QR.
  if (req.method === 'POST' && url.pathname === '/shot') {
    if (SHOT_TOKEN && req.headers.authorization !== `Bearer ${SHOT_TOKEN}`) {
      return send(res, 401, JSON.stringify({ error: 'нужен токен' }), { 'content-type': 'application/json' })
    }
    try {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const { url: source } = JSON.parse(Buffer.concat(chunks).toString())
      if (!source) return send(res, 400, JSON.stringify({ error: 'нет url' }))

      // Расширения в адресе нет намеренно: тип узнаётся только после
      // скачивания, а ответ нужен раньше. Тип отдаём заголовком.
      const id = keep(source)
      const file = `/i/${id}`
      const origin = publicOrigin()
      send(res, 200, JSON.stringify({
        id,
        // Адрес для QR. Некуда вести — отдаём null, и панель уходит на
        // запасной вариант: QR прямо на картинку у kie.ai.
        page: origin ? `${origin}/?i=${file}` : null,
        image: file,
      }), { 'content-type': 'application/json' })
    } catch (error) {
      send(res, 502, JSON.stringify({ error: String(error) }), { 'content-type': 'application/json' })
    }
    return
  }

  // Проверка живости — для Dokploy и любого монитора.
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, JSON.stringify({
      ok: true,
      shots: shots.size,
      heldMb: Math.round(held / 1024 / 1024),
      budgetMb: Math.round(BUDGET_BYTES / 1024 / 1024),
    }),
      { 'content-type': 'application/json' })
  }

  if (req.method === 'GET' && url.pathname.startsWith('/i/')) {
    // Расширение в адресе не обязательно, но и не мешает — отрезаем.
    const shot = shots.get(url.pathname.slice(3).replace(/\.[a-z0-9]+$/i, ''))
    if (!shot) return send(res, 404, 'нет такой картинки')

    // Посетитель мог отсканировать код раньше, чем мы докачали картинку —
    // тогда просто ждём здесь, а не отвечаем ошибкой.
    let body, type
    try {
      ({ body, type } = await shot.pending)
    } catch (error) {
      return send(res, 502, 'картинку скачать не удалось: ' + String(error))
    }

    // inline, а не attachment: если посетитель дойдёт до картинки напрямую,
    // она должна открыться, а не скачаться файлом.
    return send(res, 200, body, {
      'content-type': type,
      'content-disposition': 'inline',
      'cache-control': 'public, max-age=3600',
    })
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    try {
      return send(res, 200, await readFile(PAGE), { 'content-type': 'text/html; charset=utf-8' })
    } catch {
      return send(res, 500, 'страница не найдена: ' + PAGE)
    }
  }

  send(res, 404, 'не найдено')
})

server.listen(PORT, '0.0.0.0', () => {
  const origin = publicOrigin()
  console.log(`Страница стикера: ${origin ?? `http://localhost:${PORT}`}`)
  if (!origin) console.log('Сети не видно — телефон до панели не достучится.')
  if (PUBLIC_URL && !SHOT_TOKEN) {
    console.log('ВНИМАНИЕ: PUBLIC_URL задан, а SHOT_TOKEN — нет.')
    console.log('POST /shot открыт всему интернету: любой заставит сервер качать что угодно.')
  }
})
