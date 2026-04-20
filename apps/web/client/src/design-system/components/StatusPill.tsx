// StatusPill — a small coloured badge showing a status or risk level.
// Used on news items, hydrology readings, alerts — anywhere you need a quick visual label.
//
// Usage:
//   <StatusPill status="crit" label="Critical" />
//   <StatusPill status="ok"   label="Normal" />

// ── Types ────────────────────────────────────────────────────────
// "status" controls the colour. Each maps to a CSS variable in tokens.css.
export type StatusLevel = 'ok' | 'warn' | 'crit' | 'info' | 'muted'

interface StatusPillProps {
  status: StatusLevel
  label: string
  // dot: show a small circle before the label (default: true)
  dot?: boolean
}

// ── Colour map ───────────────────────────────────────────────────
// Maps each status to its CSS variable token.
// To change a colour, edit tokens.css — not here.
const colorMap: Record<StatusLevel, string> = {
  ok:   'var(--status-ok)',
  warn: 'var(--status-warn)',
  crit: 'var(--status-crit)',
  info: 'var(--status-info)',
  muted:'var(--status-muted)',
}

// ── Component ────────────────────────────────────────────────────
export function StatusPill({ status, label, dot = true }: StatusPillProps) {
  const color = colorMap[status]

  return (
    <span style={{
      display:        'inline-flex',
      alignItems:     'center',
      gap:            'var(--space-1)',
      padding:        '2px var(--space-2)',
      borderRadius:   'var(--radius-pill)',
      // Semi-transparent background using the status colour — gives depth without being loud
      background:     `color-mix(in srgb, ${color} 15%, transparent)`,
      border:         `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
      color:          color,
      fontSize:       'var(--text-xs)',
      fontWeight:     'var(--font-weight-medium)',
      letterSpacing:  '0.04em',
      whiteSpace:     'nowrap',
    }}>
      {dot && (
        // Small filled circle — the status dot
        <span style={{
          width:        6,
          height:       6,
          borderRadius: '50%',
          background:   color,
          flexShrink:   0,
        }} />
      )}
      {label}
    </span>
  )
}
