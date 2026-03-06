import { promises as fs } from "node:fs";
import path from "node:path";

import { loadConfiguredStockWatchlist } from "./stocks-watchlist";

const NASDAQ_LISTED_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt";
const OTHER_LISTED_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt";
const USER_AGENT = "WaterNewsAggregator/0.1";
const REQUEST_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const CACHE_FILE_PATH = path.resolve(__dirname, "../../../data/cache/symbol-universe.json");
const SYMBOL_PATTERN = /^[A-Z0-9.-]{1,15}$/;

export type SymbolUniverseEntry = {
  symbol: string;
  name: string | null;
  exchange: string | null;
  market: string;
  source: "nasdaq" | "catalog";
};

type SymbolUniverseCache = {
  updatedAt: string;
  items: SymbolUniverseEntry[];
};

type SymbolUniverseSnapshot = {
  updatedAt: Date;
  items: SymbolUniverseEntry[];
};

type ScoredSymbolEntry = {
  entry: SymbolUniverseEntry;
  score: number | null;
};

export type SymbolSearchResult = {
  updatedAt: string;
  totalSymbols: number;
  items: SymbolUniverseEntry[];
};

let memoryCache: SymbolUniverseSnapshot | null = null;
let loadingPromise: Promise<SymbolUniverseSnapshot> | null = null;

export async function searchSymbolUniverse(
  query: string,
  market: string,
  limit: number
): Promise<SymbolSearchResult> {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) {
    const snapshot = await getSymbolUniverseSnapshot();
    return {
      updatedAt: snapshot.updatedAt.toISOString(),
      totalSymbols: snapshot.items.length,
      items: []
    };
  }

  const normalizedMarket = normalizeMarket(market);
  const safeLimit = clamp(limit, 1, 25);
  const snapshot = await getSymbolUniverseSnapshot();

  const scored: ScoredSymbolEntry[] = snapshot.items.map((entry) => ({
    entry,
    score: scoreEntry(entry, normalizedQuery)
  }));

  const ranked = scored
    .filter((item): item is { entry: SymbolUniverseEntry; score: number } => item.score !== null)
    .filter((item) => normalizedMarket === "ALL" || item.entry.market === normalizedMarket)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      const symbolCompare = left.entry.symbol.localeCompare(right.entry.symbol);
      if (symbolCompare !== 0) {
        return symbolCompare;
      }

      return String(left.entry.name || "").localeCompare(String(right.entry.name || ""));
    })
    .slice(0, safeLimit)
    .map((item) => item.entry);

  return {
    updatedAt: snapshot.updatedAt.toISOString(),
    totalSymbols: snapshot.items.length,
    items: ranked
  };
}

async function getSymbolUniverseSnapshot(): Promise<SymbolUniverseSnapshot> {
  if (memoryCache && !isExpired(memoryCache.updatedAt)) {
    return memoryCache;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = loadSymbolUniverse();
  try {
    const snapshot = await loadingPromise;
    memoryCache = snapshot;
    return snapshot;
  } finally {
    loadingPromise = null;
  }
}

async function loadSymbolUniverse(): Promise<SymbolUniverseSnapshot> {
  const diskCache = await readCacheFromDisk();
  if (diskCache && !isExpired(diskCache.updatedAt)) {
    return diskCache;
  }

  try {
    const rebuilt = await rebuildSymbolUniverse();
    await writeCacheToDisk(rebuilt);
    return rebuilt;
  } catch {
    if (diskCache) {
      return diskCache;
    }

    return {
      updatedAt: new Date(),
      items: []
    };
  }
}

async function rebuildSymbolUniverse(): Promise<SymbolUniverseSnapshot> {
  const [nasdaqListed, otherListed, configured] = await Promise.all([
    fetchTextFile(NASDAQ_LISTED_URL),
    fetchTextFile(OTHER_LISTED_URL),
    loadConfiguredStockWatchlist()
  ]);

  const entries: SymbolUniverseEntry[] = [];
  entries.push(...parseNasdaqListed(nasdaqListed));
  entries.push(...parseOtherListed(otherListed));
  entries.push(
    ...configured.map((entry) => ({
      symbol: entry.symbol,
      name: entry.name,
      exchange: entry.exchange,
      market: normalizeMarket(entry.market),
      source: "catalog" as const
    }))
  );

  const deduped = dedupeEntries(entries);
  return {
    updatedAt: new Date(),
    items: deduped
  };
}

function parseNasdaqListed(content: string): SymbolUniverseEntry[] {
  const rows = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith("File Creation Time:"));

  if (rows.length <= 1) {
    return [];
  }

  return rows.slice(1).map((row): SymbolUniverseEntry | null => {
    const columns = row.split("|");
    const symbol = normalizeSymbol(columns[0]);
    if (!symbol) {
      return null;
    }

    return {
      symbol,
      name: cleanText(columns[1]),
      exchange: "NASDAQ",
      market: "US",
      source: "nasdaq" as const
    };
  }).filter(isDefined);
}

function parseOtherListed(content: string): SymbolUniverseEntry[] {
  const rows = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith("File Creation Time:"));

  if (rows.length <= 1) {
    return [];
  }

  return rows.slice(1).map((row): SymbolUniverseEntry | null => {
    const columns = row.split("|");
    const symbol = normalizeSymbol(columns[0]);
    if (!symbol) {
      return null;
    }

    return {
      symbol,
      name: cleanText(columns[1]),
      exchange: mapOtherListedExchange(columns[2]),
      market: "US",
      source: "nasdaq" as const
    };
  }).filter(isDefined);
}

function mapOtherListedExchange(code: string | undefined): string | null {
  const normalized = (code || "").trim().toUpperCase();
  if (normalized === "N") {
    return "NYSE";
  }
  if (normalized === "P") {
    return "NYSE ARCA";
  }
  if (normalized === "A") {
    return "NYSE AMERICAN";
  }
  if (normalized === "V") {
    return "IEX";
  }
  if (normalized === "Z") {
    return "BATS";
  }
  return normalized || null;
}

function dedupeEntries(items: SymbolUniverseEntry[]): SymbolUniverseEntry[] {
  const map = new Map<string, SymbolUniverseEntry>();
  items.forEach((entry) => {
    const key = `${entry.market}|${entry.symbol}`;
    if (!map.has(key)) {
      map.set(key, entry);
      return;
    }

    const current = map.get(key);
    if (!current) {
      map.set(key, entry);
      return;
    }

    if (current.source === "catalog" && entry.source === "nasdaq") {
      map.set(key, entry);
      return;
    }

    if (!current.name && entry.name) {
      map.set(key, entry);
    }
  });

  return [...map.values()];
}

async function fetchTextFile(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      "user-agent": USER_AGENT
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch symbol feed: ${url}`);
  }

  return await response.text();
}

function scoreEntry(entry: SymbolUniverseEntry, query: string): number | null {
  const symbol = entry.symbol.toUpperCase();
  const name = String(entry.name || "").toUpperCase();

  if (symbol === query) {
    return 0;
  }
  if (symbol.startsWith(query)) {
    return 1;
  }
  if (symbol.includes(query)) {
    return 2;
  }
  if (name.startsWith(query)) {
    return 3;
  }
  if (name.includes(query)) {
    return 4;
  }

  return null;
}

function normalizeQuery(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeMarket(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (
    normalized === "US" ||
    normalized === "CA" ||
    normalized === "EU" ||
    normalized === "ASIA" ||
    normalized === "LATAM" ||
    normalized === "OCEANIA" ||
    normalized === "AFRICA"
  ) {
    return normalized;
  }

  if (normalized === "SOUTH_AMERICA") {
    return "LATAM";
  }

  return "ALL";
}

function normalizeSymbol(value: string | undefined): string | null {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized || !SYMBOL_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

function cleanText(value: string | undefined): string | null {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized || null;
}

function isDefined<T>(value: T | null): value is T {
  return value !== null;
}

function isExpired(timestamp: Date): boolean {
  return Date.now() - timestamp.getTime() > CACHE_TTL_MS;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}

async function readCacheFromDisk(): Promise<SymbolUniverseSnapshot | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as SymbolUniverseCache;
    if (!parsed || !Array.isArray(parsed.items) || typeof parsed.updatedAt !== "string") {
      return null;
    }

    const updatedAt = new Date(parsed.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) {
      return null;
    }

    const items = parsed.items
      .map((entry) => normalizeCacheEntry(entry))
      .filter((entry): entry is SymbolUniverseEntry => Boolean(entry));

    return {
      updatedAt,
      items
    };
  } catch {
    return null;
  }
}

async function writeCacheToDisk(snapshot: SymbolUniverseSnapshot): Promise<void> {
  const dirPath = path.dirname(CACHE_FILE_PATH);
  await fs.mkdir(dirPath, { recursive: true });
  const payload: SymbolUniverseCache = {
    updatedAt: snapshot.updatedAt.toISOString(),
    items: snapshot.items
  };
  await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(payload, null, 2), "utf8");
}

function normalizeCacheEntry(value: unknown): SymbolUniverseEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const symbol = normalizeSymbol(String(record.symbol || ""));
  if (!symbol) {
    return null;
  }

  const source = record.source === "catalog" ? "catalog" : "nasdaq";
  const market = normalizeMarket(String(record.market || "ALL"));
  return {
    symbol,
    name: typeof record.name === "string" ? cleanText(record.name) : null,
    exchange: typeof record.exchange === "string" ? cleanText(record.exchange) : null,
    market,
    source
  };
}
