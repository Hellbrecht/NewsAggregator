# Repository Guidelines

## Project Structure & Module Organization
This repo is a water-risk monitoring app with a web UI, a worker, and a centralized ingestion pipeline.

- `apps/web/`: web server, API routes, and static UI pages for `News`, `Stocks`, `Hydrology Live`, `Alerts`, and the internal `dashboard`.
- `apps/worker/`: worker entry point and source-management runtime used alongside the web app.
- `src/`: centralized ingestion/analysis pipeline.
- `src/ingestion/`: RSS, API, and satellite ingestors.
- `src/analysis/`: risk classification and related analysis logic.
- `src/services/`: scheduler, source loading, output storage, diagnostics, deduplication, and logging.
- `src/models/`: normalized pipeline data models.
- `data_sources/`: source configuration JSON files for news, hydrology, and satellite inputs.
- `data/ingested/`: generated pipeline outputs such as `articles.json`, `dataset_events.json`, `item_state.json`, and pipeline logs.
- `tests/`: regression and unit tests.
- `docs/`: architecture notes, API notes, dashboard notes, pipeline handoff, and operational documentation.

## Build, Test, and Development Commands
Use the actual npm scripts defined in `package.json`:

- `npm install`: install dependencies.
- `npm run dev`: run web and worker in watch mode.
- `npm run dev:web`: run only the web server.
- `npm run dev:worker`: run only the worker.
- `npm run dev:pipeline`: run the centralized pipeline scheduler in watch mode.
- `npm run pipeline:once`: run one ingestion cycle.
- `npm run pipeline:start`: run the scheduler continuously.
- `npm run pipeline:backfill`: run the backfill runner.
- `npm run sources:diagnose`: validate configured sources and inspect source health.
- `npm run build`: TypeScript type-check (`tsc --noEmit`).
- `npm run lint`: same static type-check gate used as lint.
- `npm run test`: run the `*.test.ts` test suite.
- `npm run format`: run Prettier in check mode.

## Coding Style & Naming Conventions
Use TypeScript with strict mode assumptions and 2-space indentation.

- Prefer focused modules with one main responsibility.
- Use `kebab-case` for filenames.
- Use `camelCase` for functions and variables.
- Use `PascalCase` for types, interfaces, and classes.
- Keep ingestion and parsing deterministic where possible.
- Isolate network and filesystem I/O inside service modules.
- Preserve the config-driven source model rather than hardcoding source definitions into UI code.

## Testing Guidelines
Use `*.test.ts` for repo tests.

Minimum expectations:
- add a regression test for every bug fix,
- cover ingestion/parser changes with representative source fixtures or assertions,
- cover feed/store/service behavior when changing web-side aggregation logic,
- cover hydrology/stocks/service changes with focused tests where possible,
- re-run `npm run pipeline:once` or `npm run sources:diagnose` when changing source or pipeline behavior.

Before finishing meaningful code changes, prefer running:
- `npm run test`
- `npm run lint`
- any targeted pipeline command relevant to the change

## Commit & Pull Request Guidelines
Use Conventional Commits such as:
- `feat:`
- `fix:`
- `chore:`
- `docs:`
- `test:`

Keep commits scoped to one concern when practical, for example:
- pipeline
- web UI
- hydrology
- stocks
- docs

PRs should include:
- a short summary,
- linked issue/context when applicable,
- test or validation evidence,
- screenshots/GIFs for UI changes.

## Security & Configuration Tips
- Never commit secrets or real API keys.
- Keep `.env.example` aligned with required environment variables.
- Respect source terms, robots/rate limits, and provider stability when changing ingestion behavior.
- Treat HTML-only or malformed upstream responses as diagnosable failures rather than silently ingesting junk.
- Sanitize external content before rendering or storing it for UI use.
- Be careful with generated files under `data/ingested/`; they are runtime outputs, not source-of-truth configuration.
