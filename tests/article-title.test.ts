import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  generateShortTitleFromSummary,
  isPlaceholderArticleTitle,
  resolveArticleTitle
} from "../src/analysis/article_title";

test("generateShortTitleFromSummary trims leading punctuation", () => {
  const title = generateShortTitleFromSummary(
    ". Certains adolescents sont plus resilients que d'autres a la suite d'une catastrophe."
  );

  assert.equal(
    title,
    "Certains adolescents sont plus resilients que d'autres a la suite d'une catastrophe"
  );
});

test("isPlaceholderArticleTitle detects untitled and sans titre", () => {
  assert.equal(isPlaceholderArticleTitle("Untitled from Radio-Canada Info"), true);
  assert.equal(isPlaceholderArticleTitle("Sans titre"), true);
  assert.equal(isPlaceholderArticleTitle("Water utility raises drought alert"), false);
});

test("resolveArticleTitle keeps non-placeholder titles", () => {
  const title = resolveArticleTitle(
    "Boil water advisory issued after flood",
    "Boil water advisory issued after flood in northern town.",
    "Untitled from Example"
  );

  assert.equal(title, "Boil water advisory issued after flood");
});

test("resolveArticleTitle replaces placeholder title with summary-derived title", () => {
  const title = resolveArticleTitle(
    "Untitled from Radio-Canada Info - Sante",
    ". Certains adolescents sont plus resilients que d'autres a la suite d'une catastrophe.",
    "Untitled from Radio-Canada Info - Sante"
  );

  assert.equal(
    title,
    "Certains adolescents sont plus resilients que d'autres a la suite d'une catastrophe"
  );
});
