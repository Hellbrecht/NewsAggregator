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
import { NavLink } from 'react-router-dom'

// Nav items — label shown + URL path
const NAV_ITEMS = [
  { label: 'News',       path: '/news'      },
  { label: 'Hydrology',  path: '/hydrology' },
  { label: 'Stocks',     path: '/stocks'    },
  { label: 'Alerts',     path: '/alerts'    },
  { label: 'Map',        path: '/map'       },
] as const

interface TopBarProps {
  children?: ReactNode  // right-side actions (theme toggle, etc.)
}

export function TopBar({ children }: TopBarProps) {
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

      {/* Nav links — NavLink auto-detects the active route */}
      <nav style={{ display: 'flex', alignItems: 'stretch', gap: 0, height: '100%' }}>
        {NAV_ITEMS.map(({ label, path }) => (
          <NavLink
            key={path}
            to={path}
            style={({ isActive }) => ({
              display:        'flex',
              alignItems:     'center',
              padding:        '0 var(--space-4)',
              fontSize:       'var(--text-sm)',
              fontWeight:     isActive ? 'var(--font-weight-medium)' : 'var(--font-weight-normal)',
              color:          isActive ? 'var(--text-primary)' : 'var(--text-muted)',
              textDecoration: 'none',
              borderBottom:   isActive ? '2px solid var(--accent)' : '2px solid transparent',
              transition:     'color 0.15s, border-color 0.15s',
            })}
          >
            {label}
          </NavLink>
        ))}
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
