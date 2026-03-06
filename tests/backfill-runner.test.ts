import { strict as assert } from "node:assert";
import { test } from "node:test";

import { Article } from "../src/models/Article";
import { CategorizedSource } from "../src/models/Source";
import { BackfillConfig, filterArticlesByWindow, runBackfill } from "../src/services/backfill_runner";

function createArticle(id: string, publishedAt: string): Article {
  return {
    id,
    dedupe_hash: `hash-${id}`,
    source_id: "source-1",
    title: `Article ${id}`,
    summary: `Summary ${id}`,
    published_at: publishedAt,
    region: "global",
    topic: "water",
    raw_content: `https://example.com/${id}`
  };
}

function createSource(): CategorizedSource {
  return {
    id: "source-1",
    name: "Source One",
    url: "https://example.com",
    rss: "https://example.com/feed.xml",
    topic: "water",
    region: "global",
    reliability_score: 9,
    intervalMinutes: 60,
    category: "news"
  };
}

test("filterArticlesByWindow keeps only records in the last N days", () => {
  const now = new Date("2026-03-04T00:00:00.000Z");
  const rows = [
    createArticle("inside-a", "2026-03-03T10:00:00.000Z"),
    createArticle("inside-b", "2026-02-20T10:00:00.000Z"),
    createArticle("outside", "2025-10-01T10:00:00.000Z"),
    createArticle("invalid", "invalid-date")
  ];

  const filtered = filterArticlesByWindow(rows, 30, now);
  assert.deepEqual(
    filtered.map((entry) => entry.id),
    ["inside-a", "inside-b"]
  );
});

test("runBackfill fetches RSS with stopOnSeenHash disabled", async () => {
  const source = createSource();
  const config: BackfillConfig = {
    enabled: true,
    days: 90,
    sources: "news",
    minDelayMs: 0,
    maxDelayMs: 0,
    maxAttempts: 3
  };

  let capturedStopOnSeenHash: boolean | undefined;
  const summary = await runBackfill(config, {
    now: () => new Date("2026-03-04T00:00:00.000Z"),
    randomInt: () => 0,
    sleep: async () => undefined,
    loadSourcesWithReport: async () => ({
      sources: [source],
      issues: []
    }),
    fetchRSS: async (_source, options) => {
      capturedStopOnSeenHash = options?.stopOnSeenHash;
      return [createArticle("a", "2026-03-02T08:00:00.000Z")];
    },
    upsertArticles: async (articles) => ({
      inserted: articles.length,
      deduped: 0,
      total: articles.length,
      stateMappingsPreserved: 0
    })
  });

  assert.equal(capturedStopOnSeenHash, false);
  assert.equal(summary.totals.fetched_count, 1);
  assert.equal(summary.totals.kept_in_window_count, 1);
  assert.equal(summary.totals.inserted_count, 1);
});
