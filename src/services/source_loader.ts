import { promises as fs } from "node:fs";
import path from "node:path";

import { CategorizedSource, SourceCategory, SourceRetryPolicy } from "../models/Source";

const DATA_SOURCE_FILES: Record<SourceCategory, string> = {
  news: "news_sources.json",
  hydrology: "hydrology_sources.json",
  satellite: "satellite_sources.json"
};

const DATA_SOURCE_DIR = path.resolve(__dirname, "../../data_sources");

export interface ValidationIssue {
  file: string;
  index: number;
  reason: string;
  id?: string;
}

export interface LoadSourcesReport {
  sources: CategorizedSource[];
  issues: ValidationIssue[];
}

export async function loadSources(): Promise<CategorizedSource[]> {
  const report = await loadSourcesWithReport();
  return report.sources;
}

export async function loadSourcesWithReport(): Promise<LoadSourcesReport> {
  const categories = Object.keys(DATA_SOURCE_FILES) as SourceCategory[];
  const loaded = await Promise.all(categories.map((category) => loadFileForCategory(category)));

  const issues: ValidationIssue[] = [];
  const sources: CategorizedSource[] = [];
  const seenIds = new Set<string>();

  for (const batch of loaded) {
    for (let index = 0; index < batch.records.length; index += 1) {
      const record = batch.records[index];
      const validated = validateSourceRecord(record, batch.category, batch.fileName, index);
      if (!validated.source) {
        issues.push(validated.issue);
        continue;
      }

      if (seenIds.has(validated.source.id)) {
        issues.push({
          file: batch.fileName,
          index,
          id: validated.source.id,
          reason: "Duplicate source id across datasets."
        });
        continue;
      }

      seenIds.add(validated.source.id);
      sources.push(validated.source);
    }
  }

  return { sources, issues };
}

interface LoadedFile {
  category: SourceCategory;
  fileName: string;
  records: unknown[];
}

async function loadFileForCategory(category: SourceCategory): Promise<LoadedFile> {
  const fileName = DATA_SOURCE_FILES[category];
  const fullPath = path.join(DATA_SOURCE_DIR, fileName);
  const raw = await fs.readFile(fullPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid source file ${fileName}: expected array.`);
  }

  return { category, fileName, records: parsed };
}

interface ValidationResult {
  source?: CategorizedSource;
  issue: ValidationIssue;
}

function validateSourceRecord(
  value: unknown,
  category: SourceCategory,
  file: string,
  index: number
): ValidationResult {
  const baseIssue = { file, index, reason: "Invalid source record." };
  if (!value || typeof value !== "object") {
    return { issue: baseIssue };
  }

  const record = value as Record<string, unknown>;
  const id = normalizeRequiredString(record.id);
  const name = normalizeRequiredString(record.name);
  const url = normalizeRequiredString(record.url);
  const topic = normalizeRequiredString(record.topic);
  const region = normalizeRequiredString(record.region);
  const reliability = normalizeNumber(record.reliability_score);
  const interval = normalizeNumber(record.intervalMinutes);

  if (!id || !name || !url || !topic || !region || reliability === null || interval === null) {
    return {
      issue: {
        ...baseIssue,
        id,
        reason:
          "Missing one of required fields: id, name, url, topic, region, reliability_score, intervalMinutes."
      }
    };
  }

  if (!isSafeHttpUrl(url)) {
    return {
      issue: {
        ...baseIssue,
        id,
        reason: "Field url must be an http(s) URL."
      }
    };
  }

  const rss = normalizeOptionalString(record.rss);
  const api = normalizeOptionalString(record.api);
  const retryPolicy = normalizeRetryPolicy(record.retryPolicy);
  if (rss && !isSafeHttpUrl(rss)) {
    return {
      issue: {
        ...baseIssue,
        id,
        reason: "Field rss must be an http(s) URL when provided."
      }
    };
  }

  if (api && !isSafeHttpUrl(api)) {
    return {
      issue: {
        ...baseIssue,
        id,
        reason: "Field api must be an http(s) URL when provided."
      }
    };
  }

  if (retryPolicy === null) {
    return {
      issue: {
        ...baseIssue,
        id,
        reason:
          "Field retryPolicy must be an object with optional maxAttempts/baseDelayMs/maxDelayMs and retryOnStatuses (HTTP status codes)."
      }
    };
  }

  const normalized: CategorizedSource = {
    id,
    name,
    url,
    topic,
    region,
    reliability_score: clamp(Math.round(reliability), 1, 10),
    intervalMinutes: clamp(Math.round(interval), 1, 1440),
    category
  };

  if (rss) {
    normalized.rss = rss;
  }

  if (api) {
    normalized.api = api;
  }

  if (retryPolicy) {
    normalized.retryPolicy = retryPolicy;
  }

  return {
    source: normalized,
    issue: { file, index, id, reason: "" }
  };
}

function normalizeRequiredString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRetryPolicy(value: unknown): SourceRetryPolicy | null | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const policy: SourceRetryPolicy = {};

  if (Object.hasOwn(record, "maxAttempts")) {
    const parsed = normalizeInteger(record.maxAttempts, 1, 10);
    if (parsed === null) {
      return null;
    }

    policy.maxAttempts = parsed;
  }

  if (Object.hasOwn(record, "baseDelayMs")) {
    const parsed = normalizeInteger(record.baseDelayMs, 50, 60_000);
    if (parsed === null) {
      return null;
    }

    policy.baseDelayMs = parsed;
  }

  if (Object.hasOwn(record, "maxDelayMs")) {
    const parsed = normalizeInteger(record.maxDelayMs, 50, 600_000);
    if (parsed === null) {
      return null;
    }

    policy.maxDelayMs = parsed;
  }

  if (Object.hasOwn(record, "retryOnStatuses")) {
    const parsed = normalizeStatusCodeList(record.retryOnStatuses);
    if (parsed === null) {
      return null;
    }

    policy.retryOnStatuses = parsed;
  }

  if (Object.keys(policy).length === 0) {
    return undefined;
  }

  return policy;
}

function normalizeInteger(value: unknown, min: number, max: number): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return clamp(Math.round(parsed), min, max);
}

function normalizeStatusCodeList(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const unique = new Set<number>();
  for (const item of value) {
    const parsed = Number(item);
    if (!Number.isInteger(parsed) || parsed < 100 || parsed > 599) {
      return null;
    }

    unique.add(parsed);
  }

  return [...unique];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
