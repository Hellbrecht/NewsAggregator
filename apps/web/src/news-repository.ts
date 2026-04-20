import { promises as fs } from "node:fs";
import path from "node:path";

import { classifyWaterRisk, NewsEntry, RiskTag } from "../../../packages/shared/src";
import { Source } from "../../../src/models/Source";
import { isPlaceholderArticleTitle, resolveArticleTitle } from "../../../src/analysis/article_title";
import { isWaterRelevantText, RelevanceProfile } from "../../../src/analysis/water_relevance";
import { loadRelevanceProfile } from "../../../src/services/relevance_profile_store";
import { loadSources } from "./source-config";

const DEFAULT_LEGACY_STORE_PATH = path.resolve(__dirname, "../../../data/news-entries.json");
const DEFAULT_PIPELINE_ARTICLES_PATH = path.resolve(__dirname, "../../../data/ingested/articles.json");

const LEGACY_STORE_PATH = path.resolve(process.env.NEWS_ENTRIES_PATH ?? DEFAULT_LEGACY_STORE_PATH);
const PIPELINE_ARTICLES_PATH = path.resolve(
  process.env.PIPELINE_ARTICLES_PATH ?? DEFAULT_PIPELINE_ARTICLES_PATH
);

export async function loadEntries(): Promise<NewsEntry[]> {
  const sources = await loadSources();
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const [legacyEntries, pipelineEntries] = await Promise.all([
    loadLegacyEntries(sourceById),
    loadPipelineEntries(sourceById)
  ]);
  return mergeByLink([...legacyEntries, ...pipelineEntries]).sort(byNewestFirst);
}

async function loadLegacyEntries(sourceById: Map<string, Source>): Promise<NewsEntry[]> {
  const parsed = await readJsonArray(LEGACY_STORE_PATH);
  return parsed
    .filter(isEntryLike)
    .map((entry) => withSourceMetadata(entry, sourceById))
    .filter((entry) => isWaterRelevantText(`${entry.title} ${entry.summary}`));
}

async function loadPipelineEntries(sourceById: Map<string, Source>): Promise<NewsEntry[]> {
  const relevanceProfile = await loadRelevanceProfile();
  const parsed = await readJsonArray(PIPELINE_ARTICLES_PATH);
  return parsed
    .filter(isPipelineArticleLike)
    .map((article) =>
      toNewsEntryFromPipelineArticle(article, relevanceProfile, sourceById.get(article.source_id))
    )
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
  region?: string;
  published_at: string;
  raw_content: string;
  risk_labels?: string[];
}

export function toNewsEntryFromPipelineArticle(
  article: PipelineArticleLike,
  relevanceProfile?: RelevanceProfile,
  source?: Source
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
    source: source?.name ?? article.source_id,
    region: normalizeOptionalText(article.region) ?? source?.region,
    locationLabel: inferCountryLabel(
      [article.title, article.summary, article.raw_content, source?.name, source?.region, link]
        .filter(Boolean)
        .join(" ")
    ),
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

function withSourceMetadata(entry: NewsEntry, sourceById: Map<string, Source>): NewsEntry {
  const source = sourceById.get(entry.source);
  if (!source) {
    return {
      ...entry,
      locationLabel:
        normalizeOptionalText(entry.locationLabel) ??
        inferCountryLabel([entry.title, entry.summary, entry.link, entry.source, entry.region].join(" "))
    };
  }

  return {
    ...entry,
    source: source.name,
    region: normalizeOptionalText(entry.region) ?? source.region,
    locationLabel:
      normalizeOptionalText(entry.locationLabel) ??
      inferCountryLabel([entry.title, entry.summary, entry.link, source.name, entry.region, source.region].join(" "))
  };
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function inferCountryLabel(value: string): string | undefined {
  const haystack = value.toLowerCase();
  if (!haystack.trim()) {
    return undefined;
  }

  const countryMatchers: Array<{ label: string; patterns: RegExp[] }> = [
    {
      label: "Canada",
      patterns: [
        /\bcanada\b/,
        /\bcanadian\b/,
        /\balberta\b/,
        /\bcalgary\b/,
        /\bedmonton\b/,
        /\bontario\b/,
        /\bquebec\b/,
        /\bmontreal\b/,
        /\btoronto\b/,
        /\bvancouver\b/,
        /\bottawa\b/,
        /\bmanitoba\b/,
        /\bsaskatchewan\b/,
        /\bnova scotia\b/,
        /\bnew brunswick\b/,
        /\bnewfoundland\b/,
        /\bprince edward island\b/,
        /\byukon\b/,
        /\bnunavut\b/,
        /\bnorthwest territories\b/
      ]
    },
    {
      label: "American",
      patterns: [
        /\bunited states\b/,
        /\busa\b/,
        /\bu\.s\.\b/,
        /\bamerican\b/,
        /\bcalifornia\b/,
        /\btexas\b/,
        /\bflorida\b/,
        /\bnew york\b/,
        /\bseattle\b/,
        /\blos angeles\b/,
        /\bchicago\b/
      ]
    },
    {
      label: "Australia",
      patterns: [
        /\baustralia\b/,
        /\baustralian\b/,
        /\bqueensland\b/,
        /\bbrisbane\b/,
        /\bsydney\b/,
        /\bmelbourne\b/,
        /\bdarwin\b/,
        /\bbundaberg\b/
      ]
    },
    {
      label: "UK",
      patterns: [/\bunited kingdom\b/, /\buk\b/, /\bbritain\b/, /\bbritish\b/, /\bengland\b/, /\blondon\b/]
    },
    { label: "France", patterns: [/\bfrance\b/, /\bfrench\b/, /\bparis\b/] },
    { label: "Germany", patterns: [/\bgermany\b/, /\bgerman\b/, /\bberlin\b/] },
    { label: "Japan", patterns: [/\bjapan\b/, /\bjapanese\b/, /\btokyo\b/] },
    { label: "China", patterns: [/\bchina\b/, /\bchinese\b/, /\bbeijing\b/] },
    { label: "India", patterns: [/\bindia\b/, /\bindian\b/, /\bdelhi\b/, /\bmumbai\b/] },
    { label: "Brazil", patterns: [/\bbrazil\b/, /\bbrazilian\b/, /\bsao paulo\b/] },
    { label: "Mexico", patterns: [/\bmexico\b/, /\bmexican\b/, /\bmexico city\b/] },
    {
      label: "South Africa",
      patterns: [/\bsouth africa\b/, /\bsouth african\b/, /\bcape town\b/, /\bjohannesburg\b/]
    }
  ];

  for (const matcher of countryMatchers) {
    if (matcher.patterns.some((pattern) => pattern.test(haystack))) {
      return matcher.label;
    }
  }

  return undefined;
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
