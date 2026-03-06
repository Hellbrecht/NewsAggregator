import { strict as assert } from "node:assert";
import { promises as fs } from "node:fs";
import { test } from "node:test";

import { mergeAndSaveEntries, readEntries } from "../apps/worker/src/news-store";
import { NewsEntry } from "../packages/shared/src";

const STORE_PATH = "data/news-entries.json";

function createEntry(id: string, link: string): NewsEntry {
  return {
    id,
    title: id,
    summary: `${id} summary`,
    link,
    source: "test",
    publishedAt: new Date().toISOString(),
    riskTags: ["pollution"]
  };
}

test("mergeAndSaveEntries serializes concurrent writes", async () => {
  const original = await fs.readFile(STORE_PATH, "utf8");

  try {
    await fs.writeFile(STORE_PATH, "[]", "utf8");
    const first = [createEntry("a", "https://example.com/a")];
    const second = [createEntry("b", "https://example.com/b")];

    await Promise.all([mergeAndSaveEntries(first), mergeAndSaveEntries(second)]);
    const stored = await readEntries();

    assert.equal(stored.length, 2);
    assert(stored.some((entry) => entry.link === "https://example.com/a"));
    assert(stored.some((entry) => entry.link === "https://example.com/b"));
  } finally {
    await fs.writeFile(STORE_PATH, original, "utf8");
  }
});
