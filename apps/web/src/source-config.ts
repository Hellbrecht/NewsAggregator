import { promises as fs } from "node:fs";
import path from "node:path";

import { Source } from "../../../src/models/Source";

const SOURCES_PATH = path.resolve(__dirname, "../../../data_sources/news_sources.json");

export interface SourceDraft {
  id?: string;
  name: string;
  url: string;
  rss?: string;
  topic: string;
  region: string;
  reliability_score: number;
  intervalMinutes: number;
}

export async function loadSources(): Promise<Source[]> {
  try {
    const raw = await fs.readFile(SOURCES_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isSourceLike).map(normalizeSource);
  } catch {
    return [];
  }
}

export async function saveSources(sources: Source[]): Promise<void> {
  const safeSources = sources.filter(isSourceLike).map(normalizeSource);
  await fs.mkdir(path.dirname(SOURCES_PATH), { recursive: true });
  await fs.writeFile(SOURCES_PATH, JSON.stringify(safeSources, null, 2), "utf8");
}

export function parseSourceDraft(value: unknown): SourceDraft | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const maybe = value as Record<string, unknown>;
  const name = typeof maybe.name === "string" ? maybe.name.trim() : "";
  const url = typeof maybe.url === "string" ? maybe.url.trim() : "";
  const intervalMinutes = Number(maybe.intervalMinutes);
  const normalizedInterval = Number.isFinite(intervalMinutes)
    ? Math.max(1, Math.floor(intervalMinutes))
    : 30;
  const id = typeof maybe.id === "string" ? maybe.id.trim() : undefined;
  const rss = typeof maybe.rss === "string" && isSafeHttpUrl(maybe.rss) ? maybe.rss.trim() : undefined;
  const topic = typeof maybe.topic === "string" && maybe.topic.trim() ? maybe.topic.trim() : "water risk";
  const region = typeof maybe.region === "string" && maybe.region.trim() ? maybe.region.trim() : "global";
  const reliability_score = Number.isFinite(Number(maybe.reliability_score))
    ? clamp(Math.round(Number(maybe.reliability_score)), 1, 10)
    : 7;

  if (!name || !isSafeHttpUrl(url)) {
    return null;
  }

  return {
    id,
    name,
    url,
    rss,
    topic,
    region,
    reliability_score,
    intervalMinutes: normalizedInterval
  };
}

export function createUniqueSourceId(
  candidateName: string,
  existingSources: Source[],
  preferredId?: string
): string {
  const reserved = new Set(existingSources.map((source) => source.id));
  const preferred = sanitizeId(preferredId ?? "");
  if (preferred && !reserved.has(preferred)) {
    return preferred;
  }

  const base = sanitizeId(candidateName) || "source";
  if (!reserved.has(base)) {
    return base;
  }

  let suffix = 2;
  while (reserved.has(`${base}-${suffix}`)) {
    suffix += 1;
  }

  return `${base}-${suffix}`;
}

export function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function sanitizeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 48);
}

function isSourceLike(value: unknown): value is Source {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybe = value as Partial<Source>;
  return Boolean(
    maybe.id &&
      maybe.name &&
      maybe.url &&
      maybe.topic &&
      maybe.region &&
      typeof maybe.reliability_score === "number" &&
      typeof maybe.intervalMinutes === "number" &&
      isSafeHttpUrl(maybe.url)
  );
}

function normalizeSource(source: Source): Source {
  const normalized: Source = {
    id: sanitizeId(source.id) || "source",
    name: source.name.trim(),
    url: source.url.trim(),
    topic: source.topic.trim() || "water risk",
    region: source.region.trim() || "global",
    reliability_score: clamp(Math.round(source.reliability_score), 1, 10),
    intervalMinutes: clamp(Math.floor(source.intervalMinutes), 1, 1440)
  };

  if (source.rss && isSafeHttpUrl(source.rss)) {
    normalized.rss = source.rss.trim();
  }

  if (source.api && isSafeHttpUrl(source.api)) {
    normalized.api = source.api.trim();
  }

  return normalized;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
