# Water Risk Intelligence Monitor

Water Risk Intelligence Monitor is a full-stack application that aggregates:

- water-related news and risk signals,
- stock quotes for water-linked companies and infrastructure operators,
- and public hydrological data across North America.

Its goal is to give analysts, operators, and decision-makers one place to monitor emerging water risk in near real time.

## Presentation: What This App Does

### 1. Problem

Water risk information is fragmented:

- news breaks across many sources,
- market moves happen in parallel,
- and hydrology indicators (river flow, reservoirs, rainfall, drought) are published in separate systems.

This makes it hard to see risk early and act fast.

### 2. Solution

This app combines those streams into a single operational workspace with four tabs:

- `News`: curated and paginated water-risk coverage.
- `Stocks`: watchlist tracking with quote refresh and ticker-level visibility.
- `Hydrology Live`: real-time public hydrology modules for North America.
- `Alerts`: high-priority water risk events ranked by risk score.

### 3. Key Capabilities

- Source ingestion with scheduled scanning and manual scan controls.
- Risk classification and relevance filtering for water-related content.
- Unified UI for news, market context, and hydrology signals.
- Config-driven architecture for adding/removing monitored sources.
- Watchlist workflow for water-linked equities and infrastructure names.

### 4. Why It Matters

By linking narrative signals (news), financial signals (stocks), and physical signals (hydrology), the platform helps teams:

- detect risk earlier,
- validate risk with multiple data types,
- and prioritize response with a clearer operating picture.

### 5. Geographic Focus

Hydrology monitoring is focused on **North America**, using public data feeds to track changing water conditions that can affect infrastructure, utilities, agriculture, industry, and communities.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create local environment file:
   ```bash
   cp .env.example .env
   # PowerShell alternative:
   # Copy-Item .env.example .env
   ```
3. Set required keys (for example `MASSIVE_API_KEY`) in `.env`.
4. Run web + worker:
   ```bash
   npm run dev
   ```
5. Open:
   - `http://localhost:3000` (News)
   - `http://localhost:3000/stocks`
   - `http://localhost:3000/hydrology`
   - `http://localhost:3000/alerts`

## Core Scripts

- `npm run dev`: run web and worker in watch mode.
- `npm run build`: type-check the project (`tsc --noEmit`).
- `npm run lint`: static checks.
- `npm run test`: run test suite.
- `npm run pipeline:once`: run one ingestion cycle.

## Repository Layout

- `apps/web`: web server + frontend pages.
- `apps/worker`: scheduled crawling/parsing worker.
- `packages/shared`: shared types and utilities.
- `config`: source and ingestion configuration.
- `src`: ingestion, analysis, and service modules.
- `tests`: regression and unit test coverage.
- `docs`: architecture and operational notes.
