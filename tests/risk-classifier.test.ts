import { strict as assert } from "node:assert";
import { test } from "node:test";

import { classifyWaterRisk } from "../packages/shared/src";

test("classifyWaterRisk detects contamination and alert terms", () => {
  const text =
    "City issues boil water advisory after E. coli contamination was found in tap water.";
  const tags = classifyWaterRisk(text);

  assert(tags.includes("contamination"));
  assert(tags.includes("quality-alert"));
});

test("classifyWaterRisk returns empty for unrelated content", () => {
  const text = "Local sports team won the championship after overtime.";
  const tags = classifyWaterRisk(text);

  assert.equal(tags.length, 0);
});
