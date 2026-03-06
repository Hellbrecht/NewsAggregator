import { strict as assert } from "node:assert";
import { test } from "node:test";

import { extractRiskEntries } from "../apps/worker/src/site-parser";

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
