import { RiskCategory } from "../../../src/analysis/risk_classifier";
import {
  FeedItem,
  CombinedFeedQuery,
  CombinedFeedResponse,
  FeedSort,
  ItemDetailsResponse,
  ItemStateMap
} from "./feed-types";
import { loadFeedSnapshot } from "./feed-store";
import { loadItemStateMap, resolveItemState } from "./item-state-store";

const RISK_TAGS: RiskCategory[] = [
  "drought",
  "flood",
  "pollution",
  "infrastructure risk",
  "water conflict",
  "irrigation stress"
];

const VALID_TYPES = new Set(["NEWS", "DATA", "BOTH"]);
const VALID_SORTS = new Set<FeedSort>(["newest", "risk"]);
const MAX_LIMIT = 200;

type CursorToken =
  | {
      sort: "newest";
      timestamp: string;
      id: string;
    }
  | {
      sort: "risk";
      riskScore: number;
      timestamp: string;
      id: string;
    };

export function parseCombinedFeedQuery(url: URL): CombinedFeedQuery {
  const tags = parseTagList(url.searchParams.get("tags"));
  const type = normalizeType(url.searchParams.get("type"));
  const sort = normalizeSort(url.searchParams.get("sort"));
  const limit = clampInt(url.searchParams.get("limit"), 50, 1, MAX_LIMIT);
  const minReliability = clampInt(url.searchParams.get("minReliability"), 0, 0, 10);
  const minRisk = clampInt(url.searchParams.get("minRisk"), 0, 0, 100);

  return {
    from: normalizeDateString(url.searchParams.get("from")),
    to: normalizeDateString(url.searchParams.get("to")),
    tags: tags.length > 0 ? tags : undefined,
    region: normalizeText(url.searchParams.get("region")),
    topic: normalizeText(url.searchParams.get("topic")),
    type,
    minReliability,
    minRisk,
    search: normalizeText(url.searchParams.get("search")),
    limit,
    cursor: normalizeText(url.searchParams.get("cursor")),
    sort
  };
}

export async function getCombinedFeed(query: CombinedFeedQuery): Promise<CombinedFeedResponse> {
  const [snapshot, states] = await Promise.all([loadFeedSnapshot(), loadItemStateMap()]);
  const withState = snapshot.items.map((item) => applyState(item, states));
  const visible = withState.filter((item) => item.relevanceFeedback !== "down");
  const filtered = visible.filter((item) => matchesQuery(item, query));
  const sorted = filtered.sort(query.sort === "risk" ? compareRiskFirst : compareNewestFirst);
  const cursor = decodeCursor(query.cursor, query.sort);
  const afterCursor = cursor ? sorted.filter((item) => isAfterCursor(item, cursor, query.sort)) : sorted;

  const pageItems = afterCursor.slice(0, query.limit);
  const hasMore = afterCursor.length > pageItems.length;
  const nextCursor = hasMore && pageItems.length > 0 ? encodeCursor(pageItems[pageItems.length - 1], query.sort) : undefined;

  return {
    items: pageItems,
    nextCursor,
    stats: {
      total: visible.length,
      filtered: filtered.length,
      byType: {
        NEWS: filtered.filter((item) => item.type === "NEWS").length,
        DATA: filtered.filter((item) => item.type === "DATA").length
      },
      regions: uniqueSorted(filtered.map((item) => item.region)),
      topics: uniqueSorted(filtered.map((item) => item.topic)),
      tags: uniqueRiskTags(filtered.flatMap((item) => item.riskTags))
    }
  };
}

export async function getItemDetails(id: string): Promise<ItemDetailsResponse> {
  const itemId = id.trim();
  if (!itemId) {
    return { item: null, related: [], duplicates: [] };
  }

  const [snapshot, states] = await Promise.all([loadFeedSnapshot(), loadItemStateMap()]);
  const items = snapshot.items
    .map((item) => applyState(item, states))
    .filter((item) => item.relevanceFeedback !== "down");
  const item = items.find((entry) => entry.id === itemId) ?? null;
  if (!item) {
    return { item: null, related: [], duplicates: [] };
  }

  const duplicates = items
    .filter((candidate) => candidate.id !== item.id && candidate.dedupeHash === item.dedupeHash)
    .sort(compareNewestFirst)
    .slice(0, 50);

  const sameRegion = items.filter((candidate) => candidate.id !== item.id && candidate.region === item.region);
  const withOverlap = sameRegion.filter(
    (candidate) => hasTagOverlap(item, candidate) && isWithinDays(item.timestamp, candidate.timestamp, 7)
  );

  const related = (withOverlap.length > 0 ? withOverlap : sameRegion)
    .sort((left, right) => compareRelated(item, left, right))
    .slice(0, 50);

  return { item, related, duplicates };
}

function applyState(item: FeedItem, stateMap: ItemStateMap): FeedItem {
  const state = resolveItemState(stateMap, item.id);
  return {
    ...item,
    reviewed: state.reviewed,
    starred: state.starred,
    relevanceFeedback: state.relevanceFeedback
  };
}

function matchesQuery(item: FeedItem, query: CombinedFeedQuery): boolean {
  if (query.type !== "BOTH" && item.type !== query.type) {
    return false;
  }

  if (query.minReliability !== undefined && item.sourceReliability < query.minReliability) {
    return false;
  }

  if (query.minRisk !== undefined && item.riskScore < query.minRisk) {
    return false;
  }

  if (query.region && item.region.toLowerCase() !== query.region.toLowerCase()) {
    return false;
  }

  if (query.topic && item.topic.toLowerCase() !== query.topic.toLowerCase()) {
    return false;
  }

  if (query.tags && query.tags.length > 0) {
    const overlaps = query.tags.some((tag) => item.riskTags.includes(tag as RiskCategory));
    if (!overlaps) {
      return false;
    }
  }

  if (query.search) {
    const haystack = `${item.title} ${item.summary} ${item.sourceName}`.toLowerCase();
    if (!haystack.includes(query.search.toLowerCase())) {
      return false;
    }
  }

  const fromMs = query.from ? Date.parse(query.from) : null;
  if (fromMs !== null && Number.isFinite(fromMs) && Date.parse(item.timestamp) < fromMs) {
    return false;
  }

  const toMs = query.to ? Date.parse(query.to) : null;
  if (toMs !== null && Number.isFinite(toMs) && Date.parse(item.timestamp) > toMs) {
    return false;
  }

  return true;
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

function compareRiskFirst(a: FeedItem, b: FeedItem): number {
  if (a.riskScore !== b.riskScore) {
    return a.riskScore < b.riskScore ? 1 : -1;
  }

  return compareNewestFirst(a, b);
}

function compareRelated(base: FeedItem, left: FeedItem, right: FeedItem): number {
  const leftOverlap = overlapCount(base.riskTags, left.riskTags);
  const rightOverlap = overlapCount(base.riskTags, right.riskTags);
  if (leftOverlap !== rightOverlap) {
    return leftOverlap < rightOverlap ? 1 : -1;
  }

  const leftDistance = Math.abs(Date.parse(base.timestamp) - Date.parse(left.timestamp));
  const rightDistance = Math.abs(Date.parse(base.timestamp) - Date.parse(right.timestamp));
  if (leftDistance !== rightDistance) {
    return leftDistance > rightDistance ? 1 : -1;
  }

  return compareRiskFirst(left, right);
}

function hasTagOverlap(a: FeedItem, b: FeedItem): boolean {
  return overlapCount(a.riskTags, b.riskTags) > 0;
}

function overlapCount(a: RiskCategory[], b: RiskCategory[]): number {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  const lookup = new Set(a);
  let count = 0;
  for (const tag of b) {
    if (lookup.has(tag)) {
      count += 1;
    }
  }

  return count;
}

function isWithinDays(leftIso: string, rightIso: string, days: number): boolean {
  const leftMs = Date.parse(leftIso);
  const rightMs = Date.parse(rightIso);
  if (!Number.isFinite(leftMs) || !Number.isFinite(rightMs)) {
    return false;
  }

  const maxDistance = days * 24 * 60 * 60 * 1_000;
  return Math.abs(leftMs - rightMs) <= maxDistance;
}

function encodeCursor(item: FeedItem, sort: FeedSort): string {
  const payload: CursorToken =
    sort === "risk"
      ? {
          sort: "risk",
          riskScore: item.riskScore,
          timestamp: item.timestamp,
          id: item.id
        }
      : {
          sort: "newest",
          timestamp: item.timestamp,
          id: item.id
        };

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(raw: string | undefined, expectedSort: FeedSort): CursorToken | null {
  if (!raw) {
    return null;
  }

  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as Partial<CursorToken>;
    if (!parsed || parsed.sort !== expectedSort || typeof parsed.timestamp !== "string" || typeof parsed.id !== "string") {
      return null;
    }

    if (parsed.sort === "risk") {
      return {
        sort: "risk",
        riskScore: typeof parsed.riskScore === "number" ? parsed.riskScore : 0,
        timestamp: parsed.timestamp,
        id: parsed.id
      };
    }

    return {
      sort: "newest",
      timestamp: parsed.timestamp,
      id: parsed.id
    };
  } catch {
    return null;
  }
}

function isAfterCursor(item: FeedItem, cursor: CursorToken, sort: FeedSort): boolean {
  if (sort === "risk" && cursor.sort === "risk") {
    if (item.riskScore !== cursor.riskScore) {
      return item.riskScore < cursor.riskScore;
    }

    if (item.timestamp !== cursor.timestamp) {
      return item.timestamp < cursor.timestamp;
    }

    return item.id < cursor.id;
  }

  if (item.timestamp !== cursor.timestamp) {
    return item.timestamp < cursor.timestamp;
  }

  return item.id < cursor.id;
}

function parseTagList(value: string | null): RiskCategory[] {
  if (!value) {
    return [];
  }

  const normalized = value
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const set = new Set<RiskCategory>();

  for (const tag of normalized) {
    const matched = RISK_TAGS.find((candidate) => candidate === tag);
    if (matched) {
      set.add(matched);
    }
  }

  return [...set];
}

function normalizeText(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeDateString(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return new Date(parsed).toISOString();
}

function normalizeType(value: string | null): "NEWS" | "DATA" | "BOTH" {
  const normalized = value?.trim().toUpperCase() ?? "BOTH";
  if (!VALID_TYPES.has(normalized)) {
    return "BOTH";
  }

  return normalized as "NEWS" | "DATA" | "BOTH";
}

function normalizeSort(value: string | null): FeedSort {
  const normalized = value?.trim().toLowerCase() as FeedSort | undefined;
  if (!normalized || !VALID_SORTS.has(normalized)) {
    return "newest";
  }

  return normalized;
}

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function uniqueRiskTags(values: RiskCategory[]): RiskCategory[] {
  const ordered = new Set<RiskCategory>();
  for (const tag of RISK_TAGS) {
    if (values.includes(tag)) {
      ordered.add(tag);
    }
  }

  return [...ordered];
}
