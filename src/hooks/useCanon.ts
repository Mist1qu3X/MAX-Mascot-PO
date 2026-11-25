import { useCallback, useEffect, useRef, useState } from 'react'

import type { Rotation } from '../format'
import {
  canonCapture, canonConnect, canonFocus, canonFrame, canonLiveUrl, canonStatus, ensureBridge,
  type CanonStatus,
} from '../services/canon'
import { renderShot, type CameraStatus } from './useCamera'

/** Как часто спрашиваем помощника, что с камерой. */
const POLL_MS = 500

/**
 * Зеркалка Canon через помощника. Отдаёт то же, что `useCamera` для
 * веб-камеры: статус, адрес живой картинки и съёмку. Разница одна — снимок
 * делает сама камера, поэтому `capture` ждёт её секунду-другую.
 *
 * Камеру держим занятой всё время, пока она выбрана в настройке: при
 * размонтировании её не отпускаем, иначе каждый посетитель ждал бы
 * подключения заново. Live View помощник гасит сам, когда на превью
 * никто не смотрит.
 */
export function useCanon(enabled: boolean) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [error, setError] = useState('')
  const [info, setInfo] = useState<CanonStatus | null>(null)
  const [liveUrl, setLiveUrl] = useState('')
  /** Растёт при «обновить»: перезапускает подключение и поток превью. */
  const [run, setRun] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
      setLiveUrl('')
      return
    }

    let alive = true
    let streaming = false
    let busy = false
    setStatus('starting')
    setError('')

    const poll = async () => {
      // Запуск помощника занимает секунды — опросы за это время не копим.
      if (busy) return
      busy = true
      try {
        await step()
      } finally {
        busy = false
      }
    }

    const step = async () => {
      let next = await canonStatus()
      if (!alive) return
      if (!next) {
        // Не отвечает: не запущен или упал. Поднимаем и начинаем с начала.
        streaming = false
        const up = await ensureBridge()
        if (!alive) return
        if (!up) {
          setInfo(null)
          setStatus('error')
          setError('Не запущен помощник камеры canon-bridge.exe (папка canon рядом с программой)')
          return
        }
        next = await canonStatus()
        if (!alive || !next) return
      }

      // Помощник новый — камеру просим заново и поток превью открываем
      // новый: старый адрес уже никуда не ведёт.
      if (!streaming) {
        streaming = true
        await canonConnect()
        if (!alive) return
        setLiveUrl(canonLiveUrl())
      }

      setInfo(next)
      if (next.state === 'ready') {
        // Камера подключена, но кадра ещё не было — зеркало поднимается.
        setStatus(next.liveView && next.frameSeq > 0 ? 'ready' : 'starting')
        setError('')
      } else if (next.state === 'idle' || next.state === 'connecting') {
        setStatus('starting')
      } else {
        setStatus(next.state === 'no-camera' ? 'notfound' : 'error')
        setError(next.message)
      }
    }

    void poll()
    const timer = window.setInterval(() => void poll(), POLL_MS)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [enabled, run])

  const restart = useCallback(() => setRun((n) => n + 1), [])

  /**
   * Снимок. Не получился (камера не навелась и не сняла, оборвалась связь) —
   * берём кадр превью: он мельче, но посетитель не уходит ни с чем.
   */
  const capture = useCallback(
    async (aspect: number, mirrored: boolean, zoom: number, rotation: Rotation, save = false): Promise<string | null> => {
      let blob: Blob | null = null
      try {
        blob = await canonCapture(save)
      } catch (caught) {
        console.warn('[canon] снимок не получился, берём кадр превью:', caught)
        blob = await canonFrame()
      }
      if (!blob) return null

      try {
        const bitmap = await createImageBitmap(blob)
        const shot = renderShot(bitmap, bitmap.width, bitmap.height, aspect, mirrored, zoom, rotation)
        bitmap.close()
        return shot
      } catch (caught) {
        console.warn('[canon] снимок не читается:', caught)
        return null
      }
    },
    [],
  )

  const focus = useCallback(() => void canonFocus(), [])

  return { imgRef, liveUrl, status, error, info, restart, capture, focus }
}
