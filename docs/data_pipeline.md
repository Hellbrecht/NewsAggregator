# Data Pipeline

## Architecture

The ingestion pipeline is centralized under `src/` and loads all source definitions from `data_sources/`:

- `data_sources/news_sources.json`
- `data_sources/hydrology_sources.json`
- `data_sources/satellite_sources.json`

Core modules:

- `src/services/source_loader.ts`: validates and unifies source files into one typed list.
- `src/services/scheduler.ts`: runs ingestion jobs by `intervalMinutes` and logs health/errors.
- `src/ingestion/*`: category-specific ingestion (`rss_ingestor`, `api_ingestor`, `satellite_ingestor`).
- `src/analysis/*`: summarization and risk classification.
- `src/services/output_store.ts`: normalized persistent outputs.

## Ingestion Flow

1. Scheduler loads and validates all sources.
2. Due sources are selected using `intervalMinutes`.
3. Each source is routed to an ingestor:
   - RSS sources -> `fetchRSS`
   - Hydrology/API sources -> `fetchApiDataset`
   - Satellite sources -> `fetchSatelliteDataset`
4. Ingested records are normalized to:
   - `Article` (`data/ingested/articles.json`)
   - `DatasetEvent` (`data/ingested/dataset_events.json`)
5. Risk labels are attached using `classifyRisk`.
6. Deduplication is applied with content hashes before storage.

## Scheduler Logic

- Internal scheduler tick defaults to 60 seconds.
- Sources run when `now - lastRun >= intervalMinutes * 60_000`.
- Max parallel ingestion workers: 8.
- Failures and rate limits are logged as structured JSON events.

Run commands:

- `npm run pipeline:once`: one immediate full pass.
- `npm run pipeline:start`: continuous scheduler.
- `npm run dev:pipeline`: watch mode scheduler.

## How To Add New Sources

1. Add a new object to the correct `data_sources/*.json` file.
2. Required schema fields:
   - `id`, `name`, `url`, `topic`, `region`, `reliability_score`, `intervalMinutes`
   - optional: `rss`, `api`
3. Keep `id` unique across all three files.
4. Run `npm run lint` and `npm test`.
5. Run `npm run pipeline:once` to verify ingestion and output.

## Operational Notes

- The loader clamps `reliability_score` to `1-10` and `intervalMinutes` to `1-1440`.
- Invalid records are excluded and reported in validation logs.
- Existing web/worker app remains operational while this pipeline runs independently.
