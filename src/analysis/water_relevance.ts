const WORD_PATTERNS = [
  /\bwater (quality|supply|scarcity|shortage|crisis|security|management|infrastructure|utility|utilities|rights|dispute|conflict|restriction(s)?)\b/,
  /\bwaters (quality|supply|scarcity|shortage|crisis|security|management|rights|dispute|conflict)\b/,
  /\bdrinking water\b/,
  /\bgroundwater\b/,
  /\bwastewater\b/,
  /\bwater treatment\b/,
  /\bwater main\b/,
  /\bwater utility\b/,
  /\bsewage\b/,
  /\breservoir(s)?\b/,
  /\baquifer(s)?\b/,
  /\bwatershed (management|restoration|protection|health)\b/,
  /\bstormwater\b/,
  /\bhydrolog(y|ic|ical)\b/,
  /\bwater conference\b/,
  /\bwater week\b/,
  /\bwater summit\b/,
  /\birrigation\b/,
  /\bdrought\b/,
  /\bflood(ing)?\b/,
  /\b(contaminated|contamination in) (water|drinking water|groundwater|surface water|river(s)?|lake(s)?|reservoir(s)?|aquifer(s)?|wastewater)\b/,
  /\b(water|drinking water|groundwater|surface water|river(s)?|lake(s)?|reservoir(s)?|aquifer(s)?|wastewater) contamination\b/,
  /\b(pollution in|polluted) (water|drinking water|groundwater|surface water|river(s)?|lake(s)?|reservoir(s)?|aquifer(s)?|wastewater)\b/,
  /\b(water|groundwater|river(s)?|lake(s)?|reservoir(s)?|aquifer(s)?|wastewater) pollution\b/,
  /\bdam(s)?\b/,
  /\briver(s)?\b/,
  /\blake(s)?\b/,
  /\bspill(s)?\b/,
  /\bcrise de l'eau\b/,
  /\bgestion de l'eau\b/,
  /\bqualite de l'eau\b/,
  /\bqualité de l'eau\b/,
  /\bpenurie d'eau\b/,
  /\bpénurie d'eau\b/,
  /\bressources en eau\b/,
  /\bdistribution d'eau\b/,
  /\bapprovisionnement en eau\b/,
  /\beau potable\b/,
  /\beaux? usees?\b/,
  /\beaux? us[eé]es\b/,
  /\bsecheresse\b/,
  /\bstress hydrique\b/,
  /\binondation(s)?\b/,
  /\bcrue(s)?\b/,
  /\bsubmersion\b/,
  /\bdebordement(s)?\b/,
  /\baquifere(s)?\b/,
  /\bnappe(s)? phreatique(s)?\b/,
  /\bcanalisation(s)?\b/,
  /\bbarrage (hydro|de retenue|d'eau)\b/,
  /\bbarrage hydro[eé]lectrique\b/,
  /\bhydrologique(s)?\b/,
  /\bdeversement(s)?\b/
];

const STOP_WORDS = new Set([
  "about",
  "after",
  "alert",
  "amid",
  "analysis",
  "another",
  "because",
  "before",
  "breaking",
  "change",
  "city",
  "could",
  "daily",
  "first",
  "from",
  "global",
  "group",
  "into",
  "just",
  "latest",
  "local",
  "major",
  "market",
  "minister",
  "national",
  "new",
  "news",
  "over",
  "plan",
  "policy",
  "report",
  "said",
  "state",
  "their",
  "this",
  "today",
  "update",
  "water",
  "when",
  "with",
  "world",
  "year"
]);

const TOKEN_SIGNAL_CAP = 4;
const NEGATIVE_SIGNAL_REJECT_THRESHOLD = -6;
const POSITIVE_SIGNAL_ACCEPT_THRESHOLD = 6;
const MAX_TOKENS_PER_TEXT = 28;
const MIN_TOKEN_LENGTH = 4;

export type RelevanceFeedback = "up" | "down";

export interface RelevanceTokenStats {
  up: number;
  down: number;
}

export interface RelevanceProfile {
  version: 1;
  updatedAt: string;
  totals: {
    up: number;
    down: number;
  };
  tokens: Record<string, RelevanceTokenStats>;
}

export interface WaterRelevanceDecision {
  accepted: boolean;
  matchedPattern: boolean;
  tokenSignal: number;
  matchedLearnedTokens: string[];
}

export function isWaterRelevantText(value: string, profile?: RelevanceProfile): boolean {
  return evaluateWaterRelevance(value, profile).accepted;
}

export function evaluateWaterRelevance(
  value: string,
  profile?: RelevanceProfile
): WaterRelevanceDecision {
  const normalized = normalizeForWaterMatch(value);
  if (!normalized) {
    return {
      accepted: false,
      matchedPattern: false,
      tokenSignal: 0,
      matchedLearnedTokens: []
    };
  }

  const matchedPattern = WORD_PATTERNS.some((pattern) => pattern.test(normalized));
  const learnedTokens = extractRelevanceFeedbackTokens(normalized);
  const { tokenSignal, matchedLearnedTokens } = computeProfileSignal(learnedTokens, profile);

  let accepted = matchedPattern;
  if (matchedPattern && tokenSignal <= NEGATIVE_SIGNAL_REJECT_THRESHOLD) {
    accepted = false;
  } else if (!matchedPattern && tokenSignal >= POSITIVE_SIGNAL_ACCEPT_THRESHOLD) {
    accepted = true;
  }

  return {
    accepted,
    matchedPattern,
    tokenSignal,
    matchedLearnedTokens
  };
}

export function extractRelevanceFeedbackTokens(value: string): string[] {
  const normalized = normalizeForWaterMatch(value);
  if (!normalized) {
    return [];
  }

  const deduped = new Set<string>();
  const rawTokens = normalized.split(/[^a-z0-9]+/g);
  for (const token of rawTokens) {
    if (!token || token.length < MIN_TOKEN_LENGTH || STOP_WORDS.has(token) || /^\d+$/.test(token)) {
      continue;
    }

    deduped.add(token);
    if (deduped.size >= MAX_TOKENS_PER_TEXT) {
      break;
    }
  }

  return [...deduped];
}

function computeProfileSignal(
  tokens: string[],
  profile: RelevanceProfile | undefined
): { tokenSignal: number; matchedLearnedTokens: string[] } {
  if (!profile || !profile.tokens || tokens.length === 0) {
    return { tokenSignal: 0, matchedLearnedTokens: [] };
  }

  let tokenSignal = 0;
  const matchedLearnedTokens: string[] = [];

  for (const token of tokens) {
    const stats = profile.tokens[token];
    if (!stats) {
      continue;
    }

    matchedLearnedTokens.push(token);
    tokenSignal += clamp(stats.up - stats.down, -TOKEN_SIGNAL_CAP, TOKEN_SIGNAL_CAP);
  }

  return { tokenSignal, matchedLearnedTokens };
}

function normalizeForWaterMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
