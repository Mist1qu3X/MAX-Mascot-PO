import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Нативную часть будим сразу: ждать её умеет services/desktop.
import './services/desktop'
import { lockKiosk } from './kiosk'

import './styles/fonts.css'
import './styles/tokens.css'
import './styles/reset.css'

import { App } from './App'

// Импорты всё равно выполняются раньше, но вызов посреди них только путает.
lockKiosk()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
