import { fetchApiDataset } from "../ingestion/api_ingestor";
import { fetchRSS } from "../ingestion/rss_ingestor";
import { fetchSatelliteDataset } from "../ingestion/satellite_ingestor";
import { Article } from "../models/Article";
import { DatasetEvent } from "../models/Dataset";
import { CategorizedSource } from "../models/Source";
import { logEvent } from "./logger";
import { appendArticles, appendDatasetEvents } from "./output_store";
import { loadSourcesWithReport } from "./source_loader";

const DEFAULT_TICK_MS = 60_000;
const MAX_PARALLEL_INGESTIONS = 8;

export interface SourceRunResult {
  sourceId: string;
  sourceName: string;
  category: string;
  foundArticles: number;
  foundDatasetEvents: number;
  insertedArticles: number;
  insertedDatasetEvents: number;
  durationMs: number;
  error?: string;
}

export interface PipelineRunSummary {
  startedAt: string;
  finishedAt: string;
  totalSources: number;
  dueSources: number;
  results: SourceRunResult[];
}

export async function runPipelineOnce(forceAll = true): Promise<PipelineRunSummary> {
  const lastRunBySource = new Map<string, number>();
  return runPipelineCycle(lastRunBySource, forceAll);
}

export function startScheduler(tickMs = DEFAULT_TICK_MS): void {
  const lastRunBySource = new Map<string, number>();
  let running = false;

  const run = async () => {
    if (running) {
      logEvent("warn", "pipeline.health", "Skipping cycle because previous run is still active.");
      return;
    }

    running = true;
    try {
      const summary = await runPipelineCycle(lastRunBySource, false);
      logEvent("info", "pipeline.health", "Scheduler cycle completed.", {
        totalSources: summary.totalSources,
        dueSources: summary.dueSources
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logEvent("error", "pipeline.error", "Scheduler cycle failed.", { error: message });
    } finally {
      running = false;
    }
  };

  void run();
  setInterval(() => {
    void run();
  }, tickMs);

  logEvent("info", "pipeline.health", "Scheduler started.", { tickMs });
}

async function runPipelineCycle(
  lastRunBySource: Map<string, number>,
  forceAll: boolean
): Promise<PipelineRunSummary> {
  const startedAtIso = new Date().toISOString();
  const startedAtMs = Date.now();
  const { sources, issues } = await loadSourcesWithReport();

  if (issues.length > 0) {
    for (const issue of issues) {
      logEvent("warn", "source.validation", issue.reason, {
        file: issue.file,
        index: issue.index,
        id: issue.id
      });
    }
  }

  const now = Date.now();
  const dueSources = sources.filter(
    (source) => forceAll || isDue(source, lastRunBySource.get(source.id), now)
  );

  const results = await runWithConcurrency(dueSources, MAX_PARALLEL_INGESTIONS, async (source) => {
    const result = await ingestSingleSource(source);
    if (!result.error) {
      lastRunBySource.set(source.id, now);
    }

    return result;
  });

  const finishedAtIso = new Date().toISOString();
  const durationMs = Date.now() - startedAtMs;
  logEvent("info", "pipeline.ingestion", "Cycle ingestion finished.", {
    totalSources: sources.length,
    dueSources: dueSources.length,
    durationMs
  });

  return {
    startedAt: startedAtIso,
    finishedAt: finishedAtIso,
    totalSources: sources.length,
    dueSources: dueSources.length,
    results
  };
}

async function ingestSingleSource(source: CategorizedSource): Promise<SourceRunResult> {
  const start = Date.now();

  try {
    const articles: Article[] = [];
    const datasetEvents: DatasetEvent[] = [];

    if (source.rss) {
      const rssArticles = await fetchRSS(source);
      articles.push(...rssArticles);
    } else if (source.category === "hydrology") {
      const events = await fetchApiDataset(source);
      datasetEvents.push(...events);
    } else if (source.category === "satellite") {
      const events = await fetchSatelliteDataset(source);
      datasetEvents.push(...events);
    } else if (source.api) {
      const events = await fetchApiDataset(source);
      datasetEvents.push(...events);
    }

    const insertedArticles = await appendArticles(articles);
    const insertedDatasetEvents = await appendDatasetEvents(datasetEvents);
    const durationMs = Date.now() - start;

    logEvent("info", "pipeline.ingestion", "Source ingested.", {
      sourceId: source.id,
      sourceName: source.name,
      category: source.category,
      foundArticles: articles.length,
      foundDatasetEvents: datasetEvents.length,
      insertedArticles,
      insertedDatasetEvents,
      durationMs
    });

    return {
      sourceId: source.id,
      sourceName: source.name,
      category: source.category,
      foundArticles: articles.length,
      foundDatasetEvents: datasetEvents.length,
      insertedArticles,
      insertedDatasetEvents,
      durationMs
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - start;

    if (message.includes("429")) {
      logEvent("warn", "pipeline.rate_limit", "Rate limit encountered.", {
        sourceId: source.id,
        sourceName: source.name,
        error: message
      });
    } else {
      logEvent("error", "pipeline.error", "Source ingestion failed.", {
        sourceId: source.id,
        sourceName: source.name,
        error: message
      });
    }

    return {
      sourceId: source.id,
      sourceName: source.name,
      category: source.category,
      foundArticles: 0,
      foundDatasetEvents: 0,
      insertedArticles: 0,
      insertedDatasetEvents: 0,
      durationMs,
      error: message
    };
  }
}

function isDue(source: CategorizedSource, lastRunMs: number | undefined, nowMs: number): boolean {
  if (!lastRunMs) {
    return true;
  }

  return nowMs - lastRunMs >= source.intervalMinutes * 60_000;
}

async function runWithConcurrency<TInput, TResult>(
  inputs: TInput[],
  concurrency: number,
  worker: (input: TInput) => Promise<TResult>
): Promise<TResult[]> {
  if (inputs.length === 0) {
    return [];
  }

  const maxParallel = Math.max(1, concurrency);
  const results: TResult[] = new Array(inputs.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < inputs.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await worker(inputs[current]);
    }
  }

  const workers = Array.from({ length: Math.min(maxParallel, inputs.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

async function runCli(): Promise<void> {
  const once = process.argv.includes("--once");
  if (once) {
    const summary = await runPipelineOnce(true);
    logEvent("info", "pipeline.health", "One-time pipeline run completed.", {
      totalSources: summary.totalSources,
      dueSources: summary.dueSources
    });
    return;
  }

  startScheduler();
}

if (require.main === module) {
  void runCli().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    logEvent("error", "pipeline.error", "Pipeline process crashed.", { error: message });
    process.exitCode = 1;
  });
}
