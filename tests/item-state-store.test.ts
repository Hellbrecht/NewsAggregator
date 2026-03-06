import { strict as assert } from "node:assert";
import { promises as fs } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  loadItemStateMap,
  resolveItemState,
  setItemRelevance
} from "../apps/web/src/item-state-store";

const ITEM_STATE_PATH = path.resolve(__dirname, "../data/ingested/item_state.json");

test("setItemRelevance stores and clears relevance feedback", async () => {
  const hadOriginal = await fileExists(ITEM_STATE_PATH);
  const original = hadOriginal ? await fs.readFile(ITEM_STATE_PATH, "utf8") : null;

  try {
    await fs.mkdir(path.dirname(ITEM_STATE_PATH), { recursive: true });
    await fs.writeFile(ITEM_STATE_PATH, "{}", "utf8");

    await setItemRelevance("entry-1", "down");
    const afterDown = await loadItemStateMap();
    assert.equal(resolveItemState(afterDown, "entry-1").relevanceFeedback, "down");

    await setItemRelevance("entry-1", null);
    const afterClear = await loadItemStateMap();
    assert.equal(resolveItemState(afterClear, "entry-1").relevanceFeedback, null);
  } finally {
    if (original === null) {
      await fs.rm(ITEM_STATE_PATH, { force: true });
    } else {
      await fs.writeFile(ITEM_STATE_PATH, original, "utf8");
    }
  }
});

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}
