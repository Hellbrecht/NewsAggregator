import { summarizeArticleCandidate } from "../analysis/ai_summarizer";
import { resolveArticleTitle } from "../analysis/article_title";
import { classifyRisk } from "../analysis/risk_classifier";
import { isWaterRelevantText, RelevanceProfile } from "../analysis/water_relevance";
import { Article } from "../models/Article";
import { Source } from "../models/Source";
import { computeContentHash } from "../services/deduplicator";
import { loadRelevanceProfile } from "../services/relevance_profile_store";
import { HttpStatusError } from "./rss_ingestor";

const REQUEST_TIMEOUT_MS = 20_000;
const USER_AGENT = "WaterNewsAggregator/0.1";

interface HtmlCandidate {
  title: string;
  link: string;
}

export async function fetchHtmlHeadlines(source: Source): Promise<Article[]> {
  const html = await fetchText(source.url);
  const relevanceProfile = await loadRelevanceProfile();
  return extractHtmlHeadlineArticles(html, source, relevanceProfile);
}

export function extractHtmlHeadlineArticles(
  html: string,
  source: Source,
  relevanceProfile?: RelevanceProfile
): Article[] {
  const anchors = parseAnchors(html, source.url);
  const articles: Article[] = [];
  const seenLinks = new Set<string>();

  for (const anchor of anchors) {
    if (seenLinks.has(anchor.link)) {
      continue;
    }

    seenLinks.add(anchor.link);
    if (!isWaterRelevantText(anchor.title, relevanceProfile)) {
      continue;
    }

    articles.push(toArticle(source, anchor));
  }

  return articles;
}

function toArticle(source: Source, candidate: HtmlCandidate): Article {
  const capturedAt = new Date().toISOString();
  const summary = summarizeArticleCandidate(
    candidate.title,
    `Detected water-relevant headline on ${source.name}.`
  );
  const resolvedTitle = resolveArticleTitle(
    candidate.title,
    summary,
    `Untitled from ${source.name}`
  );
  const dedupeHash = computeContentHash(source.id, candidate.link);
  const id = computeContentHash(source.id, candidate.link, capturedAt);

  return {
    id,
    dedupe_hash: dedupeHash,
    source_id: source.id,
    title: resolvedTitle,
    summary,
    published_at: capturedAt,
    region: source.region,
    topic: source.topic,
    raw_content: `${candidate.title}\n${candidate.link}`,
    risk_labels: classifyRisk(candidate.title)
  };
}

function parseAnchors(html: string, baseUrl: string): HtmlCandidate[] {
  const anchors: HtmlCandidate[] = [];
  const anchorPattern = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gims;

  let match = anchorPattern.exec(html);
  while (match) {
    const rawHref = (match[1] ?? "").trim();
    const rawTitle = match[2] ?? "";
    const title = stripTags(rawTitle).replace(/\s+/g, " ").trim();
    const link = toAbsoluteUrl(rawHref, baseUrl);

    if (title.length >= 8 && link) {
      anchors.push({ title, link });
    }

    match = anchorPattern.exec(html);
  }

  return anchors;
}

function stripTags(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function toAbsoluteUrl(url: string, base: string): string | null {
  try {
    const parsed = new URL(url, base);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
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
      throw new HttpStatusError(response.status, response.statusText);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}
