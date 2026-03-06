import assert from "node:assert/strict";
import test from "node:test";

import {
  parseEchoSdwSummaryPayload,
  parseEchoSdwSystemsPayload,
  parseNrcsDailySnowpackPayload,
  parseUsaceRecentPayload,
  parseUsbrResultPayload,
  parseUsgsLatestFeatureCollection
} from "../apps/web/src/hydrology-realtime-service";

test("parseUsgsLatestFeatureCollection selects first matching parameter rows", () => {
  const payload = {
    features: [
      {
        properties: {
          parameter_code: "00060",
          value: "101.4",
          unit_of_measure: "ft^3/s",
          time: "2026-03-05T14:50:00+00:00",
          approval_status: "Provisional"
        },
        geometry: {
          coordinates: [-77.1276, 38.9497]
        }
      },
      {
        properties: {
          parameter_code: "00060",
          value: "100.1",
          unit_of_measure: "ft^3/s",
          time: "2026-03-05T14:40:00+00:00",
          approval_status: "Approved"
        },
        geometry: {
          coordinates: [-77.1276, 38.9497]
        }
      },
      {
        properties: {
          parameter_code: "00065",
          value: "3.72",
          unit_of_measure: "ft",
          time: "2026-03-05T14:50:00+00:00",
          approval_status: "Provisional"
        },
        geometry: {
          coordinates: [-77.1276, 38.9497]
        }
      }
    ]
  };

  const parsed = parseUsgsLatestFeatureCollection(payload, ["00060", "00065"]);

  assert.equal(parsed.size, 2);
  assert.equal(parsed.get("00060")?.value, 101.4);
  assert.equal(parsed.get("00060")?.approvalStatus, "Provisional");
  assert.equal(parsed.get("00065")?.unit, "ft");
  assert.equal(parsed.get("00065")?.point?.latitude, 38.9497);
  assert.equal(parsed.get("00065")?.point?.longitude, -77.1276);
});

test("parseUsaceRecentPayload keeps only object rows", () => {
  const payload = [
    null,
    {
      id: "Lake Mendocino-Pool.Elev.Inst.1Hour.0.Calc-val",
      dqu: {
        "cwms-ts-id": "Lake Mendocino-Pool.Elev.Inst.1Hour.0.Calc-val",
        value: 749.31
      }
    },
    "bad-row"
  ];

  const parsed = parseUsaceRecentPayload(payload);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, "Lake Mendocino-Pool.Elev.Inst.1Hour.0.Calc-val");
  assert.equal(parsed[0].dqu?.value, 749.31);
});

test("parseUsbrResultPayload extracts the latest value and timestamp", () => {
  const payload = {
    data: [
      {
        attributes: {
          dateTime: "2026-03-04T08:00:00+00:00",
          result: 3903030
        }
      }
    ]
  };

  const parsed = parseUsbrResultPayload(payload);

  assert.deepEqual(parsed, {
    value: 3903030,
    observedAt: "2026-03-04T08:00:00+00:00"
  });
});

test("parseNrcsDailySnowpackPayload keeps latest daily SWE and median", () => {
  const payload = [
    {
      stationTriplet: "784:CA:SNTL",
      data: [
        {
          values: [
            {
              date: "2026-03-01",
              value: 20.7,
              median: 40.0
            },
            {
              date: "2026-03-04",
              value: 20.5,
              median: 45.0
            }
          ]
        }
      ]
    }
  ];

  const parsed = parseNrcsDailySnowpackPayload(payload);
  const row = parsed.get("784:CA:SNTL");

  assert.equal(parsed.size, 1);
  assert.ok(row);
  assert.equal(row?.value, 20.5);
  assert.equal(row?.median, 45.0);
  assert.equal(row?.observedAt, "2026-03-04T12:00:00Z");
});

test("parseNrcsDailySnowpackPayload ignores rows without station id or values", () => {
  const payload = [
    {
      stationTriplet: "784:CA:SNTL",
      data: []
    },
    {
      stationTriplet: "",
      data: [
        {
          values: [
            {
              date: "2026-03-04",
              value: 20.5,
              median: 45.0
            }
          ]
        }
      ]
    }
  ];

  const parsed = parseNrcsDailySnowpackPayload(payload);

  assert.equal(parsed.size, 0);
});

test("parseEchoSdwSummaryPayload extracts SDWA snapshot counters", () => {
  const payload = {
    Results: {
      QueryID: "466",
      QueryRows: "3,565",
      CVRows: "3,565",
      SVRows: "3,565",
      FEARows: "413",
      InfFEARows: "3,194",
      INSPRows: "3,490"
    }
  };

  const parsed = parseEchoSdwSummaryPayload(payload);

  assert.equal(parsed.queryId, "466");
  assert.equal(parsed.queryRows, 3565);
  assert.equal(parsed.currentViolationRows, 3565);
  assert.equal(parsed.seriousViolationRows, 3565);
  assert.equal(parsed.formalEnforcementRows, 413);
  assert.equal(parsed.informalEnforcementRows, 3194);
  assert.equal(parsed.inspectionRows, 3490);
});

test("parseEchoSdwSystemsPayload keeps key violation fields and normalizes visit date", () => {
  const payload = {
    Results: {
      WaterSystems: [
        {
          PWSName: "Example Water Utility",
          PWSId: "CA1234567",
          StateCode: "CA",
          QtrsWithVio: "9",
          RulesVio: "4",
          SeriousViolator: "Yes",
          FeaFlag: "1",
          CurrVioFlag: "1",
          DfrUrl: "https://echo.epa.gov/detailed-facility-report?fid=123",
          SDWDateLastVisit: "4/11/2013"
        },
        "bad-row"
      ]
    }
  };

  const parsed = parseEchoSdwSystemsPayload(payload);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.pwsName, "Example Water Utility");
  assert.equal(parsed[0]?.pwsId, "CA1234567");
  assert.equal(parsed[0]?.stateCode, "CA");
  assert.equal(parsed[0]?.qtrsWithVio, 9);
  assert.equal(parsed[0]?.rulesVio, 4);
  assert.equal(parsed[0]?.seriousViolator, "Yes");
  assert.equal(parsed[0]?.feaFlag, 1);
  assert.equal(parsed[0]?.currVioFlag, 1);
  assert.equal(parsed[0]?.dfrUrl, "https://echo.epa.gov/detailed-facility-report?fid=123");
  assert.equal(parsed[0]?.dateLastVisit, "2013-04-11T12:00:00.000Z");
});
