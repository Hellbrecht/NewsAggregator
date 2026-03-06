import { classifyRisk } from "../analysis/risk_classifier";
import { DatasetEvent } from "../models/Dataset";
import { Source } from "../models/Source";
import { computeContentHash } from "../services/deduplicator";

const REQUEST_TIMEOUT_MS = 20_000;
const USER_AGENT = "rssbot/1.0";

export async function fetchSatelliteDataset(source: Source): Promise<DatasetEvent[]> {
  const endpoint = source.api ?? source.url;
  const metadata = await fetchMetadata(endpoint);
  const baseTimestamp = new Date().toISOString();

  const pseudoEvents: DatasetEvent[] = metadata.slice(0, 50).map((item, index) => {
    const metric = item.metric || source.topic || "satellite_observation";
    const value = item.value ?? item.status ?? "n/a";
    const location = item.location || source.region || "global";
    const timestamp = normalizeDate(item.timestamp || baseTimestamp);
    const riskLabels = classifyRisk(`${source.topic} ${metric} ${location} ${value}`);
    const dedupeHash = computeContentHash(metric, value, location, timestamp.slice(0, 13));
    const id = computeContentHash(source.id, metric, location, timestamp, index, dedupeHash);

    return {
      id,
      dedupe_hash: dedupeHash,
      source_id: source.id,
      metric,
      value,
      location,
      timestamp,
      risk_labels: riskLabels
    };
  });

  if (pseudoEvents.length > 0) {
    return pseudoEvents;
  }

  const fallbackLabels = classifyRisk(source.topic);
  return [
    {
      id: computeContentHash(source.id, source.topic, baseTimestamp),
      dedupe_hash: computeContentHash(source.topic, source.region, baseTimestamp.slice(0, 13)),
      source_id: source.id,
      metric: source.topic,
      value: "source_reachable",
      location: source.region,
      timestamp: baseTimestamp,
      risk_labels: fallbackLabels
    }
  ];
}

interface SatelliteMetadata {
  metric?: string;
  value?: string | number | null;
  status?: string;
  location?: string;
  timestamp?: string;
}

async function fetchMetadata(url: string): Promise<SatelliteMetadata[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/json,text/plain,*/*"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    const raw = await response.text();
    if (!raw.trim()) {
      return [];
    }

    if (isLikelyHtmlPayload(contentType, raw)) {
      throw new Error(
        `Expected JSON payload from ${url} but received HTML (content-type: ${contentType || "unknown"}).`
      );
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (row): row is SatelliteMetadata => Boolean(row && typeof row === "object")
        );
      }

      if (parsed && typeof parsed === "object") {
        return [parsed as SatelliteMetadata];
      }

      return [];
    } catch {
      throw new Error(
        `Expected JSON payload from ${url} but received non-JSON data (content-type: ${contentType || "unknown"}).`
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

function isLikelyHtmlPayload(contentType: string, body: string): boolean {
  if (contentType.includes("text/html")) {
    return true;
  }

  const trimmed = body.trimStart().slice(0, 64).toLowerCase();
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}

function normalizeDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}
