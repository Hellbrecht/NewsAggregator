import { strict as assert } from "node:assert";
import { promises as fs } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  applyRelevanceFeedback,
  loadRelevanceProfile,
  resetRelevanceProfileCacheForTests
} from "../src/services/relevance_profile_store";

const PROFILE_PATH = path.resolve(__dirname, "../data/ingested/relevance_profile.json");

test("applyRelevanceFeedback updates and reverses token learning state", async () => {
  const hadOriginal = await fileExists(PROFILE_PATH);
  const original = hadOriginal ? await fs.readFile(PROFILE_PATH, "utf8") : null;

  try {
    await fs.mkdir(path.dirname(PROFILE_PATH), { recursive: true });
    await fs.writeFile(PROFILE_PATH, "{}", "utf8");
    resetRelevanceProfileCacheForTests();

    await applyRelevanceFeedback({
      text: "Aquifer recharge desalination plant project update",
      previousFeedback: null,
      nextFeedback: "up"
    });

    const afterUp = await loadRelevanceProfile();
    assert.equal(afterUp.totals.up, 1);
    assert.equal(afterUp.totals.down, 0);
    assert.equal(afterUp.tokens.aquifer?.up, 1);
    assert.equal(afterUp.tokens.desalination?.up, 1);

    await applyRelevanceFeedback({
      text: "Aquifer recharge desalination plant project update",
      previousFeedback: "up",
      nextFeedback: "down"
    });

    const afterFlip = await loadRelevanceProfile();
    assert.equal(afterFlip.totals.up, 0);
    assert.equal(afterFlip.totals.down, 1);
    assert.equal(afterFlip.tokens.aquifer?.up, 0);
    assert.equal(afterFlip.tokens.aquifer?.down, 1);

    await applyRelevanceFeedback({
      text: "Aquifer recharge desalination plant project update",
      previousFeedback: "down",
      nextFeedback: null
    });

    const afterClear = await loadRelevanceProfile();
    assert.equal(afterClear.totals.up, 0);
    assert.equal(afterClear.totals.down, 0);
    assert.equal(afterClear.tokens.aquifer, undefined);
    assert.equal(afterClear.tokens.desalination, undefined);
  } finally {
    resetRelevanceProfileCacheForTests();
    if (original === null) {
      await fs.rm(PROFILE_PATH, { force: true });
    } else {
      await fs.writeFile(PROFILE_PATH, original, "utf8");
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
