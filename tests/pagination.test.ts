import { strict as assert } from "node:assert";
import { test } from "node:test";

import { groupEntriesByDate, paginate, NewsEntry } from "../packages/shared/src";

function createEntry(index: number, date: string): NewsEntry {
  return {
    id: `entry-${index}`,
    title: `Entry ${index}`,
    summary: `Summary ${index}`,
    link: `https://example.com/${index}`,
    source: "Source",
    publishedAt: `${date}T10:00:00.000Z`,
    riskTags: ["pollution"]
  };
}

test("paginate enforces item slicing", () => {
  const entries = Array.from({ length: 45 }, (_, index) => createEntry(index, "2026-03-01"));
  const result = paginate(entries, 3, 20);

  assert.equal(result.items.length, 5);
  assert.equal(result.totalPages, 3);
  assert.equal(result.page, 3);
});

test("groupEntriesByDate groups counts by YYYY-MM-DD", () => {
  const entries = [
    createEntry(1, "2026-03-01"),
    createEntry(2, "2026-03-01"),
    createEntry(3, "2026-03-02")
  ];
  const groups = groupEntriesByDate(entries);

  assert.equal(groups[0].date, "2026-03-02");
  assert.equal(groups[0].count, 1);
  assert.equal(groups[1].date, "2026-03-01");
  assert.equal(groups[1].count, 2);
});

test("groupEntriesByDate ignores invalid publishedAt values", () => {
  const entries = [
    createEntry(1, "2026-03-01"),
    {
      ...createEntry(2, "2026-03-02"),
      publishedAt: "not-a-real-date"
    }
  ];

  const groups = groupEntriesByDate(entries);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].date, "2026-03-01");
  assert.equal(groups[0].count, 1);
});
