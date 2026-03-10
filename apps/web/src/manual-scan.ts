import { MonitoredSite } from "../../../packages/shared/src";
import { mergeAndSaveEntries } from "../../worker/src/news-store";
import { extractRiskEntries, extractRiskEntriesFromFeed } from "../../worker/src/site-parser";

const REQUEST_TIMEOUT_MS = 20_000;
const USER_AGENT = "WaterNewsAggregator/0.1";

export interface SiteScanResult {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  found: number;
  inserted: number;
  error?: string;
}

export interface ScanNowResult {
  startedAt: string;
  completedAt: string;
  totalSources: number;
  totalFound: number;
  totalInserted: number;
  results: SiteScanResult[];
}

export async function scanSourcesNow(sites: MonitoredSite[]): Promise<ScanNowResult> {
  const startedAt = new Date().toISOString();
  const results: SiteScanResult[] = [];

  for (const site of sites) {
    const result = await scanSingleSite(site);
    results.push(result);
  }

  const completedAt = new Date().toISOString();
  const totalFound = results.reduce((sum, item) => sum + item.found, 0);
  const totalInserted = results.reduce((sum, item) => sum + item.inserted, 0);

  return {
    startedAt,
    completedAt,
    totalSources: sites.length,
    totalFound,
    totalInserted,
    results
  };
}

async function scanSingleSite(site: MonitoredSite): Promise<SiteScanResult> {
  try {
    const endpoint = site.rss ?? site.url;
    const payload = await fetchText(endpoint);
    const entries = site.rss
      ? extractRiskEntriesFromFeed(payload, site.name, endpoint)
      : extractRiskEntries(payload, site.name, site.url);
    const inserted = await mergeAndSaveEntries(entries);

    return {
      sourceId: site.id,
      sourceName: site.name,
      sourceUrl: endpoint,
      found: entries.length,
      inserted
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      sourceId: site.id,
      sourceName: site.name,
      sourceUrl: site.rss ?? site.url,
      found: 0,
      inserted: 0,
      error: message
    };
  }
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}
