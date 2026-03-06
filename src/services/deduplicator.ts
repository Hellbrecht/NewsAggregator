import { createHash } from "node:crypto";

const MAX_HASHES = 100_000;

export class DeduplicationCache {
  private readonly seen = new Set<string>();
  private readonly order: string[] = [];

  addIfNew(hash: string): boolean {
    if (this.seen.has(hash)) {
      return false;
    }

    this.seen.add(hash);
    this.order.push(hash);
    this.pruneIfNeeded();
    return true;
  }

  seed(hashes: string[]): void {
    for (const hash of hashes) {
      this.addIfNew(hash);
    }
  }

  get size(): number {
    return this.seen.size;
  }

  private pruneIfNeeded(): void {
    while (this.order.length > MAX_HASHES) {
      const old = this.order.shift();
      if (!old) {
        break;
      }

      this.seen.delete(old);
    }
  }
}

export function computeContentHash(...parts: Array<string | number | null | undefined>): string {
  const normalized = parts
    .map((part) => String(part ?? "").toLowerCase().trim())
    .join("|")
    .replace(/\s+/g, " ");

  return createHash("sha256").update(normalized).digest("hex");
}
