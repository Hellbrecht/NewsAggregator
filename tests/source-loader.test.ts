import { strict as assert } from "node:assert";
import { test } from "node:test";

import { loadSources, loadSourcesWithReport } from "../src/services/source_loader";

test("loadSources returns a unified source list", async () => {
  const sources = await loadSources();

  assert(sources.length > 0);
  assert(sources.every((source) => source.id && source.name && source.url));
});

test("loadSourcesWithReport has no duplicate ids", async () => {
  const { sources } = await loadSourcesWithReport();
  const ids = sources.map((source) => source.id);
  const uniqueIds = new Set(ids);

  assert.equal(uniqueIds.size, ids.length);
});
