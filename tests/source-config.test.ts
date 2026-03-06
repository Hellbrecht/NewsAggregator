import { strict as assert } from "node:assert";
import { test } from "node:test";

import { createUniqueSourceId, parseSourceDraft } from "../apps/web/src/source-config";
import { Source } from "../src/models/Source";

test("parseSourceDraft accepts valid source payload", () => {
  const draft = parseSourceDraft({
    name: "Example Feed",
    url: "https://example.com/news",
    intervalMinutes: 15
  });

  assert(draft);
  assert.equal(draft.name, "Example Feed");
  assert.equal(draft.intervalMinutes, 15);
});

test("parseSourceDraft rejects invalid URL", () => {
  const draft = parseSourceDraft({
    name: "Bad Feed",
    url: "javascript:alert(1)",
    intervalMinutes: 15
  });

  assert.equal(draft, null);
});

test("createUniqueSourceId avoids collisions", () => {
  const existing: Source[] = [
    {
      id: "example-feed",
      name: "Example Feed",
      url: "https://example.com",
      topic: "water risk",
      region: "global",
      reliability_score: 8,
      intervalMinutes: 30
    }
  ];

  const next = createUniqueSourceId("Example Feed", existing);
  assert.equal(next, "example-feed-2");
});
