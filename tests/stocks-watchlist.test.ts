import assert from "node:assert/strict";
import test from "node:test";

import { parseStockCatalog } from "../apps/web/src/stocks-watchlist";

test("parseStockCatalog flattens nested ticker lists and maps markets", () => {
  const catalog = {
    north_america: {
      usa: [{ ticker: "awk", name: "American Water Works" }],
      canada: [{ ticker: "aqn", name: "Algonquin" }],
      mexico: [{ ticker: "agua", name: "Rotoplas" }]
    },
    south_america: {
      brazil: [{ ticker: "sbsp3", name: "SABESP" }]
    },
    europe: {
      france: [{ ticker: "vie" }]
    },
    asia: {
      japan: [{ ticker: "6370" }]
    },
    africa: {
      south_africa: [{ ticker: "aft" }]
    }
  };

  const parsed = parseStockCatalog(catalog);

  assert.deepEqual(
    parsed.map((entry) => ({ symbol: entry.symbol, market: entry.market })),
    [
      { symbol: "AWK", market: "US" },
      { symbol: "AQN", market: "CA" },
      { symbol: "AGUA", market: "LATAM" },
      { symbol: "SBSP3", market: "LATAM" },
      { symbol: "VIE", market: "EU" },
      { symbol: "6370", market: "ASIA" },
      { symbol: "AFT", market: "AFRICA" }
    ]
  );
});
