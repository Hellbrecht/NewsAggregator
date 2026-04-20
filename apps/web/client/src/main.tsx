import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Import design tokens first — they define CSS variables used by everything below
import './design-system/tokens.css'
import App from './App'

// StrictMode is a development helper — it runs your components twice
// to help catch bugs early. Has zero effect in production.

// createRoot finds the <div id="root"> in index.html and hands it to React.
// From this point on, React owns everything inside that div.
const root = document.getElementById('root')!
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
