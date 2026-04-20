import { classifyWaterRisk, NewsEntry } from "../../../packages/shared/src";

interface ParsedAnchor {
  title: string;
  link: string;
}

interface ParsedFeedItem {
  title: string;
  summary: string;
  link: string;
  publishedAt: string;
}

export function extractRiskEntries(html: string, siteName: string, siteUrl: string): NewsEntry[] {
  const anchors = parseAnchors(html, siteUrl);
  const seenLinks = new Set<string>();
  const now = new Date().toISOString();
  const entries: NewsEntry[] = [];

  for (const anchor of anchors) {
    if (seenLinks.has(anchor.link)) {
      continue;
    }

    seenLinks.add(anchor.link);
    const riskTags = classifyWaterRisk(anchor.title);

    if (riskTags.length === 0) {
      continue;
    }

    entries.push({
      id: buildId(anchor.link),
      title: anchor.title,
      summary: `Detected ${riskTags.join(", ")} signal in source headline: "${anchor.title}".`,
      link: anchor.link,
      source: siteName,
      publishedAt: now,
      riskTags
    });
  }

  return entries;
}

export function extractRiskEntriesFromFeed(
  xml: string,
  siteName: string,
  feedUrl: string
): NewsEntry[] {
  const items = parseFeedItems(xml, feedUrl);
  const seenLinks = new Set<string>();
  const entries: NewsEntry[] = [];

  for (const item of items) {
    if (seenLinks.has(item.link)) {
      continue;
    }

    seenLinks.add(item.link);
    const riskTags = classifyWaterRisk(`${item.title} ${item.summary}`.trim());
    if (riskTags.length === 0) {
      continue;
    }

    entries.push({
      id: buildId(item.link),
      title: item.title,
      summary:
        item.summary || `Detected ${riskTags.join(", ")} signal in feed item: "${item.title}".`,
      link: item.link,
      source: siteName,
      publishedAt: item.publishedAt,
      riskTags
    });
  }

  return entries;
}

function parseAnchors(html: string, baseUrl: string): ParsedAnchor[] {
  const anchors: ParsedAnchor[] = [];
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

function parseFeedItems(xml: string, baseUrl: string): ParsedFeedItem[] {
  const entries = extractBlocks(xml, "item");
  const atomEntries = entries.length > 0 ? entries : extractBlocks(xml, "entry");

  return atomEntries
    .map((entry) => {
      const title = cleanText(extractTagValue(entry, "title"));
      const summary = cleanText(
        extractTagValue(entry, "description") ||
          extractTagValue(entry, "content:encoded") ||
          extractTagValue(entry, "summary") ||
          extractTagValue(entry, "content")
      );
      const link = toAbsoluteUrl(
        cleanText(extractTagValue(entry, "link") || extractAtomHref(entry)),
        baseUrl
      );
      const publishedAt = normalizeDate(
        extractTagValue(entry, "pubDate") ||
          extractTagValue(entry, "published") ||
          extractTagValue(entry, "updated")
      );

      if (!title || !link) {
        return null;
      }

      return {
        title,
        summary,
        link,
        publishedAt
      };
    })
    .filter((item): item is ParsedFeedItem => item !== null);
}

function extractBlocks(value: string, tagName: string): string[] {
  const blocks: string[] = [];
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  let match = pattern.exec(value);

  while (match) {
    blocks.push(match[1] ?? "");
    match = pattern.exec(value);
  }

  return blocks;
}

function extractTagValue(block: string, tagName: string): string {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i");
  return pattern.exec(block)?.[1]?.trim() ?? "";
}

function extractAtomHref(block: string): string {
  const match = /<link[^>]+href=["']([^"']+)["'][^>]*>/i.exec(block);
  return match?.[1]?.trim() ?? "";
}

function stripTags(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function cleanText(value: string): string {
  return stripTags(value).replace(/\s+/g, " ").trim();
}

function normalizeDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
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

function buildId(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return `entry-${Math.abs(hash)}`;
}
