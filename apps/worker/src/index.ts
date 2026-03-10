import { MonitoredSite } from "../../../packages/shared/src";
import { loadSites } from "./site-config";
import { mergeAndSaveEntries } from "./news-store";
import { extractRiskEntries, extractRiskEntriesFromFeed } from "./site-parser";

const REQUEST_TIMEOUT_MS = 20_000;
const USER_AGENT = "WaterNewsAggregator/0.1";

async function main(): Promise<void> {
  const sites = await loadSites();

  if (sites.length === 0) {
    console.error("No sites found in config/sites.json");
    return;
  }

  for (const site of sites) {
    const intervalMs = site.intervalMinutes * 60_000;

    await scanSite(site);
    setInterval(() => {
      void scanSite(site);
    }, intervalMs);
  }

  console.log(`Worker active for ${sites.length} source(s).`);
}

async function scanSite(site: MonitoredSite): Promise<void> {
  try {
    const endpoint = site.rss ?? site.url;
    const payload = await fetchText(endpoint);
    const entries = site.rss
      ? extractRiskEntriesFromFeed(payload, site.name, endpoint)
      : extractRiskEntries(payload, site.name, site.url);
    const inserted = await mergeAndSaveEntries(entries);
    console.log(
      `[${new Date().toISOString()}] ${site.name}: found=${entries.length} inserted=${inserted}`
    );
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ${site.name} scan failed`, error);
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

void main().catch((error) => {
  console.error("Worker failed to start", error);
  process.exitCode = 1;
});
