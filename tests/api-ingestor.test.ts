import { strict as assert } from "node:assert";
import { test } from "node:test";

import { fetchApiDataset } from "../src/ingestion/api_ingestor";
import { Source } from "../src/models/Source";

function createSource(): Source {
  return {
    id: "api-source",
    name: "API Source",
    url: "https://example.com",
    api: "https://example.com/data.json",
    topic: "river monitoring",
    region: "global",
    reliability_score: 9,
    intervalMinutes: 60
  };
}

test("fetchApiDataset throws when endpoint returns HTML", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
  });

  (globalThis as { fetch: typeof fetch }).fetch = async () =>
    new Response("<!doctype html><html><body>Blocked</body></html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" }
    });

  await assert.rejects(
    async () => fetchApiDataset(createSource()),
    /Expected JSON payload/
  );
});

test("fetchApiDataset parses JSON payloads", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
  });

  (globalThis as { fetch: typeof fetch }).fetch = async () =>
    new Response(
      JSON.stringify([
        {
          metric: "river_discharge",
          value: 42.1,
          location: "station-1",
          timestamp: "2026-03-04T10:00:00.000Z"
        }
      ]),
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" }
      }
    );

  const rows = await fetchApiDataset(createSource());
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.metric, "river_discharge");
  assert.equal(rows[0]?.value, 42.1);
});
