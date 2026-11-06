/**
 * Нативная часть Neutralino: доступна, только когда ПОшка собрана как
 * приложение. В браузере её нет, и это штатно — вызывающий код должен
 * уметь работать без неё.
 *
 * Зачем отдельный модуль, а не `window.Neutralino` по месту. После
 * `init()` связь с нативной частью открывается не сразу, и вызов,
 * сделанный тут же, тихо проваливается. Ловилось это плохо: первое
 * событие статистики (`app/launch`) шлётся на первом же кадре и как раз
 * попадало в это окно — тогдашний `stats.csv` не появлялся вовсе, а ошибки
 * в логе не было. Поэтому здесь одно обещание готовности на всё
 * приложение: кто пишет в файл, тот его дожидается.
 */

type Filesystem = {
  appendFile: (path: string, data: string) => Promise<void>
  readFile: (path: string) => Promise<string>
}

type Neutralino = {
  init: () => void
  filesystem: Filesystem
  app: { exit: (code?: number) => Promise<void> }
}

/** Сколько ждём готовности, прежде чем считать, что нативной части нет. */
const READY_TIMEOUT_MS = 5000
/** Пауза между попытками достучаться. */
const RETRY_MS = 150

const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms))

function api(): Neutralino | undefined {
  return (window as unknown as { Neutralino?: Neutralino }).Neutralino
}

/**
 * `null` — приложение открыто в браузере или нативная часть не отозвалась.
 * Обещание не отклоняется никогда: ронять сценарий из-за этого нельзя.
 *
 * Готовность проверяем не событием `ready`, а пробным вызовом. Подписка на
 * событие сама по себе нативный вызов, и до `init()` она не работает —
 * слушатель просто не регистрировался, событие не приходило, и всё
 * упиралось в таймаут. Пробовать тот вызов, который потом и понадобится,
 * надёжнее любого события.
 */
export const desktop: Promise<Neutralino | null> = (async () => {
  const neutralino = api()
  if (!neutralino) return null

  try {
    neutralino.init()
  } catch {
    return null
  }

  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      // Чтение несуществующего файла — самый безобидный вызов: если связь
      // с нативной частью есть, он отвечает ошибкой «нет файла», а не молчит.
      await neutralino.filesystem.readFile('.neutralino-probe')
      return neutralino
    } catch (error) {
      // Ошибка про сам файл значит, что канал уже работает.
      if (String((error as { code?: string })?.code ?? '').startsWith('NE_FS')) return neutralino
      await wait(RETRY_MS)
    }
  }
  return null
})()

/** Файловая система приложения или `null` в браузере. */
export async function filesystem(): Promise<Filesystem | null> {
  return (await desktop)?.filesystem ?? null
}

/**
 * Закрыть приложение. В браузере закрывать нечего — там это тихо ничего
 * не делает, и это правильно: жест выхода задуман для панели, где окно
 * без рамки и висит поверх всего.
 */
export async function quit(): Promise<void> {
  const neutralino = await desktop
  if (!neutralino) return
  try {
    await neutralino.app.exit()
  } catch {
    // Нативная часть отказала — падать из-за этого незачем.
  }
}
