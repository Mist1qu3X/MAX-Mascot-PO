import { useState } from 'react'

import { CAMERA_ZOOM, FORMATS, LANGUAGES, clampZoom, type Format, type Language, type Settings } from '../../format'
import { MIRRORED, PREVIEW_ASPECT, cropTransform, useCamera, type CameraDevice } from '../../hooks/useCamera'
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
  /** Открыть служебную проверку связи. */
  onDiagnostics?: () => void
}

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
export function SetupScreen({ initial, onDone, onDiagnostics }: SetupScreenProps) {
  // Сохранённый выбор подставляем, только если он есть на экране: иначе
  // «Запустить» молча включил бы вариант, которого оператор не видит.
  const [format, setFormat] = useState<Format>(
    initial && OFFERED_FORMATS.includes(initial.format) ? initial.format : OFFERED_FORMATS[0],
  )
  const [language, setLanguage] = useState<Language>(
    initial && OFFERED_LANGUAGES.includes(initial.language) ? initial.language : OFFERED_LANGUAGES[0],
  )
  const [zoom, setZoom] = useState(() => clampZoom(initial?.cameraZoom ?? CAMERA_ZOOM.initial))
  const [cameraId, setCameraId] = useState(initial?.cameraId ?? '')
  const [cameraLabel, setCameraLabel] = useState(initial?.cameraLabel ?? '')
  // Живое превью — та же камера, то же окно и та же обрезка, что на экране
  // съёмки: что оператор видит здесь, то и попадёт в снимок.
  const camera = useCamera({ deviceId: cameraId || undefined, deviceLabel: cameraLabel || undefined })
  const changeZoom = (direction: 1 | -1) => setZoom((z) => clampZoom(z + direction * CAMERA_ZOOM.step))

  const pickCamera = (device: CameraDevice) => {
    setCameraId(device.deviceId)
    setCameraLabel(device.label)
  }
  // Подсвечиваем ту камеру, что реально горит в превью: выбранная могла не
  // найтись, и тогда работает другая — оператор должен это видеть.
  const activeId = camera.status === 'ready'
    ? camera.devices.find((d) => d.label && d.label === camera.activeLabel)?.deviceId
    : undefined
  const selectedId = activeId ?? cameraId

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
          <h2 className={styles.label}>Камера</h2>
          {camera.devices.length > 0 && (
            <div className={styles.options}>
              {camera.devices.map((device, i) => (
                <button
                  key={device.deviceId}
                  type="button"
                  className={`${styles.option} ${styles.optionSlim}`}
                  aria-pressed={device.deviceId === selectedId}
                  onClick={() => pickCamera(device)}
                >
                  <span className={styles.cameraName}>{device.label || `Камера ${i + 1}`}</span>
                </button>
              ))}
            </div>
          )}
          {camera.devices.length === 0 && camera.status !== 'starting' && (
            <p className={styles.zoomNote}>
              Система не видит ни одной камеры. Подключите её и нажмите «Обновить список камер».
            </p>
          )}
          <div className={styles.buttons}>
            <button type="button" className={styles.secondary} onClick={() => void camera.start()}>
              Обновить список камер
            </button>
          </div>

          <h2 className={styles.label}>Масштаб</h2>
          <div className={styles.camera}>
            <div className={styles.camPreview} style={{ aspectRatio: PREVIEW_ASPECT[format] }}>
              <video
                ref={camera.videoRef}
                className={styles.camVideo}
                style={{ transform: cropTransform(MIRRORED, zoom) }}
                autoPlay
                playsInline
                muted
              />
              {camera.status !== 'ready' && <p className={styles.camMessage}>{CAMERA_PROBLEM[camera.status]}</p>}
            </div>

            <div className={styles.zoom}>
              <div className={styles.zoomRow}>
                <button
                  type="button"
                  className={styles.zoomButton}
                  aria-label="Отдалить"
                  disabled={zoom <= CAMERA_ZOOM.min}
                  onClick={() => changeZoom(-1)}
                >
                  −
                </button>
                <span className={styles.zoomValue}>{zoomLabel(zoom)}</span>
                <button
                  type="button"
                  className={styles.zoomButton}
                  aria-label="Приблизить"
                  disabled={zoom >= CAMERA_ZOOM.max}
                  onClick={() => changeZoom(1)}
                >
                  +
                </button>
              </div>
              <p className={styles.zoomNote}>
                ×1 — весь кадр камеры. Больше — ближе: по бокам и снизу обрезается лишнее,
                голова остаётся вверху. Снимок будет ровно таким, как в окне.
              </p>
            </div>
          </div>
          {camera.status !== 'ready' && camera.error && <p className={styles.camError}>{camera.error}</p>}
        </section>

        <div className={styles.buttons}>
          <button
            type="button"
            className={styles.start}
            onClick={() => onDone({
              format,
              language,
              cameraZoom: zoom,
              // Запоминаем ту камеру, что работала в превью, — её же возьмёт
              // экран съёмки. Не включилась никакая — оставляем выбор как есть.
              cameraId: selectedId || undefined,
              cameraLabel: (activeId ? camera.activeLabel : cameraLabel) || undefined,
            })}
          >
            Запустить
          </button>

          {/* Единственный путь к диагностике на панели: адресной строки там нет,
              а сюда пускает удержание левого верхнего угла. */}
          <button type="button" className={styles.secondary} onClick={onDiagnostics}>
            Проверить связь
          </button>
        </div>

        <p className={styles.hint}>
          Чтобы вернуться сюда — удержите левый верхний угол три секунды или откройте
          приложение с #setup в адресе.
        </p>
      </div>
    </div>
  )
}
