import { promises as fs } from "node:fs";
import path from "node:path";

import { classifyWaterRisk, NewsEntry, RiskTag } from "../../../packages/shared/src";
import { isPlaceholderArticleTitle, resolveArticleTitle } from "../../../src/analysis/article_title";
import { isWaterRelevantText, RelevanceProfile } from "../../../src/analysis/water_relevance";
import { loadRelevanceProfile } from "../../../src/services/relevance_profile_store";

const DEFAULT_LEGACY_STORE_PATH = path.resolve(__dirname, "../../../data/news-entries.json");
const DEFAULT_PIPELINE_ARTICLES_PATH = path.resolve(__dirname, "../../../data/ingested/articles.json");

const LEGACY_STORE_PATH = path.resolve(process.env.NEWS_ENTRIES_PATH ?? DEFAULT_LEGACY_STORE_PATH);
const PIPELINE_ARTICLES_PATH = path.resolve(
  process.env.PIPELINE_ARTICLES_PATH ?? DEFAULT_PIPELINE_ARTICLES_PATH
);

export async function loadEntries(): Promise<NewsEntry[]> {
  const [legacyEntries, pipelineEntries] = await Promise.all([loadLegacyEntries(), loadPipelineEntries()]);
  return mergeByLink([...legacyEntries, ...pipelineEntries]).sort(byNewestFirst);
}

async function loadLegacyEntries(): Promise<NewsEntry[]> {
  const parsed = await readJsonArray(LEGACY_STORE_PATH);
  return parsed
    .filter(isEntryLike)
    .filter((entry) => isWaterRelevantText(`${entry.title} ${entry.summary}`));
}

async function loadPipelineEntries(): Promise<NewsEntry[]> {
  const relevanceProfile = await loadRelevanceProfile();
  const parsed = await readJsonArray(PIPELINE_ARTICLES_PATH);
  return parsed
    .filter(isPipelineArticleLike)
    .map((article) => toNewsEntryFromPipelineArticle(article, relevanceProfile))
    .filter((entry): entry is NewsEntry => entry !== null);
}

function byNewestFirst(a: NewsEntry, b: NewsEntry): number {
  return a.publishedAt < b.publishedAt ? 1 : -1;
}

function isEntryLike(value: unknown): value is NewsEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybe = value as Partial<NewsEntry>;
  return Boolean(
    maybe.id &&
      maybe.title &&
      maybe.summary &&
      maybe.link &&
      maybe.publishedAt &&
      isSafeHttpUrl(maybe.link) &&
      isValidDate(maybe.publishedAt)
  );
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

export interface PipelineArticleLike {
  id: string;
  source_id: string;
  title: string;
  summary: string;
  published_at: string;
  raw_content: string;
  risk_labels?: string[];
}

export function toNewsEntryFromPipelineArticle(
  article: PipelineArticleLike,
  relevanceProfile?: RelevanceProfile
): NewsEntry | null {
  const displayRelevanceText = `${article.title} ${article.summary}`.trim();
  const isDisplayRelevant = isWaterRelevantText(displayRelevanceText, relevanceProfile);
  const isFallbackRawRelevant =
    !isDisplayRelevant &&
    isPlaceholderArticleTitle(article.title) &&
    isWaterRelevantText(article.raw_content, relevanceProfile);

  if (!isDisplayRelevant && !isFallbackRawRelevant) {
    return null;
  }

  const link = extractFirstHttpUrl(article.raw_content);
  if (!link) {
    return null;
  }

  const inferredTags = classifyWaterRisk(`${article.title} ${article.summary} ${article.raw_content}`);
  const mappedTags = mapPipelineRiskLabels(article.risk_labels);
  const riskTags = uniqueRiskTags([...inferredTags, ...mappedTags]);
  const resolvedTitle = resolveArticleTitle(
    article.title,
    article.summary,
    article.title || `Untitled from ${article.source_id}`
  );

  return {
    id: article.id,
    title: resolvedTitle,
    summary: article.summary,
    link,
    source: article.source_id,
    publishedAt: article.published_at,
    riskTags
  };
}

function mapPipelineRiskLabels(labels: string[] | undefined): RiskTag[] {
  if (!Array.isArray(labels) || labels.length === 0) {
    return [];
  }

  const mapping: Record<string, RiskTag[]> = {
    drought: ["drought"],
    flood: ["flooding"],
    pollution: ["pollution", "contamination"],
    "infrastructure risk": ["infrastructure"],
    "water conflict": ["quality-alert"],
    "irrigation stress": ["drought"]
  };

  const tags: RiskTag[] = [];
  for (const label of labels) {
    const mapped = mapping[label];
    if (mapped) {
      tags.push(...mapped);
    }
  }

  return tags;
}

function uniqueRiskTags(tags: RiskTag[]): RiskTag[] {
  return [...new Set(tags)];
}

function extractFirstHttpUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"')\]]+/i);
  if (!match) {
    return null;
  }

  try {
    const parsed = new URL(match[0]);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function isPipelineArticleLike(value: unknown): value is PipelineArticleLike {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybe = value as Partial<PipelineArticleLike>;
  return Boolean(
    maybe.id &&
      maybe.source_id &&
      maybe.title &&
      maybe.summary &&
      maybe.published_at &&
      maybe.raw_content &&
      isValidDate(maybe.published_at)
  );
}

function mergeByLink(entries: NewsEntry[]): NewsEntry[] {
  const byLink = new Map<string, NewsEntry>();

  for (const entry of entries) {
    const key = normalizeLink(entry.link);
    const existing = byLink.get(key);
    if (!existing || existing.publishedAt < entry.publishedAt) {
      byLink.set(key, entry);
    }
  }

  return [...byLink.values()];
}

function normalizeLink(link: string): string {
  return link.trim().toLowerCase();
}

async function readJsonArray(filePath: string): Promise<unknown[]> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch {
    return [];
  }
}
