# Session Handoff

Last updated: 2026-03-04

## Project Status

Repository now includes a centralized ingestion pipeline plus an internal feed API/dashboard MVP, while preserving existing web app and worker behavior.

Core architecture remains:

- Centralized sources:
  - `data_sources/news_sources.json`
  - `data_sources/hydrology_sources.json`
  - `data_sources/satellite_sources.json`
- Pipeline modules under `src/`:
  - `src/models`: `Source.ts`, `Article.ts`, `Dataset.ts`
  - `src/ingestion`: `rss_ingestor.ts`, `api_ingestor.ts`, `satellite_ingestor.ts`
  - `src/services`: `source_loader.ts`, `scheduler.ts`, `output_store.ts`, `deduplicator.ts`, `logger.ts`
  - `src/analysis`: `ai_summarizer.ts`, `risk_classifier.ts`

New internal feed modules added under `apps/web/src`:

- `feed-types.ts`
- `feed-store.ts` (cached snapshot loader for ingested JSON + health stats)
- `feed-service.ts` (filtering, sort, stable cursor pagination, related/duplicates logic)
- `item-state-store.ts` (`reviewed`/`starred` persistence)

New dashboard static assets:

- `apps/web/src/public/dashboard.html`
- `apps/web/src/public/dashboard.css`
- `apps/web/src/public/dashboard.js`

Documentation added:

- `docs/data_pipeline.md`
- `docs/dashboard.md`
- `docs/api.md`

## Current Behavior

- `npm run pipeline:once` ingests centralized sources and writes normalized outputs to:
  - `data/ingested/articles.json`
  - `data/ingested/dataset_events.json`
- Pipeline errors like `401/404/405` and network failures are logged and do not crash the run.
- Structured logs are now also persisted to:
  - `data/ingested/pipeline_logs.jsonl`
- Existing source-management UI/API still works and writes to:
  - `data_sources/news_sources.json`

Internal feed API endpoints available in `apps/web/src/server.ts`:

- `GET /api/combined-feed`
- `GET /api/item/:id`
- `POST /api/item/:id/reviewed`
- `POST /api/item/:id/star`
- `GET /api/health`

Internal dashboard route:

- `GET /dashboard`

State persistence:

- `data/ingested/item_state.json` is created on first review/star write.

## Validation Completed

- `npm test` passes (20 tests).
- `npm run lint` passes.
- `npm run pipeline:once` passes.
- API smoke check passes:
  - `/dashboard` -> 200
  - `/api/combined-feed` -> 200
  - `/api/health` -> 200
- Ingested outputs parse correctly (`articles.json`, `dataset_events.json`).

## Known Gaps / Next Priorities

1. Implement retry/backoff and per-source rate-limit policy (not yet added to ingestors).
2. Improve per-source adapters (API/satellite parsing is still generic).
3. Add database backend (replace JSON files as primary store).
4. Add auth/authorization for internal dashboard + API endpoints.
5. Add server-level integration tests for new `/api/*` endpoints.
6. Improve grouped mode to support server-side group pagination at large scale.
7. Strengthen deduplication beyond hash equality (similarity/embedding-based).

## Useful Commands

```bash
npm run lint
npm test
npm run dev:web
npm run dev:worker
npm run pipeline:once
npm run pipeline:start
npm run dev:pipeline
```

## Prompt To Reuse In A New Chat

```text
Read docs/session_handoff.md first, then continue from current repository state.
Goal: harden and scale the internal Water Intelligence Feed (no map) while preserving existing web/worker behavior.
Current MVP includes /dashboard and /api/combined-feed backed by data/ingested JSON files.
Start by validating test/lint/pipeline, then implement the highest-impact remaining priority (retry/backoff, auth, or DB-backed storage).
```
