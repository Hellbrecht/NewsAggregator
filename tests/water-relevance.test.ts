import { strict as assert } from "node:assert";
import { test } from "node:test";

import { isWaterRelevantText, RelevanceProfile } from "../src/analysis/water_relevance";

test("isWaterRelevantText detects english water terms", () => {
  assert.equal(
    isWaterRelevantText("City issues boil water advisory after reservoir contamination."),
    true
  );
});

test("isWaterRelevantText detects french water terms", () => {
  assert.equal(
    isWaterRelevantText("Une inondation majeure suit une periode de secheresse hydrique."),
    true
  );
});

test("isWaterRelevantText rejects unrelated headlines", () => {
  assert.equal(
    isWaterRelevantText("Prime minister meets leaders for trade and defense talks."),
    false
  );
});

test("isWaterRelevantText rejects metaphorical watershed usage", () => {
  assert.equal(
    isWaterRelevantText("Executives called the merger a watershed moment for the company."),
    false
  );
});

test("isWaterRelevantText accepts water event headlines", () => {
  assert.equal(isWaterRelevantText("UN 2026 Water Conference opens in New York."), true);
});

test("isWaterRelevantText learns positive patterns from relevance profile", () => {
  const profile: RelevanceProfile = {
    version: 1,
    updatedAt: "2026-03-05T00:00:00.000Z",
    totals: { up: 2, down: 0 },
    tokens: {
      desalination: { up: 2, down: 0 },
      aquifer: { up: 2, down: 0 },
      recharge: { up: 2, down: 0 }
    }
  };

  assert.equal(
    isWaterRelevantText(
      "Desalination investment accelerates aquifer recharge operations in dry regions.",
      profile
    ),
    true
  );
});

test("isWaterRelevantText can suppress negative learned patterns", () => {
  const profile: RelevanceProfile = {
    version: 1,
    updatedAt: "2026-03-05T00:00:00.000Z",
    totals: { up: 0, down: 3 },
    tokens: {
      parade: { up: 0, down: 3 },
      festival: { up: 0, down: 3 },
      downtown: { up: 0, down: 3 }
    }
  };

  assert.equal(
    isWaterRelevantText(
      "Downtown water quality festival parade celebrates summer events.",
      profile
    ),
    false
  );
});
