# Internal Feed API

Base server: `apps/web/src/server.ts`

## `GET /api/combined-feed`

Returns a normalized merged feed across `NEWS` and `DATA` items.

### Query Params

- `from`: ISO timestamp lower bound (inclusive)
- `to`: ISO timestamp upper bound (inclusive)
- `tags`: comma-separated risk tags
  - `drought`
  - `flood`
  - `pollution`
  - `infrastructure risk`
  - `water conflict`
  - `irrigation stress`
- `region`: exact region filter
- `topic`: exact topic filter
- `type`: `NEWS | DATA | BOTH` (default `BOTH`)
- `minReliability`: `0..10`
- `minRisk`: `0..100`
- `search`: case-insensitive full-text search over title + summary + source
- `limit`: page size (default `50`, max `200`)
- `cursor`: opaque pagination cursor from previous response
- `sort`: `newest | risk` (default `newest`)

### Response

```json
{
  "items": [],
  "nextCursor": "opaque-or-absent",
  "stats": {
    "total": 0,
    "filtered": 0,
    "byType": { "NEWS": 0, "DATA": 0 },
    "regions": [],
    "topics": [],
    "tags": []
  }
}
```

### Cursor Notes

- Cursor encodes sort-specific position:
  - `newest`: `(timestamp, id)`
  - `risk`: `(riskScore, timestamp, id)`
- Ordering is deterministic and stable when source data is unchanged.

## `GET /api/item/:id`

Returns an item with related and duplicate candidates.

### Response

```json
{
  "item": {},
  "related": [],
  "duplicates": []
}
```

### Related Logic

- Primary rule:
  - same `region`
  - overlapping `riskTags`
  - within +/- 7 days of the selected item
- Fallback when no overlap window is found:
  - closest items in same region
- Maximum related items: `50`

### Duplicate Logic

- Same `dedupeHash` as selected item
- Maximum duplicates: `50`

## `POST /api/item/:id/reviewed`

Body:

```json
{ "reviewed": true }
```

Persists to `data/ingested/item_state.json`.

Response:

```json
{
  "id": "item-id",
  "state": {
    "reviewed": true,
    "starred": false,
    "updatedAt": "2026-03-04T00:00:00.000Z"
  }
}
```

## `POST /api/item/:id/star`

Body:

```json
{ "starred": true }
```

Persists to `data/ingested/item_state.json`.

Response matches the state envelope above.

## `GET /api/health`

Returns internal ingestion health snapshot:

```json
{
  "ok": true,
  "countsLast24h": { "total": 0, "news": 0, "data": 0 },
  "lastPipelineRunAt": "2026-03-04T00:00:00.000Z",
  "recentErrors": []
}
```

`recentErrors` is populated from `data/ingested/pipeline_logs.jsonl` when available.
