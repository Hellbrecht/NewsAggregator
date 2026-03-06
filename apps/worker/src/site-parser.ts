import { classifyWaterRisk, NewsEntry } from "../../../packages/shared/src";

interface ParsedAnchor {
  title: string;
  link: string;
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

function buildId(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return `entry-${Math.abs(hash)}`;
}
