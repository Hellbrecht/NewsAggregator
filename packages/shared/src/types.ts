export type RiskTag =
  | "contamination"
  | "drought"
  | "flooding"
  | "infrastructure"
  | "quality-alert"
  | "pollution";

export interface NewsEntry {
  id: string;
  title: string;
  summary: string;
  link: string;
  source: string;
  region?: string;
  locationLabel?: string;
  publishedAt: string;
  riskTags: RiskTag[];
}

export interface MonitoredSite {
  id: string;
  name: string;
  url: string;
  rss?: string;
  intervalMinutes: number;
}

export interface DateGroup {
  date: string;
  count: number;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}
