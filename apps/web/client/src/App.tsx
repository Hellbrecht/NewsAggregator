// App.tsx — temporary component showcase.
// As we build each component, we add it here to preview it.

import { StatusPill } from './design-system/components/StatusPill'
import { Panel } from './design-system/components/Panel'
import { TopBar } from './design-system/components/TopBar'
import { ThemeToggle } from './design-system/components/ThemeToggle'

export default function App() {
  return (
    <div style={{ minHeight: '100vh', padding: 'var(--space-8)', fontFamily: 'var(--font-sans)' }}>

      {/* Page title */}
      <h1 style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
        WaterNews
      </h1>
      <p style={{ color: 'var(--accent)', fontSize: 'var(--text-xs)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--space-8)' }}>
        Design Token Validation
      </p>

      {/* TopBar component */}
      <Section label="TopBar — horizontal nav">
        <div style={{ width: '100%', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)' }}>
          <TopBar activePage="News">
            <ThemeToggle />
          </TopBar>
          <div style={{ height: 'var(--space-1)', background: 'var(--bg-base)' }} />
          <TopBar activePage="Hydrology" />
        </div>
      </Section>

      {/* StatusPill component */}
      <Section label="StatusPill — status badges">
        <StatusPill status="ok"   label="Normal" />
        <StatusPill status="warn" label="Warning" />
        <StatusPill status="crit" label="Critical" />
        <StatusPill status="info" label="Info" />
        <StatusPill status="muted" label="Inactive" />
        <StatusPill status="crit" label="Flood Alert" dot={false} />
      </Section>

      {/* Panel component */}
      <Section label="Panel — content cards">
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', width: '100%' }}>
          <Panel title="Standard panel" style={{ flex: 1, minWidth: 200 }}>
            <p style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>River level: 4.2m</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginTop: 'var(--space-1)' }}>USGS · 5 min ago</p>
          </Panel>
          <Panel title="Accent panel" accent style={{ flex: 1, minWidth: 200 }}>
            <p style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>Flood warning issued</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginTop: 'var(--space-1)' }}>NWS · 12 min ago</p>
          </Panel>
          <Panel style={{ flex: 1, minWidth: 200 }}>
            <p style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>No title panel</p>
          </Panel>
        </div>
      </Section>

      {/* Backgrounds */}
      <Section label="Backgrounds">
        <Swatch label="bg-base"      value="#0c0c0c" bg="var(--bg-base)"      border />
        <Swatch label="bg-panel"     value="#1a1a1a" bg="var(--bg-panel)"     border />
        <Swatch label="bg-panel-alt" value="#222222" bg="var(--bg-panel-alt)" border />
      </Section>

      {/* Text */}
      <Section label="Text">
        <Swatch label="text-primary" value="#ffffff" bg="var(--text-primary)" dark />
        <Swatch label="text-muted"   value="#707070" bg="var(--text-muted)"   dark />
      </Section>

      {/* Accent */}
      <Section label="Accent">
        <Swatch label="accent"       value="#e5342a" bg="var(--accent)" />
        <Swatch label="accent-hover" value="#cc2a20" bg="var(--accent-hover)" />
      </Section>

      {/* Status */}
      <Section label="Status badges">
        <Swatch label="ok"    value="#16a34a" bg="var(--status-ok)" />
        <Swatch label="warn"  value="#d97706" bg="var(--status-warn)" />
        <Swatch label="crit"  value="#e5342a" bg="var(--status-crit)" />
        <Swatch label="info"  value="#0ea5e9" bg="var(--status-info)" />
        <Swatch label="muted" value="#3a3a3a" bg="var(--status-muted)" border />
      </Section>

      {/* Typography sample */}
      <Section label="Typography">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <span style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)' }}>Heading XL — Water Risk Intelligence</span>
          <span style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}>Heading LG — Mississippi Basin Alert</span>
          <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-primary)' }}>Body — Flood risk elevated in southern regions following 48h of rainfall.</span>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Secondary — Source: USGS · 2 hours ago</span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Label — Critical</span>
        </div>
      </Section>

    </div>
  )
}

// ── Helper components (temporary, just for this validation page) ──

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 'var(--space-8)' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 'var(--space-4)' }}>
        {label}
      </p>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {children}
      </div>
    </div>
  )
}

function Swatch({ label, value, bg, border, dark }: {
  label: string; value: string; bg: string; border?: boolean; dark?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', alignItems: 'center' }}>
      <div style={{
        width: 80,
        height: 80,
        borderRadius: 'var(--radius-lg)',
        background: bg,
        border: border ? '1px solid var(--border)' : 'none',
      }} />
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>{label}</span>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{value}</span>
    </div>
  )
}
