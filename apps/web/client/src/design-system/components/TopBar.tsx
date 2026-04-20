// TopBar — sticky header with horizontal navigation.
// Logo left, nav links inline, action slot right.
// Active page is highlighted with white text + red underline.
//
// Usage:
//   <TopBar activePage="News" />
//   <TopBar activePage="Hydrology">
//     <ThemeToggle />
//   </TopBar>

import type { ReactNode } from 'react'

// The pages shown in the nav — order matters (left to right)
export const NAV_PAGES = ['News', 'Hydrology', 'Stocks', 'Alerts', 'Map'] as const
export type NavPage = typeof NAV_PAGES[number]

interface TopBarProps {
  activePage: NavPage
  children?:  ReactNode  // right-side actions (theme toggle, etc.)
}

export function TopBar({ activePage, children }: TopBarProps) {
  return (
    <header style={{
      height:         'var(--topbar-height)',
      background:     'var(--bg-panel)',
      borderBottom:   '1px solid var(--border)',
      display:        'flex',
      alignItems:     'center',
      gap:            'var(--space-8)',
      padding:        '0 var(--space-6)',
      position:       'sticky',
      top:            0,
      zIndex:         10,
    }}>

      {/* Logo — red accent mark + app name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
        <span style={{
          width: 8, height: 8,
          borderRadius: '50%',
          background: 'var(--accent)',
          display: 'inline-block',
        }} />
        <span style={{
          color:      'var(--text-primary)',
          fontSize:   'var(--text-sm)',
          fontWeight: 'var(--font-weight-bold)',
          letterSpacing: '0.04em',
        }}>
          WaterNews
        </span>
      </div>

      {/* Nav links — horizontal, one line */}
      <nav style={{ display: 'flex', alignItems: 'stretch', gap: 0, height: '100%' }}>
        {NAV_PAGES.map(page => {
          const isActive = page === activePage
          return (
            <a
              key={page}
              href={`/${page.toLowerCase()}`}
              style={{
                display:        'flex',
                alignItems:     'center',
                padding:        '0 var(--space-4)',
                fontSize:       'var(--text-sm)',
                fontWeight:     isActive ? 'var(--font-weight-medium)' : 'var(--font-weight-normal)',
                color:          isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                textDecoration: 'none',
                // Red underline on active page — single pixel, flush with bottom of bar
                borderBottom:   isActive ? '2px solid var(--accent)' : '2px solid transparent',
                // Smooth transition when switching pages
                transition:     'color 0.15s, border-color 0.15s',
              }}
            >
              {page}
            </a>
          )
        })}
      </nav>

      {/* Spacer — pushes action slot to the right */}
      <div style={{ flex: 1 }} />

      {/* Right-side action slot */}
      {children && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexShrink: 0 }}>
          {children}
        </div>
      )}
    </header>
  )
}
