export type SourceCategory = "news" | "hydrology" | "satellite";

export interface SourceRetryPolicy {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryOnStatuses?: number[];
}

export interface Source {
  id: string;
  name: string;
  url: string;
  rss?: string;
  api?: string;
  topic: string;
  region: string;
  reliability_score: number;
  intervalMinutes: number;
  retryPolicy?: SourceRetryPolicy;
}

export interface CategorizedSource extends Source {
  category: SourceCategory;
}
