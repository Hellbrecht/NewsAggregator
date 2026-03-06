import { classifyRisk } from "../analysis/risk_classifier";
import { DatasetEvent } from "../models/Dataset";
import { Source } from "../models/Source";
import { computeContentHash } from "../services/deduplicator";

const REQUEST_TIMEOUT_MS = 20_000;
const USER_AGENT = "rssbot/1.0";

export async function fetchApiDataset(source: Source): Promise<DatasetEvent[]> {
  const endpoint = source.api ?? source.url;
  const payload = await fetchJsonPayload(endpoint);
  const rows = normalizeToArray(payload);

  return rows.slice(0, 300).map((row, index) => toDatasetEvent(source, row, index));
}

function toDatasetEvent(source: Source, row: Record<string, unknown>, index: number): DatasetEvent {
  const metric = getString(row, ["metric", "parameter", "indicator", "name"], source.topic);
  const value = getValue(row, ["value", "reading", "measurement", "val"]);
  const location = getString(row, ["location", "station", "region", "country"], source.region);
  const timestamp = normalizeDate(
    getString(row, ["timestamp", "time", "datetime", "date"], new Date().toISOString())
  );

  const riskLabels = classifyRisk(`${source.topic} ${metric} ${location}`);
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
}

async function fetchJsonPayload(url: string): Promise<unknown> {
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
      return JSON.parse(raw) as unknown;
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

function normalizeToArray(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"));
  }

  if (payload && typeof payload === "object") {
    const objectPayload = payload as Record<string, unknown>;

    if (Array.isArray(objectPayload.data)) {
      return objectPayload.data.filter(
        (row): row is Record<string, unknown> => Boolean(row && typeof row === "object")
      );
    }

    return [objectPayload];
  }

  return [];
}

function getString(row: Record<string, unknown>, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return fallback;
}

function getValue(
  row: Record<string, unknown>,
  keys: string[]
): string | number | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" || typeof value === "string") {
      return value;
    }
  }

  return null;
}

function normalizeDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}
