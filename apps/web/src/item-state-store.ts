import { promises as fs } from "node:fs";
import path from "node:path";

import { ItemState, ItemStateMap, RelevanceFeedback } from "./feed-types";

const STATE_PATH = path.resolve(__dirname, "../../../data/ingested/item_state.json");
const STATE_CACHE_TTL_MS = 5_000;

let cachedState: { value: ItemStateMap; expiresAt: number } | null = null;
let writeQueue = Promise.resolve<void>(undefined);

export async function loadItemStateMap(): Promise<ItemStateMap> {
  const now = Date.now();
  if (cachedState && cachedState.expiresAt > now) {
    return cachedState.value;
  }

  const loaded = await readStateMapFromDisk();
  cachedState = {
    value: loaded,
    expiresAt: now + STATE_CACHE_TTL_MS
  };

  return loaded;
}

export async function setItemReviewed(id: string, reviewed: boolean): Promise<ItemState> {
  return updateItemState(id, { reviewed });
}

export async function setItemStarred(id: string, starred: boolean): Promise<ItemState> {
  return updateItemState(id, { starred });
}

export async function setItemRelevance(
  id: string,
  relevanceFeedback: RelevanceFeedback
): Promise<ItemState> {
  return updateItemState(id, { relevanceFeedback });
}

export function resolveItemState(states: ItemStateMap, id: string): ItemState {
  const current = states[id];
  return {
    reviewed: current?.reviewed ?? false,
    starred: current?.starred ?? false,
    relevanceFeedback: current?.relevanceFeedback ?? null,
    updatedAt: current?.updatedAt ?? ""
  };
}

async function updateItemState(
  id: string,
  patch: Partial<Pick<ItemState, "reviewed" | "starred" | "relevanceFeedback">>
): Promise<ItemState> {
  const normalizedId = id.trim();
  if (!normalizedId) {
    throw new Error("Item id is required.");
  }

  const run = async (): Promise<ItemState> => {
    const currentState = await readStateMapFromDisk();
    const previous = currentState[normalizedId];
    const hasRelevanceFeedback = Object.prototype.hasOwnProperty.call(
      patch,
      "relevanceFeedback"
    );
    const next: ItemState = {
      reviewed: patch.reviewed ?? previous?.reviewed ?? false,
      starred: patch.starred ?? previous?.starred ?? false,
      relevanceFeedback: hasRelevanceFeedback
        ? patch.relevanceFeedback ?? null
        : previous?.relevanceFeedback ?? null,
      updatedAt: new Date().toISOString()
    };

    currentState[normalizedId] = next;
    await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
    await fs.writeFile(STATE_PATH, JSON.stringify(currentState, null, 2), "utf8");
    cachedState = {
      value: currentState,
      expiresAt: Date.now() + STATE_CACHE_TTL_MS
    };

    return next;
  };

  const nextWrite = writeQueue.then(run, run);
  writeQueue = nextWrite.then(
    () => undefined,
    () => undefined
  );

  return nextWrite;
}

async function readStateMapFromDisk(): Promise<ItemStateMap> {
  try {
    const raw = await fs.readFile(STATE_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const normalized: ItemStateMap = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const state = normalizeState(value);
      if (state) {
        normalized[id] = state;
      }
    }

    return normalized;
  } catch {
    return {};
  }
}

function normalizeState(value: unknown): ItemState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const maybe = value as Partial<ItemState>;
  return {
    reviewed: Boolean(maybe.reviewed),
    starred: Boolean(maybe.starred),
    relevanceFeedback:
      maybe.relevanceFeedback === "up" || maybe.relevanceFeedback === "down"
        ? maybe.relevanceFeedback
        : null,
    updatedAt: typeof maybe.updatedAt === "string" ? maybe.updatedAt : ""
  };
}
