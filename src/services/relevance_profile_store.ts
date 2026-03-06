import { promises as fs } from "node:fs";
import path from "node:path";

import {
  extractRelevanceFeedbackTokens,
  RelevanceFeedback,
  RelevanceProfile,
  RelevanceTokenStats
} from "../analysis/water_relevance";

const DEFAULT_PROFILE_PATH = path.resolve(__dirname, "../../data/ingested/relevance_profile.json");
const PROFILE_PATH = path.resolve(process.env.RELEVANCE_PROFILE_PATH ?? DEFAULT_PROFILE_PATH);
const PROFILE_CACHE_TTL_MS = 5_000;
const MAX_TRACKED_TOKENS = 2_000;

interface CachedProfile {
  value: RelevanceProfile;
  expiresAt: number;
}

export interface ApplyRelevanceFeedbackInput {
  text: string;
  previousFeedback: RelevanceFeedback | null;
  nextFeedback: RelevanceFeedback | null;
}

let cachedProfile: CachedProfile | null = null;
let writeQueue = Promise.resolve<RelevanceProfile>(createEmptyProfile());

export async function loadRelevanceProfile(): Promise<RelevanceProfile> {
  const now = Date.now();
  if (cachedProfile && cachedProfile.expiresAt > now) {
    return cloneProfile(cachedProfile.value);
  }

  const loaded = await readProfileFromDisk();
  cachedProfile = {
    value: loaded,
    expiresAt: now + PROFILE_CACHE_TTL_MS
  };

  return cloneProfile(loaded);
}

export async function applyRelevanceFeedback(
  input: ApplyRelevanceFeedbackInput
): Promise<RelevanceProfile> {
  const normalized = normalizeFeedbackInput(input);
  if (!normalized) {
    return loadRelevanceProfile();
  }

  const run = async (): Promise<RelevanceProfile> => {
    const current = await readProfileFromDisk();
    const next = mergeFeedback(current, normalized);
    if (!next.changed) {
      cachedProfile = {
        value: next.profile,
        expiresAt: Date.now() + PROFILE_CACHE_TTL_MS
      };
      return cloneProfile(next.profile);
    }

    await fs.mkdir(path.dirname(PROFILE_PATH), { recursive: true });
    await fs.writeFile(PROFILE_PATH, JSON.stringify(next.profile, null, 2), "utf8");

    cachedProfile = {
      value: next.profile,
      expiresAt: Date.now() + PROFILE_CACHE_TTL_MS
    };

    return cloneProfile(next.profile);
  };

  const nextWrite = writeQueue.then(run, run);
  writeQueue = nextWrite.then(
    () => createEmptyProfile(),
    () => createEmptyProfile()
  );

  return nextWrite;
}

export function resetRelevanceProfileCacheForTests(): void {
  cachedProfile = null;
  writeQueue = Promise.resolve(createEmptyProfile());
}

function normalizeFeedbackInput(
  input: ApplyRelevanceFeedbackInput
): ApplyRelevanceFeedbackInput | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const text = input.text?.trim() ?? "";
  const previousFeedback = normalizeFeedbackValue(input.previousFeedback);
  const nextFeedback = normalizeFeedbackValue(input.nextFeedback);
  if (!text || previousFeedback === nextFeedback) {
    return null;
  }

  return {
    text,
    previousFeedback,
    nextFeedback
  };
}

function mergeFeedback(
  profile: RelevanceProfile,
  input: ApplyRelevanceFeedbackInput
): { changed: boolean; profile: RelevanceProfile } {
  const deltaUp = voteDelta(input.previousFeedback, input.nextFeedback, "up");
  const deltaDown = voteDelta(input.previousFeedback, input.nextFeedback, "down");
  if (deltaUp === 0 && deltaDown === 0) {
    return {
      changed: false,
      profile
    };
  }

  const tokens = extractRelevanceFeedbackTokens(input.text);
  if (tokens.length === 0) {
    return {
      changed: false,
      profile
    };
  }

  const nextProfile = cloneProfile(profile);
  nextProfile.totals.up = clampCount(nextProfile.totals.up + deltaUp);
  nextProfile.totals.down = clampCount(nextProfile.totals.down + deltaDown);

  for (const token of tokens) {
    const current = nextProfile.tokens[token] ?? { up: 0, down: 0 };
    const updated = {
      up: clampCount(current.up + deltaUp),
      down: clampCount(current.down + deltaDown)
    };

    if (updated.up === 0 && updated.down === 0) {
      delete nextProfile.tokens[token];
    } else {
      nextProfile.tokens[token] = updated;
    }
  }

  nextProfile.tokens = pruneTokenMap(nextProfile.tokens);
  nextProfile.updatedAt = new Date().toISOString();

  return {
    changed: true,
    profile: nextProfile
  };
}

function voteDelta(
  previousFeedback: RelevanceFeedback | null,
  nextFeedback: RelevanceFeedback | null,
  target: RelevanceFeedback
): number {
  const wasTarget = previousFeedback === target ? 1 : 0;
  const isTarget = nextFeedback === target ? 1 : 0;
  return isTarget - wasTarget;
}

function pruneTokenMap(
  map: Record<string, RelevanceTokenStats>
): Record<string, RelevanceTokenStats> {
  const entries = Object.entries(map).filter(([, stats]) => stats.up > 0 || stats.down > 0);
  if (entries.length <= MAX_TRACKED_TOKENS) {
    return Object.fromEntries(entries);
  }

  entries.sort((left, right) => scoreTokenStats(right[1]) - scoreTokenStats(left[1]));
  return Object.fromEntries(entries.slice(0, MAX_TRACKED_TOKENS));
}

function scoreTokenStats(stats: RelevanceTokenStats): number {
  return stats.up + stats.down + Math.abs(stats.up - stats.down);
}

async function readProfileFromDisk(): Promise<RelevanceProfile> {
  try {
    const raw = await fs.readFile(PROFILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return normalizeProfile(parsed);
  } catch {
    return createEmptyProfile();
  }
}

function normalizeProfile(value: unknown): RelevanceProfile {
  if (!value || typeof value !== "object") {
    return createEmptyProfile();
  }

  const maybe = value as Partial<RelevanceProfile>;
  const tokensInput =
    maybe.tokens && typeof maybe.tokens === "object" && !Array.isArray(maybe.tokens)
      ? (maybe.tokens as Record<string, unknown>)
      : {};

  const tokens: Record<string, RelevanceTokenStats> = {};
  for (const [token, stats] of Object.entries(tokensInput)) {
    if (!token) {
      continue;
    }

    const normalizedStats = normalizeTokenStats(stats);
    if (!normalizedStats || (normalizedStats.up === 0 && normalizedStats.down === 0)) {
      continue;
    }

    tokens[token] = normalizedStats;
  }

  return {
    version: 1,
    updatedAt: typeof maybe.updatedAt === "string" ? maybe.updatedAt : "",
    totals: {
      up: clampCount(maybe.totals?.up),
      down: clampCount(maybe.totals?.down)
    },
    tokens
  };
}

function normalizeTokenStats(value: unknown): RelevanceTokenStats | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const maybe = value as Partial<RelevanceTokenStats>;
  return {
    up: clampCount(maybe.up),
    down: clampCount(maybe.down)
  };
}

function normalizeFeedbackValue(value: unknown): RelevanceFeedback | null {
  return value === "up" || value === "down" ? value : null;
}

function createEmptyProfile(): RelevanceProfile {
  return {
    version: 1,
    updatedAt: "",
    totals: {
      up: 0,
      down: 0
    },
    tokens: {}
  };
}

function clampCount(value: unknown): number {
  const numberValue = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
  return numberValue > 0 ? numberValue : 0;
}

function cloneProfile(profile: RelevanceProfile): RelevanceProfile {
  return {
    version: 1,
    updatedAt: profile.updatedAt,
    totals: {
      up: profile.totals.up,
      down: profile.totals.down
    },
    tokens: Object.fromEntries(
      Object.entries(profile.tokens).map(([token, stats]) => [
        token,
        { up: stats.up, down: stats.down }
      ])
    )
  };
}
