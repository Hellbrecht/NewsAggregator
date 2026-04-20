import { strict as assert } from "node:assert";
import { test } from "node:test";

import { extractHtmlHeadlineArticles } from "../src/ingestion/html_ingestor";
import { Source } from "../src/models/Source";

const SOURCE: Source = {
  id: "example-html-source",
  name: "Example HTML Source",
  url: "https://example.com/news",
  topic: "world",
  region: "canada",
  reliability_score: 8,
  intervalMinutes: 60
};

test("extractHtmlHeadlineArticles keeps relevant water-risk headlines from HTML pages", () => {
  const html = `
    <html>
      <body>
        <a href="/story-1">Flood risk rises as warmer weather hits central Canada</a>
        <a href="/story-2">Election debate scheduled for Thursday night</a>
        <a href="/story-3">City expands drinking water testing after contamination concern</a>
      </body>
    </html>
  `;

  const articles = extractHtmlHeadlineArticles(html, SOURCE);

  assert.equal(articles.length, 2);
  assert.equal(articles[0]?.source_id, SOURCE.id);
  assert(articles.every((article) => article.raw_content.includes("https://example.com/")));
});

test("extractHtmlHeadlineArticles rejects unsafe URLs and duplicate anchors", () => {
  const html = `
    <html>
      <body>
        <a href="javascript:alert(1)">Flood risk rises after heavy rain</a>
        <a href="/story-1">Flood risk rises after heavy rain</a>
        <a href="/story-1">Flood risk rises after heavy rain</a>
      </body>
    </html>
  `;

  const articles = extractHtmlHeadlineArticles(html, SOURCE);

  assert.equal(articles.length, 1);
  assert.equal(articles[0]?.source_id, SOURCE.id);
  assert(articles[0]?.raw_content.includes("https://example.com/story-1"));
});
