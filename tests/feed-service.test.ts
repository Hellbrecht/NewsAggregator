import { strict as assert } from "node:assert";
import { test } from "node:test";

import { getCombinedFeed, getItemDetails, parseCombinedFeedQuery } from "../apps/web/src/feed-service";
import {
  loadItemStateMap,
  resolveItemState,
  setItemRelevance
} from "../apps/web/src/item-state-store";

test("parseCombinedFeedQuery normalizes known params", () => {
  const url = new URL(
    "http://localhost/api/combined-feed?type=data&sort=risk&limit=12&minReliability=5&minRisk=60&tags=flood,pollution"
  );
  const parsed = parseCombinedFeedQuery(url);

  assert.equal(parsed.type, "DATA");
  assert.equal(parsed.sort, "risk");
  assert.equal(parsed.limit, 12);
  assert.equal(parsed.minReliability, 5);
  assert.equal(parsed.minRisk, 60);
  assert.deepEqual(parsed.tags, ["flood", "pollution"]);
});

test("getCombinedFeed cursor pagination is stable and non-overlapping", async () => {
  const baseQuery = {
    type: "BOTH" as const,
    sort: "newest" as const,
    limit: 5,
    minReliability: 0,
    minRisk: 0
  };

  const firstPage = await getCombinedFeed(baseQuery);
  assert(firstPage.items.length > 0);

  const replay = await getCombinedFeed(baseQuery);
  assert.deepEqual(
    firstPage.items.map((item) => item.id),
    replay.items.map((item) => item.id)
  );

  if (!firstPage.nextCursor) {
    return;
  }

  const secondPage = await getCombinedFeed({
    ...baseQuery,
    cursor: firstPage.nextCursor
  });
  const firstIds = new Set(firstPage.items.map((item) => item.id));
  const overlap = secondPage.items.some((item) => firstIds.has(item.id));

  assert.equal(overlap, false);
});

test("getItemDetails returns the requested item and bounded related sets", async () => {
  const feed = await getCombinedFeed({
    type: "BOTH",
    sort: "newest",
    limit: 1,
    minReliability: 0,
    minRisk: 0
  });

  assert(feed.items.length > 0);
  const targetId = feed.items[0].id;
  const details = await getItemDetails(targetId);

  assert(details.item);
  assert.equal(details.item?.id, targetId);
  assert(details.related.length <= 50);
  assert(details.duplicates.length <= 50);
});

test("getCombinedFeed hides items marked as irrelevant", async () => {
  const baseQuery = {
    type: "BOTH" as const,
    sort: "newest" as const,
    limit: 20,
    minReliability: 0,
    minRisk: 0
  };

  const before = await getCombinedFeed(baseQuery);
  assert(before.items.length > 0);

  const targetId = before.items[0].id;
  const beforeState = await loadItemStateMap();
  const previousFeedback = resolveItemState(beforeState, targetId).relevanceFeedback;

  try {
    await setItemRelevance(targetId, "down");

    const after = await getCombinedFeed(baseQuery);
    assert.equal(after.items.some((item) => item.id === targetId), false);
  } finally {
    await setItemRelevance(targetId, previousFeedback);
  }
});

test("getCombinedFeed includes stored relevance feedback state", async () => {
  const baseQuery = {
    type: "BOTH" as const,
    sort: "newest" as const,
    limit: 50,
    minReliability: 0,
    minRisk: 0
  };

  const before = await getCombinedFeed(baseQuery);
  assert(before.items.length > 0);

  const index = before.items.length > 1 ? 1 : 0;
  const targetId = before.items[index].id;
  const beforeState = await loadItemStateMap();
  const previousFeedback = resolveItemState(beforeState, targetId).relevanceFeedback;

  try {
    await setItemRelevance(targetId, "up");

    const after = await getCombinedFeed(baseQuery);
    const target = after.items.find((item) => item.id === targetId);
    assert(target);
    assert.equal(target?.relevanceFeedback, "up");
  } finally {
    await setItemRelevance(targetId, previousFeedback);
  }
});
