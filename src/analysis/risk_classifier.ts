export type RiskCategory =
  | "drought"
  | "flood"
  | "pollution"
  | "infrastructure risk"
  | "water conflict"
  | "irrigation stress";

const CATEGORY_KEYWORDS: Record<RiskCategory, string[]> = {
  drought: [
    "drought",
    "dry spell",
    "water scarcity",
    "water shortage",
    "low reservoir",
    "secheresse",
    "sécheresse",
    "stress hydrique",
    "penurie d'eau",
    "pénurie d'eau",
    "manque d'eau"
  ],
  flood: [
    "flood",
    "flooding",
    "storm surge",
    "overflow",
    "inundation",
    "flash flood",
    "inondation",
    "inondations",
    "crue",
    "submersion",
    "debordement",
    "débordement"
  ],
  pollution: [
    "contamination",
    "pollution",
    "sewage",
    "chemical spill",
    "toxic",
    "unsafe water",
    "eaux usees",
    "eaux usées",
    "eau non potable",
    "deversement chimique",
    "déversement chimique",
    "eau toxique"
  ],
  "infrastructure risk": [
    "dam failure",
    "water main break",
    "pipe burst",
    "treatment plant outage",
    "infrastructure",
    "rupture de barrage",
    "barrage fragilise",
    "barrage fragilisé",
    "rupture de conduite",
    "canalisation rompue",
    "panne d'usine de traitement"
  ],
  "water conflict": [
    "water conflict",
    "water dispute",
    "water rights",
    "transboundary tension",
    "conflit de l'eau",
    "conflit lie a l'eau",
    "conflit lié a l'eau",
    "litige sur l'eau",
    "droits sur l'eau",
    "tension transfrontaliere",
    "tension transfrontalière"
  ],
  "irrigation stress": [
    "irrigation stress",
    "crop water stress",
    "irrigation demand",
    "agricultural water shortage",
    "stress d'irrigation",
    "demande d'irrigation",
    "stress hydrique agricole",
    "penurie d'eau agricole",
    "pénurie d'eau agricole"
  ]
};

export function classifyRisk(text: string): RiskCategory[] {
  const normalized = normalize(text);
  if (!normalized) {
    return [];
  }

  return (Object.keys(CATEGORY_KEYWORDS) as RiskCategory[]).filter((category) =>
    CATEGORY_KEYWORDS[category].some((keyword) => normalized.includes(normalize(keyword)))
  );
}

export function isHighPriorityRisk(categories: RiskCategory[]): boolean {
  return categories.some(
    (category) =>
      category === "flood" ||
      category === "pollution" ||
      category === "infrastructure risk" ||
      category === "water conflict"
  );
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
