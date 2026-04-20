// NewsPage — paginated news feed with date filtering and relevance voting.
// Mirrors the functionality of the old index.html + app.js.

import { useState, useEffect } from 'react'
import { TopBar }      from '../design-system/components/TopBar'
import { ThemeToggle } from '../design-system/components/ThemeToggle'
import { Panel }       from '../design-system/components/Panel'
import { StatusPill }  from '../design-system/components/StatusPill'
import { api, type NewsItem, type NewsResponse } from '../lib/api'

// Groups a flat list of {date, count} into months.
// e.g. [{ month: 'April 2026', dates: [{date, count}, ...] }, ...]
function groupByMonth(dates: { date: string; count: number }[]) {
  const map = new Map<string, { date: string; count: number }[]>()
  for (const d of dates) {
    const [year, month] = d.date.split('-')
    const label = new Date(Number(year), Number(month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
    if (!map.has(label)) map.set(label, [])
    map.get(label)!.push(d)
  }
  return Array.from(map.entries()).map(([month, dates]) => ({ month, dates }))
}

// Strips HTML tags and decodes entities, then trims to a short excerpt.
// The browser's own DOM parser does the heavy lifting — safest approach.
// For expanded view — preserves paragraph structure instead of a wall of text.
function toParagraphs(html: string): string[] {
  const strip = (str: string) => {
    const tmp = document.createElement('div')
    tmp.innerHTML = str
    return tmp.textContent || tmp.innerText || ''
  }
  // Insert newlines at block boundaries before stripping tags
  const withBreaks = html.replace(/<\/p>|<br\s*\/?>|<\/div>/gi, '\n')
  const clean = strip(strip(withBreaks)).replace(/\n{3,}/g, '\n\n').trim()
  return clean.split('\n').map(s => s.trim()).filter(Boolean)
}

function excerpt(html: string, maxLen = 160): string {
  // Some RSS feeds double-encode HTML — run the strip twice to catch both layers.
  // First pass turns &lt;p&gt; → <p>, second pass removes the resulting <p> tag.
  const strip = (str: string) => {
    const tmp = document.createElement('div')
    tmp.innerHTML = str
    return tmp.textContent || tmp.innerText || ''
  }
  const text = strip(strip(html)).replace(/\s+/g, ' ').trim()
  return text.length > maxLen ? text.slice(0, maxLen).trimEnd() + '…' : text
}

export default function NewsPage() {
  // ── State ──────────────────────────────────────────────────────
  // useState(initialValue) returns [currentValue, functionToUpdateIt]
  // When you call the update function, React re-renders the component.
  const [data,    setData]    = useState<NewsResponse | null>(null)
  const [page,    setPage]    = useState(1)
  const [date,    setDate]    = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  // ── Effect — fetch data when page or date changes ──────────────
  // useEffect(fn, [dependencies]) runs fn whenever dependencies change.
  // The [] at the end is the dependency list — re-runs when page or date changes.
  useEffect(() => {
    setLoading(true)
    setError(null)
    api.getNews(page, date)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [page, date])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <TopBar><ThemeToggle /></TopBar>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Date sidebar ── */}
        <aside style={{
          width:       200,
          flexShrink:  0,
          borderRight: '1px solid var(--border)',
          padding:     'var(--space-4)',
          overflowY:   'auto',
        }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-3)' }}>
            Filter by date
          </p>
          <DateItem label="All dates" active={!date} onClick={() => { setDate(undefined); setPage(1) }} />

          {data && groupByMonth(data.dates).map(({ month, dates: monthDates }) => {
            // Derive YYYY-MM key from the first date in this month group
            const monthKey = monthDates[0].date.slice(0, 7)
            const isOpen = monthDates.some(d => d.date === date) || date === monthKey
              || (!date && groupByMonth(data.dates)[0]?.month === month)
            return (
              <MonthGroup key={month} label={month} monthKey={monthKey} defaultOpen={isOpen}
                onMonthClick={() => { setDate(monthKey); setPage(1) }}>
                {monthDates.map(d => (
                  <DateItem key={d.date} label={d.date} count={d.count} active={date === d.date}
                    onClick={() => { setDate(d.date); setPage(1) }} />
                ))}
              </MonthGroup>
            )
          })}
        </aside>

        {/* ── Main feed ── */}
        <main style={{ flex: 1, padding: 'var(--space-6)', overflowY: 'auto' }}>
          {error && (
            <Panel accent style={{ marginBottom: 'var(--space-4)' }}>
              <p style={{ color: 'var(--status-crit)', fontSize: 'var(--text-sm)' }}>{error}</p>
            </Panel>
          )}

          {loading && <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Loading...</p>}

          {!loading && data && (
            <>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-4)' }}>
                {data.totalItems} articles{date ? ` · ${date}` : ''}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {data.items.map(item => (
                  <Panel key={item.id}>
                    <NewsCard item={item} />
                  </Panel>
                ))}
              </div>

              {data.totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-6)', justifyContent: 'center' }}>
                  <PageButton disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</PageButton>
                  <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>{page} / {data.totalPages}</span>
                  <PageButton disabled={page === data.totalPages} onClick={() => setPage(p => p + 1)}>Next →</PageButton>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}

// ── NewsCard — one article ────────────────────────────────────────
function NewsCard({ item }: { item: NewsItem }) {
  const [feedback, setFeedback] = useState(item.relevanceFeedback)
  const [expanded, setExpanded] = useState(false)

  function vote(value: 'up' | 'down') {
    const next = feedback === value ? null : value
    setFeedback(next)
    api.setRelevance(item.id, next)
  }

  const status = item.riskTags?.some(t => /critical|flood|danger/i.test(t)) ? 'crit' as const
    : item.riskTags?.some(t => /warn|risk|elevated/i.test(t)) ? 'warn' as const
    : 'ok' as const

  return (
    <div style={{ padding: 'var(--space-4) 0', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <a href={item.link} target="_blank" rel="noopener noreferrer" style={{
        color: 'var(--text-primary)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-weight-medium)',
        textDecoration: 'none', lineHeight: 1.5,
      }}>
        {item.title}
      </a>

      {item.summary && (() => {
        const short = excerpt(item.summary, 160)
        const paragraphs = toParagraphs(item.summary)
        const isTruncated = paragraphs.join(' ').length > 160
        return (
          <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.6 }}>
            {expanded
              ? paragraphs.map((p, i) => (
                  <p key={i} style={{ marginBottom: i < paragraphs.length - 1 ? 'var(--space-3)' : 0 }}>{p}</p>
                ))
              : <p>{short}</p>
            }
            {isTruncated && (
              <button onClick={() => setExpanded(e => !e)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-primary)', fontSize: 'var(--text-xs)',
                padding: '0', marginTop: 'var(--space-2)',
              }}>
                {expanded ? 'show less' : '…more'}
              </button>
            )}
          </div>
        )
      })()}

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {item.riskTags?.[0] && <StatusPill status={status} label={item.riskTags[0]} />}
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{item.source}</span>
        {item.region && <><span style={{ color: 'var(--border)' }}>·</span><span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{item.region}</span></>}
        <span style={{ color: 'var(--border)' }}>·</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{new Date(item.publishedAt).toLocaleDateString()}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <a href={item.link} target="_blank" rel="noopener noreferrer" style={{
            padding:        '2px var(--space-2)',
            borderRadius:   'var(--radius-sm)',
            border:         '1px solid var(--border)',
            color:          'var(--text-muted)',
            fontSize:       'var(--text-xs)',
            textDecoration: 'none',
            whiteSpace:     'nowrap',
          }}>
            Link ↗
          </a>
          <VoteBtn active={feedback === 'up'}   onClick={() => vote('up')}>↑</VoteBtn>
          <VoteBtn active={feedback === 'down'} onClick={() => vote('down')}>↓</VoteBtn>
        </div>
      </div>
    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────────

function MonthGroup({ label, monthKey, defaultOpen, onMonthClick, children }: {
  label: string; monthKey: string; defaultOpen: boolean
  onMonthClick: () => void; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginBottom: 'var(--space-1)' }}>
      {/* Expand/collapse toggle */}
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: 'var(--space-2) var(--space-3)', background: 'transparent',
        border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
        fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        <span>{label}</span>
        <span>{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div style={{ paddingLeft: 'var(--space-2)' }}>
          {/* All-month button sits at the top of the expanded list */}
          <button onClick={onMonthClick} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            width: '100%', padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
            marginBottom: 'var(--space-1)', background: 'transparent',
            color: 'var(--text-muted)', fontSize: 'var(--text-xs)',
          }}>
            All of {label}
          </button>
          {children}
        </div>
      )}
    </div>
  )
}

function DateItem({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      width: '100%', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)',
      border: 'none', cursor: 'pointer', marginBottom: 'var(--space-1)',
      background: active ? 'var(--bg-panel-alt)' : 'transparent',
      color: active ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 'var(--text-xs)',
    }}>
      <span>{label}</span>
      {count !== undefined && <span>{count}</span>}
    </button>
  )
}

function PageButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: 'var(--space-2) var(--space-4)', borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--border)', background: 'var(--bg-panel)',
      color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
      fontSize: 'var(--text-sm)', cursor: disabled ? 'default' : 'pointer',
    }}>
      {children}
    </button>
  )
}

function VoteBtn({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active: boolean }) {
  return (
    <button onClick={onClick} style={{
      width: 24, height: 24, borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--border)',
      background: active ? 'var(--accent)' : 'var(--bg-panel-alt)',
      color: active ? '#fff' : 'var(--text-muted)',
      fontSize: 'var(--text-xs)', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {children}
    </button>
  )
}
