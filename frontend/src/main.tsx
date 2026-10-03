import React from 'react'
import ReactDOM from 'react-dom/client'

// Fonts are bundled locally with Fontsource so the offline demo works.
import '@fontsource-variable/newsreader'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'

import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/landing.css'

import App from './App'

// Hand control of theme transitions back to CSS once the first frame is painted.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    document.documentElement.removeAttribute('data-first-paint')
  })
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
