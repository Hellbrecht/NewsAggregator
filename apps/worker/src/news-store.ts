import { promises as fs } from "node:fs";
import path from "node:path";

import { NewsEntry } from "../../../packages/shared/src";

const DEFAULT_STORE_PATH = path.resolve(__dirname, "../../../data/news-entries.json");
let mergeQueue = Promise.resolve<void>(undefined);

export async function readEntries(): Promise<NewsEntry[]> {
  try {
    const raw = await fs.readFile(DEFAULT_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isEntryLike).sort(byNewestFirst);
  } catch {
    return [];
  }
}

export function mergeAndSaveEntries(incoming: NewsEntry[]): Promise<number> {
  if (incoming.length === 0) {
    return Promise.resolve(0);
  }

  const run = async (): Promise<number> => {
    const existing = await readEntries();
    const byLink = new Map<string, NewsEntry>();

    for (const entry of existing) {
      byLink.set(normalizeLink(entry.link), entry);
    }

    let inserted = 0;
    for (const entry of incoming) {
      if (!isEntryLike(entry)) {
        continue;
      }

      const key = normalizeLink(entry.link);
      if (!byLink.has(key)) {
        inserted += 1;
        byLink.set(key, entry);
      }
    }

    const merged = [...byLink.values()].sort(byNewestFirst).slice(0, 2000);
    await fs.mkdir(path.dirname(DEFAULT_STORE_PATH), { recursive: true });
    await fs.writeFile(DEFAULT_STORE_PATH, JSON.stringify(merged, null, 2), "utf8");

    return inserted;
  };

  const next = mergeQueue.then(run, run);
  mergeQueue = next.then(
    () => undefined,
    () => undefined
  );

  return next;
}

function normalizeLink(link: string): string {
  return link.trim().toLowerCase();
}

function byNewestFirst(a: NewsEntry, b: NewsEntry): number {
  return a.publishedAt < b.publishedAt ? 1 : -1;
}

function isEntryLike(value: unknown): value is NewsEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybe = value as Partial<NewsEntry>;
  return Boolean(
    maybe.id &&
      maybe.title &&
      maybe.link &&
      maybe.publishedAt &&
      isSafeHttpUrl(maybe.link) &&
      isValidDate(maybe.publishedAt)
  );
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}
