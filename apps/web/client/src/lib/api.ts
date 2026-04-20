// api.ts — the single place where all API calls live.
//
// WHY this exists:
// Each page needs data from the server. Rather than writing fetch() calls
// scattered across every component, we centralise them here.
// Result: one place to fix bugs, one place to add auth later, consistent error handling.
//
// HOW it works:
// Each function calls fetch() with the right URL, awaits the response,
// parses the JSON, and returns typed data to whoever called it.

// ── Types ─────────────────────────────────────────────────────────
// These describe the shape of data coming back from the server.
// TypeScript uses them to catch mistakes — if you try to access a field
// that doesn't exist, it errors at compile time, not at runtime.

export interface NewsItem {
  id:                string
  title:             string
  summary?:          string
  link:              string
  source:            string
  region?:           string
  publishedAt:       string
  riskTags?:         string[]
  relevanceFeedback: 'up' | 'down' | null
}

export interface NewsResponse {
  page:         number
  pageSize:     number
  totalItems:   number
  totalPages:   number
  selectedDate: string | null
  dates:        { date: string; count: number }[]
  items:        NewsItem[]
}

export interface StockQuote {
  symbol:        string
  name?:         string
  close:         number | null
  change:        number | null
  changePercent: number | null
  open?:         number | null
  high?:         number | null
  low?:          number | null
  date?:         string
  status:        string
  market:        string
}

export interface StocksResponse {
  requestedAt: string
  items:       StockQuote[]
}

export interface WatchlistItem {
  symbol:   string
  market:   string
  name?:    string
  exchange?: string
}

export interface WatchlistResponse {
  items: WatchlistItem[]
}

export interface HydrologyItem {
  location:   string
  metric:     string
  value:      number
  unit:       string
  observedAt: string
  latitude?:  number
  longitude?: number
  note?:      string
}

export interface HydrologyProvider {
  id:          string
  name:        string
  status:      'ok' | 'error' | 'loading'
  items:       HydrologyItem[]
  error?:      string
  sourceUrl?:  string
  updatedAt?:  string
}

export interface HydrologyResponse {
  providers:   HydrologyProvider[]
  requestedAt: string
}

export interface FeedItem {
  id:                string
  title:             string
  summary?:          string
  originalUrl?:      string   // link to source article
  sourceName?:       string   // display name of source
  region?:           string
  timestamp?:        string   // ISO date string
  riskScore?:        number
  riskTags?:         string[]
  type?:             string   // 'NEWS' | 'DATA'
  relevanceFeedback: 'up' | 'down' | null
  sourceReliability?: number
}

export interface CombinedFeedResponse {
  items:      FeedItem[]
  nextCursor: string | null
  stats?:     Record<string, unknown>
}

// ── Base fetcher ───────────────────────────────────────────────────
// All functions below call this. It handles errors in one place.
// If the server returns an error, it throws — the component catches it.
async function get<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

// ── API functions ──────────────────────────────────────────────────

export const api = {
  // News
  getNews: (page = 1, date?: string) =>
    get<NewsResponse>(`/api/news?page=${page}${date ? `&date=${date}` : ''}`),

  // Alerts / combined feed
  getCombinedFeed: (params?: { cursor?: string; timeRange?: string; minRisk?: number; type?: string; q?: string }) => {
    const p = new URLSearchParams()
    if (params?.cursor)    p.set('cursor',    params.cursor)
    if (params?.timeRange) p.set('timeRange', params.timeRange)
    if (params?.minRisk)   p.set('minRisk',   String(params.minRisk))
    if (params?.type)      p.set('type',      params.type)
    if (params?.q)         p.set('q',         params.q)
    return get<CombinedFeedResponse>(`/api/combined-feed?${p.toString()}`)
  },

  // Hydrology
  getHydrology: (refresh = false) =>
    get<HydrologyResponse>(`/api/hydrology/realtime${refresh ? '?refresh=1' : ''}`),

  // Stocks
  getStocksWatchlist: () =>
    get<WatchlistResponse>('/api/stocks/watchlist'),

  getStocks: (symbols: string[]) =>
    get<StocksResponse>(`/api/stocks?symbols=${symbols.join(',')}`),

  // Item actions
  setRelevance: (id: string, feedback: 'up' | 'down' | null) =>
    post(`/api/item/${id}/relevance`, { relevanceFeedback: feedback }),
}
