# Internal Dashboard (No Map)

## Purpose

`/dashboard` is an internal Water Intelligence Feed UI for monitoring water news and risk signals in near real-time without a map view.

It reads normalized pipeline outputs from:

- `data/ingested/articles.json`
- `data/ingested/dataset_events.json`

And item state from:

- `data/ingested/item_state.json`

## Layout

- Top bar:
  - Search
  - Time range (`24h`, `7d`, `30d`, `custom`)
  - Sort (`newest`, `risk`)
  - View mode (`raw`, `grouped`)
  - Refresh action
- Left filters:
  - Type (`NEWS`, `DATA`, `BOTH`)
  - Region, topic
  - Min reliability, min risk sliders
  - Risk tags multi-select
- Main panel:
  - Virtualized feed list
  - Cursor-based pagination via `Load more`
- Right panel:
  - Selected item details
  - Related items
  - Duplicate items
  - Reviewed/star toggles

## Grouped Mode

- Grouping key: `dedupeHash` (derived from `dedupe_hash`).
- Each group shows one representative card plus duplicate count.
- Expand/collapse action shows a short duplicate preview.
- Full duplicate list is available in the details panel from `/api/item/:id`.

## Polling

- Dashboard polls `/api/combined-feed` every 45 seconds.
- Manual refresh is available and does not require page reload.

## Performance

- API uses in-memory snapshot caching (30-second TTL) for ingested JSON files.
- UI uses a virtualized list window to avoid rendering all rows at once.
- Cursor pagination is deterministic and stable per sort mode.
