import { RiskTag } from "./types";

const WATER_TERMS = [
  "water",
  "drinking water",
  "groundwater",
  "reservoir",
  "watershed",
  "well",
  "tap water"
];

const RISK_KEYWORDS: Record<RiskTag, string[]> = {
  contamination: [
    "contaminat",
    "e. coli",
    "lead",
    "arsenic",
    "boil water",
    "unsafe water",
    "toxic"
  ],
  drought: ["drought", "water shortage", "low reservoir", "water restriction"],
  flooding: ["flood", "overflow", "storm surge", "flash flood"],
  infrastructure: ["water main break", "pipe burst", "treatment plant", "pump failure"],
  "quality-alert": ["advisory", "warning", "notice", "alert", "do not drink"],
  pollution: ["sewage", "spill", "chemical release", "pollution", "runoff"]
};

export function classifyWaterRisk(text: string): RiskTag[] {
  const normalized = normalize(text);

  if (!containsAny(normalized, WATER_TERMS)) {
    return [];
  }

  const matches = (Object.keys(RISK_KEYWORDS) as RiskTag[]).filter((riskTag) =>
    containsAny(normalized, RISK_KEYWORDS[riskTag])
  );

  return matches;
}

export function isWaterRiskRelated(text: string): boolean {
  return classifyWaterRisk(text).length > 0;
}

function containsAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(normalize(term)));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
