/**
 * Зеркалка Canon через помощника `canon-bridge.exe` (исходники — в папке
 * canon-bridge).
 *
 * Зачем он нужен. Панель живёт в webview и вызвать библиотеку Canon EDSDK
 * не может, а в режиме веб-камеры (EOS Webcam Utility) зеркалка не наводит
 * резкость и отдаёт кадр видеопотока вместо фотографии. Помощник держит
 * камеру сам: превью из Live View, на съёмке — автофокус и настоящий снимок.
 * С панелью он говорит по HTTP на 127.0.0.1.
 *
 * Запускает его сама панель, когда в настройке выбран Canon, и он же
 * закрывается вместе с ней. В браузере (веб-версия, дев-сервер) запускать
 * нечем — там помощника стартуют руками, и панель его подхватывает.
 */

import { appPath, appPid, desktop } from './desktop'

export const CANON_URL: string = import.meta.env.VITE_CANON_BRIDGE ?? 'http://127.0.0.1:8232'

export type CanonStatus = {
  version: string
  /** `edsdk` — настоящая камера, `fake` — имитация для разработки. */
  backend: string
  /** idle — камеру не просили; no-sdk — рядом нет библиотек Canon; no-camera — камера не найдена. */
  state: 'idle' | 'connecting' | 'ready' | 'no-sdk' | 'no-camera' | 'error'
  /** Причина словами — показываем оператору как есть. */
  message: string
  camera: string
  liveView: boolean
  /** Сколько кадров превью отдано с запуска: ноль — картинки ещё не было. */
  frameSeq: number
  frameWidth: number
  frameHeight: number
  captures: number
  lastCaptureMs: number
  lastCaptureWidth: number
  lastCaptureHeight: number
  lastCaptureFocused: boolean
  lastCaptureError: string
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

async function call(path: string, init: RequestInit = {}, timeoutMs = 2000): Promise<Response> {
  return fetch(`${CANON_URL}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) })
}

/** `null` — помощник не запущен или не отвечает. */
export async function canonStatus(): Promise<CanonStatus | null> {
  try {
    const response = await call('/status', {}, 1500)
    return response.ok ? ((await response.json()) as CanonStatus) : null
  } catch {
    return null
  }
}

let launching: Promise<boolean> | null = null

/** Помощник работает? Если нет и мы — приложение, запускаем его и ждём. */
export function ensureBridge(): Promise<boolean> {
  launching ??= (async () => {
    if (await canonStatus()) return true

    const neutralino = await desktop
    const home = appPath().replace(/\//g, '\\')
    if (!neutralino?.os || !home) return false

    const port = new URL(CANON_URL).port || '80'
    const command = `"${home}\\canon\\canon-bridge.exe" --port=${port} --parent-pid=${appPid()} --shots-dir="${home}\\shots"`
    try {
      await neutralino.os.spawnProcess(command)
    } catch (error) {
      console.warn('[canon] помощник не запустился', error)
      return false
    }
    for (let i = 0; i < 30; i++) {
      await wait(200)
      if (await canonStatus()) return true
    }
    return false
  })().finally(() => {
    launching = null
  })
  return launching
}

const post = (path: string) => call(path, { method: 'POST' }).then(() => undefined, () => undefined)

/** Занять камеру. Дальше помощник держит её сам и переподключается при обрыве. */
export const canonConnect = () => post('/connect')
/** Отпустить камеру — чтобы ею могла пользоваться другая программа. */
export const canonDisconnect = () => post('/disconnect')
/** Начать наводку заранее: к моменту съёмки резкость уже стоит. */
export const canonFocus = () => post('/focus')

/** Закрыть помощника. Не ждём: зовётся на выходе из приложения. */
export function canonShutdown(): Promise<void> {
  return fetch(`${CANON_URL}/shutdown`, { method: 'POST', keepalive: true, signal: AbortSignal.timeout(800) })
    .then(() => undefined, () => undefined)
}

/** Превью для <img>: поток кадров Live View. Метка времени — чтобы адрес каждый раз был новым. */
export const canonLiveUrl = () => `${CANON_URL}/live.mjpg?t=${Date.now()}`

/**
 * Настоящий снимок: камера наводит резкость, срабатывает затвор, на
 * компьютер приезжает полноразмерный JPEG. `save` — помощник заодно
 * кладёт оригинал в папку shots.
 */
export async function canonCapture(save = false): Promise<Blob> {
  const response = await call(`/capture${save ? '?save=1' : ''}`, { method: 'POST' }, 35_000)
  if (!response.ok) {
    const reason = await response.json().then((json: { error?: string }) => json.error, () => undefined)
    throw new Error(reason ?? `HTTP ${response.status}`)
  }
  return response.blob()
}

/** Один свежий кадр превью — запасной вариант, если снимок не получился. */
export async function canonFrame(): Promise<Blob | null> {
  try {
    const response = await call('/frame.jpg', {}, 6000)
    return response.ok ? await response.blob() : null
  } catch {
    return null
  }
}
