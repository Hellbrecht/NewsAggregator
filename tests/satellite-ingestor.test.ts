import { strict as assert } from "node:assert";
import { test } from "node:test";

import { fetchSatelliteDataset } from "../src/ingestion/satellite_ingestor";
import { Source } from "../src/models/Source";

function createSource(): Source {
  return {
    id: "satellite-source",
    name: "Satellite Source",
    url: "https://example.com",
    api: "https://example.com/satellite.json",
    topic: "surface water monitoring",
    region: "global",
    reliability_score: 9,
    intervalMinutes: 180
  };
}

test("fetchSatelliteDataset throws when endpoint returns HTML", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
  });

  (globalThis as { fetch: typeof fetch }).fetch = async () =>
    new Response("<html><body>Human verification</body></html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" }
    });

  await assert.rejects(
    async () => fetchSatelliteDataset(createSource()),
    /Expected JSON payload/
  );
});

test("fetchSatelliteDataset parses JSON payloads", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
  });

  (globalThis as { fetch: typeof fetch }).fetch = async () =>
    new Response(
      JSON.stringify([
        {
          metric: "reservoir_extent",
          value: 81,
          location: "region-a",
          timestamp: "2026-03-04T09:30:00.000Z"
        }
      ]),
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" }
      }
    );

  const rows = await fetchSatelliteDataset(createSource());
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.metric, "reservoir_extent");
  assert.equal(rows[0]?.value, 81);
});
