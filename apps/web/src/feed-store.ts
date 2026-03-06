import { promises as fs } from "node:fs";
import path from "node:path";

import { RiskCategory } from "../../../src/analysis/risk_classifier";
import { Article } from "../../../src/models/Article";
import { DatasetEvent } from "../../../src/models/Dataset";
import { CategorizedSource } from "../../../src/models/Source";
import { loadStoredArticles, loadStoredDatasetEvents } from "../../../src/services/output_store";
import { loadSourcesWithReport } from "../../../src/services/source_loader";
import { FeedItem } from "./feed-types";

const FEED_CACHE_TTL_MS = 30_000;
const LOG_PATH = path.resolve(__dirname, "../../../data/ingested/pipeline_logs.jsonl");
const ARTICLES_PATH = path.resolve(__dirname, "../../../data/ingested/articles.json");
const DATASET_EVENTS_PATH = path.resolve(__dirname, "../../../data/ingested/dataset_events.json");

const RISK_SCORE_WEIGHT: Record<RiskCategory, number> = {
  drought: 16,
  flood: 32,
  pollution: 32,
  "infrastructure risk": 30,
  "water conflict": 30,
  "irrigation stress": 18
};

interface FeedSnapshot {
  items: FeedItem[];
  loadedAt: string;
  sourceById: Map<string, CategorizedSource>;
}

let snapshotCache: { value: FeedSnapshot; expiresAt: number } | null = null;

export async function loadFeedSnapshot(): Promise<FeedSnapshot> {
  const now = Date.now();
  if (snapshotCache && snapshotCache.expiresAt > now) {
    return snapshotCache.value;
  }

  const [articles, datasetEvents, sourceReport] = await Promise.all([
    loadStoredArticles(),
    loadStoredDatasetEvents(),
    loadSourcesWithReport()
  ]);
  const sourceById = new Map(sourceReport.sources.map((source) => [source.id, source]));

  const articleItems = articles.map((article) => toArticleItem(article, sourceById.get(article.source_id)));
  const datasetItems = datasetEvents.map((event) => toDatasetItem(event, sourceById.get(event.source_id)));
  const items = [...articleItems, ...datasetItems].sort(compareNewestFirst);

  const snapshot: FeedSnapshot = {
    items,
    loadedAt: new Date().toISOString(),
    sourceById
  };

  snapshotCache = {
    value: snapshot,
    expiresAt: now + FEED_CACHE_TTL_MS
  };

  return snapshot;
}

export async function readIngestionHealth(): Promise<{
  countsLast24h: { total: number; news: number; data: number };
  lastPipelineRunAt: string | null;
  recentErrors: Array<Record<string, unknown>>;
}> {
  const snapshot = await loadFeedSnapshot();
  const nowMs = Date.now();
  const dayAgoMs = nowMs - 24 * 60 * 60 * 1_000;

  let news = 0;
  let data = 0;

  for (const item of snapshot.items) {
    const timestampMs = Date.parse(item.timestamp);
    if (!Number.isFinite(timestampMs) || timestampMs < dayAgoMs) {
      continue;
    }

    if (item.type === "NEWS") {
      news += 1;
    } else {
      data += 1;
    }
  }

  const recentErrors = await readRecentPipelineErrors(50);
  const lastPipelineRunAt = await readLastPipelineRunTimestamp();

  return {
    countsLast24h: {
      total: news + data,
      news,
      data
    },
    lastPipelineRunAt,
    recentErrors
  };
}

function toArticleItem(article: Article, source: CategorizedSource | undefined): FeedItem {
  const timestamp = normalizeIso(article.published_at);
  const riskTags = normalizeRiskTags(article.risk_labels);
  const reliability = source?.reliability_score ?? 5;
  const dedupeHash = article.dedupe_hash ?? article.id;
  const topic = article.topic || source?.topic || "water";

  return {
    id: article.id,
    type: "NEWS",
    dedupeHash,
    sourceId: article.source_id,
    sourceName: source?.name ?? article.source_id,
    sourceReliability: reliability,
    timestamp,
    region: article.region || source?.region || "global",
    topic,
    title: article.title,
    summary: buildNewsSummary(article.summary, riskTags, topic),
    riskTags,
    riskScore: calculateRiskScore(riskTags, reliability),
    originalUrl: extractFirstHttpUrl(article.raw_content) ?? source?.url,
    reviewed: false,
    starred: false,
    relevanceFeedback: null,
    article
  };
}

function toDatasetItem(event: DatasetEvent, source: CategorizedSource | undefined): FeedItem {
  const timestamp = normalizeIso(event.timestamp);
  const riskTags = normalizeRiskTags(event.risk_labels);
  const reliability = source?.reliability_score ?? 5;
  const dedupeHash = event.dedupe_hash ?? event.id;
  const value = formatValue(event.value);
  const topic = source?.topic || event.metric || "water dataset";

  return {
    id: event.id,
    type: "DATA",
    dedupeHash,
    sourceId: event.source_id,
    sourceName: source?.name ?? event.source_id,
    sourceReliability: reliability,
    timestamp,
    region: source?.region || event.location || "global",
    topic,
    title: `${event.metric} • ${event.location}`,
    summary: buildDatasetSummary(event.metric, event.location, value, riskTags, topic),
    riskTags,
    riskScore: calculateRiskScore(riskTags, reliability),
    originalUrl: source?.url,
    reviewed: false,
    starred: false,
    relevanceFeedback: null,
    datasetEvent: event
  };
}

function normalizeIso(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(0).toISOString();
  }

  return parsed.toISOString();
}

function compareNewestFirst(a: FeedItem, b: FeedItem): number {
  if (a.timestamp === b.timestamp) {
    if (a.id === b.id) {
      return 0;
    }

    return a.id < b.id ? 1 : -1;
  }

  return a.timestamp < b.timestamp ? 1 : -1;
}

function normalizeRiskTags(value: RiskCategory[] | undefined): RiskCategory[] {
  if (!value || value.length === 0) {
    return [];
  }

  const unique = new Set<RiskCategory>();
  for (const entry of value) {
    if (entry in RISK_SCORE_WEIGHT) {
      unique.add(entry);
    }
  }

  return [...unique];
}

function calculateRiskScore(tags: RiskCategory[], reliability: number): number {
  const base = clamp(Math.round(reliability * 4), 0, 60);
  const tagsScore = tags.reduce((sum, tag) => sum + (RISK_SCORE_WEIGHT[tag] ?? 0), 0);
  return clamp(base + tagsScore, 0, 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function extractFirstHttpUrl(text: string): string | undefined {
  const match = text.match(/https?:\/\/[^\s<>"')\]]+/i);
  if (!match) {
    return undefined;
  }

  try {
    const parsed = new URL(match[0]);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }

    return parsed.toString();
  } catch {
    return undefined;
  }
}

function formatValue(value: string | number | null): string {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "n/a";
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return "n/a";
}

function buildNewsSummary(summary: string, tags: RiskCategory[], topic: string): string {
  const base = summary.trim() || `Potential ${topic} development detected from source headline analysis.`;
  if (tags.length === 0) {
    return `${base} Classified as low-signal context; monitor for follow-up updates.`;
  }

  return `${base} Risk interpretation: ${tags.join(", ")} indicators are present for ${topic}.`;
}

function buildDatasetSummary(
  metric: string,
  location: string,
  value: string,
  tags: RiskCategory[],
  topic: string
): string {
  const firstSentence = `Observed ${metric} at ${location} with value ${value}.`;
  if (tags.length === 0) {
    return `${firstSentence} No direct risk tag was inferred; this remains a monitoring signal for ${topic}.`;
  }

  return `${firstSentence} Interpretation: ${tags.join(", ")} conditions may be evolving for ${topic}.`;
}

async function readLastPipelineRunTimestamp(): Promise<string | null> {
  try {
    const [articlesStat, datasetsStat] = await Promise.all([
      fs.stat(ARTICLES_PATH),
      fs.stat(DATASET_EVENTS_PATH)
    ]);
    const latest = Math.max(articlesStat.mtimeMs, datasetsStat.mtimeMs);
    return new Date(latest).toISOString();
  } catch {
    return null;
  }
}

async function readRecentPipelineErrors(limit: number): Promise<Array<Record<string, unknown>>> {
  try {
    const raw = await fs.readFile(LOG_PATH, "utf8");
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const parsed: Array<Record<string, unknown>> = [];
    for (let index = lines.length - 1; index >= 0 && parsed.length < limit; index -= 1) {
      try {
        const entry = JSON.parse(lines[index]) as Record<string, unknown>;
        if (entry.level === "error") {
          parsed.push(entry);
        }
      } catch {
        // Ignore malformed lines.
      }
    }

    return parsed;
  } catch {
    return [];
  }
}
