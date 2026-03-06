import assert from "node:assert/strict";
import test from "node:test";

import { getStockQuotes, parseRequestedSymbols } from "../apps/web/src/stocks-service";

test("parseRequestedSymbols filters invalid values and deduplicates", () => {
  const parsed = parseRequestedSymbols("aapl, MSFT, bad symbol, msft, ry.to, ,,");
  assert.deepEqual(parsed, ["AAPL", "MSFT", "RY.TO"]);
});

test("parseRequestedSymbols returns empty when no symbols are provided", () => {
  assert.deepEqual(parseRequestedSymbols(null), []);
  assert.deepEqual(parseRequestedSymbols(" , , "), []);
});

test("getStockQuotes falls back to Yahoo when Stooq is unavailable", async () => {
  const previousProvider = process.env.STOCKS_PROVIDER;
  const previousMassiveApiKey = process.env.MASSIVE_API_KEY;
  const originalFetch = globalThis.fetch;

  process.env.STOCKS_PROVIDER = "stooq";
  delete process.env.MASSIVE_API_KEY;

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("https://stooq.com/")) {
      return new Response("Exceeded the daily hits limit", {
        status: 200,
        headers: { "content-type": "text/plain" }
      });
    }

    if (url.startsWith("https://query1.finance.yahoo.com/v8/finance/chart/")) {
      return new Response(
        JSON.stringify({
          chart: {
            result: [
              {
                meta: {
                  longName: "American Water Works Company, Inc.",
                  chartPreviousClose: 131.4
                },
                timestamp: [1772634600, 1772744402],
                indicators: {
                  quote: [
                    {
                      open: [132.8, 135.37],
                      high: [136.49, 136.89],
                      low: [131.71, 134.47],
                      close: [135.81, 134.63],
                      volume: [2007300, 1277175]
                    }
                  ]
                }
              }
            ],
            error: null
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }

    throw new Error(`Unexpected URL requested in test: ${url}`);
  };

  try {
    const [quote] = await getStockQuotes(["AWK"]);
    assert.equal(quote.status, "ok");
    assert.equal(quote.sourceSymbol, "AWK");
    assert.equal(quote.name, "American Water Works Company, Inc.");
    assert.equal(quote.date, "2026-03-05");
    assert.equal(quote.close, 134.63);
    assert.equal(quote.history.length, 2);
  } finally {
    globalThis.fetch = originalFetch;

    if (previousProvider === undefined) {
      delete process.env.STOCKS_PROVIDER;
    } else {
      process.env.STOCKS_PROVIDER = previousProvider;
    }

    if (previousMassiveApiKey === undefined) {
      delete process.env.MASSIVE_API_KEY;
    } else {
      process.env.MASSIVE_API_KEY = previousMassiveApiKey;
    }
  }
});
