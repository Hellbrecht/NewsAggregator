import { strict as assert } from "node:assert";
import { promises as fs } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { Article } from "../src/models/Article";
import {
  loadStoredArticles,
  resetOutputStoreCacheForTests,
  upsertArticles
} from "../src/services/output_store";

const ARTICLES_PATH = path.resolve(__dirname, "../data/ingested/articles.json");
const ITEM_STATE_PATH = path.resolve(__dirname, "../data/ingested/item_state.json");

function createArticle(id: string, dedupeHash: string, publishedAt: string): Article {
  return {
    id,
    dedupe_hash: dedupeHash,
    source_id: "source-test",
    title: `Title ${id}`,
    summary: `Summary ${id}`,
    published_at: publishedAt,
    region: "global",
    topic: "water",
    raw_content: `https://example.com/${id}`
  };
}

test("upsertArticles dedupes by hash and preserves stable existing ids", async () => {
  const originalArticles = await fs.readFile(ARTICLES_PATH, "utf8");
  const hadItemState = await fileExists(ITEM_STATE_PATH);
  const originalItemState = hadItemState ? await fs.readFile(ITEM_STATE_PATH, "utf8") : null;

  try {
    const existing = createArticle("existing-id", "shared-hash", "2026-02-01T12:00:00.000Z");
    await fs.writeFile(ARTICLES_PATH, JSON.stringify([existing], null, 2), "utf8");
    await fs.writeFile(
      ITEM_STATE_PATH,
      JSON.stringify(
        {
          "existing-id": {
            reviewed: true,
            starred: false,
            updatedAt: "2026-03-01T00:00:00.000Z"
          }
        },
        null,
        2
      ),
      "utf8"
    );
    resetOutputStoreCacheForTests();

    const incoming = createArticle("incoming-id", "shared-hash", "2026-03-01T12:00:00.000Z");
    const result = await upsertArticles([incoming]);

    assert.equal(result.inserted, 0);
    assert.equal(result.deduped, 1);

    const stored = await loadStoredArticles();
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.id, "existing-id");

    const parsedState = JSON.parse(await fs.readFile(ITEM_STATE_PATH, "utf8")) as Record<string, unknown>;
    assert.equal(typeof parsedState["existing-id"], "object");
  } finally {
    resetOutputStoreCacheForTests();
    await fs.writeFile(ARTICLES_PATH, originalArticles, "utf8");

    if (originalItemState === null) {
      await fs.rm(ITEM_STATE_PATH, { force: true });
    } else {
      await fs.writeFile(ITEM_STATE_PATH, originalItemState, "utf8");
    }
  }
});

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}
