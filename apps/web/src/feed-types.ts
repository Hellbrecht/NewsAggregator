import { Article } from "../../../src/models/Article";
import { RiskCategory } from "../../../src/analysis/risk_classifier";
import { DatasetEvent } from "../../../src/models/Dataset";

export type FeedItemType = "NEWS" | "DATA";
export type FeedSort = "newest" | "risk";
export type RelevanceFeedback = "up" | "down" | null;

export interface FeedItem {
  id: string;
  type: FeedItemType;
  dedupeHash: string;
  sourceId: string;
  sourceName: string;
  sourceReliability: number;
  timestamp: string;
  region: string;
  topic: string;
  title: string;
  summary: string;
  riskTags: RiskCategory[];
  riskScore: number;
  originalUrl?: string;
  reviewed: boolean;
  starred: boolean;
  relevanceFeedback: RelevanceFeedback;
  article?: Article;
  datasetEvent?: DatasetEvent;
}

export interface ItemState {
  reviewed: boolean;
  starred: boolean;
  relevanceFeedback: RelevanceFeedback;
  updatedAt: string;
}

export type ItemStateMap = Record<string, ItemState>;

export interface CombinedFeedQuery {
  from?: string;
  to?: string;
  tags?: string[];
  region?: string;
  topic?: string;
  type: "NEWS" | "DATA" | "BOTH";
  minReliability?: number;
  minRisk?: number;
  search?: string;
  limit: number;
  cursor?: string;
  sort: FeedSort;
}

export interface FeedStats {
  total: number;
  filtered: number;
  byType: Record<FeedItemType, number>;
  regions: string[];
  topics: string[];
  tags: RiskCategory[];
}

export interface CombinedFeedResponse {
  items: FeedItem[];
  nextCursor?: string;
  stats: FeedStats;
}

export interface ItemDetailsResponse {
  item: FeedItem | null;
  related: FeedItem[];
  duplicates: FeedItem[];
}
