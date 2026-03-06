import { FetchRssOptions, fetchRSS, getHttpStatusFromError } from "../ingestion/rss_ingestor";
import { Article } from "../models/Article";
import { CategorizedSource } from "../models/Source";
import { logEvent } from "./logger";
import { UpsertArticlesResult, upsertArticles } from "./output_store";
import { LoadSourcesReport, loadSourcesWithReport } from "./source_loader";

const DEFAULT_BACKFILL_DAYS = 90;
const DEFAULT_MIN_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 1_500;
const DEFAULT_MAX_ATTEMPTS = 3;
const TERMINAL_HTTP_STATUSES = new Set([401, 403, 404, 405]);

export type BackfillSourceScope = "news" | "all";

export interface BackfillConfig {
  enabled: boolean;
  days: number;
  sources: BackfillSourceScope;
  maxPerSource?: number;
  minDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
}

export interface BackfillSourceMetrics {
  source_id: string;
  source_name: string;
  category: string;
  fetched_count: number;
  kept_in_window_count: number;
  inserted_count: number;
  deduped_count: number;
  errors: number;
}

export interface BackfillSummary {
  startedAt: string;
  finishedAt: string;
  days: number;
  sourceScope: BackfillSourceScope;
  sourceCount: number;
  sources: BackfillSourceMetrics[];
  totals: {
    fetched_count: number;
    kept_in_window_count: number;
    inserted_count: number;
    deduped_count: number;
    errors: number;
  };
}

export interface BackfillDependencies {
  loadSourcesWithReport?: () => Promise<LoadSourcesReport>;
  fetchRSS?: (source: CategorizedSource, options?: FetchRssOptions) => Promise<Article[]>;
  upsertArticles?: (articles: Article[]) => Promise<UpsertArticlesResult>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  randomInt?: (min: number, max: number) => number;
}

export async function runBackfill(
  config: BackfillConfig,
  dependencies: BackfillDependencies = {}
): Promise<BackfillSummary> {
  const loadSources = dependencies.loadSourcesWithReport ?? loadSourcesWithReport;
  const fetchRss = dependencies.fetchRSS ?? fetchRSS;
  const upsert = dependencies.upsertArticles ?? upsertArticles;
  const sleep = dependencies.sleep ?? wait;
  const now = dependencies.now ?? (() => new Date());
  const randomInt = dependencies.randomInt ?? randomBetween;

  const startedAt = now().toISOString();
  const emptySummary: BackfillSummary = {
    startedAt,
    finishedAt: startedAt,
    days: config.days,
    sourceScope: config.sources,
    sourceCount: 0,
    sources: [],
    totals: {
      fetched_count: 0,
      kept_in_window_count: 0,
      inserted_count: 0,
      deduped_count: 0,
      errors: 0
    }
  };

  if (!config.enabled) {
    logEvent("info", "pipeline.backfill", "Backfill disabled via BACKFILL_ENABLED.");
    return emptySummary;
  }

  const report = await loadSources();
  if (report.issues.length > 0) {
    for (const issue of report.issues) {
      logEvent("warn", "source.validation", issue.reason, {
        file: issue.file,
        index: issue.index,
        id: issue.id
      });
    }
  }

  const targets = selectBackfillSources(report.sources, config.sources);
  const summary: BackfillSummary = {
    ...emptySummary,
    sourceCount: targets.length
  };

  const referenceNow = now();
  for (let index = 0; index < targets.length; index += 1) {
    const source = targets[index];
    const metrics: BackfillSourceMetrics = {
      source_id: source.id,
      source_name: source.name,
      category: source.category,
      fetched_count: 0,
      kept_in_window_count: 0,
      inserted_count: 0,
      deduped_count: 0,
      errors: 0
    };

    try {
      const fetched = await fetchRss(source, {
        stopOnSeenHash: false,
        maxAttempts: config.maxAttempts,
        onWarning: (message, context) => {
          logEvent("warn", "pipeline.backfill.warning", message, {
            sourceId: source.id,
            sourceName: source.name,
            ...(context ?? {})
          });
        }
      });
      metrics.fetched_count = fetched.length;

      const inWindow = filterArticlesByWindow(fetched, config.days, referenceNow);
      metrics.kept_in_window_count = inWindow.length;
      const limited = applyMaxPerSourceGuard(inWindow, config.maxPerSource);
      const result = await upsert(limited);
      metrics.inserted_count = result.inserted;
      metrics.deduped_count = result.deduped;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = getHttpStatusFromError(error);
      metrics.errors = 1;

      if (status !== null && TERMINAL_HTTP_STATUSES.has(status)) {
        logEvent("warn", "pipeline.backfill.error", "Backfill source failed with terminal HTTP status.", {
          sourceId: source.id,
          sourceName: source.name,
          status,
          error: message
        });
      } else {
        logEvent("error", "pipeline.backfill.error", "Backfill source failed.", {
          sourceId: source.id,
          sourceName: source.name,
          status: status ?? undefined,
          error: message
        });
      }
    }

    logEvent("info", "pipeline.backfill.source", "Backfill source processed.", { ...metrics });
    summary.sources.push(metrics);
    summary.totals.fetched_count += metrics.fetched_count;
    summary.totals.kept_in_window_count += metrics.kept_in_window_count;
    summary.totals.inserted_count += metrics.inserted_count;
    summary.totals.deduped_count += metrics.deduped_count;
    summary.totals.errors += metrics.errors;

    if (index < targets.length - 1) {
      const delayMs = clampInt(
        randomInt(config.minDelayMs, config.maxDelayMs),
        config.minDelayMs,
        config.maxDelayMs
      );
      await sleep(delayMs);
    }
  }

  summary.finishedAt = now().toISOString();
  logEvent("info", "pipeline.backfill.summary", "Backfill completed.", {
    sourceCount: summary.sourceCount,
    fetched_count: summary.totals.fetched_count,
    kept_in_window_count: summary.totals.kept_in_window_count,
    inserted_count: summary.totals.inserted_count,
    deduped_count: summary.totals.deduped_count,
    errors: summary.totals.errors
  });
  return summary;
}

export function filterArticlesByWindow(
  articles: Article[],
  days: number,
  now: Date = new Date()
): Article[] {
  const thresholdMs = now.getTime() - clampInt(days, 1, 3_650) * 24 * 60 * 60 * 1_000;

  return articles
    .filter((article) => {
      const timestampMs = Date.parse(article.published_at);
      return Number.isFinite(timestampMs) && timestampMs >= thresholdMs;
    })
    .sort((left, right) => (left.published_at < right.published_at ? 1 : -1));
}

export function resolveBackfillConfig(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env
): BackfillConfig {
  const parsedArgs = parseBackfillArgs(argv);
  const enabled = parseOptionalBoolean(env.BACKFILL_ENABLED) ?? true;
  const days = clampInt(
    parsedArgs.days ?? parseOptionalPositiveInt(env.BACKFILL_DAYS) ?? DEFAULT_BACKFILL_DAYS,
    1,
    3_650
  );
  const sources = parsedArgs.sources ?? normalizeSourceScope(env.BACKFILL_SOURCES) ?? "news";
  const maxPerSource = parsedArgs.maxPerSource ?? parseOptionalPositiveInt(env.BACKFILL_MAX_PER_SOURCE);

  return {
    enabled,
    days,
    sources,
    maxPerSource,
    minDelayMs: DEFAULT_MIN_DELAY_MS,
    maxDelayMs: DEFAULT_MAX_DELAY_MS,
    maxAttempts: DEFAULT_MAX_ATTEMPTS
  };
}

export async function runBackfillCli(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env
): Promise<BackfillSummary> {
  const config = resolveBackfillConfig(argv, env);
  return runBackfill(config);
}

function applyMaxPerSourceGuard(articles: Article[], maxPerSource: number | undefined): Article[] {
  if (!maxPerSource || maxPerSource < 1) {
    return articles;
  }

  return articles.slice(0, maxPerSource);
}

function selectBackfillSources(
  sources: CategorizedSource[],
  scope: BackfillSourceScope
): CategorizedSource[] {
  if (scope === "all") {
    return sources.filter((source) => Boolean(source.rss));
  }

  return sources.filter((source) => source.category === "news" && Boolean(source.rss));
}

function parseBackfillArgs(argv: string[]): {
  days?: number;
  sources?: BackfillSourceScope;
  maxPerSource?: number;
} {
  const parsed: {
    days?: number;
    sources?: BackfillSourceScope;
    maxPerSource?: number;
  } = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value.startsWith("--days=")) {
      parsed.days = parseOptionalPositiveInt(value.slice("--days=".length));
      continue;
    }

    if (value === "--days") {
      parsed.days = parseOptionalPositiveInt(argv[index + 1]);
      index += 1;
      continue;
    }

    if (value.startsWith("--sources=")) {
      parsed.sources = normalizeSourceScope(value.slice("--sources=".length));
      continue;
    }

    if (value === "--sources") {
      parsed.sources = normalizeSourceScope(argv[index + 1]);
      index += 1;
      continue;
    }

    if (value.startsWith("--maxPerSource=")) {
      parsed.maxPerSource = parseOptionalPositiveInt(value.slice("--maxPerSource=".length));
      continue;
    }

    if (value === "--maxPerSource") {
      parsed.maxPerSource = parseOptionalPositiveInt(argv[index + 1]);
      index += 1;
    }
  }

  return parsed;
}

function normalizeSourceScope(value: string | undefined): BackfillSourceScope | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "news" || normalized === "all") {
    return normalized;
  }

  return undefined;
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function parseOptionalPositiveInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.round(parsed);
}

function clampInt(value: number, min: number, max: number): number {
  const rounded = Number.isFinite(value) ? Math.round(value) : min;
  return Math.min(max, Math.max(min, rounded));
}

function randomBetween(min: number, max: number): number {
  const floorMin = Math.min(min, max);
  const floorMax = Math.max(min, max);
  return floorMin + Math.floor(Math.random() * (floorMax - floorMin + 1));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (require.main === module) {
  void runBackfillCli().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    logEvent("error", "pipeline.backfill.error", "Backfill process crashed.", { error: message });
    process.exitCode = 1;
  });
}
