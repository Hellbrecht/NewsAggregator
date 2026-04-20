// ThemeToggle — switches between dark and light theme.
//
// How it works:
//   1. Reads the current theme from <html data-theme="...">
//   2. On click: flips dark ↔ light
//   3. Writes the new value to localStorage so it survives page refresh
//   4. All CSS variables in tokens.css react instantly — no JS needed for the colours
//
// Usage:
//   <ThemeToggle />

import { useState, useEffect } from 'react'

type Theme = 'dark' | 'light'

// Read the current theme from the <html> element
function getTheme(): Theme {
  return (document.documentElement.getAttribute('data-theme') as Theme) ?? 'dark'
}

// Apply theme to <html> and save to localStorage
function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('theme', theme)
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getTheme)

  // On first load: restore saved theme from localStorage (if any)
  useEffect(() => {
    const saved = localStorage.getItem('theme') as Theme | null
    if (saved) {
      applyTheme(saved)
      setTheme(saved)
    }
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }

  const isDark = theme === 'dark'

  return (
    <button
      onClick={toggle}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            'var(--space-2)',
        background:     'var(--bg-panel-alt)',
        border:         '1px solid var(--border)',
        borderRadius:   'var(--radius-pill)',
        padding:        '4px var(--space-3)',
        cursor:         'pointer',
        color:          'var(--text-muted)',
        fontSize:       'var(--text-xs)',
        transition:     'color 0.15s, background 0.15s',
      }}
    >
      {/* Icon changes based on current theme */}
      <span style={{ fontSize: 14 }}>{isDark ? '○' : '●'}</span>
      <span>{isDark ? 'Light' : 'Dark'}</span>
    </button>
  )
}
