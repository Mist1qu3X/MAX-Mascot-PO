import { useCallback, useEffect, useState } from 'react'

import { apiRoute, generationConfig } from '../../services/kie'
import { pendingCount } from '../../services/stats'
import { desktop } from '../../services/desktop'
import styles from './DiagScreen.module.css'

/**
 * Служебный экран проверки связи. Открывается по `#diag` в адресе.
 *
 * Нужен потому, что «фотка не загружается» с панели выглядит одинаково при
 * десятке разных причин: нет интернета, заблокирован kie.ai, кончились
 * кредиты, не задан ключ, не поднят сервер стикера. Разбираться в этом,
 * стоя у панели без консоли, невозможно — пусть приложение скажет само.
 *
 * Макета нет, свёрстан просто и крупно: читать будут с расстояния вытянутой
 * руки, возможно в спешке.
 */

type Check = {
  name: string
  /** Что означает провал — чтобы не гадать по названию хоста. */
  hint: string
  run: () => Promise<string>
}

type Result = { state: 'idle' | 'run' | 'ok' | 'fail'; text: string }

const KIE_KEY = import.meta.env.VITE_KIE_API_KEY ?? ''
const RELAY = import.meta.env.VITE_STICKER_RELAY ?? 'http://localhost:8787'

/** Каждая проверка со своим пределом: висящий запрос не должен всё стопорить. */
async function ping(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(15_000) })
}

const CHECKS: Check[] = [
  {
    name: 'Интернет',
    hint: 'Панель вообще не видит сеть',
    run: async () => {
      const t = Date.now()
      await ping('https://cloudflare.com/cdn-cgi/trace')
      return `${Date.now() - t} мс`
    },
  },
  {
    name: 'kie.ai — генерация',
    hint: 'Хост недоступен: блокировка провайдером или нет сети',
    run: async () => {
      const t = Date.now()
      const r = await ping('https://api.kie.ai/api/v1/chat/credit', {
        headers: { authorization: `Bearer ${KIE_KEY}` },
      })
      const json = (await r.json()) as { data?: number; msg?: string }
      if (typeof json.data !== 'number') throw new Error(json.msg ?? `HTTP ${r.status}`)
      return `${Math.round(json.data)} кредитов, ${Date.now() - t} мс`
    },
  },
  {
    name: 'kie.ai — хранилище (запасное)',
    hint: 'Недоступно, но это не страшно: кадр уходит через свой сервер, '
      + 'а сюда мы обращаемся, только если своего нет',
    run: async () => {
      const t = Date.now()
      await ping('https://kieai.redpandaai.co/', { method: 'HEAD' })
      return `${Date.now() - t} мс`
    },
  },
  {
    name: 'Свой сервер',
    hint: 'КРИТИЧНО: через него уходит кадр на обработку и работает QR. '
      + 'Без него генерация не начнётся',
    run: async () => {
      const t = Date.now()
      const r = await ping(`${RELAY}/health`)
      const json = (await r.json()) as { shots?: number; heldMb?: number }
      return `${json.shots ?? '?'} картинок, ${json.heldMb ?? '?'} МБ, ${Date.now() - t} мс`
    },
  },
  {
    name: 'Статистика',
    hint: 'События копятся локально и уйдут, когда связь вернётся',
    run: async () => {
      const t = Date.now()
      await ping('https://event-stats.alavenir.tech/openapi.json')
      return `${Date.now() - t} мс`
    },
  },
  {
    name: 'Камера',
    hint: 'Съёмка не заработает: нет устройства или не выдано разрешение',
    run: async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      const track = stream.getVideoTracks()[0]
      const { width, height } = track.getSettings()
      stream.getTracks().forEach((t) => t.stop())
      return `${width} × ${height}`
    },
  },
]

export function DiagScreen({ onClose }: { onClose?: () => void }) {
  const [results, setResults] = useState<Record<string, Result>>({})
  const [native, setNative] = useState('проверяем…')
  const [font, setFont] = useState('проверяем…')

  const runAll = useCallback(() => {
    setResults(Object.fromEntries(CHECKS.map((c) => [c.name, { state: 'run', text: '…' } as Result])))
    for (const check of CHECKS) {
      check.run()
        .then((text) => setResults((r) => ({ ...r, [check.name]: { state: 'ok', text } })))
        .catch((error: unknown) => setResults((r) => ({
          ...r,
          [check.name]: { state: 'fail', text: error instanceof Error ? error.message : String(error) },
        })))
    }
  }, [])

  useEffect(() => {
    runAll()
    void desktop.then((n) => setNative(n ? 'да, файл stats.csv пишется' : 'нет, журнал только в браузере'))

    // Если фирменный шрифт не догрузился, webview берёт системный. Он шире,
    // и текст начинает вылезать за края плашек — по вёрстке это заметно
    // не сразу, а вот по этой строке видно однозначно.
    void document.fonts.ready.then(() => {
      const ok = document.fonts.check('98px "VK Sans Display"')
      setFont(ok ? 'загружен' : 'НЕ ЗАГРУЖЕН — вёрстка поедет')
    })
  }, [runAll])

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>Проверка панели</h1>

      <ul className={styles.list}>
        {CHECKS.map((check) => {
          const result = results[check.name] ?? { state: 'idle', text: '' }
          return (
            <li className={styles.row} key={check.name} data-state={result.state}>
              <span className={styles.mark}>{{ ok: '✓', fail: '✕', run: '…', idle: '·' }[result.state]}</span>
              <span className={styles.name}>{check.name}</span>
              <span className={styles.value}>{result.text}</span>
              {result.state === 'fail' && <span className={styles.hint}>{check.hint}</span>}
            </li>
          )
        })}
      </ul>

      <dl className={styles.facts}>
        <div><dt>Ключ kie.ai</dt><dd>{generationConfig.hasKey ? 'задан' : 'НЕ ЗАДАН'}</dd></div>
        <div><dt>Модель</dt><dd>{generationConfig.model} · {generationConfig.resolution} · {generationConfig.format}</dd></div>
        <div><dt>Задач на кадр</dt><dd>{generationConfig.attempts}</dd></div>
        <div><dt>Путь к API</dt><dd>{apiRoute() === 'direct' ? 'напрямую на api.kie.ai' : 'через свой сервер (api.kie.ai не отвечал)'}</dd></div>
        <div><dt>Адрес страницы</dt><dd>{RELAY}</dd></div>
        <div><dt>Статистика в очереди</dt><dd>{pendingCount()}</dd></div>
        <div><dt>Приложение Neutralino</dt><dd>{native}</dd></div>
        <div><dt>Шрифт VK Sans Display</dt><dd>{font}</dd></div>
        <div><dt>Экран</dt><dd>{window.innerWidth} × {window.innerHeight}, dpr {window.devicePixelRatio}</dd></div>
      </dl>

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={runAll}>Проверить снова</button>
        <button type="button" className={styles.ghost} onClick={onClose}>Закрыть</button>
      </div>
    </div>
  )
}
