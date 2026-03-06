# Water News Aggregator

Water News Aggregator ingests water-risk signals from configured sources and serves them in a paginated web feed.

## Usage

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run web + worker locally:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:3000`.

### Scan All Button

`Scan All` runs a one-time manual crawl across every configured source in the **Sources** panel.

What it does:

1. Calls `POST /api/scan-now` without a `sourceId` to include all sources.
2. Fetches each source page and extracts water-risk entries.
3. Deduplicates and stores only new entries.
4. Refreshes the feed and shows inserted count in status text.

It does not start continuous scanning; the action is immediate and one-time per click.

## Available Scripts

- `npm run dev`: Run web and worker in watch mode.
- `npm run build`: Type-check the project (`tsc --noEmit`).
- `npm run lint`: Run TypeScript checks.
- `npm run test`: Run test suite.
