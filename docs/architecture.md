# Architecture Overview

The project has two runtime components:

- `apps/worker`: periodically scans configured websites, detects water-risk news, and stores entries in `data/news-entries.json`.
- `apps/web`: serves a UI and API for browsing entries with date grouping and pagination (20 per page).

Shared logic lives in `packages/shared`:

- risk classification (`classifyWaterRisk`)
- pagination helpers (`paginate`, `groupEntriesByDate`)
- shared types (`NewsEntry`, `MonitoredSite`)

Current persistence is a JSON file for a fast MVP loop. A future migration can replace this with a database without changing the UI contract.
