import { promises as fs } from "node:fs";
import path from "node:path";

const STOCKS_FILE_PATH = path.resolve(__dirname, "../../../data_sources/stocks.json");
const SYMBOL_PATTERN = /^[A-Z0-9.-]{1,15}$/;

export type ConfiguredStockEntry = {
  symbol: string;
  market: string;
  name: string | null;
  exchange: string | null;
};

type RawTickerEntry = {
  ticker: string;
  name: string | null;
  exchange: string | null;
  ancestry: string[];
};

export async function loadConfiguredStockWatchlist(): Promise<ConfiguredStockEntry[]> {
  const raw = await fs.readFile(STOCKS_FILE_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return parseStockCatalog(parsed);
}

export function parseStockCatalog(catalog: unknown): ConfiguredStockEntry[] {
  const rawEntries: RawTickerEntry[] = [];
  collectTickers(catalog, [], rawEntries);

  const deduped = new Map<string, ConfiguredStockEntry>();
  rawEntries.forEach((entry) => {
    const symbol = normalizeSymbol(entry.ticker);
    if (!symbol) {
      return;
    }

    const market = mapAncestryToMarket(entry.ancestry);
    const key = `${market}|${symbol}`;
    if (deduped.has(key)) {
      return;
    }

    deduped.set(key, {
      symbol,
      market,
      name: entry.name,
      exchange: entry.exchange
    });
  });

  return [...deduped.values()];
}

function collectTickers(node: unknown, ancestry: string[], output: RawTickerEntry[]): void {
  if (Array.isArray(node)) {
    node.forEach((entry) => {
      collectTickers(entry, ancestry, output);
    });
    return;
  }

  if (!isRecord(node)) {
    return;
  }

  const tickerValue = node.ticker;
  if (typeof tickerValue === "string" && tickerValue.trim()) {
    output.push({
      ticker: tickerValue,
      name: typeof node.name === "string" ? node.name.trim() || null : null,
      exchange: typeof node.exchange === "string" ? node.exchange.trim() || null : null,
      ancestry
    });
    return;
  }

  Object.entries(node).forEach(([key, value]) => {
    collectTickers(value, [...ancestry, key], output);
  });
}

function mapAncestryToMarket(ancestry: string[]): string {
  const chain = ancestry.map((entry) => entry.toLowerCase());

  if (chain.includes("usa")) {
    return "US";
  }

  if (chain.includes("canada")) {
    return "CA";
  }

  if (chain.includes("europe")) {
    return "EU";
  }

  if (chain.includes("asia")) {
    return "ASIA";
  }

  if (chain.includes("oceania")) {
    return "OCEANIA";
  }

  if (chain.includes("africa")) {
    return "AFRICA";
  }

  if (chain.includes("south_america")) {
    return "LATAM";
  }

  if (chain.includes("mexico")) {
    return "LATAM";
  }

  if (chain.includes("north_america")) {
    return "US";
  }

  return "US";
}

function normalizeSymbol(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (!normalized || !SYMBOL_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
