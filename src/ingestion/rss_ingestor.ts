import { summarizeArticleCandidate } from "../analysis/ai_summarizer";
import { resolveArticleTitle } from "../analysis/article_title";
import { classifyRisk } from "../analysis/risk_classifier";
import { isWaterRelevantText } from "../analysis/water_relevance";
import { Article } from "../models/Article";
import { Source, SourceRetryPolicy } from "../models/Source";
import { computeContentHash } from "../services/deduplicator";
import { loadRelevanceProfile } from "../services/relevance_profile_store";

const REQUEST_TIMEOUT_MS = 20_000;
const USER_AGENT = "rssbot/1.0";
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 300;
const DEFAULT_MAX_DELAY_MS = 5_000;
const DEFAULT_RETRY_STATUSES = [408, 425, 429, 500, 502, 503, 504];
const NON_RETRYABLE_STATUSES = new Set([401, 403, 404, 405]);

export interface FetchRssOptions {
  stopOnSeenHash?: boolean;
  seenHashes?: Set<string>;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryOnStatuses?: number[];
  onWarning?: (message: string, context?: Record<string, unknown>) => void;
}

export class HttpStatusError extends Error {
  readonly status: number;
  readonly statusText: string;

  constructor(status: number, statusText: string) {
    super(`HTTP ${status} ${statusText}`);
    this.status = status;
    this.statusText = statusText;
  }
}

export async function fetchRSS(source: Source, options: FetchRssOptions = {}): Promise<Article[]> {
  if (!source.rss) {
    return [];
  }

  const xml = await fetchText(source.rss, source.retryPolicy, options);
  const candidates = extractRssEntries(xml);
  const relevanceProfile = await loadRelevanceProfile();
  const articles: Article[] = [];
  const seenInBatch = new Set<string>();

  for (const candidate of candidates) {
    if (isMalformedCandidate(candidate)) {
      warn(options, "Skipping malformed RSS entry.", {
        sourceId: source.id,
        sourceName: source.name
      });
      continue;
    }

    try {
      const text = `${candidate.title} ${candidate.body}`.trim();
      if (!isWaterRelevantText(text, relevanceProfile)) {
        continue;
      }

      const article = toArticle(source, candidate);
      const dedupeKey = article.dedupe_hash ?? article.id;
      if (seenInBatch.has(dedupeKey)) {
        continue;
      }

      if (options.stopOnSeenHash && options.seenHashes?.has(dedupeKey)) {
        break;
      }

      seenInBatch.add(dedupeKey);
      articles.push(article);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warn(options, "Skipping malformed RSS entry.", {
        sourceId: source.id,
        sourceName: source.name,
        error: message
      });
    }
  }

  return articles;
}

interface RssCandidate {
  title: string;
  body: string;
  link: string;
  publishedAt: string;
}

export function getHttpStatusFromError(error: unknown): number | null {
  if (error instanceof HttpStatusError) {
    return error.status;
  }

  if (!(error instanceof Error)) {
    return null;
  }

  const match = /HTTP\s+(\d{3})/.exec(error.message);
  if (!match) {
    return null;
  }

  return Number(match[1]);
}

function toArticle(source: Source, candidate: RssCandidate): Article {
  const raw = [candidate.title, candidate.body, candidate.link].filter(Boolean).join("\n");
  const summary = summarizeArticleCandidate(candidate.title, candidate.body);
  const resolvedTitle = resolveArticleTitle(
    candidate.title,
    summary,
    `Untitled from ${source.name}`
  );
  const riskLabels = classifyRisk(`${candidate.title} ${candidate.body}`);
  const dedupeHash = computeContentHash(
    resolvedTitle,
    summary,
    candidate.publishedAt.slice(0, 10),
    source.region
  );
  const id = computeContentHash(
    source.id,
    candidate.link || resolvedTitle,
    candidate.publishedAt,
    dedupeHash
  );

  return {
    id,
    dedupe_hash: dedupeHash,
    source_id: source.id,
    title: resolvedTitle,
    summary,
    published_at: candidate.publishedAt,
    region: source.region,
    topic: source.topic,
    raw_content: raw,
    risk_labels: riskLabels
  };
}

function extractRssEntries(xml: string): RssCandidate[] {
  const items = extractBlocks(xml, "item");
  const entries = items.length > 0 ? items : extractBlocks(xml, "entry");

  return entries.map((entry) => {
    const title = extractTagValue(entry, "title");
    const description =
      extractTagValue(entry, "description") ||
      extractTagValue(entry, "content:encoded") ||
      extractTagValue(entry, "summary");
    const link = extractTagValue(entry, "link") || extractAtomHref(entry);
    const publishedAt = normalizeDate(
      extractTagValue(entry, "pubDate") ||
        extractTagValue(entry, "published") ||
        extractTagValue(entry, "updated")
    );

    return {
      title: clean(title),
      body: clean(description),
      link: clean(link),
      publishedAt
    };
  });
}

function extractBlocks(xml: string, tagName: string): string[] {
  const blocks: string[] = [];
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  let match = pattern.exec(xml);
  while (match) {
    blocks.push(match[1] ?? "");
    match = pattern.exec(xml);
  }

  return blocks;
}

function extractTagValue(block: string, tagName: string): string {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i");
  const match = pattern.exec(block);
  return match?.[1]?.trim() ?? "";
}

function extractAtomHref(block: string): string {
  const match = /<link[^>]+href=["']([^"']+)["'][^>]*>/i.exec(block);
  return match?.[1]?.trim() ?? "";
}

function isMalformedCandidate(candidate: RssCandidate): boolean {
  return !candidate.title && !candidate.body && !candidate.link;
}

function normalizeDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

function clean(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(
  url: string,
  sourceRetryPolicy: SourceRetryPolicy | undefined,
  options: FetchRssOptions
): Promise<string> {
  const policy = resolveRetryPolicy(sourceRetryPolicy, options);
  let waitMs = policy.baseDelayMs;
  let lastError: unknown = new Error("RSS fetch failed.");

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try {
      return await fetchTextOnce(url);
    } catch (error) {
      lastError = error;
      const status = getHttpStatusFromError(error);
      const reachedMaxAttempts = attempt >= policy.maxAttempts;
      const retryable =
        !reachedMaxAttempts && shouldRetryRequest(error, status, policy.retryOnStatuses);

      if (!retryable) {
        throw error;
      }

      await sleep(waitMs);
      waitMs = Math.min(policy.maxDelayMs, waitMs * 2);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function fetchTextOnce(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT }
    });

    if (!response.ok) {
      throw new HttpStatusError(response.status, response.statusText);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function resolveRetryPolicy(
  sourceRetryPolicy: SourceRetryPolicy | undefined,
  options: FetchRssOptions
): {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryOnStatuses: Set<number>;
} {
  const maxAttempts = clampInt(
    options.maxAttempts ?? sourceRetryPolicy?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    1,
    10
  );
  const baseDelayMs = clampInt(
    options.baseDelayMs ?? sourceRetryPolicy?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
    50,
    60_000
  );
  const maxDelayMs = clampInt(
    options.maxDelayMs ?? sourceRetryPolicy?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS,
    baseDelayMs,
    600_000
  );
  const statuses =
    options.retryOnStatuses ??
    sourceRetryPolicy?.retryOnStatuses ??
    DEFAULT_RETRY_STATUSES;

  return {
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    retryOnStatuses: new Set(statuses)
  };
}

function shouldRetryRequest(
  error: unknown,
  status: number | null,
  retryOnStatuses: Set<number>
): boolean {
  if (status !== null) {
    if (NON_RETRYABLE_STATUSES.has(status)) {
      return false;
    }

    return retryOnStatuses.has(status);
  }

  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }

  return true;
}

function clampInt(value: number, min: number, max: number): number {
  const rounded = Number.isFinite(value) ? Math.round(value) : min;
  return Math.min(max, Math.max(min, rounded));
}

function warn(
  options: FetchRssOptions,
  message: string,
  context?: Record<string, unknown>
): void {
  if (!options.onWarning) {
    return;
  }

  options.onWarning(message, context);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
