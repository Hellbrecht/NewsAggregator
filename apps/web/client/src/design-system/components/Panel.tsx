// Panel — the standard dark card/container used throughout the dashboard.
// Wrap any content section in a Panel to give it the dark background + border.
//
// Usage:
//   <Panel>...</Panel>
//   <Panel title="River Levels" accent>...</Panel>

import type { ReactNode, CSSProperties } from 'react'

interface PanelProps {
  children:  ReactNode
  title?:    string        // optional header label
  accent?:   boolean       // red left border — draws attention to important panels
  style?:    CSSProperties // escape hatch for one-off sizing/layout overrides
  className?: string
}

export function Panel({ children, title, accent, style, className }: PanelProps) {
  return (
    <div
      className={className}
      style={{
        background:   'var(--bg-panel)',
        border:       '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding:      'var(--panel-padding)',
        // accent prop adds a red left border — same pattern as in the inspiration screenshots
        borderLeft:   accent ? '3px solid var(--accent)' : '1px solid var(--border)',
        ...style,
      }}
    >
      {/* Optional title bar */}
      {title && (
        <p style={{
          fontSize:      'var(--text-xs)',
          fontWeight:    'var(--font-weight-medium)',
          color:         'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom:  'var(--space-4)',
        }}>
          {title}
        </p>
      )}
      {children}
    </div>
  )
}
