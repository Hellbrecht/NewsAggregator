// HydrologyPage — real-time readings from all water data providers.
// Layout: TopBar, page header, then one card per provider with a station table.

import { useState, useEffect } from 'react'
import { TopBar }      from '../design-system/components/TopBar'
import { ThemeToggle } from '../design-system/components/ThemeToggle'
import { Panel }       from '../design-system/components/Panel'
import { StatusPill }  from '../design-system/components/StatusPill'
import { api, type HydrologyProvider, type HydrologyItem } from '../lib/api'

// ── Plain-English metric descriptions ────────────────────────────────
const METRIC_DESCRIPTIONS: Record<string, string> = {
  'Streamflow':             'Volume of water flowing past a point per second. Higher = more water moving downstream. Key flood indicator.',
  'Gage height':            'Height of the water surface above a fixed reference point. Rising levels indicate flooding risk.',
  'Pool elevation':         'Height of the water surface in a reservoir above sea level.',
  'Lake/Reservoir Storage': 'Total volume of water stored in a reservoir, typically measured in acre-feet.',
  'Snowpack':               'Depth or water equivalent of snow on the ground. Melting snowpack drives spring river levels.',
  'Precipitation':          'Amount of rainfall or snowfall recorded at a station.',
  'Water temperature':      'Temperature of the water at the measurement point.',
  'Dissolved oxygen':       'Amount of oxygen dissolved in water. Low levels stress aquatic life.',
  'Turbidity':              'Cloudiness of water caused by particles. High turbidity can signal runoff or erosion events.',
}

function getMetricDescription(metric: string): string | null {
  const key = Object.keys(METRIC_DESCRIPTIONS).find(
    k => metric.toLowerCase().includes(k.toLowerCase())
  )
  return key ? METRIC_DESCRIPTIONS[key] : null
}

// ── Main page ─────────────────────────────────────────────────────────
export default function HydrologyPage() {
  const [providers,   setProviders]   = useState<HydrologyProvider[]>([])
  const [requestedAt, setRequestedAt] = useState<string | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  function load(refresh = false) {
    if (refresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)

    api.getHydrology(refresh)
      .then(data => {
        setProviders(Array.isArray(data.providers) ? data.providers : [])
        setRequestedAt(data.requestedAt ?? null)
      })
      .catch(e => {
        console.error('[HydrologyPage] load error:', e)
        setError(String(e?.message ?? e))
      })
      .finally(() => {
        setLoading(false)
        setRefreshing(false)
      })
  }

  useEffect(() => { load() }, [])

  return (
    <div style={{
      display:        'flex',
      flexDirection:  'column',
      minHeight:      '100vh',
      background:     'var(--bg-base)',
      color:          'var(--text-primary)',
    }}>
      <TopBar><ThemeToggle /></TopBar>

      <main style={{ flex: 1, padding: 'var(--space-6)', maxWidth: 1200, margin: '0 auto', width: '100%' }}>

        {/* Header */}
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-primary)' }}>
            Hydrology Live
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>
            Real-time readings from river gauges, reservoirs, and snowpack stations.
          </p>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            style={{
              padding:      'var(--space-2) var(--space-4)',
              borderRadius: 'var(--radius-sm)',
              border:       '1px solid var(--border)',
              background:   'var(--bg-panel)',
              color:        refreshing ? 'var(--text-muted)' : 'var(--text-primary)',
              fontSize:     'var(--text-sm)',
              cursor:       refreshing ? 'default' : 'pointer',
            }}
          >
            {refreshing ? 'Refreshing…' : 'Refresh Data'}
          </button>
          {requestedAt && (
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
              Snapshot: {new Date(requestedAt).toLocaleString()} — {providers.length} provider(s)
            </p>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <Panel accent style={{ marginBottom: 'var(--space-4)' }}>
            <p style={{ color: 'var(--status-crit)', fontSize: 'var(--text-sm)' }}>{error}</p>
          </Panel>
        )}

        {/* Loading */}
        {loading && (
          <p style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>Loading…</p>
        )}

        {/* Provider cards */}
        {!loading && !error && providers.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>No provider data available.</p>
        )}

        {!loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            {providers.map(p => (
              <ProviderCard key={p.id} provider={p} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

// ── ProviderCard ──────────────────────────────────────────────────────
function ProviderCard({ provider }: { provider: HydrologyProvider }) {
  const [showAll, setShowAll] = useState(false)

  const items = provider.items ?? []
  const displayed = showAll ? items : items.slice(0, 10)
  const uniqueMetrics = [...new Set(items.map(i => i.metric))]
  const pillStatus = provider.status === 'ok' ? 'ok' : provider.status === 'error' ? 'crit' : 'muted'

  return (
    <Panel>
      {/* Provider header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
        <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-primary)' }}>
          {provider.name}
        </h2>
        <StatusPill status={pillStatus} label={provider.status === 'ok' ? 'Live' : provider.status} />
      </div>

      {/* Metric descriptions */}
      {uniqueMetrics.length > 0 && (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          {uniqueMetrics.map(metric => {
            const desc = getMetricDescription(metric)
            return desc ? (
              <p key={metric} style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.6, marginBottom: 'var(--space-1)' }}>
                <span style={{ color: 'var(--text-primary)', fontWeight: 'var(--font-weight-medium)' }}>{metric}:</span>{' '}
                {desc}
              </p>
            ) : null
          })}
        </div>
      )}

      {/* Error message from provider */}
      {provider.error && (
        <p style={{ color: 'var(--status-crit)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3)' }}>
          {provider.error}
        </p>
      )}

      {/* Last observed + source link */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        {provider.updatedAt && (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
            Last observed: {new Date(provider.updatedAt).toLocaleString()}
          </p>
        )}
        {provider.sourceUrl && (
          <a
            href={provider.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent)', fontSize: 'var(--text-xs)', textDecoration: 'none' }}
          >
            Source API ↗
          </a>
        )}
      </div>

      {/* Station table */}
      {items.length > 0 ? (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
              <thead>
                <tr>
                  {['Location', 'Metric', 'Value', 'Observed'].map(h => (
                    <th key={h} style={{
                      textAlign:      'left',
                      padding:        'var(--space-2) var(--space-3)',
                      color:          'var(--text-muted)',
                      fontWeight:     'var(--font-weight-medium)',
                      textTransform:  'uppercase',
                      letterSpacing:  '0.06em',
                      borderBottom:   '1px solid var(--border)',
                      whiteSpace:     'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((item, i) => (
                  <StationRow key={i} item={item} />
                ))}
              </tbody>
            </table>
          </div>
          {items.length > 10 && (
            <button
              onClick={() => setShowAll(s => !s)}
              style={{
                marginTop:  'var(--space-3)',
                background: 'none',
                border:     'none',
                color:      'var(--text-muted)',
                fontSize:   'var(--text-xs)',
                cursor:     'pointer',
              }}
            >
              {showAll ? 'Show less' : `+ ${items.length - 10} more stations`}
            </button>
          )}
        </>
      ) : (
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>No readings available.</p>
      )}
    </Panel>
  )
}

// ── StationRow ────────────────────────────────────────────────────────
function StationRow({ item }: { item: HydrologyItem }) {
  const value = item.value != null ? item.value.toLocaleString() : '—'
  const unit  = item.unit ?? ''
  const obs   = item.observedAt ? new Date(item.observedAt).toLocaleString() : '—'

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--text-primary)', verticalAlign: 'top' }}>
        <span style={{ display: 'block', fontWeight: 'var(--font-weight-medium)' }}>{item.location}</span>
        {item.note && <span style={{ color: 'var(--text-muted)' }}>{item.note}</span>}
      </td>
      <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--text-muted)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
        {item.metric}
      </td>
      <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--text-primary)', fontWeight: 'var(--font-weight-medium)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
        {value} {unit}
      </td>
      <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--text-muted)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
        {obs}
      </td>
    </tr>
  )
}
