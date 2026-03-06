import { strict as assert } from "node:assert";
import { test } from "node:test";

import { summarizeArticleCandidate } from "../src/analysis/ai_summarizer";

test("summarizeArticleCandidate does not prefix summary with punctuation when title is empty", () => {
  const summary = summarizeArticleCandidate(
    "",
    "Certains adolescents sont plus resilients que d'autres a la suite d'une catastrophe."
  );

  assert.equal(summary.startsWith("."), false);
  assert.equal(summary.startsWith("Certains adolescents"), true);
});
