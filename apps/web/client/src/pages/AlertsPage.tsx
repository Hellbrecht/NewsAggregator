// AlertsPage — high-risk signals from the combined news + data feed.
// Filters: time range, minimum risk score, type, text search.

import { useState, useEffect, useCallback } from 'react'
import { TopBar }      from '../design-system/components/TopBar'
import { ThemeToggle } from '../design-system/components/ThemeToggle'
import { Panel }       from '../design-system/components/Panel'
import { StatusPill }  from '../design-system/components/StatusPill'
import { api, type FeedItem } from '../lib/api'

const TIME_RANGE_OPTIONS = [
  { label: '24h',  value: '24h'  },
  { label: '48h',  value: '48h'  },
  { label: '72h',  value: '72h'  },
  { label: '7d',   value: '7d'   },
  { label: '30d',  value: '30d'  },
  { label: 'All',  value: ''     },
]

// Risk score → StatusPill level
function riskLevel(score: number): 'crit' | 'warn' | 'ok' | 'info' {
  if (score >= 80) return 'crit'
  if (score >= 60) return 'warn'
  if (score >= 40) return 'ok'
  return 'info'
}

// ── Main page ──────────────────────────────────────────────────────────
export default function AlertsPage() {
  const [items,      setItems]      = useState<FeedItem[]>([])
  const [cursor,     setCursor]     = useState<string | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // Filters
  const [timeRange, setTimeRange] = useState('72h')
  const [minRisk,   setMinRisk]   = useState(0)
  const [typeFilter, setTypeFilter] = useState('')
  const [search,    setSearch]    = useState('')

  const load = useCallback(async (reset = true) => {
    if (reset) {
      setLoading(true)
      setItems([])
      setCursor(null)
    } else {
      setLoadingMore(true)
    }
    setError(null)

    try {
      const data = await api.getCombinedFeed({
        cursor:    reset ? undefined : cursor ?? undefined,
        timeRange: timeRange || undefined,
        minRisk:   minRisk > 0 ? minRisk : undefined,
        type:      typeFilter || undefined,
        q:         search.trim() || undefined,
      })
      if (reset) {
        setItems(data.items ?? [])
      } else {
        setItems(prev => [...prev, ...(data.items ?? [])])
      }
      setCursor(data.nextCursor ?? null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[AlertsPage] load error:', msg)
      setError(msg)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [timeRange, minRisk, typeFilter, search, cursor])

  // Re-load whenever filters change
  useEffect(() => { void load(true) }, [timeRange, minRisk, typeFilter, search])

  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      minHeight:     '100vh',
      background:    'var(--bg-base)',
      color:         'var(--text-primary)',
    }}>
      <TopBar><ThemeToggle /></TopBar>

      <main style={{ flex: 1, padding: 'var(--space-6)', maxWidth: 1200, margin: '0 auto', width: '100%' }}>

        {/* Header */}
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-primary)' }}>
            Alerts
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>
            High-risk signals from news, data events, and infrastructure reports.
          </p>
        </div>

        {/* Filter bar */}
        <div style={{
          display:       'flex',
          flexWrap:      'wrap',
          alignItems:    'center',
          gap:           'var(--space-3)',
          marginBottom:  'var(--space-6)',
          padding:       'var(--space-4)',
          background:    'var(--bg-panel)',
          border:        '1px solid var(--border)',
          borderRadius:  'var(--radius-md)',
        }}>
          {/* Time range */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <label style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Period
            </label>
            <div style={{ display: 'flex', gap: 0 }}>
              {TIME_RANGE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTimeRange(opt.value)}
                  style={{
                    padding:      'var(--space-1) var(--space-3)',
                    background:   timeRange === opt.value ? 'var(--accent)' : 'transparent',
                    border:       '1px solid var(--border)',
                    marginLeft:   -1,
                    color:        timeRange === opt.value ? '#fff' : 'var(--text-muted)',
                    fontSize:     'var(--text-xs)',
                    cursor:       'pointer',
                    borderRadius: opt.value === '24h' ? 'var(--radius-sm) 0 0 var(--radius-sm)'
                                : opt.value === ''    ? '0 var(--radius-sm) var(--radius-sm) 0'
                                : 0,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Min risk */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <label style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
              Min risk
            </label>
            <select
              value={minRisk}
              onChange={e => setMinRisk(Number(e.target.value))}
              style={{
                padding:      'var(--space-1) var(--space-2)',
                background:   'var(--bg-panel-alt)',
                border:       '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color:        'var(--text-primary)',
                fontSize:     'var(--text-xs)',
                cursor:       'pointer',
              }}
            >
              <option value={0}>Any</option>
              <option value={40}>40+</option>
              <option value={60}>60+</option>
              <option value={70}>70+</option>
              <option value={80}>80+</option>
              <option value={90}>90+</option>
            </select>
          </div>

          {/* Type */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <label style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Type
            </label>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              style={{
                padding:      'var(--space-1) var(--space-2)',
                background:   'var(--bg-panel-alt)',
                border:       '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color:        'var(--text-primary)',
                fontSize:     'var(--text-xs)',
                cursor:       'pointer',
              }}
            >
              <option value="">All</option>
              <option value="NEWS">News</option>
              <option value="DATA">Data</option>
            </select>
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="Search alerts…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding:      'var(--space-1) var(--space-3)',
              background:   'var(--bg-panel-alt)',
              border:       '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color:        'var(--text-primary)',
              fontSize:     'var(--text-xs)',
              outline:      'none',
              minWidth:     160,
            }}
          />
        </div>

        {/* Error */}
        {error && (
          <Panel accent style={{ marginBottom: 'var(--space-4)' }}>
            <p style={{ color: 'var(--status-crit)', fontSize: 'var(--text-sm)' }}>{error}</p>
          </Panel>
        )}

        {/* Loading */}
        {loading && <p style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>Loading…</p>}

        {/* Empty */}
        {!loading && !error && items.length === 0 && (
          <Panel>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: 'var(--space-8) 0' }}>
              No alerts match your current filters.
            </p>
          </Panel>
        )}

        {/* Alert list */}
        {!loading && items.length > 0 && (
          <>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-4)' }}>
              {items.length} signal{items.length !== 1 ? 's' : ''}
              {cursor ? ' (more available)' : ''}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {items.map(item => (
                <AlertCard key={item.id} item={item} />
              ))}
            </div>

            {/* Load more */}
            {cursor && (
              <div style={{ marginTop: 'var(--space-6)', textAlign: 'center' }}>
                <button
                  onClick={() => void load(false)}
                  disabled={loadingMore}
                  style={{
                    padding:      'var(--space-2) var(--space-6)',
                    borderRadius: 'var(--radius-sm)',
                    border:       '1px solid var(--border)',
                    background:   'var(--bg-panel)',
                    color:        'var(--text-primary)',
                    fontSize:     'var(--text-sm)',
                    cursor:       loadingMore ? 'default' : 'pointer',
                  }}
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

// ── AlertCard — one signal card ───────────────────────────────────────
function AlertCard({ item }: { item: FeedItem }) {
  const [expanded, setExpanded] = useState(false)
  const score = item.riskScore ?? 0
  const level = riskLevel(score)

  const dateStr = item.timestamp
    ? new Date(item.timestamp).toLocaleString()
    : null

  function decodeHtml(html: string) {
    const tmp = document.createElement('div')
    tmp.innerHTML = html
    return (tmp.textContent || '').trim()
  }

  const cleanTitle   = decodeHtml(item.title)
  const cleanSummary = item.summary ? decodeHtml(item.summary) : null

  return (
    <Panel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>

        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
          {/* Risk score badge */}
          <span style={{
            flexShrink:     0,
            width:          36,
            height:         36,
            borderRadius:   'var(--radius-sm)',
            background:     `color-mix(in srgb, var(--status-${level}) 15%, transparent)`,
            border:         `1px solid color-mix(in srgb, var(--status-${level}) 40%, transparent)`,
            color:          `var(--status-${level})`,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            fontSize:       'var(--text-xs)',
            fontWeight:     'var(--font-weight-bold)',
          }}>
            {score}
          </span>
          <div style={{ flex: 1 }}>
            {item.originalUrl ? (
              <a
                href={item.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color:          'var(--text-primary)',
                  fontSize:       'var(--text-sm)',
                  fontWeight:     'var(--font-weight-medium)',
                  textDecoration: 'none',
                  lineHeight:     1.5,
                }}
              >
                {cleanTitle}
              </a>
            ) : (
              <p style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-weight-medium)', lineHeight: 1.5 }}>
                {cleanTitle}
              </p>
            )}
          </div>
        </div>

        {/* Summary */}
        {cleanSummary && (
          <div style={{ paddingLeft: 44 }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.6 }}>
              {expanded ? cleanSummary : cleanSummary.slice(0, 200) + (cleanSummary.length > 200 ? '…' : '')}
            </p>
            {cleanSummary.length > 200 && (
              <button
                onClick={() => setExpanded(e => !e)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: 'var(--text-xs)', padding: 0, marginTop: 'var(--space-1)' }}
              >
                {expanded ? 'show less' : '…more'}
              </button>
            )}
          </div>
        )}

        {/* Meta row */}
        <div style={{ paddingLeft: 44, display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <StatusPill status={level} label={`Risk ${score}`} />
          {item.riskTags?.slice(0, 2).map(tag => (
            <StatusPill key={tag} status="muted" label={tag} dot={false} />
          ))}
          {item.sourceName && (
            <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{item.sourceName}</span>
          )}
          {item.region && (
            <>
              <span style={{ color: 'var(--border)' }}>·</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{item.region}</span>
            </>
          )}
          {dateStr && (
            <>
              <span style={{ color: 'var(--border)' }}>·</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{dateStr}</span>
            </>
          )}
        </div>
      </div>
    </Panel>
  )
}
