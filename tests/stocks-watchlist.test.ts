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
      france: [{ ticker: "vie", aliases: { yahoo: "vie.pa" } }]
    },
    asia: {
      japan: [{ ticker: "6370", aliases: { yahoo: "6370.t" } }]
    },
    africa: {
      south_africa: [{ ticker: "aft" }]
    }
  };

  const parsed = parseStockCatalog(catalog);

  assert.deepEqual(
    parsed.map((entry) => ({
      symbol: entry.symbol,
      market: entry.market,
      yahooAlias: entry.aliases.yahoo
    })),
    [
      { symbol: "AWK", market: "US", yahooAlias: null },
      { symbol: "AQN", market: "CA", yahooAlias: null },
      { symbol: "AGUA", market: "LATAM", yahooAlias: null },
      { symbol: "SBSP3", market: "LATAM", yahooAlias: null },
      { symbol: "VIE", market: "EU", yahooAlias: "VIE.PA" },
      { symbol: "6370", market: "ASIA", yahooAlias: "6370.T" },
      { symbol: "AFT", market: "AFRICA", yahooAlias: null }
    ]
  );
});
