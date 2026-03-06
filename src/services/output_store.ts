import { promises as fs } from "node:fs";
import path from "node:path";

import { Article } from "../models/Article";
import { DatasetEvent } from "../models/Dataset";

const OUTPUT_DIR = path.resolve(__dirname, "../../data/ingested");
const ARTICLES_FILE = path.join(OUTPUT_DIR, "articles.json");
const DATASET_EVENTS_FILE = path.join(OUTPUT_DIR, "dataset_events.json");
const ITEM_STATE_FILE = path.join(OUTPUT_DIR, "item_state.json");
const MAX_ARTICLES = 20_000;
const MAX_DATASET_EVENTS = 50_000;

interface ItemState {
  reviewed: boolean;
  starred: boolean;
  relevanceFeedback?: "up" | "down" | null;
  updatedAt: string;
}

type ItemStateMap = Record<string, ItemState>;

export interface UpsertArticlesResult {
  inserted: number;
  deduped: number;
  total: number;
  stateMappingsPreserved: number;
}

export interface UpsertDatasetEventsResult {
  inserted: number;
  deduped: number;
  total: number;
}

let articleCache: Article[] | null = null;
let datasetCache: DatasetEvent[] | null = null;
let itemStateCache: ItemStateMap | null = null;

let articleWriteQueue = Promise.resolve<UpsertArticlesResult>({
  inserted: 0,
  deduped: 0,
  total: 0,
  stateMappingsPreserved: 0
});

let datasetWriteQueue = Promise.resolve<UpsertDatasetEventsResult>({
  inserted: 0,
  deduped: 0,
  total: 0
});

export async function loadStoredArticles(): Promise<Article[]> {
  const rows = await loadStoredArticlesInternal();
  return [...rows];
}

export async function loadStoredDatasetEvents(): Promise<DatasetEvent[]> {
  const rows = await loadStoredDatasetEventsInternal();
  return [...rows];
}

export async function appendArticles(entries: Article[]): Promise<number> {
  const result = await upsertArticles(entries);
  return result.inserted;
}

export async function appendDatasetEvents(entries: DatasetEvent[]): Promise<number> {
  const result = await upsertDatasetEvents(entries);
  return result.inserted;
}

export async function upsertArticles(entries: Article[]): Promise<UpsertArticlesResult> {
  if (entries.length === 0) {
    const existing = await loadStoredArticlesInternal();
    return {
      inserted: 0,
      deduped: 0,
      total: existing.length,
      stateMappingsPreserved: 0
    };
  }

  const run = async (): Promise<UpsertArticlesResult> => {
    const existing = await loadStoredArticlesInternal();
    const states = await loadItemStateMapInternal();
    const { merged, nextStates, stateChanged, inserted, deduped, stateMappingsPreserved } =
      mergeArticles(existing, entries, states);
    const bounded = merged.slice(0, MAX_ARTICLES);

    articleCache = bounded;
    await writeJsonArray(ARTICLES_FILE, bounded);

    if (stateChanged) {
      itemStateCache = nextStates;
      await writeJsonObject(ITEM_STATE_FILE, nextStates);
    }

    return {
      inserted,
      deduped,
      total: bounded.length,
      stateMappingsPreserved
    };
  };

  const nextWrite = articleWriteQueue.then(run, run);
  articleWriteQueue = nextWrite.then(
    () => ({
      inserted: 0,
      deduped: 0,
      total: 0,
      stateMappingsPreserved: 0
    }),
    () => ({
      inserted: 0,
      deduped: 0,
      total: 0,
      stateMappingsPreserved: 0
    })
  );
  return nextWrite;
}

export async function upsertDatasetEvents(
  entries: DatasetEvent[]
): Promise<UpsertDatasetEventsResult> {
  if (entries.length === 0) {
    const existing = await loadStoredDatasetEventsInternal();
    return {
      inserted: 0,
      deduped: 0,
      total: existing.length
    };
  }

  const run = async (): Promise<UpsertDatasetEventsResult> => {
    const existing = await loadStoredDatasetEventsInternal();
    const { merged, inserted, deduped } = mergeDatasetEvents(existing, entries);
    const bounded = merged.slice(0, MAX_DATASET_EVENTS);
    datasetCache = bounded;
    await writeJsonArray(DATASET_EVENTS_FILE, bounded);

    return {
      inserted,
      deduped,
      total: bounded.length
    };
  };

  const nextWrite = datasetWriteQueue.then(run, run);
  datasetWriteQueue = nextWrite.then(
    () => ({
      inserted: 0,
      deduped: 0,
      total: 0
    }),
    () => ({
      inserted: 0,
      deduped: 0,
      total: 0
    })
  );
  return nextWrite;
}

export function resetOutputStoreCacheForTests(): void {
  articleCache = null;
  datasetCache = null;
  itemStateCache = null;
  articleWriteQueue = Promise.resolve({
    inserted: 0,
    deduped: 0,
    total: 0,
    stateMappingsPreserved: 0
  });
  datasetWriteQueue = Promise.resolve({
    inserted: 0,
    deduped: 0,
    total: 0
  });
}

interface MergeArticlesResult {
  merged: Article[];
  nextStates: ItemStateMap;
  stateChanged: boolean;
  inserted: number;
  deduped: number;
  stateMappingsPreserved: number;
}

function mergeArticles(
  existing: Article[],
  incoming: Article[],
  currentStates: ItemStateMap
): MergeArticlesResult {
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  const canonicalIdByHash = new Map<string, string>();
  for (const entry of existing) {
    canonicalIdByHash.set(getDedupeKey(entry.id, entry.dedupe_hash), entry.id);
  }

  let inserted = 0;
  let deduped = 0;
  let stateMappingsPreserved = 0;
  let stateChanged = false;
  const nextStates: ItemStateMap = { ...currentStates };

  for (const candidate of incoming) {
    const dedupeKey = getDedupeKey(candidate.id, candidate.dedupe_hash);
    const existingById = byId.get(candidate.id);
    if (existingById) {
      byId.set(candidate.id, choosePreferredArticle(existingById, candidate));
      canonicalIdByHash.set(dedupeKey, candidate.id);
      continue;
    }

    const canonicalId = canonicalIdByHash.get(dedupeKey);
    if (canonicalId) {
      deduped += 1;

      if (nextStates[candidate.id] && !nextStates[canonicalId]) {
        nextStates[canonicalId] = nextStates[candidate.id];
        delete nextStates[candidate.id];
        stateChanged = true;
        stateMappingsPreserved += 1;
      }

      continue;
    }

    inserted += 1;
    byId.set(candidate.id, candidate);
    canonicalIdByHash.set(dedupeKey, candidate.id);
  }

  const merged = [...byId.values()].sort((a, b) =>
    compareIsoDescending(a.published_at, b.published_at)
  );

  return {
    merged,
    nextStates,
    stateChanged,
    inserted,
    deduped,
    stateMappingsPreserved
  };
}

function mergeDatasetEvents(
  existing: DatasetEvent[],
  incoming: DatasetEvent[]
): {
  merged: DatasetEvent[];
  inserted: number;
  deduped: number;
} {
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  const canonicalIdByHash = new Map<string, string>();
  for (const entry of existing) {
    canonicalIdByHash.set(getDedupeKey(entry.id, entry.dedupe_hash), entry.id);
  }

  let inserted = 0;
  let deduped = 0;

  for (const candidate of incoming) {
    const dedupeKey = getDedupeKey(candidate.id, candidate.dedupe_hash);
    const existingById = byId.get(candidate.id);
    if (existingById) {
      byId.set(candidate.id, choosePreferredDatasetEvent(existingById, candidate));
      canonicalIdByHash.set(dedupeKey, candidate.id);
      continue;
    }

    if (canonicalIdByHash.has(dedupeKey)) {
      deduped += 1;
      continue;
    }

    inserted += 1;
    byId.set(candidate.id, candidate);
    canonicalIdByHash.set(dedupeKey, candidate.id);
  }

  const merged = [...byId.values()].sort((a, b) => compareIsoDescending(a.timestamp, b.timestamp));
  return {
    merged,
    inserted,
    deduped
  };
}

function choosePreferredArticle(existing: Article, incoming: Article): Article {
  return compareIsoDescending(incoming.published_at, existing.published_at) <= 0 ? incoming : existing;
}

function choosePreferredDatasetEvent(existing: DatasetEvent, incoming: DatasetEvent): DatasetEvent {
  return compareIsoDescending(incoming.timestamp, existing.timestamp) <= 0 ? incoming : existing;
}

function compareIsoDescending(left: string, right: string): number {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  const leftIsValid = Number.isFinite(leftMs);
  const rightIsValid = Number.isFinite(rightMs);

  if (leftIsValid && rightIsValid && leftMs !== rightMs) {
    return leftMs < rightMs ? 1 : -1;
  }

  if (left === right) {
    return 0;
  }

  return left < right ? 1 : -1;
}

function getDedupeKey(id: string, hash: string | undefined): string {
  const key = (hash ?? id).trim();
  return key || id;
}

async function loadStoredArticlesInternal(): Promise<Article[]> {
  if (articleCache) {
    return articleCache;
  }

  articleCache = await readJsonArray<Article>(ARTICLES_FILE);
  return articleCache;
}

async function loadStoredDatasetEventsInternal(): Promise<DatasetEvent[]> {
  if (datasetCache) {
    return datasetCache;
  }

  datasetCache = await readJsonArray<DatasetEvent>(DATASET_EVENTS_FILE);
  return datasetCache;
}

async function loadItemStateMapInternal(): Promise<ItemStateMap> {
  if (itemStateCache) {
    return itemStateCache;
  }

  itemStateCache = await readJsonObject<ItemStateMap>(ITEM_STATE_FILE);
  return itemStateCache;
}

async function readJsonArray<T>(filePath: string): Promise<T[]> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

async function readJsonObject<T extends Record<string, unknown>>(filePath: string): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {} as T;
    }

    return parsed as T;
  } catch {
    return {} as T;
  }
}

async function writeJsonArray<T>(filePath: string, rows: T[]): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(rows, null, 2), "utf8");
}

async function writeJsonObject(filePath: string, payload: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}
