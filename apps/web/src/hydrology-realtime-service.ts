const USER_AGENT = "WaterNewsAggregator/0.1";
const REQUEST_TIMEOUT_MS = 20_000;
const CACHE_TTL_MS = 5 * 60 * 1_000;
const FETCH_CONCURRENCY = 4;

const USGS_COLLECTION_ENDPOINT = "https://api.waterdata.usgs.gov/ogcapi/v0/collections";
const USACE_BASE_URL = "https://cwms-data.usace.army.mil/cwms-data";
const USBR_BASE_URL = "https://data.usbr.gov/rise/api";
const ECCC_COLLECTION_ENDPOINT = "https://api.weather.gc.ca/collections";
const DFO_BASE_URL = "https://api.iwls-sine.azure.cloud-nuage.dfo-mpo.gc.ca/api/v1";
const NOAA_COOPS_ENDPOINT = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
const NRCS_AWDB_BASE_URL = "https://wcc.sc.egov.usda.gov/awdbRestApi";
const ECHO_BASE_URL = "https://echodata.epa.gov/echo";
const ECHO_SDWA_DOCS_URL = "https://echo.epa.gov/tools/web-services/facility-search-drinking-water";
const NRCS_SNOW_PRODUCTS_URL =
  "https://www.nrcs.usda.gov/programs-initiatives/sswsf-snow-survey-and-water-supply-forecasting-program/snow-and-water-products";
const ECHO_SDWA_QUEUE_RESPONSESET = 150;
const ECHO_SDWA_QUEUE_MAX_ROWS = 20;

const USGS_PARAMETER_LABELS: Record<string, string> = {
  "00060": "Streamflow",
  "00065": "Gage height"
};

const USGS_TARGETS = [
  {
    siteNumber: "01646500",
    parameterCodes: ["00060", "00065"]
  },
  {
    siteNumber: "09380000",
    parameterCodes: ["00060", "00065"]
  },
  {
    siteNumber: "11447650",
    parameterCodes: ["00060", "00065"]
  }
] as const;

const USACE_TARGETS = [
  {
    office: "SPK",
    timeSeriesId: "Lake Mendocino-Pool.Elev.Inst.1Hour.0.Calc-val",
    label: "Lake Mendocino",
    metric: "Pool elevation"
  },
  {
    office: "SPK",
    timeSeriesId: "Lake Kaweah-Pool.Elev.Inst.1Hour.0.Calc-val",
    label: "Lake Kaweah",
    metric: "Pool elevation"
  },
  {
    office: "SPK",
    timeSeriesId: "Lake Isabella-Pool.Elev.Inst.1Hour.0.Calc-val",
    label: "Lake Isabella",
    metric: "Pool elevation"
  }
] as const;

const USBR_TARGETS = [
  {
    locationId: 471,
    parameterId: 3
  },
  {
    locationId: 1533,
    parameterId: 3
  },
  {
    locationId: 489,
    parameterId: 3
  }
] as const;

const ECCC_PROVINCE_TARGETS = [
  { code: "BC", label: "British Columbia" },
  { code: "AB", label: "Alberta" },
  { code: "ON", label: "Ontario" },
  { code: "QC", label: "Quebec" }
] as const;

const DFO_GREAT_LAKES_TARGETS = [
  {
    stationCode: "10050",
    lake: "Lake Superior"
  },
  {
    stationCode: "10980",
    lake: "Lake Superior / Lake Huron"
  },
  {
    stationCode: "12250",
    lake: "Lake Erie"
  },
  {
    stationCode: "13988",
    lake: "Lake Ontario"
  }
] as const;

const NOAA_GREAT_LAKES_TARGETS = [
  {
    stationId: "9099090",
    lake: "Lake Superior"
  },
  {
    stationId: "9075080",
    lake: "Lake Huron / Lake Michigan"
  },
  {
    stationId: "9063020",
    lake: "Lake Erie"
  },
  {
    stationId: "9052030",
    lake: "Lake Ontario"
  }
] as const;

const NRCS_SNOWPACK_TARGETS = [
  {
    stationTriplet: "784:CA:SNTL",
    region: "Sierra Nevada"
  },
  {
    stationTriplet: "352:WA:SNTL",
    region: "Cascades"
  },
  {
    stationTriplet: "335:CO:SNTL",
    region: "Central Rockies"
  },
  {
    stationTriplet: "366:UT:SNTL",
    region: "Wasatch"
  }
] as const;

type ProviderStatus = "ok" | "degraded" | "error";

export type HydrologyRealtimeItem = {
  id: string;
  location: string;
  metric: string;
  value: number | null;
  unit: string | null;
  observedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  sourceUrl: string;
};

export type HydrologyProvider = {
  id:
    | "USGS"
    | "USACE"
    | "USBR"
    | "ECCC"
    | "NRCS_SNOWPACK"
    | "GREAT_LAKES"
    | "ECHO_SDWA_SNAPSHOT"
    | "ECHO_SDWA_VIOLATIONS";
  name: string;
  sourceUrl: string;
  status: ProviderStatus;
  updatedAt: string | null;
  items: HydrologyRealtimeItem[];
  error: string | null;
};

export type HydrologyRealtimeSnapshot = {
  requestedAt: string;
  cacheTtlMs: number;
  providers: HydrologyProvider[];
};

type HydrologyCache = {
  expiresAt: number;
  snapshot: HydrologyRealtimeSnapshot;
};

type UsgsFeatureCollection = {
  features?: Array<{
    properties?: Record<string, unknown>;
    geometry?: {
      type?: string;
      coordinates?: unknown;
    };
  }>;
};

type UsaceRecentRecord = {
  id?: string;
  dqu?: {
    "office-id"?: string;
    "cwms-ts-id"?: string;
    "unit-id"?: string;
    "date-time"?: number;
    value?: number;
    "quality-code"?: number;
  };
};

type UsbrResultPayload = {
  data?: Array<{
    attributes?: {
      dateTime?: string;
      result?: number;
    };
  }>;
};

type UsbrLocationPayload = {
  data?: {
    attributes?: {
      locationName?: string;
      locationCoordinates?: {
        coordinates?: unknown;
      };
    };
  };
};

type UsbrParameterPayload = {
  data?: {
    attributes?: {
      parameterName?: string;
      parameterUnit?: string;
    };
  };
};

type EcccFeatureCollection = {
  features?: Array<{
    properties?: Record<string, unknown>;
    geometry?: {
      coordinates?: unknown;
    };
  }>;
};

type DfoStation = {
  id?: string;
  code?: string;
  officialName?: string;
  latitude?: number;
  longitude?: number;
};

type DfoLatestPayloadRow = {
  stationId?: string;
  measurementDTOs?: Array<{
    eventDate?: string;
    value?: number;
    qcFlagCode?: string;
  }>;
};

type NoaaLatestPayload = {
  metadata?: {
    name?: string;
    lat?: string;
    lon?: string;
    id?: string;
  };
  data?: Array<{
    t?: string;
    v?: string;
  }>;
};

type NrcsStationPayload = Array<{
  stationTriplet?: string;
  name?: string;
  latitude?: number;
  longitude?: number;
}>;

type NrcsDailyDataPayload = Array<{
  stationTriplet?: string;
  data?: Array<{
    values?: Array<{
      date?: string;
      value?: number;
      median?: number;
    }>;
  }>;
}>;

type EchoSdwSummaryPayload = {
  Results?: Record<string, unknown>;
};

type EchoSdwQueryResultsPayload = {
  Results?: {
    WaterSystems?: unknown;
  };
};

let memoryCache: HydrologyCache | null = null;
let loadingPromise: Promise<HydrologyRealtimeSnapshot> | null = null;

export async function getHydrologyRealtimeSnapshot(
  forceRefresh = false
): Promise<HydrologyRealtimeSnapshot> {
  const now = Date.now();
  if (!forceRefresh && memoryCache && now < memoryCache.expiresAt) {
    return memoryCache.snapshot;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = loadHydrologyRealtimeSnapshot();
  try {
    const snapshot = await loadingPromise;
    memoryCache = {
      expiresAt: now + CACHE_TTL_MS,
      snapshot
    };
    return snapshot;
  } finally {
    loadingPromise = null;
  }
}

async function loadHydrologyRealtimeSnapshot(): Promise<HydrologyRealtimeSnapshot> {
  const [usgs, usace, usbr, eccc, nrcsSnowpack, greatLakes, echoSdwSnapshot, echoSdwViolations] =
    await Promise.all([
      fetchUsgsProvider(),
      fetchUsaceProvider(),
      fetchUsbrProvider(),
      fetchEcccProvider(),
      fetchNrcsSnowpackProvider(),
      fetchGreatLakesProvider(),
      fetchEchoSdwSnapshotProvider(),
      fetchEchoSdwViolationsProvider()
    ]);

  return {
    requestedAt: new Date().toISOString(),
    cacheTtlMs: CACHE_TTL_MS,
    providers: [usgs, usace, usbr, eccc, nrcsSnowpack, greatLakes, echoSdwSnapshot, echoSdwViolations]
  };
}

async function fetchUsgsProvider(): Promise<HydrologyProvider> {
  try {
    const rows = await mapWithConcurrency(USGS_TARGETS, FETCH_CONCURRENCY, async (target) => {
      const locationId = `USGS-${target.siteNumber}`;
      const [locationMeta, latestCollection] = await Promise.all([
        fetchUsgsLocation(target.siteNumber),
        fetchUsgsLatestContinuous(locationId, target.parameterCodes)
      ]);
      const measurementsByParameter = parseUsgsLatestFeatureCollection(
        latestCollection,
        target.parameterCodes
      );

      return target.parameterCodes.map((parameterCode) => {
        const measurement = measurementsByParameter.get(parameterCode);
        const point = measurement?.point || null;
        return {
          id: `USGS-${target.siteNumber}-${parameterCode}`,
          location: locationMeta.name || `USGS ${target.siteNumber}`,
          metric: `${USGS_PARAMETER_LABELS[parameterCode] || `Parameter ${parameterCode}`} (${parameterCode})`,
          value: measurement ? measurement.value : null,
          unit: measurement?.unit || null,
          observedAt: measurement?.time || null,
          latitude: point?.latitude ?? locationMeta.latitude ?? null,
          longitude: point?.longitude ?? locationMeta.longitude ?? null,
          note: measurement?.approvalStatus ? String(measurement.approvalStatus) : null,
          sourceUrl: buildUsgsLatestContinuousUrl(locationId, [parameterCode])
        } satisfies HydrologyRealtimeItem;
      });
    });

    const items = rows.flat();
    return finalizeProvider({
      id: "USGS",
      name: "USGS Water Data (Modern API)",
      sourceUrl: `${USGS_COLLECTION_ENDPOINT}/latest-continuous`,
      items,
      error: null
    });
  } catch (error) {
    return finalizeProvider({
      id: "USGS",
      name: "USGS Water Data (Modern API)",
      sourceUrl: `${USGS_COLLECTION_ENDPOINT}/latest-continuous`,
      items: [],
      error: normalizeError(error)
    });
  }
}

async function fetchUsaceProvider(): Promise<HydrologyProvider> {
  try {
    const targetByOffice = new Map<string, string[]>();
    USACE_TARGETS.forEach((target) => {
      const list = targetByOffice.get(target.office) || [];
      list.push(target.timeSeriesId);
      targetByOffice.set(target.office, list);
    });

    const payloadById = new Map<string, UsaceRecentRecord>();
    for (const [office, ids] of targetByOffice.entries()) {
      const endpoint = new URL(`${USACE_BASE_URL}/timeseries/recent`);
      endpoint.searchParams.set("office", office);
      endpoint.searchParams.set("unit-system", "EN");
      endpoint.searchParams.set("ts-ids", ids.join(","));

      const payload = await fetchJson<unknown>(endpoint);
      const parsed = parseUsaceRecentPayload(payload);
      parsed.forEach((entry) => {
        const seriesId = String(entry?.dqu?.["cwms-ts-id"] || entry?.id || "").trim();
        if (seriesId) {
          payloadById.set(seriesId, entry);
        }
      });
    }

    const items = USACE_TARGETS.map((target) => {
      const record = payloadById.get(target.timeSeriesId);
      const value = record?.dqu?.value;
      const timestamp = toIsoFromEpochMs(record?.dqu?.["date-time"]);
      const unit = cleanText(record?.dqu?.["unit-id"]);

      return {
        id: `USACE-${target.timeSeriesId}`,
        location: target.label,
        metric: target.metric,
        value: typeof value === "number" && Number.isFinite(value) ? value : null,
        unit,
        observedAt: timestamp,
        latitude: null,
        longitude: null,
        note: record?.dqu?.["quality-code"] !== undefined ? `Quality ${record.dqu["quality-code"]}` : null,
        sourceUrl: buildUsaceRecentUrl(target.office, [target.timeSeriesId])
      } satisfies HydrologyRealtimeItem;
    });

    return finalizeProvider({
      id: "USACE",
      name: "USACE CWMS Data API",
      sourceUrl: `${USACE_BASE_URL}/swagger-ui.html`,
      items,
      error: null
    });
  } catch (error) {
    return finalizeProvider({
      id: "USACE",
      name: "USACE CWMS Data API",
      sourceUrl: `${USACE_BASE_URL}/swagger-ui.html`,
      items: [],
      error: normalizeError(error)
    });
  }
}

async function fetchUsbrProvider(): Promise<HydrologyProvider> {
  try {
    const uniqueLocationIds = [...new Set(USBR_TARGETS.map((target) => target.locationId))];
    const uniqueParameterIds = [...new Set(USBR_TARGETS.map((target) => target.parameterId))];

    const [locationMap, parameterMap, resultRows] = await Promise.all([
      fetchUsbrLocations(uniqueLocationIds),
      fetchUsbrParameters(uniqueParameterIds),
      mapWithConcurrency(USBR_TARGETS, FETCH_CONCURRENCY, async (target) => {
        try {
          const payload = await fetchJson<unknown>(buildUsbrResultUrl(target.locationId, target.parameterId));
          const parsed = parseUsbrResultPayload(payload);
          return {
            target,
            result: parsed,
            error: null
          };
        } catch (error) {
          return {
            target,
            result: null,
            error: normalizeError(error)
          };
        }
      })
    ]);

    const targetErrors = resultRows.map((row) => row.error).filter((value): value is string => Boolean(value));

    const items = resultRows.map(({ target, result, error }) => {
      const locationMeta = locationMap.get(target.locationId);
      const parameterMeta = parameterMap.get(target.parameterId);

      return {
        id: `USBR-${target.locationId}-${target.parameterId}`,
        location: locationMeta?.name || `Location ${target.locationId}`,
        metric: parameterMeta?.name || `Parameter ${target.parameterId}`,
        value: result?.value ?? null,
        unit: parameterMeta?.unit || null,
        observedAt: result?.observedAt || null,
        latitude: locationMeta?.latitude ?? null,
        longitude: locationMeta?.longitude ?? null,
        note: error || null,
        sourceUrl: buildUsbrResultUrl(target.locationId, target.parameterId).toString()
      } satisfies HydrologyRealtimeItem;
    });

    return finalizeProvider({
      id: "USBR",
      name: "Bureau of Reclamation RISE API",
      sourceUrl: `${USBR_BASE_URL}`,
      items,
      error: targetErrors.length ? targetErrors.join(" | ") : null
    });
  } catch (error) {
    return finalizeProvider({
      id: "USBR",
      name: "Bureau of Reclamation RISE API",
      sourceUrl: `${USBR_BASE_URL}`,
      items: [],
      error: normalizeError(error)
    });
  }
}

async function fetchEcccProvider(): Promise<HydrologyProvider> {
  try {
    const rows = await mapWithConcurrency(ECCC_PROVINCE_TARGETS, FETCH_CONCURRENCY, async (target) => {
      const endpoint = buildEcccRealtimeUrl(target.code, 1);
      const payload = await fetchJson<unknown>(endpoint);
      const features = parseEcccRealtimePayload(payload);
      const feature = features[0];
      if (!feature) {
        return [];
      }

      const props = feature.properties || {};
      const point = readPointCoordinates(feature.geometry?.coordinates);
      const stationName = cleanText(props.STATION_NAME) || `Station ${cleanText(props.STATION_NUMBER) || target.code}`;
      const stationNumber = cleanText(props.STATION_NUMBER);
      const observedAt = cleanText(props.DATETIME);

      const level = toNumberOrNull(props.LEVEL);
      const discharge = toNumberOrNull(props.DISCHARGE);
      const items: HydrologyRealtimeItem[] = [];

      if (level !== null) {
        const levelSymbol = cleanText(props.LEVEL_SYMBOL_EN);
        items.push({
          id: `ECCC-${target.code}-${stationNumber || stationName}-LEVEL`,
          location: `${stationName} (${target.label})`,
          metric: "Water level",
          value: level,
          unit: "m",
          observedAt,
          latitude: point?.latitude ?? null,
          longitude: point?.longitude ?? null,
          note: levelSymbol || stationNumber || null,
          sourceUrl: endpoint.toString()
        });
      }

      if (discharge !== null) {
        const dischargeSymbol = cleanText(props.DISCHARGE_SYMBOL_EN);
        items.push({
          id: `ECCC-${target.code}-${stationNumber || stationName}-DISCHARGE`,
          location: `${stationName} (${target.label})`,
          metric: "Discharge",
          value: discharge,
          unit: "m3/s",
          observedAt,
          latitude: point?.latitude ?? null,
          longitude: point?.longitude ?? null,
          note: dischargeSymbol || stationNumber || null,
          sourceUrl: endpoint.toString()
        });
      }

      if (items.length === 0) {
        items.push({
          id: `ECCC-${target.code}-${stationNumber || stationName}`,
          location: `${stationName} (${target.label})`,
          metric: "Hydrometric reading",
          value: null,
          unit: null,
          observedAt,
          latitude: point?.latitude ?? null,
          longitude: point?.longitude ?? null,
          note: stationNumber || null,
          sourceUrl: endpoint.toString()
        });
      }

      return items;
    });

    return finalizeProvider({
      id: "ECCC",
      name: "Environment and Climate Change Canada (GeoMet)",
      sourceUrl: `${ECCC_COLLECTION_ENDPOINT}/hydrometric-realtime`,
      items: rows.flat(),
      error: null
    });
  } catch (error) {
    return finalizeProvider({
      id: "ECCC",
      name: "Environment and Climate Change Canada (GeoMet)",
      sourceUrl: `${ECCC_COLLECTION_ENDPOINT}/hydrometric-realtime`,
      items: [],
      error: normalizeError(error)
    });
  }
}

async function fetchNrcsSnowpackProvider(): Promise<HydrologyProvider> {
  try {
    const stationTriplets = NRCS_SNOWPACK_TARGETS.map((target) => target.stationTriplet);
    const [stationPayload, dataPayload] = await Promise.all([
      fetchJson<unknown>(buildNrcsStationsUrl(stationTriplets)),
      fetchJson<unknown>(buildNrcsDataUrl(stationTriplets))
    ]);

    const stationRows = parseNrcsStationPayload(stationPayload);
    const stationByTriplet = new Map(
      stationRows
        .map((row) => {
          const stationTriplet = cleanText(row.stationTriplet);
          if (!stationTriplet) {
            return null;
          }

          return [
            stationTriplet,
            {
              name: cleanText(row.name),
              latitude: toNumberOrNull(row.latitude),
              longitude: toNumberOrNull(row.longitude)
            }
          ] as const;
        })
        .filter(
          (
            entry
          ): entry is readonly [
            string,
            {
              name: string | null;
              latitude: number | null;
              longitude: number | null;
            }
          ] => Boolean(entry)
        )
    );

    const measurementByTriplet = parseNrcsDailySnowpackPayload(dataPayload);
    const missing: string[] = [];
    const items = NRCS_SNOWPACK_TARGETS.map((target) => {
      const station = stationByTriplet.get(target.stationTriplet);
      const measurement = measurementByTriplet.get(target.stationTriplet);
      if (!measurement) {
        missing.push(`NRCS station ${target.stationTriplet} returned no recent SWE values`);
      }

      const median = measurement?.median ?? null;
      const value = measurement?.value ?? null;
      const percentOfMedian =
        value !== null && median !== null && median > 0 ? Math.round((value / median) * 100) : null;

      const noteParts: string[] = [target.region];
      if (median !== null) {
        noteParts.push(`Median ${median.toFixed(1)} in`);
      }
      if (percentOfMedian !== null) {
        noteParts.push(`${percentOfMedian}% of median`);
      }
      if (!measurement) {
        noteParts.push("No recent daily SWE value");
      }

      return {
        id: `NRCS-${target.stationTriplet}-WTEQ`,
        location: station?.name ? `${station.name} (${target.region})` : `${target.stationTriplet} (${target.region})`,
        metric: "Snow water equivalent (SWE)",
        value,
        unit: "in",
        observedAt: measurement?.observedAt || null,
        latitude: station?.latitude ?? null,
        longitude: station?.longitude ?? null,
        note: noteParts.join(" | "),
        sourceUrl: buildNrcsDataUrl([target.stationTriplet]).toString()
      } satisfies HydrologyRealtimeItem;
    });

    return finalizeProvider({
      id: "NRCS_SNOWPACK",
      name: "NRCS Snowpack (SNOTEL SWE)",
      sourceUrl: NRCS_SNOW_PRODUCTS_URL,
      items,
      error: missing.length ? missing.join("; ") : null
    });
  } catch (error) {
    return finalizeProvider({
      id: "NRCS_SNOWPACK",
      name: "NRCS Snowpack (SNOTEL SWE)",
      sourceUrl: NRCS_SNOW_PRODUCTS_URL,
      items: [],
      error: normalizeError(error)
    });
  }
}

async function fetchGreatLakesProvider(): Promise<HydrologyProvider> {
  const [dfo, noaa] = await Promise.all([fetchDfoGreatLakesItems(), fetchNoaaGreatLakesItems()]);
  const errors = [dfo.error, noaa.error].filter((value): value is string => Boolean(value));

  return finalizeProvider({
    id: "GREAT_LAKES",
    name: "Great Lakes Levels (DFO + NOAA)",
    sourceUrl: "https://tidesandcurrents.noaa.gov/greatlakes/",
    items: [...dfo.items, ...noaa.items],
    error: errors.length ? errors.join(" | ") : null
  });
}

async function fetchEchoSdwSnapshotProvider(): Promise<HydrologyProvider> {
  try {
    const summaryUrl = buildEchoSdwSystemsUrl({
      p_sv: "Y",
      responseset: 1,
      queryset: 5000
    });
    const payload = await fetchJson<unknown>(summaryUrl);
    const summary = parseEchoSdwSummaryPayload(payload);
    const observedAt = new Date().toISOString();
    const items: HydrologyRealtimeItem[] = [
      {
        id: "ECHO-SDWA-SNAPSHOT-SV",
        location: "US Public Water Systems",
        metric: "Serious violator systems",
        value: summary.queryRows,
        unit: "systems",
        observedAt,
        latitude: null,
        longitude: null,
        note: summary.queryId ? `ECHO query ${summary.queryId}` : "ECHO SDWA snapshot",
        sourceUrl: summaryUrl.toString()
      },
      {
        id: "ECHO-SDWA-SNAPSHOT-CV",
        location: "US Public Water Systems",
        metric: "Systems with current violations",
        value: summary.currentViolationRows,
        unit: "systems",
        observedAt,
        latitude: null,
        longitude: null,
        note: "Current violations from SDWIS snapshot",
        sourceUrl: summaryUrl.toString()
      },
      {
        id: "ECHO-SDWA-SNAPSHOT-FEA",
        location: "US Public Water Systems",
        metric: "Formal enforcement actions (5y)",
        value: summary.formalEnforcementRows,
        unit: "systems",
        observedAt,
        latitude: null,
        longitude: null,
        note: "Systems with at least one formal enforcement action in the last 5 years",
        sourceUrl: summaryUrl.toString()
      },
      {
        id: "ECHO-SDWA-SNAPSHOT-IEA",
        location: "US Public Water Systems",
        metric: "Informal enforcement actions (5y)",
        value: summary.informalEnforcementRows,
        unit: "systems",
        observedAt,
        latitude: null,
        longitude: null,
        note: "Systems with at least one informal enforcement action in the last 5 years",
        sourceUrl: summaryUrl.toString()
      },
      {
        id: "ECHO-SDWA-SNAPSHOT-INSP",
        location: "US Public Water Systems",
        metric: "Systems inspected (5y)",
        value: summary.inspectionRows,
        unit: "systems",
        observedAt,
        latitude: null,
        longitude: null,
        note: "Systems with at least one inspection in the last 5 years",
        sourceUrl: summaryUrl.toString()
      }
    ];

    return finalizeProvider({
      id: "ECHO_SDWA_SNAPSHOT",
      name: "EPA ECHO SDWA Compliance Snapshot",
      sourceUrl: ECHO_SDWA_DOCS_URL,
      items,
      error: null
    });
  } catch (error) {
    return finalizeProvider({
      id: "ECHO_SDWA_SNAPSHOT",
      name: "EPA ECHO SDWA Compliance Snapshot",
      sourceUrl: ECHO_SDWA_DOCS_URL,
      items: [],
      error: normalizeError(error)
    });
  }
}

async function fetchEchoSdwViolationsProvider(): Promise<HydrologyProvider> {
  try {
    const queryUrl = buildEchoSdwSystemsUrl({
      p_sv: "Y",
      p_qiv: "GT1",
      p_health: "Y",
      responseset: ECHO_SDWA_QUEUE_RESPONSESET,
      queryset: 5000
    });
    const queryPayload = await fetchJson<unknown>(queryUrl);
    const summary = parseEchoSdwSummaryPayload(queryPayload);
    if (!summary.queryId) {
      throw new Error("ECHO SDWA query did not return a QueryID.");
    }

    const pageUrl = buildEchoSdwQidUrl(summary.queryId, 1);
    const pagePayload = await fetchJson<unknown>(pageUrl);
    const systems = parseEchoSdwSystemsPayload(pagePayload);
    const ranked = [...systems]
      .sort((left, right) => {
        const leftQtrs = left.qtrsWithVio ?? Number.NEGATIVE_INFINITY;
        const rightQtrs = right.qtrsWithVio ?? Number.NEGATIVE_INFINITY;
        if (leftQtrs !== rightQtrs) {
          return rightQtrs - leftQtrs;
        }

        const leftRules = left.rulesVio ?? Number.NEGATIVE_INFINITY;
        const rightRules = right.rulesVio ?? Number.NEGATIVE_INFINITY;
        if (leftRules !== rightRules) {
          return rightRules - leftRules;
        }

        const leftFea = left.feaFlag ?? Number.NEGATIVE_INFINITY;
        const rightFea = right.feaFlag ?? Number.NEGATIVE_INFINITY;
        return rightFea - leftFea;
      })
      .slice(0, ECHO_SDWA_QUEUE_MAX_ROWS);

    const items = ranked.map((system, index) => {
      const name = system.pwsName || "Public Water System";
      const state = system.stateCode ? ` (${system.stateCode})` : "";
      const pwsId = system.pwsId || "unknown";
      const noteParts = [
        `PWSID ${pwsId}`,
        `Rules in violation ${system.rulesVio ?? "--"}`,
        `Serious violator ${system.seriousViolator || "--"}`,
        `Formal enforcement flag ${system.feaFlag === null ? "--" : system.feaFlag > 0 ? "Y" : "N"}`
      ];

      return {
        id: `ECHO-SDWA-VIOL-${pwsId}-${index}`,
        location: `${name}${state}`,
        metric: "Quarters in noncompliance (3y)",
        value: system.qtrsWithVio,
        unit: "quarters",
        observedAt: system.dateLastVisit || null,
        latitude: null,
        longitude: null,
        note: noteParts.join(" | "),
        sourceUrl: system.dfrUrl || pageUrl.toString()
      } satisfies HydrologyRealtimeItem;
    });

    return finalizeProvider({
      id: "ECHO_SDWA_VIOLATIONS",
      name: "EPA ECHO SDWA Open Violations Queue",
      sourceUrl: ECHO_SDWA_DOCS_URL,
      items,
      error: null
    });
  } catch (error) {
    return finalizeProvider({
      id: "ECHO_SDWA_VIOLATIONS",
      name: "EPA ECHO SDWA Open Violations Queue",
      sourceUrl: ECHO_SDWA_DOCS_URL,
      items: [],
      error: normalizeError(error)
    });
  }
}

async function fetchDfoGreatLakesItems(): Promise<{ items: HydrologyRealtimeItem[]; error: string | null }> {
  try {
    const [stationPayload, latestPayload] = await Promise.all([
      fetchJson<unknown>(buildDfoStationsUrl()),
      fetchJson<unknown>(new URL(`${DFO_BASE_URL}/stations/data/latest`))
    ]);

    const stations = parseDfoStationsPayload(stationPayload);
    const latestRows = parseDfoLatestPayload(latestPayload);
    const stationsByCode = new Map(stations.map((station) => [String(station.code || ""), station]));
    const latestByStationId = new Map(
      latestRows
        .map((row) => [String(row.stationId || ""), row] as const)
        .filter((entry) => entry[0])
    );

    const missing: string[] = [];
    const items = DFO_GREAT_LAKES_TARGETS.map((target) => {
      const station = stationsByCode.get(target.stationCode);
      if (!station?.id) {
        missing.push(`DFO station ${target.stationCode} not found`);
        return {
          id: `GREATLAKES-DFO-${target.stationCode}`,
          location: `${target.lake} (${target.stationCode})`,
          metric: "Water level (wlo)",
          value: null,
          unit: "m",
          observedAt: null,
          latitude: null,
          longitude: null,
          note: "DFO station metadata unavailable",
          sourceUrl: `${DFO_BASE_URL}/stations`
        } satisfies HydrologyRealtimeItem;
      }

      const latest = latestByStationId.get(String(station.id));
      const measurement = pickLatestDfoMeasurement(latest?.measurementDTOs);
      const qc = cleanText(measurement?.qcFlagCode);
      const noteParts = ["DFO/CHS local datum"];
      if (qc) {
        noteParts.push(`QC ${qc}`);
      }

      return {
        id: `GREATLAKES-DFO-${target.stationCode}`,
        location: `${cleanText(station.officialName) || target.stationCode} (${target.lake})`,
        metric: "Water level (wlo)",
        value: toNumberOrNull(measurement?.value),
        unit: "m",
        observedAt: cleanText(measurement?.eventDate),
        latitude: toNumberOrNull(station.latitude),
        longitude: toNumberOrNull(station.longitude),
        note: noteParts.join(" | "),
        sourceUrl: buildDfoStationDataUrl(String(station.id)).toString()
      } satisfies HydrologyRealtimeItem;
    });

    return {
      items,
      error: missing.length ? missing.join("; ") : null
    };
  } catch (error) {
    return {
      items: [],
      error: normalizeError(error)
    };
  }
}

async function fetchNoaaGreatLakesItems(): Promise<{ items: HydrologyRealtimeItem[]; error: string | null }> {
  const rows = await mapWithConcurrency(NOAA_GREAT_LAKES_TARGETS, FETCH_CONCURRENCY, async (target) => {
    try {
      const endpoint = buildNoaaLatestUrl(target.stationId);
      const payload = await fetchJson<unknown>(endpoint);
      const parsed = parseNoaaLatestPayload(payload);

      return {
        item: {
          id: `GREATLAKES-NOAA-${target.stationId}`,
          location: `${parsed.name || `NOAA ${target.stationId}`} (${target.lake})`,
          metric: "Water level (IGLD)",
          value: parsed.value,
          unit: "m",
          observedAt: parsed.observedAt,
          latitude: parsed.latitude,
          longitude: parsed.longitude,
          note: "NOAA CO-OPS IGLD datum",
          sourceUrl: endpoint.toString()
        } satisfies HydrologyRealtimeItem,
        error: null as string | null
      };
    } catch (error) {
      const endpoint = buildNoaaLatestUrl(target.stationId);
      return {
        item: {
          id: `GREATLAKES-NOAA-${target.stationId}`,
          location: `NOAA ${target.stationId} (${target.lake})`,
          metric: "Water level (IGLD)",
          value: null,
          unit: "m",
          observedAt: null,
          latitude: null,
          longitude: null,
          note: normalizeError(error),
          sourceUrl: endpoint.toString()
        } satisfies HydrologyRealtimeItem,
        error: `NOAA station ${target.stationId}: ${normalizeError(error)}`
      };
    }
  });

  const errors = rows.map((row) => row.error).filter((value): value is string => Boolean(value));
  return {
    items: rows.map((row) => row.item),
    error: errors.length ? errors.join("; ") : null
  };
}

function finalizeProvider(args: {
  id:
    | "USGS"
    | "USACE"
    | "USBR"
    | "ECCC"
    | "NRCS_SNOWPACK"
    | "GREAT_LAKES"
    | "ECHO_SDWA_SNAPSHOT"
    | "ECHO_SDWA_VIOLATIONS";
  name: string;
  sourceUrl: string;
  items: HydrologyRealtimeItem[];
  error: string | null;
}): HydrologyProvider {
  const hasValues = args.items.some((item) => item.value !== null);
  const hasItems = args.items.length > 0;
  const status: ProviderStatus = args.error
    ? hasItems
      ? "degraded"
      : "error"
    : hasValues
      ? "ok"
      : hasItems
        ? "degraded"
        : "error";

  return {
    id: args.id,
    name: args.name,
    sourceUrl: args.sourceUrl,
    status,
    updatedAt: selectLatestTimestamp(args.items),
    items: args.items,
    error: args.error
  };
}

async function fetchUsgsLatestContinuous(
  monitoringLocationId: string,
  parameterCodes: readonly string[]
): Promise<UsgsFeatureCollection> {
  const endpoint = new URL(`${USGS_COLLECTION_ENDPOINT}/latest-continuous/items`);
  endpoint.searchParams.set("f", "json");
  endpoint.searchParams.set("limit", "20");
  endpoint.searchParams.set("sortby", "-time");
  endpoint.searchParams.set("monitoring_location_id", monitoringLocationId);
  endpoint.searchParams.set("parameter_code", parameterCodes.join(","));

  return await fetchJson<UsgsFeatureCollection>(endpoint);
}

async function fetchUsgsLocation(
  siteNumber: string
): Promise<{ name: string | null; latitude: number | null; longitude: number | null }> {
  const endpoint = new URL(`${USGS_COLLECTION_ENDPOINT}/monitoring-locations/items`);
  endpoint.searchParams.set("f", "json");
  endpoint.searchParams.set("limit", "1");
  endpoint.searchParams.set("agency_code", "USGS");
  endpoint.searchParams.set("monitoring_location_number", siteNumber);

  const payload = await fetchJson<UsgsFeatureCollection>(endpoint);
  const feature = payload.features?.[0];
  const props = feature?.properties || {};
  const coordinates = feature?.geometry?.coordinates;
  const point = readPointCoordinates(coordinates);

  return {
    name: cleanText(props.monitoring_location_name),
    latitude: point?.latitude ?? null,
    longitude: point?.longitude ?? null
  };
}

export function parseUsgsLatestFeatureCollection(
  payload: unknown,
  parameterCodes: readonly string[]
): Map<
  string,
  {
    value: number | null;
    unit: string | null;
    time: string | null;
    approvalStatus: string | null;
    point: { latitude: number; longitude: number } | null;
  }
> {
  const result = new Map<
    string,
    {
      value: number | null;
      unit: string | null;
      time: string | null;
      approvalStatus: string | null;
      point: { latitude: number; longitude: number } | null;
    }
  >();

  const allowed = new Set(parameterCodes);
  const raw = payload as UsgsFeatureCollection;
  const features = Array.isArray(raw?.features) ? raw.features : [];

  features.forEach((feature) => {
    const props = feature?.properties || {};
    const parameterCode = cleanText(props.parameter_code);
    if (!parameterCode || !allowed.has(parameterCode) || result.has(parameterCode)) {
      return;
    }

    const point = readPointCoordinates(feature?.geometry?.coordinates);
    result.set(parameterCode, {
      value: toNumberOrNull(props.value),
      unit: cleanText(props.unit_of_measure),
      time: cleanText(props.time),
      approvalStatus: cleanText(props.approval_status),
      point
    });
  });

  return result;
}

function buildUsgsLatestContinuousUrl(
  monitoringLocationId: string,
  parameterCodes: readonly string[]
): string {
  const endpoint = new URL(`${USGS_COLLECTION_ENDPOINT}/latest-continuous/items`);
  endpoint.searchParams.set("f", "json");
  endpoint.searchParams.set("sortby", "-time");
  endpoint.searchParams.set("limit", "20");
  endpoint.searchParams.set("monitoring_location_id", monitoringLocationId);
  endpoint.searchParams.set("parameter_code", parameterCodes.join(","));
  return endpoint.toString();
}

export function parseUsaceRecentPayload(payload: unknown): UsaceRecentRecord[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.filter((row): row is UsaceRecentRecord => Boolean(row && typeof row === "object"));
}

export function parseEchoSdwSummaryPayload(payload: unknown): {
  queryId: string | null;
  queryRows: number | null;
  currentViolationRows: number | null;
  seriousViolationRows: number | null;
  formalEnforcementRows: number | null;
  informalEnforcementRows: number | null;
  inspectionRows: number | null;
} {
  const raw = payload as EchoSdwSummaryPayload;
  const results =
    raw?.Results && typeof raw.Results === "object" ? (raw.Results as Record<string, unknown>) : {};

  return {
    queryId: cleanText(results.QueryID),
    queryRows: toLooseNumberOrNull(results.QueryRows),
    currentViolationRows: toLooseNumberOrNull(results.CVRows),
    seriousViolationRows: toLooseNumberOrNull(results.SVRows),
    formalEnforcementRows: toLooseNumberOrNull(results.FEARows),
    informalEnforcementRows: toLooseNumberOrNull(results.InfFEARows),
    inspectionRows: toLooseNumberOrNull(results.INSPRows)
  };
}

export function parseEchoSdwSystemsPayload(payload: unknown): Array<{
  pwsName: string | null;
  pwsId: string | null;
  stateCode: string | null;
  qtrsWithVio: number | null;
  rulesVio: number | null;
  seriousViolator: string | null;
  feaFlag: number | null;
  currVioFlag: number | null;
  dfrUrl: string | null;
  dateLastVisit: string | null;
}> {
  const raw = payload as EchoSdwQueryResultsPayload;
  const rows = Array.isArray(raw?.Results?.WaterSystems) ? raw.Results.WaterSystems : [];

  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    .map((row) => ({
      pwsName: cleanText(row.PWSName),
      pwsId: cleanText(row.PWSId),
      stateCode: cleanText(row.StateCode),
      qtrsWithVio: toLooseNumberOrNull(row.QtrsWithVio),
      rulesVio: toLooseNumberOrNull(row.RulesVio),
      seriousViolator: cleanText(row.SeriousViolator),
      feaFlag: toLooseNumberOrNull(row.FeaFlag),
      currVioFlag: toLooseNumberOrNull(row.CurrVioFlag),
      dfrUrl: cleanText(row.DfrUrl),
      dateLastVisit:
        toUsDateIso(row.SDWDateLastVisit) ||
        toUsDateIso(row.DateLastSansurvey) ||
        toUsDateIso(row.SDWDateLastFea)
    }));
}

function buildUsaceRecentUrl(office: string, timeSeriesIds: readonly string[]): string {
  const endpoint = new URL(`${USACE_BASE_URL}/timeseries/recent`);
  endpoint.searchParams.set("office", office);
  endpoint.searchParams.set("unit-system", "EN");
  endpoint.searchParams.set("ts-ids", timeSeriesIds.join(","));
  return endpoint.toString();
}

function buildEchoSdwSystemsUrl(params: Record<string, string | number | null | undefined>): URL {
  const endpoint = new URL(`${ECHO_BASE_URL}/sdw_rest_services.get_systems`);
  endpoint.searchParams.set("output", "JSON");
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") {
      return;
    }

    endpoint.searchParams.set(key, String(value));
  });
  return endpoint;
}

function buildEchoSdwQidUrl(queryId: string, pageNo: number): URL {
  const endpoint = new URL(`${ECHO_BASE_URL}/sdw_rest_services.get_qid`);
  endpoint.searchParams.set("output", "JSON");
  endpoint.searchParams.set("qid", queryId);
  endpoint.searchParams.set("pageno", String(Math.max(1, Math.floor(pageNo))));
  return endpoint;
}

type UsbrParsedResult = {
  value: number | null;
  observedAt: string | null;
};

export function parseUsbrResultPayload(payload: unknown): UsbrParsedResult | null {
  const raw = payload as UsbrResultPayload;
  const rows = Array.isArray(raw?.data) ? raw.data : [];
  const first = rows[0]?.attributes;
  if (!first) {
    return null;
  }

  const value = toNumberOrNull(first.result);
  const observedAt = cleanText(first.dateTime);
  return {
    value,
    observedAt
  };
}

function parseNrcsStationPayload(payload: unknown): NrcsStationPayload {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.filter(
    (row): row is NrcsStationPayload[number] => Boolean(row && typeof row === "object")
  );
}

export function parseNrcsDailySnowpackPayload(
  payload: unknown
): Map<string, { value: number | null; median: number | null; observedAt: string | null }> {
  const result = new Map<string, { value: number | null; median: number | null; observedAt: string | null }>();
  if (!Array.isArray(payload)) {
    return result;
  }

  const rows = payload as NrcsDailyDataPayload;
  rows.forEach((row) => {
    const stationTriplet = cleanText(row?.stationTriplet);
    if (!stationTriplet || result.has(stationTriplet)) {
      return;
    }

    const dataRows = Array.isArray(row?.data) ? row.data : [];
    let best: { value: number | null; median: number | null; observedAt: string | null } | null = null;
    let bestMs = Number.NEGATIVE_INFINITY;

    dataRows.forEach((entry) => {
      const latest = pickLatestNrcsDailyValue(entry?.values);
      if (!latest?.observedAt) {
        return;
      }

      const timestamp = Date.parse(latest.observedAt);
      if (!Number.isFinite(timestamp) || timestamp <= bestMs) {
        return;
      }

      bestMs = timestamp;
      best = latest;
    });

    if (best) {
      result.set(stationTriplet, best);
    }
  });

  return result;
}

function buildNrcsStationsUrl(stationTriplets: readonly string[]): URL {
  const endpoint = new URL(`${NRCS_AWDB_BASE_URL}/services/v1/stations`);
  endpoint.searchParams.set("stationTriplets", stationTriplets.join(","));
  endpoint.searchParams.set("elements", "WTEQ");
  endpoint.searchParams.set("activeOnly", "true");
  return endpoint;
}

function buildNrcsDataUrl(stationTriplets: readonly string[]): URL {
  const endpoint = new URL(`${NRCS_AWDB_BASE_URL}/services/v1/data`);
  endpoint.searchParams.set("stationTriplets", stationTriplets.join(","));
  endpoint.searchParams.set("elements", "WTEQ");
  endpoint.searchParams.set("duration", "DAILY");
  endpoint.searchParams.set("beginDate", "-7");
  endpoint.searchParams.set("endDate", "0");
  endpoint.searchParams.set("centralTendencyType", "MEDIAN");
  return endpoint;
}

function buildEcccRealtimeUrl(provinceCode: string, limit: number): URL {
  const endpoint = new URL(`${ECCC_COLLECTION_ENDPOINT}/hydrometric-realtime/items`);
  endpoint.searchParams.set("f", "json");
  endpoint.searchParams.set("PROV_TERR_STATE_LOC", provinceCode);
  endpoint.searchParams.set("sortby", "-DATETIME");
  endpoint.searchParams.set("limit", String(Math.max(1, Math.floor(limit))));
  return endpoint;
}

function parseEcccRealtimePayload(payload: unknown): NonNullable<EcccFeatureCollection["features"]> {
  const raw = payload as EcccFeatureCollection;
  if (!Array.isArray(raw?.features)) {
    return [];
  }

  return raw.features.filter((entry) => Boolean(entry && typeof entry === "object"));
}

function buildDfoStationsUrl(): URL {
  const endpoint = new URL(`${DFO_BASE_URL}/stations`);
  endpoint.searchParams.set("chs-region-code", "CNA");
  return endpoint;
}

function parseDfoStationsPayload(payload: unknown): DfoStation[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.filter((row): row is DfoStation => Boolean(row && typeof row === "object"));
}

function parseDfoLatestPayload(payload: unknown): DfoLatestPayloadRow[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.filter((row): row is DfoLatestPayloadRow => Boolean(row && typeof row === "object"));
}

function pickLatestDfoMeasurement(
  values: DfoLatestPayloadRow["measurementDTOs"]
): { eventDate?: string; value?: number; qcFlagCode?: string } | null {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  let best: { eventDate?: string; value?: number; qcFlagCode?: string } | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;

  values.forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }

    const timestamp = Date.parse(String(entry.eventDate || ""));
    if (!Number.isFinite(timestamp)) {
      return;
    }

    if (timestamp > bestMs) {
      bestMs = timestamp;
      best = entry;
    }
  });

  return best;
}

function buildDfoStationDataUrl(stationId: string): URL {
  const endpoint = new URL(`${DFO_BASE_URL}/stations/${encodeURIComponent(stationId)}/data`);
  const to = new Date();
  const from = new Date(Date.now() - 6 * 60 * 60 * 1_000);
  endpoint.searchParams.set("time-series-code", "wlo");
  endpoint.searchParams.set("from", from.toISOString());
  endpoint.searchParams.set("to", to.toISOString());
  return endpoint;
}

function buildNoaaLatestUrl(stationId: string): URL {
  const endpoint = new URL(NOAA_COOPS_ENDPOINT);
  endpoint.searchParams.set("date", "latest");
  endpoint.searchParams.set("station", stationId);
  endpoint.searchParams.set("product", "water_level");
  endpoint.searchParams.set("datum", "IGLD");
  endpoint.searchParams.set("units", "metric");
  endpoint.searchParams.set("time_zone", "gmt");
  endpoint.searchParams.set("format", "json");
  return endpoint;
}

function parseNoaaLatestPayload(payload: unknown): {
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  value: number | null;
  observedAt: string | null;
} {
  const raw = payload as NoaaLatestPayload;
  const first = Array.isArray(raw?.data) ? raw.data[0] : null;
  return {
    name: cleanText(raw?.metadata?.name),
    latitude: toNumberOrNull(raw?.metadata?.lat),
    longitude: toNumberOrNull(raw?.metadata?.lon),
    value: toNumberOrNull(first?.v),
    observedAt: parseNoaaUtcToIso(first?.t)
  };
}

function parseNoaaUtcToIso(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Date.parse(`${normalized.replace(" ", "T")}:00Z`);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

function pickLatestNrcsDailyValue(
  values: unknown
): { value: number | null; median: number | null; observedAt: string | null } | null {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  let best: { value: number | null; median: number | null; observedAt: string | null } | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;

  values.forEach((row) => {
    if (!row || typeof row !== "object") {
      return;
    }

    const observedAt = toNrcsDateIso((row as { date?: string }).date);
    if (!observedAt) {
      return;
    }

    const timestamp = Date.parse(observedAt);
    if (!Number.isFinite(timestamp) || timestamp <= bestMs) {
      return;
    }

    bestMs = timestamp;
    best = {
      value: toNumberOrNull((row as { value?: number }).value),
      median: toNumberOrNull((row as { median?: number }).median),
      observedAt
    };
  });

  return best;
}

function toNrcsDateIso(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return `${normalized}T12:00:00Z`;
  }

  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

async function fetchUsbrLocations(
  locationIds: number[]
): Promise<Map<number, { name: string | null; latitude: number | null; longitude: number | null }>> {
  const rows = await mapWithConcurrency(locationIds, FETCH_CONCURRENCY, async (locationId) => {
    try {
      const payload = await fetchJson<unknown>(new URL(`${USBR_BASE_URL}/location/${locationId}`));
      const parsed = payload as UsbrLocationPayload;
      const attributes = parsed?.data?.attributes || {};
      const coords = readPointCoordinates(attributes.locationCoordinates?.coordinates);
      return {
        locationId,
        name: cleanText(attributes.locationName),
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null
      };
    } catch {
      return {
        locationId,
        name: null,
        latitude: null,
        longitude: null
      };
    }
  });

  const map = new Map<number, { name: string | null; latitude: number | null; longitude: number | null }>();
  rows.forEach((row) => {
    map.set(row.locationId, {
      name: row.name,
      latitude: row.latitude,
      longitude: row.longitude
    });
  });
  return map;
}

async function fetchUsbrParameters(
  parameterIds: number[]
): Promise<Map<number, { name: string | null; unit: string | null }>> {
  const rows = await mapWithConcurrency(parameterIds, FETCH_CONCURRENCY, async (parameterId) => {
    try {
      const payload = await fetchJson<unknown>(new URL(`${USBR_BASE_URL}/parameter/${parameterId}`));
      const parsed = payload as UsbrParameterPayload;
      const attributes = parsed?.data?.attributes || {};
      return {
        parameterId,
        name: cleanText(attributes.parameterName),
        unit: cleanText(attributes.parameterUnit)
      };
    } catch {
      return {
        parameterId,
        name: null,
        unit: null
      };
    }
  });

  const map = new Map<number, { name: string | null; unit: string | null }>();
  rows.forEach((row) => {
    map.set(row.parameterId, {
      name: row.name,
      unit: row.unit
    });
  });
  return map;
}

function buildUsbrResultUrl(locationId: number, parameterId: number): URL {
  const endpoint = new URL(`${USBR_BASE_URL}/result`);
  const before = new Date();
  const after = new Date(Date.now() - 60 * 24 * 60 * 60 * 1_000);
  endpoint.searchParams.set("locationId", String(locationId));
  endpoint.searchParams.set("parameterId", String(parameterId));
  endpoint.searchParams.set("catalogItem.isModeled", "false");
  endpoint.searchParams.set("dateTime[after]", after.toISOString().slice(0, 10));
  endpoint.searchParams.set("dateTime[before]", before.toISOString().slice(0, 10));
  endpoint.searchParams.set("order[dateTime]", "DESC");
  endpoint.searchParams.set("itemsPerPage", "1");
  return endpoint;
}

async function fetchJson<T>(url: URL): Promise<T> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/json,text/plain,*/*"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url.origin}`);
  }

  return (await response.json()) as T;
}

function selectLatestTimestamp(items: HydrologyRealtimeItem[]): string | null {
  let latestMs: number | null = null;

  items.forEach((item) => {
    if (!item.observedAt) {
      return;
    }

    const ms = Date.parse(item.observedAt);
    if (!Number.isFinite(ms)) {
      return;
    }

    if (latestMs === null || ms > latestMs) {
      latestMs = ms;
    }
  });

  if (latestMs === null) {
    return null;
  }

  return new Date(latestMs).toISOString();
}

function normalizeError(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  return String(value);
}

function toNumberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function toLooseNumberOrNull(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const normalized = value.replaceAll(",", "").replaceAll("$", "").trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return toNumberOrNull(value);
}

function toUsDateIso(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  const match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    return null;
  }

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(year) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const timestamp = Date.UTC(year, month - 1, day, 12, 0, 0);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function toIsoFromEpochMs(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return new Date(value).toISOString();
}

function readPointCoordinates(
  rawCoordinates: unknown
): { latitude: number; longitude: number } | null {
  if (!Array.isArray(rawCoordinates) || rawCoordinates.length < 2) {
    return null;
  }

  const [longitudeRaw, latitudeRaw] = rawCoordinates;
  const longitude = toNumberOrNull(longitudeRaw);
  const latitude = toNumberOrNull(latitudeRaw);
  if (longitude === null || latitude === null) {
    return null;
  }

  return { latitude, longitude };
}

async function mapWithConcurrency<TInput, TResult>(
  inputs: readonly TInput[],
  concurrency: number,
  worker: (input: TInput) => Promise<TResult>
): Promise<TResult[]> {
  if (inputs.length === 0) {
    return [];
  }

  const safeConcurrency = Math.max(1, Math.floor(concurrency));
  const results = new Array<TResult>(inputs.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= inputs.length) {
        return;
      }

      results[index] = await worker(inputs[index]);
    }
  }

  const workers = Array.from({ length: Math.min(safeConcurrency, inputs.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}
