import { DateGroup, NewsEntry, PaginatedResult } from "./types";

export function paginate<T>(items: T[], page: number, pageSize: number): PaginatedResult<T> {
  const safePageSize = Math.max(1, pageSize);
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const safePage = clamp(page, 1, totalPages);
  const start = (safePage - 1) * safePageSize;
  const end = start + safePageSize;

  return {
    items: items.slice(start, end),
    page: safePage,
    pageSize: safePageSize,
    totalItems,
    totalPages
  };
}

export function groupEntriesByDate(entries: NewsEntry[]): DateGroup[] {
  const map = new Map<string, number>();

  for (const entry of entries) {
    const date = tryToDateKey(entry.publishedAt);
    if (!date) {
      continue;
    }

    map.set(date, (map.get(date) ?? 0) + 1);
  }

  return [...map.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function toDateKey(isoDate: string): string {
  const dateKey = tryToDateKey(isoDate);
  if (!dateKey) {
    throw new RangeError(`Invalid date value: ${isoDate}`);
  }

  return dateKey;
}

export function tryToDateKey(isoDate: string): string | null {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
