# Session Handoff

Last updated: 2026-03-11

## Project Status

Water Risk Intelligence Monitor is now a multi-surface app that combines:

- curated water-risk news,
- stock watchlist and quote monitoring,
- real-time hydrology monitoring,
- alerts derived from feed risk scoring,
- and a centralized ingestion pipeline that writes normalized JSON snapshots.

The repo no longer matches the earlier generic `apps/web` + `apps/worker` only description. The current structure has two parallel runtime tracks:

1. the current centralized pipeline under `src/`, backed by `data_sources/*.json` and `data/ingested/*`
2. the older worker/news-store path under `apps/worker`, still used for parts of the web app and manual scan flow

That split is important when making changes.

## Current Architecture

### Centralized ingestion pipeline

Primary source of normalized ingestion outputs:

- source config:
  - `data_sources/news_sources.json`
  - `data_sources/hydrology_sources.json`
  - `data_sources/satellite_sources.json`
  - `data_sources/stocks.json`
- pipeline modules:
  - `src/models`
  - `src/ingestion`
  - `src/analysis`
  - `src/services`

Main pipeline responsibilities:

- load and validate categorized sources,
- ingest RSS, HTML, API, and satellite inputs,
- classify and normalize articles / dataset events,
- append deduplicated outputs,
- persist structured pipeline logs,
- support one-shot runs, scheduler runs, backfill runs, and diagnostics.

Pipeline outputs currently land in:

- `data/ingested/articles.json`
- `data/ingested/dataset_events.json`
- `data/ingested/pipeline_logs.jsonl`
- `data/ingested/item_state.json` (created when UI state is written)

### Web app

`apps/web/src/server.ts` is the main HTTP server and serves:

- static pages:
  - `/` -> News
  - `/stocks`
  - `/hydrology`
  - `/alerts`
- API routes:
  - `GET /api/news`
  - `GET /api/combined-feed`
  - `GET /api/item/:id`
  - `POST /api/item/:id/reviewed`
  - `POST /api/item/:id/star`
  - `POST /api/item/:id/relevance`
  - `GET /api/health`
  - `GET /api/stocks`
  - `GET /api/stocks/watchlist`
  - `GET /api/stocks/symbol-search`
  - `GET /api/hydrology/realtime`
  - `GET /api/sources`
  - `POST /api/sources`
  - `DELETE /api/sources/:id`
  - `POST /api/scan-now`
  - `GET /health`

Web-side state/features now include:

- combined feed loading and filtering,
- item review/star state,
- relevance feedback (`up` / `down`) persisted to item state,
- learning feedback routed into `src/services/relevance_profile_store`,
- source-management UI/API,
- manual scan flow,
- stock watchlist + symbol search + quote lookup,
- real-time hydrology snapshot API and UI.

### Legacy worker path

`apps/worker` still exists and is not fully retired.

It currently:

- loads sites through `apps/worker/src/site-config.ts`,
- prefers unified news sources from `src/services/source_loader`,
- falls back to legacy `config/sites.json` for backward compatibility,
- writes/merges older news entry outputs through `apps/worker/src/news-store.ts`,
- powers parts of the legacy/manual scan path still referenced by the web app.

Treat this as a compatibility layer that still matters.

## Current Behavior

### Pipeline / source behavior

- `npm run pipeline:once` runs the centralized pipeline once.
- `npm run pipeline:start` runs the scheduler continuously.
- `npm run dev:pipeline` watches the scheduler during development.
- `npm run pipeline:backfill` runs the backfill runner.
- `npm run sources:diagnose` checks configured sources and reports failures by mode/status.

Important behavior already in place:

- malformed or unreachable sources are intended to fail visibly rather than silently ingest junk,
- pipeline source validation issues are logged but do not crash the whole run,
- per-source failures remain non-fatal to the overall pipeline run,
- rate-limit hits are logged distinctly when recognizable,
- diagnostics can be used to catch source drift before or between scheduled runs.

### News / feed behavior

- `/api/news` returns paginated news entries with date grouping and hides entries marked with relevance feedback `down`.
- `/api/combined-feed` provides the richer combined feed from normalized JSON snapshots.
- relevance feedback is persisted and used to update learning state.
- sidebar/date grouping and `Scan All` style source scan behavior are already part of the current UX.

### Stocks behavior

- stocks are exposed through dedicated API routes and a watchlist-backed UI.
- stock symbol alias handling exists for non-US/provider-specific lookup cases.
- quote-page symbol support is separate from display ticker.
- provider fallback logic exists in the stock quote service.

### Hydrology behavior

- `GET /api/hydrology/realtime` powers the Hydrology Live page.
- the app has provider-specific realtime coverage for North American public hydrology sources.
- refresh behavior and card-level presentation logic already exist in the current UI.

## Important Files To Read First

- `README.md`
- `AGENTS.md`
- `docs/architecture.md`
- `docs/data_pipeline.md`
- `docs/api.md`
- `docs/dashboard.md`
- `docs/ollama-rag-risk-scoring.md`
- `docs/session_diary.md`

For implementation entry points:

- `apps/web/src/server.ts`
- `apps/web/src/feed-store.ts`
- `apps/web/src/feed-service.ts`
- `apps/web/src/stocks-service.ts`
- `apps/web/src/hydrology-realtime-service.ts`
- `apps/web/src/item-state-store.ts`
- `apps/web/src/manual-scan.ts`
- `src/services/scheduler.ts`
- `src/services/source_loader.ts`
- `src/services/source_diagnostics.ts`

## Latest Known Validation State

This handoff update is documentation-only. The commands below were not rerun during this edit.

Latest recorded validations in repo docs/diary:

- `2026-03-09`
  - `npm test`: pass
  - `npm run build`: pass
  - `npm run lint`: pass
- earlier recorded validations also include:
  - `npm run pipeline:once`: pass
  - targeted hydrology test pass
  - targeted stocks tests pass

Use current repo state, not the older March 4 validation counts, as the reference point.

## Known Gaps / Next Priorities

1. Reduce the remaining architectural split between the centralized pipeline and the legacy worker/news-store path.
2. Add stronger retry/backoff and source-specific rate-limit handling in ingestors.
3. Improve per-source adapters so API/satellite/hydrology parsing is less generic.
4. Add better server-level integration coverage for the expanded `/api/*` surface.
5. Clarify auth/public-private boundaries if this moves beyond a trusted local deployment.
6. Replace or supplement JSON-file persistence with a more durable backend when scale or concurrency requires it.
7. Strengthen deduplication and ranking beyond current deterministic/hash-oriented behavior.

## Useful Commands

```bash
npm run dev
npm run dev:web
npm run dev:worker
npm run dev:pipeline
npm run pipeline:once
npm run pipeline:start
npm run pipeline:backfill
npm run sources:diagnose
npm run test
npm run lint
npm run build
```

## Prompt To Reuse In A New Chat

```text
Read docs/session_handoff.md first, then continue from the current repository state.

Goal:
Improve Water Risk Intelligence Monitor while preserving the current web app, stock/hydrology surfaces, and the centralized ingestion pipeline.

Current architecture notes:
- The main app surface is in apps/web/src/server.ts.
- The normalized ingestion pipeline is under src/.
- The repo still has a legacy worker/news-store path under apps/worker that has not been fully retired.
- Source configs live in data_sources/*.json.
- Runtime outputs live in data/ingested/*.

What to do:
1. Validate current repo state against the handoff and key entry points.
2. Choose the highest-impact next task from the current gaps list.
3. Preserve existing behavior unless deliberately replacing the legacy path.
4. Run the relevant validation commands for the area you change.
```
