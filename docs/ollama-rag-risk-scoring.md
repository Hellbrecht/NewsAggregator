# Ollama + RAG for Regional Water Risk Scoring

## Executive Recommendation

Do not let an LLM directly assign the final regional risk score from raw articles.

The best path for this repository is a **hybrid pipeline**:

1. keep the current deterministic ingestion, relevance filtering, deduplication, and baseline tagging,
2. add an **LLM enrichment stage** after article persistence,
3. use **RAG to retrieve local evidence** for the affected region and recent time window,
4. compute the final regional risk score with a **deterministic scoring function** fed by structured LLM outputs.

This gives you:

- traceable scores,
- lower hallucination risk,
- better temporal consistency,
- better use of existing `region`, `topic`, `risk_labels`, and dataset event signals,
- and a clean rollback path when Ollama is unavailable.

## Why This Fits The Current App

The codebase already has the right primitives:

- RSS/news ingestion creates normalized `Article` records with `region`, `topic`, `raw_content`, `summary`, and rule-based `risk_labels`.
- storage already supports append/upsert and dedupe in `data/ingested/articles.json`.
- the web layer already computes a simple risk score from tags and source reliability.
- hydrology and satellite feeds already exist and can become retrieval evidence for RAG.

What is missing is not "an LLM", but these three pieces:

1. **fine-grained geography extraction** beyond coarse source-level `region`,
2. **evidence retrieval** across recent articles and datasets,
3. **regional aggregation logic** that converts article-level evidence into stable region-level scores.

## Recommended System Design

### 1. Keep the current ingestion flow as the system of record

Use the centralized `src/` pipeline, not the lightweight `apps/worker` JSON cache path, as the canonical path for LLM enrichment.

Reason:

- `src/ingestion/rss_ingestor.ts` already builds richer `Article` objects.
- `apps/worker` stores a much thinner `NewsEntry` shape intended for the old UI.
- the web app already reads the richer `data/ingested/*` snapshot path.

### 2. Add an asynchronous enrichment stage after `upsertArticles`

For every newly inserted article:

- chunk and clean the article text,
- generate an embedding,
- persist an enrichment record,
- run a structured extraction prompt through Ollama,
- persist the extracted result separately from the raw article.

This stage should be:

- idempotent,
- retryable,
- non-blocking for ingestion,
- and safe to skip when Ollama is down.

Suggested files:

- `src/analysis/llm_enricher.ts`
- `src/analysis/rag_retriever.ts`
- `src/analysis/regional_risk_scorer.ts`
- `src/services/ollama_client.ts`
- `src/models/ArticleEnrichment.ts`
- `src/models/RegionalRiskScore.ts`

### 3. Use the LLM for extraction, not final judgment

Have Ollama return structured JSON for each article with fields like:

- `water_relevance_score` (0-1)
- `event_type` (`drought`, `flood`, `contamination`, `infrastructure_failure`, `water_conflict`, `policy_signal`, `monitoring_only`)
- `severity` (0-5)
- `urgency` (0-5)
- `impact_horizon_days`
- `affected_regions`
- `affected_locations`
- `confidence` (0-1)
- `evidence_spans`
- `reasoning_summary`

Important:

- require JSON schema output,
- store the exact evidence spans used,
- reject outputs that name regions not supported by the article text or retrieved context,
- and fall back to the rule-based classifier when validation fails.

### 4. Build RAG around region + recency, not general Q&A

The goal is not chat over articles.
The goal is to answer:

"Given this article, what is the incremental risk contribution for region X, based on recent corroborating evidence?"

Retrieve context from:

- recent articles in the same region,
- recent articles with overlapping risk labels,
- hydrology dataset events near the same region,
- source reliability metadata,
- and optionally a static region taxonomy or gazetteer.

Recommended retrieval windows:

- news-to-news: last 14 days,
- dataset corroboration: last 7 days,
- duplicate/cascade detection: last 3 days.

### 5. Compute the final score deterministically

The final region score should not be the model output.

Compute it from weighted factors:

`regional_score = severity_signal + corroboration_signal + reliability_signal + recency_signal + spread_signal - uncertainty_penalty`

Example factorization:

- `severity_signal`: from LLM `severity` and `event_type`
- `corroboration_signal`: number and strength of retrieved supporting items
- `reliability_signal`: source `reliability_score`
- `recency_signal`: exponential decay by publish age
- `spread_signal`: multiple unique sources and repeated mentions
- `uncertainty_penalty`: low LLM confidence, conflicting labels, weak geography match

Clamp to `0-100`.

This makes the score stable enough for sorting, alerting, and historical comparison.

## Why Source-Level Region Is Not Enough

Right now `region` is mostly assigned from the source definition, not the article event location.

That is too coarse for regional risk scoring.

Examples:

- a US source may report on Mexico,
- a Canada source may report on Alberta or Quebec,
- a Europe source may report on Sudan or India.

So the first new capability should be **location extraction and normalization**.

Use a hierarchy such as:

- `macro_region`: `north-america`, `europe`, `global`
- `country`
- `admin1`: province/state
- `admin2` or city when extractable
- `watershed` or basin when known

If location is ambiguous, store:

- extracted candidates,
- confidence,
- and a fallback to the source-level region.

## Best Ollama Usage Pattern

### Models

Use separate models for extraction and embeddings.

Recommended starting point:

- chat/extraction: a compact instruct model available in Ollama that supports reliable structured output
- embeddings: `embeddinggemma` or `qwen3-embedding`

Do not start with a very large model unless quality testing proves you need it.
For this task, latency and throughput matter more than essay quality.

### API features to rely on

Use:

- `/api/chat` for structured extraction
- `/api/embed` for embeddings
- JSON schema constrained outputs

Avoid:

- free-form prompt outputs for scoring,
- chain-of-thought storage,
- and giving the model raw global context dumps.

## Recommended Retrieval Corpus

Create a local evidence index over:

1. article chunks
2. article summaries
3. dataset events
4. region metadata

For article chunks, include metadata:

- `article_id`
- `source_id`
- `published_at`
- `source_region`
- `topic`
- `risk_labels`
- `dedupe_hash`

For dataset events, include:

- `source_id`
- `timestamp`
- `metric`
- `location`
- `risk_labels`

Use metadata filters before vector search whenever possible:

- same country or admin region first,
- then nearby macro region,
- then broader fallback.

This reduces noisy matches and keeps RAG grounded.

## Proposed Data Model Additions

### `ArticleEnrichment`

Suggested fields:

- `article_id`
- `model`
- `embedded_at`
- `embedding_version`
- `geography`
- `event_type`
- `severity`
- `urgency`
- `confidence`
- `evidence_spans`
- `retrieved_context_ids`
- `llm_summary`
- `validation_status`

### `RegionalRiskScore`

Suggested fields:

- `region_id`
- `window_start`
- `window_end`
- `score`
- `score_components`
- `top_article_ids`
- `top_dataset_event_ids`
- `dominant_risk_types`
- `confidence`
- `updated_at`

## Phased Implementation Plan

### Phase 1: Article enrichment

Build article-level extraction only.

Deliverables:

- Ollama client
- structured extraction schema
- embedding generation
- persisted enrichments
- validation and fallback behavior

Success criteria:

- extracted location quality is measurably better than source-level `region`
- false positive rate stays below the current rules-only path

### Phase 2: Retrieval-backed regional scoring

Aggregate enriched articles plus dataset events into rolling region scores.

Deliverables:

- vector index
- region normalization
- regional score computation
- score explanation payload for UI/API

Success criteria:

- alerts become more region-specific
- similar articles cluster into one evolving regional signal

### Phase 3: UI exposure

Expose:

- region leaderboard,
- score trend over time,
- evidence drilldown,
- and "why this score changed" explanations.

## Evaluation Plan

Do not ship this without an offline evaluation set.

Create a labeled set of articles with:

- correct affected region,
- event type,
- severity bucket,
- and expected contribution to region score.

Measure:

- geography extraction accuracy,
- event classification accuracy,
- severity calibration,
- false alert rate,
- and score stability over time.

Human review should compare:

- current heuristic score,
- pure LLM score,
- hybrid score.

The hybrid approach is the one most likely to survive production use.

## Risks To Avoid

### 1. Letting the model score directly

This creates fragile scores that drift with prompt or model changes.

### 2. Using source region as event region

This will materially mis-score cross-border stories.

### 3. Storing only one final explanation string

You need machine-readable score components for testing and debugging.

### 4. Running enrichment inline during scraping

That will make the worker brittle and slow.

### 5. Using RAG before geography normalization

Retrieval quality will be weak if your regional key is weak.

## Concrete Recommendation For This Repository

Best next move:

1. make the `src/` pipeline the only enrichment path,
2. add article-level LLM extraction with Ollama structured outputs,
3. add embeddings for articles and dataset events,
4. normalize geography to a region taxonomy,
5. compute regional scores deterministically from extracted signals plus retrieved corroboration,
6. expose the score explanation in the web feed and alerts view.

If you do only one thing first, do **location extraction + structured article enrichment**.
That is the highest-leverage dependency for everything else.

## Implementation Notes For This Codebase

- Reuse `src/ingestion/rss_ingestor.ts` as the entry point for article enrichment.
- Keep `src/analysis/risk_classifier.ts` as a fast baseline and fallback.
- Extend `src/services/output_store.ts` with separate enrichment and regional-score files before introducing a database.
- Replace or augment the simple `calculateRiskScore` logic in `apps/web/src/feed-store.ts` only after the enrichment pipeline proves stable.
- Prefer adding a separate API route for regional scores rather than overloading the existing feed response first.

## Current Code Anchors

- Article creation: `src/ingestion/rss_ingestor.ts`
- article shape: `src/models/Article.ts`
- persistent article storage: `src/services/output_store.ts`
- current heuristic feed risk scoring: `apps/web/src/feed-store.ts`
- current relevance filtering: `src/analysis/water_relevance.ts`

## Current Ollama Capabilities To Use

As of March 9, 2026, Ollama documents:

- local API access via `http://localhost:11434/api`
- structured outputs with JSON schema on chat responses
- embedding generation via `/api/embed`
- recommended embedding models including `embeddinggemma` and `qwen3-embedding`

Sources:

- https://docs.ollama.com/api
- https://docs.ollama.com/api/chat
- https://docs.ollama.com/api/embed
- https://docs.ollama.com/capabilities/structured-outputs
- https://docs.ollama.com/capabilities/embeddings
