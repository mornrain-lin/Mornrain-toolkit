import {createRoot} from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Apply persisted theme (default: dark) before render to avoid flash
const THEME_KEY = 'toolkit-theme'
const saved = localStorage.getItem(THEME_KEY)
if (saved === 'light') {
  document.documentElement.classList.remove('dark')
} else {
  document.documentElement.classList.add('dark')
}

createRoot(document.getElementById('root')!).render(<App />)
