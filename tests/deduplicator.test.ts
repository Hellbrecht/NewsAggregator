import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DeduplicationCache, computeContentHash } from "../src/services/deduplicator";

test("computeContentHash is deterministic for equivalent input", () => {
  const a = computeContentHash("Flood Alert", "Region A", "2026-03-04");
  const b = computeContentHash(" flood alert ", "region a", "2026-03-04");

  assert.equal(a, b);
});

test("DeduplicationCache only accepts unseen hashes", () => {
  const cache = new DeduplicationCache();
  const hash = computeContentHash("same event");

  assert.equal(cache.addIfNew(hash), true);
  assert.equal(cache.addIfNew(hash), false);
});
