import { strict as assert } from "node:assert";
import { test } from "node:test";

import { extractRiskEntries, extractRiskEntriesFromFeed } from "../apps/worker/src/site-parser";

test("extractRiskEntries keeps only anchors with water risk signals", () => {
  const html = `
    <html>
      <body>
        <a href="/ok">Downtown boil water advisory after pipe break</a>
        <a href="/ignore">Summer parade schedule announced</a>
        <a href="/ok2">River contamination warning issued near reservoir</a>
      </body>
    </html>
  `;

  const entries = extractRiskEntries(html, "Example Source", "https://example.com");

  assert.equal(entries.length, 2);
  assert(entries.every((entry) => entry.link.startsWith("https://example.com/")));
});

test("extractRiskEntries rejects unsafe URL schemes", () => {
  const html = `
    <html>
      <body>
        <a href="javascript:alert(1)">Boil water advisory after contamination</a>
        <a href="https://example.com/safe">River water contamination warning</a>
      </body>
    </html>
  `;

  const entries = extractRiskEntries(html, "Example Source", "https://example.com");

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.link, "https://example.com/safe");
});

test("extractRiskEntriesFromFeed keeps water-risk RSS items", () => {
  const xml = `
    <rss>
      <channel>
        <item>
          <title>Boil water advisory issued after treatment failure</title>
          <description>Residents are asked to conserve water until repairs finish.</description>
          <link>https://example.com/advisory</link>
          <pubDate>Fri, 06 Mar 2026 14:05:00 GMT</pubDate>
        </item>
        <item>
          <title>Weekend festival lineup announced</title>
          <description>No impact expected.</description>
          <link>https://example.com/festival</link>
        </item>
      </channel>
    </rss>
  `;

  const entries = extractRiskEntriesFromFeed(xml, "Example Feed", "https://example.com/rss.xml");

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.link, "https://example.com/advisory");
  assert.equal(entries[0]?.publishedAt, "2026-03-06T14:05:00.000Z");
});

test("extractRiskEntriesFromFeed supports atom links and deduplicates repeated items", () => {
  const xml = `
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <title>River water contamination warning remains in effect</title>
        <summary>Sampling found elevated pollutant levels in drinking water.</summary>
        <link href="/alerts/river-warning" />
        <updated>2026-03-06T14:10:00Z</updated>
      </entry>
      <entry>
        <title>River water contamination warning remains in effect</title>
        <summary>Duplicate item from feed refresh for drinking water notice.</summary>
        <link href="/alerts/river-warning" />
        <updated>2026-03-06T14:11:00Z</updated>
      </entry>
    </feed>
  `;

  const entries = extractRiskEntriesFromFeed(xml, "Example Feed", "https://example.com/feed.xml");

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.link, "https://example.com/alerts/river-warning");
});
