import { useCallback, useEffect, useRef, useState } from 'react'

import { Stage } from './components/Stage/Stage'
import { applyFormat, loadSettings, readSettings, saveSettings, type Settings } from './format'
import { useGeneration } from './hooks/useGeneration'
import { useQuitGesture } from './hooks/useQuitGesture'
import { useSetupGesture } from './hooks/useSetupGesture'
import { CameraScreen } from './screens/Camera/CameraScreen'
import { LoadingScreen } from './screens/Loading/LoadingScreen'
import { ResultScreen } from './screens/Result/ResultScreen'
import { SetupScreen } from './screens/Setup/SetupScreen'
import { WelcomeScreen } from './screens/Welcome/WelcomeScreen'
import { DiagScreen } from './screens/Diag/DiagScreen'
import { LanguageProvider, TEXTS } from './i18n'
import { canonConnect, canonDisconnect, canonShutdown, ensureBridge } from './services/canon'
import { desktop, quit } from './services/desktop'
import { saveShot } from './services/shots'
import { startSession, startStats, track } from './services/stats'
import { beginGeneration, cancelGeneration, endGeneration, startGenerationStats } from './services/generations'

import { generationConfig } from './services/kie'
import styles from './App.module.css'

type Screen = 'welcome' | 'camera' | 'loading' | 'result'

const SCREENS: Screen[] = ['welcome', 'camera', 'loading', 'result']

/** Открыть экран сразу — удобно при отладке на панели: #camera, #loading, #result. */
function initialScreen(): Screen {
  const hash = window.location.hash.slice(1) as Screen
  return SCREENS.includes(hash) ? hash : 'welcome'
}

/** Сколько кадр висит на экране после съёмки, прежде чем уйти в обработку. */
const SHOT_HOLD_MS = 700
/** Сколько показываем сообщение об ошибке, прежде чем вернуться к началу. */
const ERROR_HOLD_MS = 5000

export function App() {
  const [settings, setSettings] = useState<Settings | null>(loadSettings)
  const [screen, setScreen] = useState<Screen>(initialScreen)
  const [diag, setDiag] = useState(() => window.location.hash === '#diag')
  const [photo, setPhoto] = useState<string | null>(null)
  const generation = useGeneration()
  const timers = useRef<number[]>([])

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])

  useEffect(() => {
    startStats()
    startGenerationStats()
    track('app', 'launch', {
      model: readSettings()?.model ?? generationConfig.defaultModel,
      resolution: generationConfig.resolution,
    })
  }, [])

  useEffect(() => {
    if (settings) applyFormat(settings.format)
  }, [settings])

  // Зеркалку занимаем сразу, как только она выбрана, а не на первом
  // посетителе: подключение занимает секунды. Выбрали веб-камеру — отпускаем,
  // иначе EOS Webcam Utility ту же камеру не получит.
  const cameraSource = settings?.cameraSource
  useEffect(() => {
    if (cameraSource === 'canon') void ensureBridge().then((up) => (up ? canonConnect() : undefined))
    else if (cameraSource === 'webcam') void canonDisconnect()
  }, [cameraSource])

  // Без генерации #result сразу показывает готовый образец: иначе экран
  // результата открывался бы пустым — ни маскота, ни QR.
  const startGeneration = generation.start
  useEffect(() => {
    if (import.meta.env.MODE === 'mock' && initialScreen() === 'result') void startGeneration('')
  }, [startGeneration])

  const language = settings?.language ?? 'ru'
  const texts = TEXTS[language]

  const openSetup = useCallback(() => {
    clearTimers()
    cancelGeneration()
    generation.reset()
    setPhoto(null)
    setScreen('welcome')
    setSettings(null)
  }, [clearTimers, generation])

  // Долгое удержание в левом верхнем углу — на панели адресной строки нет.
  useSetupGesture(openSetup)

  // Выход. Помощника камеры закрываем первым: он должен отпустить
  // зеркалку, иначе она останется «занята» до перетыкания кабеля.
  const quitApp = useCallback(() => {
    void desktop.then((native) => {
      // В браузере закрывать нечего, и помощника, запущенного руками, не трогаем.
      if (!native) return
      track('app', 'quit')
      cancelGeneration()
      return canonShutdown().then(quit)
    })
  }, [])

  // Пять быстрых касаний в правом верхнем углу — окно без рамки и поверх
  // всего, закрыть его иначе нечем. Вторая дорога — кнопка на экране настройки.
  useQuitGesture(quitApp)

  // …а в браузере хватает #setup.
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === '#setup') openSetup()
      setDiag(window.location.hash === '#diag')
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [openSetup])

  const goToWelcome = useCallback(() => {
    clearTimers()
    // После результата или ошибки генерация уже закрыта — тогда это ничего
    // не делает. Иначе ушли посреди отрисовки: она «прервана».
    cancelGeneration()
    generation.reset()
    setPhoto(null)
    setScreen('welcome')
  }, [clearTimers, generation])

  const handleStart = useCallback(() => {
    startSession()
    track('session', 'start')
    setScreen('camera')
  }, [])

  const handleCapture = useCallback(
    (shot: string) => {
      setPhoto(shot)
      track('photo', 'captured')
      if (settings?.saveShots) void saveShot(shot)

      // Генерацию запускаем сразу, не дожидаясь смены экрана: загрузка кадра
      // на сервис идёт параллельно с тем, как человек смотрит на свой снимок.
      track('generation', 'start')
      // Модель из настроек — она же уйдёт в статистику этой генерации.
      const model = settings?.model ?? generationConfig.defaultModel
      beginGeneration(model)
      void generation.start(shot, ({ ok, ms, reason }) => {
        endGeneration(ok ? 'success' : `error:${reason ?? 'api'}`)
        if (ok) {
          track('generation', 'success', { ms })
          setScreen('result')
          track('result', 'shown')
        } else {
          track('generation', `failed:${reason}`, { ms })
          timers.current.push(window.setTimeout(goToWelcome, ERROR_HOLD_MS))
        }
      }, { model, progressSeconds: settings?.progressSeconds })

      timers.current.push(window.setTimeout(() => setScreen('loading'), SHOT_HOLD_MS))
    },
    [generation, goToWelcome, settings?.model, settings?.progressSeconds, settings?.saveShots],
  )

  const handleRestart = useCallback(() => {
    track('session', 'restart')
    goToWelcome()
  }, [goToWelcome])

  useEffect(() => clearTimers, [clearTimers])

  const applySettings = useCallback((next: Settings) => {
    saveSettings(next)
    setSettings(next)
    track('setup', `${next.format}:${next.language}`, {
      cameraZoom: next.cameraZoom,
      cameraSource: next.cameraSource,
      cameraRotation: next.cameraRotation,
      model: next.model,
      progressSeconds: next.progressSeconds,
    })
    if (window.location.hash === '#setup') window.location.hash = ''
  }, [])

  const showsCamera = screen === 'camera' || screen === 'loading'

  // Служебный экран проверки связи — по #diag в адресе или кнопкой из
  // настроек. Отдельно от сценария: открывать его может понадобиться в
  // любой момент, в том числе на ошибке.
  const closeDiag = () => {
    // Закрываем состоянием, а не только адресом. На панели диагностику
    // открывают кнопкой из настроек, хеш при этом пустой — чистить его
    // нечего, события не будет, и экран оставался висеть навсегда.
    setDiag(false)
    if (window.location.hash === '#diag') window.location.hash = ''
  }

  if (diag) return <DiagScreen onClose={closeDiag} />

  if (!settings) {
    return (
      <SetupScreen
        initial={readSettings() ?? undefined}
        onDone={applySettings}
        onDiagnostics={(draft) => {
          // Выбор на экране настройки сохраняем: проверка читает сохранённое,
          // и сам экран после неё открывается заново — без этого он молча
          // возвращался к прошлой камере.
          saveSettings(draft)
          setDiag(true)
        }}
        onQuit={quitApp}
      />
    )
  }

  return (
    <LanguageProvider value={language}>
      <Stage>
        {screen === 'welcome' && (
          <WelcomeScreen format={settings.format} onStart={handleStart} />
        )}

        {/* Экран съёмки остаётся смонтированным под панелью прогресса:
            так в размытой подложке виден снятый кадр, а камера не перезапускается. */}
        {showsCamera && (
          <div className={screen === 'loading' ? `${styles.layer} ${styles.blurred}` : styles.layer}>
            <CameraScreen
              format={settings.format}
              zoom={settings.cameraZoom}
              rotation={settings.cameraRotation}
              source={settings.cameraSource}
              cameraId={settings.cameraId}
              cameraLabel={settings.cameraLabel}
              saveOriginals={settings.saveShots}
              onCapture={handleCapture}
              onFail={goToWelcome}
            />
          </div>
        )}

        {screen === 'loading' && (
          <LoadingScreen
            format={settings.format}
            progress={generation.progress}
            caption={
              generation.error ? texts.errors[generation.error.reason] ?? texts.errors.api
                : generation.overdue ? texts.loadingOverdue
                : undefined
            }
          />
        )}

        {screen === 'result' && (
          <ResultScreen
            format={settings.format}
            mascot={generation.mascot ?? photo}
            mascotBackup={generation.mascotBackup}
            qrValue={generation.sticker?.value}
            viaPage={generation.sticker?.viaPage ?? false}
            onRestart={handleRestart}
          />
        )}
      </Stage>
    </LanguageProvider>
  )
}
