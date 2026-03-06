import { strict as assert } from "node:assert";
import { test } from "node:test";

import { classifyRisk } from "../src/analysis/risk_classifier";

test("classifyRisk detects flood and infrastructure risk signals", () => {
  const labels = classifyRisk("Severe flood warning after dam failure and treatment plant outage.");

  assert(labels.includes("flood"));
  assert(labels.includes("infrastructure risk"));
});

test("classifyRisk detects water conflict and irrigation stress", () => {
  const labels = classifyRisk("Cross-border water dispute increased irrigation demand stress.");

  assert(labels.includes("water conflict"));
  assert(labels.includes("irrigation stress"));
});

test("classifyRisk detects French flood and pollution signals", () => {
  const labels = classifyRisk(
    "Alerte inondation apres un deversement chimique dans des eaux usees."
  );

  assert(labels.includes("flood"));
  assert(labels.includes("pollution"));
});

test("classifyRisk detects French drought and water conflict signals", () => {
  const labels = classifyRisk(
    "La secheresse et un conflit de l'eau aggravent le stress hydrique agricole."
  );

  assert(labels.includes("drought"));
  assert(labels.includes("water conflict"));
  assert(labels.includes("irrigation stress"));
});
