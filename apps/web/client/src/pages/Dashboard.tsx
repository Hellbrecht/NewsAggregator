// Dashboard.tsx — the main dashboard page.
// This is what the user sees at /dashboard.
// Layout: TopBar at top, then a grid of Panel cards below.
// Data is placeholder for now — real API wiring comes next.

import { TopBar } from '../design-system/components/TopBar'
import { Panel } from '../design-system/components/Panel'
import { StatusPill } from '../design-system/components/StatusPill'
import { ThemeToggle } from '../design-system/components/ThemeToggle'

export default function Dashboard() {
  return (
    // Full-height column layout — TopBar on top, scrollable content below
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

      {/* ── Top navigation bar ── */}
      <TopBar>
        <ThemeToggle />
      </TopBar>

      {/* ── Page content ── */}
      <main style={{
        flex:    1,
        padding: 'var(--space-6)',
        display: 'grid',
        // Two columns: wider left feed, narrower right sidebar
        // On small screens this collapses to one column
        gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
        gridTemplateRows:    'auto 1fr',
        gap:     'var(--space-4)',
        alignContent: 'start',
      }}>

        {/* ── Left column ── */}

        {/* Alert banner — spans both columns when active */}
        <Panel accent style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <StatusPill status="crit" label="Active Alert" />
            <span style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>
              Flood warning issued for Mississippi River basin — NWS
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginLeft: 'auto' }}>
              12 min ago
            </span>
          </div>
        </Panel>

        {/* News feed */}
        <Panel title="Latest News" style={{ gridColumn: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {PLACEHOLDER_ARTICLES.map(article => (
              <FeedItem key={article.id} {...article} />
            ))}
          </div>
        </Panel>

        {/* Right column — stats and hydrology */}
        <div style={{ gridColumn: 2, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

          {/* Risk summary */}
          <Panel title="Risk Summary">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {RISK_REGIONS.map(r => (
                <div key={r.region} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>{r.region}</span>
                  <StatusPill status={r.status} label={r.label} />
                </div>
              ))}
            </div>
          </Panel>

          {/* Hydrology snapshot */}
          <Panel title="Hydrology">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {HYDRO_STATIONS.map(s => (
                <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>{s.name}</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{s.provider}</p>
                  </div>
                  <span style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-weight-medium)' }}>
                    {s.reading}
                  </span>
                </div>
              ))}
            </div>
          </Panel>

        </div>
      </main>
    </div>
  )
}

// ── FeedItem — a single news card inside the feed ────────────────
function FeedItem({ title, source, time, status }: typeof PLACEHOLDER_ARTICLES[0]) {
  return (
    <div style={{
      padding:      'var(--space-3) 0',
      borderBottom: '1px solid var(--border)',
      display:      'flex',
      flexDirection:'column',
      gap:          'var(--space-2)',
    }}>
      <p style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)', lineHeight: 1.4 }}>
        {title}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <StatusPill status={status} label={status === 'crit' ? 'Critical' : status === 'warn' ? 'Warning' : 'Normal'} />
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{source}</span>
        <span style={{ color: 'var(--border)', fontSize: 'var(--text-xs)' }}>·</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{time}</span>
      </div>
    </div>
  )
}

// ── Placeholder data — will be replaced by real API calls ────────
const PLACEHOLDER_ARTICLES = [
  { id: 1, title: 'Major flooding reported along the Missouri River after record rainfall', source: 'Reuters', time: '8 min ago',  status: 'crit' as const },
  { id: 2, title: 'USGS upgrades river gauge readings in Great Lakes region', source: 'USGS',    time: '34 min ago', status: 'ok'   as const },
  { id: 3, title: 'Drought conditions worsen across southwestern US water basins', source: 'AP',      time: '1 hr ago',  status: 'warn' as const },
  { id: 4, title: 'Canadian water quality report shows improved readings in St. Lawrence', source: 'ECCC',    time: '2 hr ago',  status: 'ok'   as const },
]

const RISK_REGIONS = [
  { region: 'Mississippi Basin',  status: 'crit' as const, label: 'Critical' },
  { region: 'Great Lakes',        status: 'ok'   as const, label: 'Normal'   },
  { region: 'Colorado River',     status: 'warn' as const, label: 'Warning'  },
  { region: 'Pacific Northwest',  status: 'ok'   as const, label: 'Normal'   },
]

const HYDRO_STATIONS = [
  { name: 'Missouri R. at Omaha',   provider: 'USGS',  reading: '18.4 ft' },
  { name: 'Lake Erie at Buffalo',   provider: 'USACE', reading: '571.2 ft' },
  { name: 'Colorado R. at Hoover',  provider: 'USBR',  reading: '1,045 ft' },
]
