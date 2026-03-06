import { URL } from "node:url";

const STOOQ_QUOTE_ENDPOINT = "https://stooq.com/q/l/";
const STOOQ_HISTORY_ENDPOINT = "https://stooq.com/q/d/l/";
const MASSIVE_API_BASE = "https://api.polygon.io";
const YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart/";
const SYMBOL_PATTERN = /^[A-Z0-9.-]{1,15}$/;
const USER_AGENT = "WaterNewsAggregator/0.1";
const YAHOO_USER_AGENT = "Mozilla/5.0";
const REQUEST_TIMEOUT_MS = 12_000;
const HISTORY_POINTS = 20;
const FETCH_CONCURRENCY = 6;
const QUOTE_CACHE_TTL_MS = 5 * 60 * 1_000;
const QUOTE_STALE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
const HISTORY_CACHE_TTL_MS = 12 * 60 * 60 * 1_000;
const HISTORY_STALE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const RATE_LIMIT_BACKOFF_MS = 30 * 60 * 1_000;
const DEFAULT_PROVIDER = "stooq";

export type StockQuote = {
  symbol: string;
  sourceSymbol: string;
  name: string | null;
  date: string | null;
  time: string | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  change: number | null;
  changePercent: number | null;
  history: number[];
  status: "ok" | "unavailable";
};

type QuoteCacheEntry = {
  quote: StockQuote;
  fetchedAt: number;
  expiresAt: number;
};

type HistoryCacheEntry = {
  history: number[];
  fetchedAt: number;
  expiresAt: number;
};

const quoteCache = new Map<string, QuoteCacheEntry>();
const historyCache = new Map<string, HistoryCacheEntry>();
let stooqRateLimitedUntilMs = 0;
let massiveRateLimitedUntilMs = 0;
let yahooRateLimitedUntilMs = 0;

export function parseRequestedSymbols(value: string | null): string[] {
  if (!value) {
    return [];
  }

  const seen = new Set<string>();
  const symbols: string[] = [];

  value
    .split(",")
    .map((entry) => normalizeSymbol(entry))
    .forEach((symbol) => {
      if (!symbol || seen.has(symbol)) {
        return;
      }

      seen.add(symbol);
      symbols.push(symbol);
    });

  return symbols;
}

export async function getStockQuotes(symbols: string[]): Promise<StockQuote[]> {
  const symbolsNeedingRefresh = symbols.filter((symbol) => !readFreshQuoteCache(symbol));
  const massiveSnapshotByTicker = await fetchMassiveSnapshotQuotes(symbolsNeedingRefresh);
  return mapWithConcurrency(symbols, FETCH_CONCURRENCY, async (symbol) => {
    const cached = readFreshQuoteCache(symbol);
    if (cached) {
      return cached;
    }

    const stale = readStaleQuoteCache(symbol);

    try {
      const quote = await fetchSymbolData(symbol, massiveSnapshotByTicker);
      if (quote.status === "ok") {
        writeQuoteCache(symbol, quote);
        return quote;
      }

      return stale ?? quote;
    } catch {
      return stale ?? createUnavailableQuote(symbol, symbol);
    }
  });
}

function normalizeSymbol(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (!normalized || !SYMBOL_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

function toStooqSymbol(symbol: string): string {
  if (symbol.includes(".")) {
    return symbol.toLowerCase();
  }

  return `${symbol.toLowerCase()}.us`;
}

function isCanadianSymbol(symbol: string): boolean {
  return /\.(TO|V|CN)$/i.test(symbol);
}

function toUsFallbackSymbol(symbol: string): string {
  const base = symbol.split(".")[0].trim().toLowerCase();
  return `${base}.us`;
}

async function fetchSymbolData(
  symbol: string,
  massiveSnapshotByTicker: Map<string, StockQuote>
): Promise<StockQuote> {
  const massiveQuote = readMassiveSnapshotQuoteForSymbol(symbol, massiveSnapshotByTicker);
  if (massiveQuote) {
    return massiveQuote;
  }

  const stooqQuote = await fetchStooqSymbolData(symbol);
  if (stooqQuote.status === "ok") {
    return stooqQuote;
  }

  const yahooQuote = await fetchYahooQuote(symbol);
  if (yahooQuote.status === "ok") {
    return yahooQuote;
  }

  return stooqQuote;
}

function shouldUseMassiveProvider(symbol: string): boolean {
  const apiKey = getMassiveApiKey();
  if (!apiKey) {
    return false;
  }

  if (getStocksProvider(apiKey) !== "massive") {
    return false;
  }

  return getMassiveTickerCandidates(symbol).length > 0;
}

function getMassiveTickerCandidates(symbol: string): string[] {
  const normalized = symbol.trim().toUpperCase();
  const candidates: string[] = [];

  if (/^[A-Z0-9]{1,15}$/.test(normalized)) {
    candidates.push(normalized);
  }

  if (isCanadianSymbol(normalized)) {
    const base = normalized.split(".")[0].trim().toUpperCase();
    if (base && /^[A-Z0-9]{1,15}$/.test(base) && !candidates.includes(base)) {
      candidates.push(base);
    }
  }

  return candidates;
}

async function fetchStooqSymbolData(symbol: string): Promise<StockQuote> {
  const primarySourceSymbol = toStooqSymbol(symbol);
  if (isStooqRateLimited()) {
    return createUnavailableQuote(symbol, primarySourceSymbol);
  }

  let quote = await fetchStooqQuoteFromSource(symbol, primarySourceSymbol);
  let historySourceSymbol = primarySourceSymbol;

  if (quote.status === "unavailable" && isCanadianSymbol(symbol)) {
    const fallbackSourceSymbol = toUsFallbackSymbol(symbol);
    const fallbackQuote = await fetchStooqQuoteFromSource(symbol, fallbackSourceSymbol);
    if (fallbackQuote.status === "ok") {
      quote = fallbackQuote;
      historySourceSymbol = fallbackSourceSymbol;
    }
  }

  if (quote.status === "ok") {
    historySourceSymbol = quote.sourceSymbol.toLowerCase();
  }

  const historyCacheKey = `stooq:${historySourceSymbol}`;
  const history =
    quote.status === "ok"
      ? await fetchStooqHistory(historySourceSymbol, historyCacheKey)
      : readHistoryCache(historyCacheKey, true) ?? [];
  return {
    ...quote,
    history
  };
}

async function fetchStooqQuoteFromSource(symbol: string, sourceSymbol: string): Promise<StockQuote> {
  if (isStooqRateLimited()) {
    return createUnavailableQuote(symbol, sourceSymbol);
  }

  const query = new URL(STOOQ_QUOTE_ENDPOINT);
  query.searchParams.set("s", sourceSymbol.toLowerCase());
  query.searchParams.set("i", "d");
  query.searchParams.set("f", "sd2t2ohlcvn");

  const response = await sendStooqRequest(query);
  if (!response || !response.ok) {
    return createUnavailableQuote(symbol, sourceSymbol);
  }

  const content = await readResponseTextSafe(response);
  if (content === null) {
    return createUnavailableQuote(symbol, sourceSymbol);
  }

  if (isStooqRateLimitPayload(content)) {
    markStooqRateLimited();
    return createUnavailableQuote(symbol, sourceSymbol);
  }

  return parseQuoteLine(symbol, sourceSymbol, content);
}

async function fetchStooqHistory(sourceSymbol: string, cacheKey: string): Promise<number[]> {
  const cached = readHistoryCache(cacheKey, false);
  if (cached) {
    return cached;
  }

  const stale = readHistoryCache(cacheKey, true);
  if (isStooqRateLimited()) {
    return stale ?? [];
  }

  const query = new URL(STOOQ_HISTORY_ENDPOINT);
  query.searchParams.set("s", sourceSymbol.toLowerCase());
  query.searchParams.set("i", "d");

  const response = await sendStooqRequest(query);
  if (!response || !response.ok) {
    return stale ?? [];
  }

  const content = await readResponseTextSafe(response);
  if (content === null) {
    return stale ?? [];
  }

  if (isStooqRateLimitPayload(content)) {
    markStooqRateLimited();
    return stale ?? [];
  }

  if (!content || content === "No data") {
    return [];
  }

  const closes: number[] = [];
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("Date,")) {
      return;
    }

    const columns = trimmed.split(",");
    const close = toNumberOrNull(columns[4]);
    if (close !== null) {
      closes.push(close);
    }
  });

  const history = closes.slice(-HISTORY_POINTS);
  writeHistoryCache(cacheKey, history);
  return history;
}

async function fetchMassiveSnapshotQuotes(symbols: string[]): Promise<Map<string, StockQuote>> {
  const quotesByTicker = new Map<string, StockQuote>();
  if (!symbols.length || isMassiveRateLimited()) {
    return quotesByTicker;
  }

  const apiKey = getMassiveApiKey();
  if (!apiKey || getStocksProvider(apiKey) !== "massive") {
    return quotesByTicker;
  }

  const tickers = Array.from(
    new Set(
      symbols.flatMap((symbol) => getMassiveTickerCandidates(symbol)).filter((ticker) => Boolean(ticker))
    )
  );
  if (!tickers.length) {
    return quotesByTicker;
  }

  const requested = new Set(tickers.map((ticker) => ticker.toUpperCase()));
  const marketDate = resolvePreviousUsMarketDateIso();
  const query = new URL(`/v2/aggs/grouped/locale/us/market/stocks/${marketDate}`, MASSIVE_API_BASE);
  query.searchParams.set("adjusted", "true");
  query.searchParams.set("apiKey", apiKey);

  const payload = await sendMassiveJsonRequest(query);
  if (!payload) {
    return quotesByTicker;
  }

  const rows = Array.isArray(payload.results) ? payload.results : [];
  rows.forEach((row) => {
    const quote = parseMassiveGroupedQuote(row, marketDate);
    if (!quote || !requested.has(quote.symbol.toUpperCase())) {
      return;
    }

    quotesByTicker.set(quote.symbol.toUpperCase(), quote);
  });

  return quotesByTicker;
}

function readMassiveSnapshotQuoteForSymbol(
  symbol: string,
  massiveSnapshotByTicker: Map<string, StockQuote>
): StockQuote | null {
  if (!shouldUseMassiveProvider(symbol)) {
    return null;
  }

  const candidates = getMassiveTickerCandidates(symbol);
  for (const candidate of candidates) {
    const quote = massiveSnapshotByTicker.get(candidate.toUpperCase());
    if (!quote || quote.status !== "ok") {
      continue;
    }

    return {
      ...cloneQuote(quote),
      symbol,
      sourceSymbol: candidate.toUpperCase()
    };
  }

  return null;
}

async function fetchYahooQuote(symbol: string): Promise<StockQuote> {
  const candidates = getYahooTickerCandidates(symbol);
  if (!candidates.length) {
    return createUnavailableQuote(symbol, symbol);
  }

  for (const yahooSymbol of candidates) {
    const quote = await fetchYahooChartQuote(symbol, yahooSymbol);
    if (quote.status === "ok") {
      return quote;
    }
  }

  return createUnavailableQuote(symbol, candidates[0]);
}

function getYahooTickerCandidates(symbol: string): string[] {
  const normalized = symbol.trim().toUpperCase();
  const candidates: string[] = [];
  if (normalized) {
    candidates.push(normalized);
  }

  if (isCanadianSymbol(normalized)) {
    const base = normalized.split(".")[0].trim().toUpperCase();
    if (base && !candidates.includes(base)) {
      candidates.push(base);
    }
  }

  return candidates;
}

async function fetchYahooChartQuote(symbol: string, yahooSymbol: string): Promise<StockQuote> {
  if (isYahooRateLimited()) {
    return createUnavailableQuote(symbol, yahooSymbol);
  }

  const query = new URL(`${YAHOO_CHART_BASE}${encodeURIComponent(yahooSymbol)}`);
  query.searchParams.set("interval", "1d");
  query.searchParams.set("range", "1mo");
  query.searchParams.set("includePrePost", "false");
  query.searchParams.set("events", "div,splits");

  const payload = await sendYahooJsonRequest(query);
  if (!payload) {
    return createUnavailableQuote(symbol, yahooSymbol);
  }

  const result = readYahooChartResult(payload);
  if (!result) {
    return createUnavailableQuote(symbol, yahooSymbol);
  }

  const quote = parseYahooChartToQuote(symbol, yahooSymbol, result);
  return quote ?? createUnavailableQuote(symbol, yahooSymbol);
}

async function sendStooqRequest(url: URL): Promise<Response | null> {
  if (isStooqRateLimited()) {
    return null;
  }

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "user-agent": USER_AGENT
      }
    });
    if (response.status === 429) {
      markStooqRateLimited();
    }
    return response;
  } catch {
    return null;
  }
}

async function sendMassiveJsonRequest(url: URL): Promise<Record<string, unknown> | null> {
  if (!getMassiveApiKey() || isMassiveRateLimited()) {
    return null;
  }

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "user-agent": USER_AGENT
      }
    });

    if (response.status === 429) {
      markMassiveRateLimited();
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    if (!isRecord(payload)) {
      return null;
    }

    const status = String(payload.status || "").toUpperCase();
    const errorText = String(payload.error || payload.message || "");
    if (status === "ERROR" || /limit|rate/i.test(errorText)) {
      if (/limit|rate/i.test(errorText)) {
        markMassiveRateLimited();
      }
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

async function sendYahooJsonRequest(url: URL): Promise<Record<string, unknown> | null> {
  if (isYahooRateLimited()) {
    return null;
  }

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "user-agent": YAHOO_USER_AGENT
      }
    });

    if (response.status === 429) {
      markYahooRateLimited();
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    if (!isRecord(payload)) {
      return null;
    }

    const chart = isRecord(payload.chart) ? payload.chart : null;
    const errorText = chart && chart.error ? JSON.stringify(chart.error) : "";
    if (/too many requests|rate limit/i.test(errorText)) {
      markYahooRateLimited();
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function readYahooChartResult(payload: Record<string, unknown>): Record<string, unknown> | null {
  const chart = isRecord(payload.chart) ? payload.chart : null;
  if (!chart) {
    return null;
  }

  const results = Array.isArray(chart.result) ? chart.result : [];
  const first = results[0];
  return isRecord(first) ? first : null;
}

function parseYahooChartToQuote(
  symbol: string,
  yahooSymbol: string,
  result: Record<string, unknown>
): StockQuote | null {
  const timestampsRaw = Array.isArray(result.timestamp) ? result.timestamp : [];
  if (!timestampsRaw.length) {
    return null;
  }

  const quoteRows = readYahooQuoteRows(result);
  if (!quoteRows) {
    return null;
  }

  const closes = quoteRows.close
    .map((value) => toNumberOrNullLoose(value))
    .filter((value): value is number => Number.isFinite(value));
  const history = closes.slice(-HISTORY_POINTS);

  const latestIndex = findLatestYahooIndex(timestampsRaw, quoteRows.close);
  if (latestIndex < 0) {
    return null;
  }

  const timestampSeconds = toNumberOrNullLoose(timestampsRaw[latestIndex]);
  const timestampMs =
    timestampSeconds !== null && Number.isFinite(timestampSeconds)
      ? Math.trunc(timestampSeconds * 1_000)
      : null;

  const open = toNumberOrNullLoose(quoteRows.open[latestIndex]);
  const high = toNumberOrNullLoose(quoteRows.high[latestIndex]);
  const low = toNumberOrNullLoose(quoteRows.low[latestIndex]);
  const close = toNumberOrNullLoose(quoteRows.close[latestIndex]);
  const volume = toNumberOrNullLoose(quoteRows.volume[latestIndex]);
  if (close === null) {
    return null;
  }

  const meta = isRecord(result.meta) ? result.meta : null;
  const openForChange = open ?? toNumberOrNullLoose(meta?.chartPreviousClose);
  const change = openForChange !== null ? close - openForChange : null;
  const changePercent =
    openForChange !== null && openForChange !== 0 ? ((close - openForChange) / openForChange) * 100 : null;
  const name = readYahooName(meta);

  return {
    symbol,
    sourceSymbol: yahooSymbol.toUpperCase(),
    name,
    date: timestampMs !== null ? formatIsoDateTimePart(timestampMs, "date") : null,
    time: timestampMs !== null ? formatIsoDateTimePart(timestampMs, "time") : null,
    open,
    high,
    low,
    close,
    volume,
    change,
    changePercent,
    history,
    status: "ok"
  };
}

function readYahooQuoteRows(result: Record<string, unknown>): {
  open: unknown[];
  high: unknown[];
  low: unknown[];
  close: unknown[];
  volume: unknown[];
} | null {
  const indicators = isRecord(result.indicators) ? result.indicators : null;
  const quoteList = indicators && Array.isArray(indicators.quote) ? indicators.quote : [];
  const firstQuote = quoteList[0];
  if (!isRecord(firstQuote)) {
    return null;
  }

  return {
    open: Array.isArray(firstQuote.open) ? firstQuote.open : [],
    high: Array.isArray(firstQuote.high) ? firstQuote.high : [],
    low: Array.isArray(firstQuote.low) ? firstQuote.low : [],
    close: Array.isArray(firstQuote.close) ? firstQuote.close : [],
    volume: Array.isArray(firstQuote.volume) ? firstQuote.volume : []
  };
}

function findLatestYahooIndex(timestamps: unknown[], closes: unknown[]): number {
  const last = Math.min(timestamps.length, closes.length) - 1;
  for (let index = last; index >= 0; index -= 1) {
    if (toNumberOrNullLoose(timestamps[index]) === null) {
      continue;
    }

    if (toNumberOrNullLoose(closes[index]) === null) {
      continue;
    }

    return index;
  }

  return -1;
}

function readYahooName(meta: Record<string, unknown> | null): string | null {
  if (!meta) {
    return null;
  }

  const longName = typeof meta.longName === "string" ? meta.longName.trim() : "";
  if (longName) {
    return longName;
  }

  const shortName = typeof meta.shortName === "string" ? meta.shortName.trim() : "";
  return shortName || null;
}

async function readResponseTextSafe(response: Response): Promise<string | null> {
  try {
    return (await response.text()).trim();
  } catch {
    return null;
  }
}

function parseQuoteLine(symbol: string, sourceSymbol: string, content: string): StockQuote {
  if (!content) {
    return createUnavailableQuote(symbol, sourceSymbol);
  }

  const line = content
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0 && !entry.toLowerCase().startsWith("symbol,"));
  if (!line) {
    return createUnavailableQuote(symbol, sourceSymbol);
  }

  const [rawSymbol, rawDate, rawTime, rawOpen, rawHigh, rawLow, rawClose, rawVolume, ...nameParts] =
    line.split(",");

  const open = toNumberOrNull(rawOpen);
  const close = toNumberOrNull(rawClose);
  const change = open !== null && close !== null ? close - open : null;
  const changePercent =
    open !== null && close !== null && open !== 0 ? ((close - open) / open) * 100 : null;

  const nameRaw = nameParts.join(",").trim();
  const unavailable = [rawDate, rawTime, rawOpen, rawHigh, rawLow, rawClose, rawVolume].every(
    isNotAvailable
  );

  if (unavailable) {
    return createUnavailableQuote(symbol, rawSymbol || sourceSymbol);
  }

  return {
    symbol,
    sourceSymbol: (rawSymbol || sourceSymbol).toUpperCase(),
    name: isNotAvailable(nameRaw) ? null : nameRaw,
    date: isNotAvailable(rawDate) ? null : rawDate,
    time: isNotAvailable(rawTime) ? null : rawTime,
    open,
    high: toNumberOrNull(rawHigh),
    low: toNumberOrNull(rawLow),
    close,
    volume: toNumberOrNull(rawVolume),
    change,
    changePercent,
    history: [],
    status: "ok"
  };
}

function createUnavailableQuote(symbol: string, sourceSymbol: string): StockQuote {
  return {
    symbol,
    sourceSymbol: sourceSymbol.toUpperCase(),
    name: null,
    date: null,
    time: null,
    open: null,
    high: null,
    low: null,
    close: null,
    volume: null,
    change: null,
    changePercent: null,
    history: [],
    status: "unavailable"
  };
}

function toNumberOrNull(value: string | undefined): number | null {
  if (!value || isNotAvailable(value)) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function isNotAvailable(value: string | undefined): boolean {
  if (!value) {
    return true;
  }

  return value.trim().toUpperCase() === "N/D";
}

function getMassiveApiKey(): string {
  return String(process.env.MASSIVE_API_KEY || "").trim();
}

function getStocksProvider(apiKey: string): "stooq" | "massive" {
  return normalizeProvider(process.env.STOCKS_PROVIDER, Boolean(apiKey));
}

function normalizeProvider(value: string | undefined, hasMassiveKey: boolean): "stooq" | "massive" {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "stooq" || normalized === "massive") {
    return normalized;
  }

  return hasMassiveKey ? "massive" : DEFAULT_PROVIDER;
}

function parseMassiveGroupedQuote(row: unknown, marketDate: string): StockQuote | null {
  if (!isRecord(row)) {
    return null;
  }

  const ticker = typeof row.T === "string" ? row.T.trim().toUpperCase() : "";
  if (!ticker) {
    return null;
  }

  const open = toNumberOrNullLoose(row.o);
  const high = toNumberOrNullLoose(row.h);
  const low = toNumberOrNullLoose(row.l);
  const close = toNumberOrNullLoose(row.c);
  const volume = toNumberOrNullLoose(row.v);
  if (close === null) {
    return null;
  }

  const change = open !== null ? close - open : null;
  const changePercent =
    (open !== null && close !== null && open !== 0 ? ((close - open) / open) * 100 : null);

  return {
    symbol: ticker,
    sourceSymbol: ticker,
    name: null,
    date: marketDate,
    time: null,
    open,
    high,
    low,
    close,
    volume,
    change,
    changePercent,
    history: [],
    status: "ok"
  };
}

function resolvePreviousUsMarketDateIso(): string {
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  cursor.setUTCDate(cursor.getUTCDate() - 1);

  while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return cursor.toISOString().slice(0, 10);
}

function formatIsoDateTimePart(timestampMs: number, part: "date" | "time"): string | null {
  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return part === "date"
    ? date.toISOString().slice(0, 10)
    : date.toISOString().slice(11, 19);
}

function toNumberOrNullLoose(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readFreshQuoteCache(symbol: string): StockQuote | null {
  const key = symbol.toUpperCase();
  const entry = quoteCache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    return null;
  }

  return cloneQuote(entry.quote);
}

function readStaleQuoteCache(symbol: string): StockQuote | null {
  const key = symbol.toUpperCase();
  const entry = quoteCache.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.fetchedAt > QUOTE_STALE_MAX_AGE_MS) {
    return null;
  }

  return cloneQuote(entry.quote);
}

function writeQuoteCache(symbol: string, quote: StockQuote): void {
  if (quote.status !== "ok") {
    return;
  }

  const now = Date.now();
  quoteCache.set(symbol.toUpperCase(), {
    quote: cloneQuote(quote),
    fetchedAt: now,
    expiresAt: now + QUOTE_CACHE_TTL_MS
  });
}

function readHistoryCache(sourceSymbol: string, allowStale: boolean): number[] | null {
  const key = sourceSymbol.toLowerCase();
  const entry = historyCache.get(key);
  if (!entry) {
    return null;
  }

  const now = Date.now();
  if (entry.expiresAt > now) {
    return [...entry.history];
  }

  if (allowStale && now - entry.fetchedAt <= HISTORY_STALE_MAX_AGE_MS) {
    return [...entry.history];
  }

  return null;
}

function writeHistoryCache(sourceSymbol: string, history: number[]): void {
  const now = Date.now();
  historyCache.set(sourceSymbol.toLowerCase(), {
    history: [...history],
    fetchedAt: now,
    expiresAt: now + HISTORY_CACHE_TTL_MS
  });
}

function cloneQuote(quote: StockQuote): StockQuote {
  return {
    ...quote,
    history: [...quote.history]
  };
}

function isStooqRateLimited(): boolean {
  return Date.now() < stooqRateLimitedUntilMs;
}

function markStooqRateLimited(): void {
  stooqRateLimitedUntilMs = Math.max(stooqRateLimitedUntilMs, Date.now() + RATE_LIMIT_BACKOFF_MS);
}

function isStooqRateLimitPayload(content: string): boolean {
  return /daily\s+hits\s+limit/i.test(content);
}

function isMassiveRateLimited(): boolean {
  return Date.now() < massiveRateLimitedUntilMs;
}

function markMassiveRateLimited(): void {
  massiveRateLimitedUntilMs = Math.max(massiveRateLimitedUntilMs, Date.now() + RATE_LIMIT_BACKOFF_MS);
}

function isYahooRateLimited(): boolean {
  return Date.now() < yahooRateLimitedUntilMs;
}

function markYahooRateLimited(): void {
  yahooRateLimitedUntilMs = Math.max(yahooRateLimitedUntilMs, Date.now() + RATE_LIMIT_BACKOFF_MS);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const safeConcurrency = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }

      results[index] = await mapper(items[index]);
    }
  }

  const workers = Array.from(
    { length: Math.min(safeConcurrency, items.length) },
    () => runWorker()
  );
  await Promise.all(workers);
  return results;
}
