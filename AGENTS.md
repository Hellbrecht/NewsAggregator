# Repository Guidelines

## Project Structure & Module Organization
Use a clear split between ingestion and UI:
- `apps/web/`: frontend pages, right-side date menu, and paginated news list (20 items per page).
- `apps/worker/`: scheduled crawlers/parsers that scan configured sites every X minutes.
- `packages/shared/`: shared types and validation schemas (for example, `NewsEntry`, `RiskCategory`).
- `config/sites.json`: monitored sources, crawl intervals, and parser settings.
- `tests/`: unit, integration, and end-to-end coverage.
- `docs/`: architecture notes, data-flow diagrams, and operational runbooks.

## Build, Test, and Development Commands
Standardize on npm scripts:
- `npm install`: install all dependencies.
- `npm run dev`: start web app and worker locally.
- `npm run build`: production build for all apps/packages.
- `npm run test`: run unit/integration tests.
- `npm run lint`: run static analysis.
- `npm run test:e2e`: validate main flow (crawl -> classify -> entry appears in UI).

## Coding Style & Naming Conventions
Use TypeScript with strict mode enabled. Use 2-space indentation and keep files focused on one responsibility.
Name files in `kebab-case` (for example, `water-risk-parser.ts`), functions/variables in `camelCase`, and types/classes in `PascalCase`.
Keep parser logic deterministic and isolate network/database I/O behind service modules.
Run lint/format before each commit.

## Testing Guidelines
Use `*.test.ts` for unit tests and `*.spec.ts` for integration/e2e tests.
Minimum expectations:
- parser extraction accuracy for each source,
- classification checks for water risk/danger keywords,
- date grouping in the right menu,
- pagination correctness (max 20 entries per page).
Add a regression test for every bug fix.

## Commit & Pull Request Guidelines
Use Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
Keep commits small and scoped (parser, UI, or infra).
PRs must include: summary, linked issue, test evidence, and screenshots/GIFs for UI changes (especially date menu and pagination).

## Security & Configuration Tips
Never commit secrets. Keep `.env.example` updated with required keys.
Respect site terms, robots.txt, and rate limits when crawling.
Sanitize external content before storing or rendering.
