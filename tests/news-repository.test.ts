import { strict as assert } from "node:assert";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

test("loadEntries includes pipeline-ingested articles in the main news list", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "news-repository-"));
  const legacyPath = path.join(tempDir, "legacy-news-entries.json");
  const pipelinePath = path.join(tempDir, "pipeline-articles.json");

  const previousLegacy = process.env.NEWS_ENTRIES_PATH;
  const previousPipeline = process.env.PIPELINE_ARTICLES_PATH;

  try {
    await fs.writeFile(
      legacyPath,
      JSON.stringify(
        [
          {
            id: "legacy-non-water",
            title: "Finance ministers discuss tax reform",
            summary: "Leaders debated corporate tax rates in a closed-door meeting.",
            link: "https://example.com/finance-tax-reform",
            source: "legacy",
            publishedAt: "2026-03-04T09:00:00.000Z",
            riskTags: []
          }
        ],
        null,
        2
      ),
      "utf8"
    );
    await fs.writeFile(
      pipelinePath,
      JSON.stringify(
        [
          {
            id: "article-1",
            source_id: "radio-canada-environnement",
            title: "Sécheresse et inondation: la crise de l'eau s'aggrave",
            summary: "Un rapport signale une crise hydrique dans plusieurs regions.",
            published_at: "2026-03-04T12:30:00.000Z",
            raw_content:
              "Sécheresse et inondation observées. https://ici.radio-canada.ca/nouvelle/12345",
            risk_labels: ["drought", "flood"]
          }
        ],
        null,
        2
      ),
      "utf8"
    );

    process.env.NEWS_ENTRIES_PATH = legacyPath;
    process.env.PIPELINE_ARTICLES_PATH = pipelinePath;

    const repository = await import("../apps/web/src/news-repository");
    const entries = await repository.loadEntries();

    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, "article-1");
    assert.equal(entries[0].source, "radio-canada-environnement");
    assert.equal(entries[0].link, "https://ici.radio-canada.ca/nouvelle/12345");
    assert(entries[0].riskTags.includes("drought"));
    assert(entries[0].riskTags.includes("flooding"));
  } finally {
    if (previousLegacy === undefined) {
      delete process.env.NEWS_ENTRIES_PATH;
    } else {
      process.env.NEWS_ENTRIES_PATH = previousLegacy;
    }

    if (previousPipeline === undefined) {
      delete process.env.PIPELINE_ARTICLES_PATH;
    } else {
      process.env.PIPELINE_ARTICLES_PATH = previousPipeline;
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
