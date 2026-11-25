import { useEffect, useState } from 'react'

import {
  CAMERA_ZOOM,
  FORMATS,
  LANGUAGES,
  PROGRESS_FILL,
  ROTATIONS,
  clampProgressSeconds,
  clampZoom,
  type CameraSource,
  type Format,
  type Language,
  type Rotation,
  type Settings,
} from '../../format'
import { CameraFeed } from '../../components/CameraFeed/CameraFeed'
import { MIRRORED, PREVIEW_ASPECT, type CameraDevice } from '../../hooks/useCamera'
import { useCameraSource } from '../../hooks/useCameraSource'
import { canonDisconnect, canonStatus } from '../../services/canon'
import { desktop } from '../../services/desktop'
import { DEFAULT_MODEL, MODELS, modelLabel } from '../../services/kie'

/** Модели на экране: все из MODELS, плюс заданная через VITE_KIE_MODEL, если её там нет. */
const OFFERED_MODELS = MODELS[DEFAULT_MODEL] ? Object.keys(MODELS) : [...Object.keys(MODELS), DEFAULT_MODEL]
import styles from './SetupScreen.module.css'

const CAMERA_PROBLEM: Record<string, string> = {
  idle: 'Включаем камеру…',
  starting: 'Включаем камеру…',
  denied: 'Нет доступа к камере',
  notfound: 'Камера не найдена',
  error: 'Камера не отвечает',
}

const zoomLabel = (zoom: number) => `×${zoom.toFixed(1).replace('.', ',')}`

type SetupScreenProps = {
  initial?: Settings
  onDone: (settings: Settings) => void
  /**
   * Открыть служебную проверку связи. Вместе с ней уходит то, что выбрано на
   * экране сейчас: проверка смотрит на выбранную камеру, а после возврата
   * экран открывается с тем же выбором, а не с прошлым сохранённым.
   */
  onDiagnostics?: (draft: Settings) => void
  /** Закрыть приложение — кнопка есть только в собранной программе. */
  onQuit?: () => void
}

/** Сколько пробный снимок висит в окне превью. */
const PROBE_HOLD_MS = 6000

/**
 * Что предлагаем на экране. Сейчас панель одна — вертикальная и на русском,
 * поэтому выбор сведён к одному варианту. Горизонтальные экраны и английский
 * в коде остались: вернуть их на экран — дописать сюда. Разово их можно
 * открыть и сейчас: ?format=landscape, ?lang=en в адресе.
 */
const OFFERED_FORMATS: Format[] = ['portrait']
const OFFERED_LANGUAGES: Language[] = ['ru']

/**
 * Первый запуск: выбираем ориентацию панели и язык.
 *
 * Макета на этот экран нет — свёрстан в той же фирменной палитре, но
 * без привязки к сетке 2160 × 3840: формат ещё не выбран, так что
 * размеры считаются от меньшей стороны окна.
 */
export function SetupScreen({ initial, onDone, onDiagnostics, onQuit }: SetupScreenProps) {
  // Сохранённый выбор подставляем, только если он есть на экране: иначе
  // «Запустить» молча включил бы вариант, которого оператор не видит.
  const [format, setFormat] = useState<Format>(
    initial && OFFERED_FORMATS.includes(initial.format) ? initial.format : OFFERED_FORMATS[0],
  )
  const [language, setLanguage] = useState<Language>(
    initial && OFFERED_LANGUAGES.includes(initial.language) ? initial.language : OFFERED_LANGUAGES[0],
  )
  const [model, setModel] = useState(
    initial?.model && OFFERED_MODELS.includes(initial.model) ? initial.model : DEFAULT_MODEL,
  )
  const [progressSeconds, setProgressSeconds] = useState(() => clampProgressSeconds(initial?.progressSeconds))
  const changeProgress = (direction: 1 | -1) =>
    setProgressSeconds((s) => clampProgressSeconds(s + direction * PROGRESS_FILL.step))
  const [zoom, setZoom] = useState(() => clampZoom(initial?.cameraZoom ?? CAMERA_ZOOM.initial))
  const [cameraId, setCameraId] = useState(initial?.cameraId ?? '')
  const [cameraLabel, setCameraLabel] = useState(initial?.cameraLabel ?? '')
  const [source, setSource] = useState<CameraSource>(initial?.cameraSource ?? 'webcam')
  const [rotation, setRotation] = useState<Rotation>(initial?.cameraRotation ?? 0)
  const [saveShots, setSaveShots] = useState(initial?.saveShots ?? false)
  // Живое превью — та же камера, то же окно и та же обрезка, что на экране
  // съёмки: что оператор видит здесь, то и попадёт в снимок.
  const camera = useCameraSource({ source, deviceId: cameraId || undefined, deviceLabel: cameraLabel || undefined })
  const changeZoom = (direction: 1 | -1) => setZoom((z) => clampZoom(z + direction * CAMERA_ZOOM.step))
  const turn = () => setRotation((r) => ROTATIONS[(ROTATIONS.indexOf(r) + 1) % ROTATIONS.length])

  // Собранная программа или браузер: в браузере нечем ни закрыть окно, ни
  // сохранить файл, ни запустить помощника камеры.
  const [isApp, setIsApp] = useState(false)
  // Зеркалку предлагаем там, где её можно включить: в программе — всегда,
  // в браузере — если помощник уже запущен руками.
  const [canonOffered, setCanonOffered] = useState(initial?.cameraSource === 'canon')
  useEffect(() => {
    let alive = true
    void desktop.then((native) => {
      if (!alive || !native) return
      setIsApp(true)
      setCanonOffered(true)
    })
    void canonStatus().then((status) => {
      if (alive && status) setCanonOffered(true)
    })
    return () => {
      alive = false
    }
  }, [])

  const pickCamera = (device: CameraDevice) => {
    // Зеркалку отпускаем: иначе веб-камера EOS Webcam Utility её не получит.
    if (source === 'canon') void canonDisconnect()
    setSource('webcam')
    setCameraId(device.deviceId)
    setCameraLabel(device.label)
  }
  // Подсвечиваем ту камеру, что реально горит в превью: выбранная могла не
  // найтись, и тогда работает другая — оператор должен это видеть.
  const activeId = source === 'webcam' && camera.status === 'ready'
    ? camera.devices.find((d) => d.label && d.label === camera.activeLabel)?.deviceId
    : undefined
  const selectedId = activeId ?? cameraId

  // Пробный снимок зеркалки: настоящий кадр с автофокусом, без генерации —
  // проверить резкость, кадрирование и поворот на месте.
  const [probe, setProbe] = useState<string | null>(null)
  const [probing, setProbing] = useState(false)
  const [probeNote, setProbeNote] = useState('')
  const takeProbe = async () => {
    setProbing(true)
    setProbeNote('')
    const started = Date.now()
    const image = await camera.capture(PREVIEW_ASPECT[format], MIRRORED, zoom, rotation, saveShots)
    setProbing(false)
    if (!image) {
      setProbeNote('Снимок не получился. Подробности — в файле canon-bridge.log в папке canon.')
      return
    }
    setProbe(image)
    setProbeNote(`Снимок готов за ${((Date.now() - started) / 1000).toFixed(1).replace('.', ',')} с.`)
  }
  useEffect(() => {
    if (!probe) return
    const timer = window.setTimeout(() => setProbe(null), PROBE_HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [probe])

  /** Всё, что выбрано на экране, — одним объектом настроек. */
  const collect = (): Settings => ({
    format,
    language,
    model,
    progressSeconds,
    cameraZoom: zoom,
    cameraSource: source,
    cameraRotation: rotation,
    saveShots,
    // Запоминаем ту камеру, что работала в превью, — её же возьмёт экран
    // съёмки. Не включилась никакая — оставляем выбор как есть.
    cameraId: selectedId || undefined,
    cameraLabel: (activeId ? camera.activeLabel : cameraLabel) || undefined,
  })

  const canon = source === 'canon' ? camera.canon : null
  const lastShot = canon && canon.lastCaptureWidth > 0
    ? `Последний снимок: ${canon.lastCaptureWidth} × ${canon.lastCaptureHeight}`
      + (canon.lastCaptureFocused ? '' : ' — камера не навела резкость, снято как есть')
    : ''

  return (
    <div className={styles.screen}>
      <div className={styles.sheet}>
        <h1 className={styles.title}>Настройка панели</h1>

        <section className={styles.section}>
          <h2 className={styles.label}>Ориентация экрана</h2>
          <div className={styles.options}>
            {OFFERED_FORMATS.map((key) => (
              <button
                key={key}
                type="button"
                className={styles.option}
                aria-pressed={format === key}
                disabled={!FORMATS[key].ready}
                onClick={() => setFormat(key)}
              >
                <span className={styles.preview} data-format={key} />
                <span className={styles.optionName}>{FORMATS[key].label}</span>
                <span className={styles.optionNote}>
                  {FORMATS[key].ready ? `${FORMATS[key].w} × ${FORMATS[key].h}` : 'Экраны ещё не свёрстаны'}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.label}>Язык</h2>
          <div className={styles.options}>
            {OFFERED_LANGUAGES.map((key) => (
              <button
                key={key}
                type="button"
                className={`${styles.option} ${styles.optionSlim}`}
                aria-pressed={language === key}
                onClick={() => setLanguage(key)}
              >
                <span className={styles.optionName}>{LANGUAGES[key]}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <label className={styles.label} htmlFor="setup-model">Модель генерации</label>
          <select
            id="setup-model"
            className={styles.select}
            value={model}
            onChange={(event) => setModel(event.target.value)}
          >
            {OFFERED_MODELS.map((key) => (
              <option key={key} value={key}>{modelLabel(key)}</option>
            ))}
          </select>
        </section>

        <section className={styles.section}>
          <h2 className={styles.label}>Шкала загрузки: время от 0 до 100%</h2>
          <div className={styles.stepper}>
            <button
              type="button"
              className={styles.stepButton}
              aria-label="Меньше секунд"
              disabled={progressSeconds <= PROGRESS_FILL.min}
              onClick={() => changeProgress(-1)}
            >
              −
            </button>
            <span className={styles.stepValue}>{progressSeconds}&nbsp;с</span>
            <button
              type="button"
              className={styles.stepButton}
              aria-label="Больше секунд"
              disabled={progressSeconds >= PROGRESS_FILL.max}
              onClick={() => changeProgress(1)}
            >
              +
            </button>
          </div>
          <p className={styles.note}>
            Картинка готова раньше — шкала сразу доезжает до 100%. Не готова — ждёт на 99%
            с надписью «Осталось совсем немного…».
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.label}>Камера</h2>
          {(camera.devices.length > 0 || canonOffered) && (
            <div className={styles.options}>
              {camera.devices.map((device, i) => (
                <button
                  key={device.deviceId}
                  type="button"
                  className={`${styles.option} ${styles.optionSlim}`}
                  aria-pressed={source === 'webcam' && device.deviceId === selectedId}
                  onClick={() => pickCamera(device)}
                >
                  <span className={styles.cameraName}>{device.label || `Камера ${i + 1}`}</span>
                </button>
              ))}
              {canonOffered && (
                <button
                  type="button"
                  className={`${styles.option} ${styles.optionSlim}`}
                  aria-pressed={source === 'canon'}
                  onClick={() => setSource('canon')}
                >
                  <span className={styles.cameraName}>Canon напрямую (USB)</span>
                </button>
              )}
            </div>
          )}
          {source === 'webcam' && camera.devices.length === 0 && camera.status !== 'starting' && (
            <p className={styles.note}>
              Система не видит ни одной камеры. Подключите её и нажмите «Обновить список камер».
            </p>
          )}
          {source === 'canon' && (
            <p className={styles.note}>
              {canon?.state === 'ready' && (
                <strong>
                  {canon.camera}
                  {canon.frameWidth > 0 && ` · превью ${canon.frameWidth} × ${canon.frameHeight}`}
                  {canon.backend === 'fake' && ' · имитация, не настоящая камера'}
                  {'. '}
                </strong>
              )}
              Зеркалка подключается по USB напрямую, без EOS Webcam Utility: на съёмке она сама наводит
              резкость и делает настоящий снимок. Диск режимов — на фото, объектив — в положении AF,
              EOS Utility закрыта.
            </p>
          )}
          <div className={styles.buttons}>
            <button type="button" className={styles.secondary} onClick={() => void camera.restart()}>
              Обновить список камер
            </button>
            {source === 'canon' && (
              <button
                type="button"
                className={styles.secondary}
                disabled={camera.status !== 'ready' || probing}
                onClick={() => void takeProbe()}
              >
                {probing ? 'Снимаем…' : 'Пробный снимок'}
              </button>
            )}
          </div>
          {source === 'canon' && (probeNote || lastShot) && (
            <p className={styles.note}>{[probeNote, lastShot].filter(Boolean).join(' ')}</p>
          )}
          {canon?.lastCaptureError && <p className={styles.camError}>{canon.lastCaptureError}</p>}

          <h2 className={styles.label}>Масштаб</h2>
          <div className={styles.camera}>
            <div className={styles.camPreview} style={{ aspectRatio: PREVIEW_ASPECT[format] }}>
              <CameraFeed
                camera={camera}
                className={styles.camVideo}
                mirrored={MIRRORED}
                zoom={zoom}
                rotation={rotation}
                aspect={PREVIEW_ASPECT[format]}
              />
              {probe && <img className={styles.camProbe} src={probe} alt="Пробный снимок" />}
              {camera.status !== 'ready' && !probe && (
                <p className={styles.camMessage}>{CAMERA_PROBLEM[camera.status]}</p>
              )}
            </div>

            <div className={styles.zoom}>
              <div className={styles.stepper}>
                <button
                  type="button"
                  className={styles.stepButton}
                  aria-label="Отдалить"
                  disabled={zoom <= CAMERA_ZOOM.min}
                  onClick={() => changeZoom(-1)}
                >
                  −
                </button>
                <span className={styles.stepValue}>{zoomLabel(zoom)}</span>
                <button
                  type="button"
                  className={styles.stepButton}
                  aria-label="Приблизить"
                  disabled={zoom >= CAMERA_ZOOM.max}
                  onClick={() => changeZoom(1)}
                >
                  +
                </button>
              </div>
              <p className={styles.note}>
                ×1 — весь кадр камеры. Больше — ближе: по бокам и снизу обрезается лишнее,
                голова остаётся вверху. Снимок будет ровно таким, как в окне.
              </p>
              <div className={styles.buttons}>
                <button type="button" className={styles.secondary} onClick={turn}>
                  Повернуть на 90°
                </button>
                <span className={styles.note}>Поворот: {rotation}°. Нужен, если камера стоит боком.</span>
              </div>
            </div>
          </div>
          {camera.status !== 'ready' && camera.error && <p className={styles.camError}>{camera.error}</p>}
          {isApp && (
            <label className={styles.check}>
              <input type="checkbox" checked={saveShots} onChange={(event) => setSaveShots(event.target.checked)} />
              <span>
                Сохранять кадры в папку shots рядом с программой — посмотреть, что ушло в обработку.
                На мероприятии лучше выключить.
              </span>
            </label>
          )}
        </section>

        <div className={styles.buttons}>
          <button
            type="button"
            className={styles.start}
            onClick={() => onDone(collect())}
          >
            Запустить
          </button>

          {/* Единственный путь к диагностике на панели: адресной строки там нет,
              а сюда пускает удержание левого верхнего угла. */}
          <button type="button" className={styles.secondary} onClick={() => onDiagnostics?.(collect())}>
            Проверить связь
          </button>

          {isApp && (
            <button type="button" className={styles.secondary} onClick={onQuit}>
              Закрыть программу
            </button>
          )}
        </div>

        <p className={styles.hint}>
          Чтобы вернуться сюда — удержите левый верхний угол три секунды или откройте
          приложение с #setup в адресе. Закрыть программу с любого экрана — пять быстрых
          касаний в правом верхнем углу.
        </p>
      </div>
    </div>
  )
}
