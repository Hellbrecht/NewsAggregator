// StocksPage — water sector equity watchlist with live quotes.
// Flow: load watchlist (symbols + markets) → fetch quotes → display by market tab.

import { useState, useEffect, useMemo } from 'react'
import { TopBar }      from '../design-system/components/TopBar'
import { ThemeToggle } from '../design-system/components/ThemeToggle'
import { Panel }       from '../design-system/components/Panel'
import { StatusPill }  from '../design-system/components/StatusPill'
import { api, type WatchlistItem, type StockQuote } from '../lib/api'

const YAHOO_BASE = 'https://finance.yahoo.com/quote/'

// Market order for tabs
const MARKET_ORDER = ['ALL', 'US', 'CA', 'EU', 'ASIA', 'LATAM', 'OCEANIA', 'AFRICA']

// ── Main page ─────────────────────────────────────────────────────────
export default function StocksPage() {
  const [watchlist,    setWatchlist]    = useState<WatchlistItem[]>([])
  const [quotes,       setQuotes]       = useState<Record<string, StockQuote>>({})
  const [requestedAt,  setRequestedAt]  = useState<string | null>(null)
  const [activeMarket, setActiveMarket] = useState('ALL')
  const [loading,      setLoading]      = useState(true)
  const [refreshing,   setRefreshing]   = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  async function load(refresh = false) {
    refresh ? setRefreshing(true) : setLoading(true)
    setError(null)

    try {
      // Step 1: get the watchlist (symbols + market group)
      const wl = await api.getStocksWatchlist()
      const items = Array.isArray(wl.items) ? wl.items : []
      setWatchlist(items)

      // Step 2: get quotes for all symbols at once
      const symbols = items.map(i => i.symbol)
      if (symbols.length === 0) return

      const qData = await api.getStocks(symbols)
      const qMap: Record<string, StockQuote> = {}
      for (const q of (qData.items ?? [])) {
        qMap[q.symbol] = q
      }
      setQuotes(qMap)
      setRequestedAt(qData.requestedAt ?? null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[StocksPage] load error:', msg)
      setError(msg)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { void load() }, [])

  // Markets that actually have items
  const markets = useMemo(() => {
    const present = new Set(watchlist.map(i => i.market))
    return MARKET_ORDER.filter(m => m === 'ALL' || present.has(m))
  }, [watchlist])

  // Items filtered by active market tab
  const filtered = useMemo(() =>
    activeMarket === 'ALL'
      ? watchlist
      : watchlist.filter(i => i.market === activeMarket),
    [watchlist, activeMarket]
  )

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
            Water Sector Stocks
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>
            Watchlist of water utilities, infrastructure, and environmental equities.
          </p>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
          <button
            onClick={() => void load(true)}
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
            {refreshing ? 'Refreshing…' : 'Refresh Quotes'}
          </button>
          {requestedAt && (
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
              Updated {new Date(requestedAt).toLocaleString()} — {watchlist.length} symbols
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <Panel accent style={{ marginBottom: 'var(--space-4)' }}>
            <p style={{ color: 'var(--status-crit)', fontSize: 'var(--text-sm)' }}>{error}</p>
          </Panel>
        )}

        {/* Loading */}
        {loading && <p style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>Loading…</p>}

        {!loading && (
          <>
            {/* Market tabs */}
            <div style={{
              display:      'flex',
              gap:          0,
              borderBottom: '1px solid var(--border)',
              marginBottom: 'var(--space-5)',
              overflowX:    'auto',
            }}>
              {markets.map(m => (
                <button
                  key={m}
                  onClick={() => setActiveMarket(m)}
                  style={{
                    padding:      'var(--space-2) var(--space-4)',
                    background:   'transparent',
                    border:       'none',
                    borderBottom: m === activeMarket ? '2px solid var(--accent)' : '2px solid transparent',
                    color:        m === activeMarket ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize:     'var(--text-sm)',
                    fontWeight:   m === activeMarket ? 'var(--font-weight-medium)' : 'var(--font-weight-normal)',
                    cursor:       'pointer',
                    whiteSpace:   'nowrap',
                    marginBottom: -1,
                  }}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Quotes table */}
            <Panel>
              {filtered.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>No symbols in this market.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                    <thead>
                      <tr>
                        {['Symbol', 'Name', 'Price', 'Change', 'Change %', 'Open', 'High', 'Low', ''].map(h => (
                          <th key={h} style={{
                            textAlign:     h === 'Price' || h === 'Change' || h === 'Change %' || h === 'Open' || h === 'High' || h === 'Low' ? 'right' : 'left',
                            padding:       'var(--space-2) var(--space-3)',
                            color:         'var(--text-muted)',
                            fontWeight:    'var(--font-weight-medium)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            fontSize:      'var(--text-xs)',
                            borderBottom:  '1px solid var(--border)',
                            whiteSpace:    'nowrap',
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(item => (
                        <QuoteRow
                          key={item.symbol}
                          item={item}
                          quote={quotes[item.symbol] ?? null}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </>
        )}
      </main>
    </div>
  )
}

// ── QuoteRow — one row per symbol ─────────────────────────────────────
function QuoteRow({ item, quote }: { item: WatchlistItem; quote: StockQuote | null }) {
  const change  = quote?.change  ?? null
  const changePct = quote?.changePercent ?? null

  // Color: green for positive, red for negative, muted for no data
  const changeColor =
    change == null ? 'var(--text-muted)' :
    change > 0     ? 'var(--status-ok)'  :
    change < 0     ? 'var(--status-crit)' :
    'var(--text-muted)'

  const pillStatus =
    quote?.status === 'ok' ? 'ok' :
    quote?.status == null  ? 'muted' : 'warn'

  const fmt = (n: number | null | undefined, decimals = 2) =>
    n == null ? '—' : n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      {/* Symbol */}
      <td style={{ padding: 'var(--space-3)', verticalAlign: 'middle' }}>
        <a
          href={`${YAHOO_BASE}${encodeURIComponent(item.symbol)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--accent)', fontWeight: 'var(--font-weight-medium)', textDecoration: 'none', fontSize: 'var(--text-sm)' }}
        >
          {item.symbol}
        </a>
      </td>
      {/* Name */}
      <td style={{ padding: 'var(--space-3)', color: 'var(--text-primary)', verticalAlign: 'middle', maxWidth: 200 }}>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {quote?.name ?? item.name ?? '—'}
        </span>
      </td>
      {/* Price */}
      <td style={{ padding: 'var(--space-3)', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 'var(--font-weight-medium)', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
        {fmt(quote?.close)}
      </td>
      {/* Change */}
      <td style={{ padding: 'var(--space-3)', textAlign: 'right', color: changeColor, verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
        {change == null ? '—' : `${change > 0 ? '+' : ''}${fmt(change)}`}
      </td>
      {/* Change % */}
      <td style={{ padding: 'var(--space-3)', textAlign: 'right', color: changeColor, verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
        {changePct == null ? '—' : `${changePct > 0 ? '+' : ''}${fmt(changePct)}%`}
      </td>
      {/* Open */}
      <td style={{ padding: 'var(--space-3)', textAlign: 'right', color: 'var(--text-muted)', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
        {fmt(quote?.open)}
      </td>
      {/* High */}
      <td style={{ padding: 'var(--space-3)', textAlign: 'right', color: 'var(--text-muted)', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
        {fmt(quote?.high)}
      </td>
      {/* Low */}
      <td style={{ padding: 'var(--space-3)', textAlign: 'right', color: 'var(--text-muted)', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
        {fmt(quote?.low)}
      </td>
      {/* Status pill */}
      <td style={{ padding: 'var(--space-3)', verticalAlign: 'middle', textAlign: 'right' }}>
        <StatusPill status={pillStatus} label={quote?.status ?? 'no data'} dot={false} />
      </td>
    </tr>
  )
}
