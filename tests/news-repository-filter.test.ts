import { strict as assert } from "node:assert";
import { test } from "node:test";

import { toNewsEntryFromPipelineArticle } from "../apps/web/src/news-repository";

test("toNewsEntryFromPipelineArticle rejects raw-only non-water matches", () => {
  const entry = toNewsEntryFromPipelineArticle({
    id: "pipeline-1",
    source_id: "reuters-env",
    title: "Toyota plans around $19 billion share sale by financial institutions",
    summary: "Executives described the move as a watershed moment for governance reform.",
    published_at: "2026-03-01T00:00:00.000Z",
    raw_content:
      "Toyota plans around $19 billion share sale by financial institutions. https://example.com/toyota-share-sale"
  });

  assert.equal(entry, null);
});

test("toNewsEntryFromPipelineArticle allows untitled items when raw content is water-relevant", () => {
  const entry = toNewsEntryFromPipelineArticle({
    id: "pipeline-2",
    source_id: "radio-canada-economie",
    title: "Untitled from Radio-Canada Info - Economie",
    summary: "Voir le reportage complet.",
    published_at: "2026-03-01T00:00:00.000Z",
    raw_content:
      "Le manque d'eau dans les reservoirs force Hydro-Quebec a limiter ses exportations. https://ici.radio-canada.ca/info/videos/1-1234567"
  });

  assert.notEqual(entry, null);
  assert.equal(entry?.link, "https://ici.radio-canada.ca/info/videos/1-1234567");
  assert.equal(entry?.title, "Voir le reportage complet");
});
