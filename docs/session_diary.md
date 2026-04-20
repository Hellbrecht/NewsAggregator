# Session Diary

## 2026-03-04

### Summary

- Implemented internal Water Intelligence Feed MVP (no map) using normalized JSON outputs as backend store.
- Preserved existing `apps/web` and `apps/worker` behavior.
- Updated session handoff to current state.

### Completed

- Added internal feed backend modules:
  - `apps/web/src/feed-types.ts`
  - `apps/web/src/feed-store.ts`
  - `apps/web/src/feed-service.ts`
  - `apps/web/src/item-state-store.ts`
- Added new API routes in `apps/web/src/server.ts`:
  - `GET /api/combined-feed`
  - `GET /api/item/:id`
  - `POST /api/item/:id/reviewed`
  - `POST /api/item/:id/star`
  - `GET /api/health`
- Added dashboard route and UI assets:
  - `GET /dashboard`
  - `apps/web/src/public/dashboard.html`
  - `apps/web/src/public/dashboard.css`
  - `apps/web/src/public/dashboard.js`
- Added docs:
  - `docs/api.md`
  - `docs/dashboard.md`
- Added tests:
  - `tests/feed-service.test.ts`
- Enhanced pipeline logging persistence:
  - `src/services/logger.ts` now appends to `data/ingested/pipeline_logs.jsonl`
- Updated handoff:
  - `docs/session_handoff.md`

### Validation

- `npm test`: pass (20 tests)
- `npm run lint`: pass
- `npm run pipeline:once`: pass
- API/UI smoke checks:
  - `/dashboard` -> 200
  - `/api/combined-feed` -> 200
  - `/api/health` -> 200

### Notes

- `data/ingested/item_state.json` is created on first review/star action.
- External source failures (`401/404/405`, network fetch issues) remain non-fatal and are logged.
- Repository directory currently has no `.git` metadata in this workspace path, so no commits were created in-session.

### Next Focus

1. Retry/backoff and per-source rate-limit policy in ingestors.
2. Better source-specific adapters for API/satellite inputs.
3. Auth boundary for internal dashboard/API.
4. Optional DB backend to replace JSON files as primary store.

## 2026-03-05

### Timestamp

- 2026-03-05 09:48:21 -05:00 (America/Toronto)

### Summary

- Added article relevance feedback with thumbs up/down and hidden irrelevant items.
- Wired relevance feedback into ingestion relevance learning.
- Updated sidebar UX with month-collapsible date groups and sticky source panel stacking.
- Applied annotated UI request: removed feed subtitle, moved global scan button into Sources header, renamed to `Scan All`.
- Added project `README.md` with `Scan All` usage details and mirrored it to Obsidian project docs.

### Validation

- `npm run test`: pass (40 tests)
- `npm run lint`: currently failing due pre-existing unrelated `apps/web/src/stocks-service.ts` `StockQuote.history` type issue.

### Timestamped Note

- 2026-03-05 12:00:03 -05:00 (America/Toronto)
  - Tightened water relevance filtering to reduce false positives in aggregated articles.
  - Updated pipeline-to-list conversion to prioritize `title + summary` relevance, with `raw_content` fallback only for placeholder titles.
  - Added generated short titles for `Untitled...` items based on summary text and applied the same logic in ingestion and list rendering.
  - Added regression tests for relevance filtering and untitled-title generation paths.

- 2026-03-05 20:45:02 -05:00 (America/Toronto)
  - Updated Hydrology cards to fixed uniform height with internal scrolling and preserved rounded corners.
  - Increased Hydrology card height (1.5x) and moved vertical scrolling to an inner card body container.
  - Switched Stocks quote primary provider flow to Massive grouped daily aggregates with Stooq fallback, plus CA symbol mapping support.
  - Set Stocks auto-refresh cadence to every 5 minutes.
  - Added clickable ticker links in the Stocks table to Yahoo Finance quote pages.
  - Added Yahoo chart API fallback for symbols that remain unavailable after Massive/Stooq.
  - Added/updated stock quote regression coverage in `tests/stocks-service.test.ts`.
  - Validation:
    - `npm run build`: pass
    - `npx tsx --test tests/stocks-service.test.ts`: pass
    - `npm run test -- tests/stocks-service.test.ts`: includes one unrelated flaky failure in `tests/output-store.test.ts` (pre-existing).

## 2026-03-09

### Timestamped Note

- 2026-03-09 14:34:00 -04:00 (America/Toronto)
  - Added alias-aware stock catalog support so configured tickers can carry provider-specific symbols for quote lookup.
  - Updated the Stocks quote service to load configured aliases, try provider candidates for non-US symbols, and return a preferred `quotePageSymbol` for UI links.
  - Updated the Stocks table link builder to use the preferred quote page symbol instead of the raw display ticker.
  - Seeded Yahoo aliases for an initial Europe/Asia set in `data_sources/stocks.json`, including France, UK, Japan, Hong Kong, and Singapore examples.
  - Added regression coverage for alias parsing and non-US Yahoo fallback behavior in `tests/stocks-watchlist.test.ts` and `tests/stocks-service.test.ts`.
  - Validation:
    - `npm test`: pass
    - `npm run build`: pass
    - `npm run lint`: pass
