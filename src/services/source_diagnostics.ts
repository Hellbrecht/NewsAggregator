import { fetchApiDataset } from "../ingestion/api_ingestor";
import { fetchRSS, getHttpStatusFromError } from "../ingestion/rss_ingestor";
import { fetchSatelliteDataset } from "../ingestion/satellite_ingestor";
import { CategorizedSource } from "../models/Source";
import { loadSourcesWithReport } from "./source_loader";

type DiagnoseMode = "rss" | "api" | "satellite";

interface SourceDiagnosis {
  id: string;
  name: string;
  category: string;
  mode: DiagnoseMode;
  endpoint: string;
  ok: boolean;
  count: number;
  durationMs: number;
  status?: number;
  error?: string;
  warning?: string;
}

interface DiagnosticsSummary {
  startedAt: string;
  finishedAt: string;
  totalSources: number;
  failedSources: number;
  statusBreakdown: Record<string, number>;
  sourceValidationIssues: number;
  results: SourceDiagnosis[];
}

export async function runSourceDiagnostics(): Promise<DiagnosticsSummary> {
  const startedAt = new Date().toISOString();
  const report = await loadSourcesWithReport();
  const results: SourceDiagnosis[] = [];

  for (const source of report.sources) {
    results.push(await diagnoseSource(source));
  }

  const failures = results.filter((result) => !result.ok);
  const statusBreakdown = failures.reduce<Record<string, number>>((acc, result) => {
    const key = result.status ? String(result.status) : "network_or_other";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    totalSources: results.length,
    failedSources: failures.length,
    statusBreakdown,
    sourceValidationIssues: report.issues.length,
    results
  };
}

async function diagnoseSource(source: CategorizedSource): Promise<SourceDiagnosis> {
  const endpoint = source.rss ?? source.api ?? source.url;
  const mode = resolveMode(source);
  const start = Date.now();

  try {
    let count = 0;
    if (mode === "rss") {
      count = (await fetchRSS(source, { maxAttempts: 1 })).length;
    } else if (mode === "satellite") {
      count = (await fetchSatelliteDataset(source)).length;
    } else {
      count = (await fetchApiDataset(source)).length;
    }

    return {
      id: source.id,
      name: source.name,
      category: source.category,
      mode,
      endpoint,
      ok: true,
      count,
      durationMs: Date.now() - start,
      warning: count === 0 ? "Source reachable but returned zero records." : undefined
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = getHttpStatusFromError(error);

    return {
      id: source.id,
      name: source.name,
      category: source.category,
      mode,
      endpoint,
      ok: false,
      count: 0,
      durationMs: Date.now() - start,
      status: status ?? undefined,
      error: message
    };
  }
}

function resolveMode(source: CategorizedSource): DiagnoseMode {
  if (source.rss) {
    return "rss";
  }

  if (source.category === "satellite") {
    return "satellite";
  }

  return "api";
}

async function runCli(): Promise<void> {
  const summary = await runSourceDiagnostics();
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (summary.failedSources > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void runCli().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
