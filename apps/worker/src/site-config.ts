import { promises as fs } from "node:fs";
import path from "node:path";

import { MonitoredSite } from "../../../packages/shared/src";
import { loadSources as loadUnifiedSources } from "../../../src/services/source_loader";

const DEFAULT_SITES_PATH = path.resolve(__dirname, "../../../config/sites.json");

export async function loadSites(): Promise<MonitoredSite[]> {
  try {
    const unified = await loadUnifiedSources();
    const newsSources = unified
      .filter((source) => source.category === "news")
      .map((source) => ({
        id: source.id,
        name: source.name,
        url: source.url,
        intervalMinutes: Math.max(1, Number(source.intervalMinutes) || 30)
      }));

    if (newsSources.length > 0) {
      return newsSources;
    }
  } catch {
    // Fall through to legacy config/sites.json for backward compatibility.
  }

  const raw = await fs.readFile(DEFAULT_SITES_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Invalid sites configuration: expected array.");
  }

  return parsed.filter(isSiteLike).map(normalizeSite);
}

function isSiteLike(value: unknown): value is MonitoredSite {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybe = value as Partial<MonitoredSite>;
  return Boolean(maybe.id && maybe.name && maybe.url);
}

function normalizeSite(site: MonitoredSite): MonitoredSite {
  return {
    id: site.id,
    name: site.name,
    url: site.url,
    intervalMinutes: Math.max(1, Number(site.intervalMinutes) || 30)
  };
}
