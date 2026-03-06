const AUTO_REFRESH_MS = 5 * 60 * 1_000;
const PROVIDER_DETAILS = {
  USGS: {
    summary: "USGS live gauge observations from the modern Water Data API.",
    points: [
      "Rows combine streamflow (00060) and gage height (00065) for each selected station.",
      "Value is the latest sensor reading; Observed is the reported sample time from USGS.",
      "A note like Provisional means the number may still be revised by USGS quality control."
    ]
  },
  USACE: {
    summary: "USACE CWMS real-time reservoir operations snapshots.",
    points: [
      "Rows show pool elevation time series for selected USACE projects.",
      "Value is the latest CWMS reading in operational engineering units (typically feet here).",
      "Quality code notes come from CWMS and indicate data quality state for that sample."
    ]
  },
  USBR: {
    summary: "USBR RISE operational reservoir dataset snapshot.",
    points: [
      "Rows show latest reported storage values for selected Reclamation reservoirs.",
      "Value is daily reservoir storage (typically acre-feet for parameter 3 in this view).",
      "Observed is the source timestamp in RISE for the most recent available result."
    ]
  },
  ECCC: {
    summary: "Environment and Climate Change Canada real-time hydrometric signals.",
    points: [
      "Rows are pulled from the national hydrometric realtime collection (GeoMet).",
      "Water level and discharge values come from the latest available station sample in each selected province.",
      "Use each station as a local trend indicator; station datum and context can differ by site."
    ]
  },
  NRCS_SNOWPACK: {
    summary: "NRCS SNOTEL snowpack precursor signal from daily snow water equivalent (SWE).",
    points: [
      "Rows show daily SWE for selected SNOTEL reference stations in major western snow basins.",
      "Notes include the station median SWE and the current percent-of-median signal for quick runoff context.",
      "Use this as an upstream snowpack indicator alongside river and reservoir observations."
    ]
  },
  GREAT_LAKES: {
    summary: "Great Lakes shoreline level snapshot from Canadian and US gauge networks.",
    points: [
      "This block combines DFO/CHS gauges on the Canadian side with NOAA CO-OPS stations on the US side.",
      "NOAA rows use IGLD datum in meters; DFO rows use station local water-level reference (wlo).",
      "Compare trends within each station over time rather than directly comparing absolute levels across networks."
    ]
  },
  ECHO_SDWA_SNAPSHOT: {
    summary: "EPA ECHO SDWA national compliance totals for serious violators and enforcement activity.",
    points: [
      "Rows summarize national counts from the latest SDWIS snapshot behind ECHO web services.",
      "Values are system counts (not rates) for current violations and formal/informal enforcement markers.",
      "Use this card as a macro compliance baseline alongside real-time hydrology observations."
    ]
  },
  ECHO_SDWA_VIOLATIONS: {
    summary: "EPA ECHO SDWA queue of high-risk systems ranked by noncompliance duration and rule count.",
    points: [
      "Rows prioritize systems with more quarters in noncompliance and more rules in active violation.",
      "Notes include PWSID, rule-count, serious-violator status, and enforcement-flag context.",
      "Observed time is the latest available visit/survey date when present in SDWA records."
    ]
  }
};

const state = {
  loading: false,
  timerId: null
};

const refreshButton = document.querySelector("#hydrology-refresh-btn");
const statusElement = document.querySelector("#hydrology-status");
const gridElement = document.querySelector("#hydrology-grid");

void initialize();

async function initialize() {
  bindActions();
  await loadHydrology(false);

  state.timerId = window.setInterval(() => {
    void loadHydrology(false, true);
  }, AUTO_REFRESH_MS);
}

function bindActions() {
  refreshButton?.addEventListener("click", () => {
    void loadHydrology(true);
  });

  window.addEventListener("beforeunload", () => {
    if (state.timerId) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
  });
}

async function loadHydrology(forceRefresh = false, isBackground = false) {
  if (state.loading) {
    return;
  }

  state.loading = true;
  if (refreshButton) {
    refreshButton.disabled = true;
  }

  if (!isBackground) {
    setStatus("Loading live hydrology feeds...", false);
  }

  try {
    const url = forceRefresh ? "/api/hydrology/realtime?refresh=1" : "/api/hydrology/realtime";
    const response = await fetch(url);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || "Failed to load hydrology feeds.");
    }

    const providers = Array.isArray(payload?.providers) ? payload.providers : [];
    renderProviders(providers);

    const updatedAt = formatDateTime(payload?.requestedAt);
    const providerSummary = providers.length ? `${providers.length} provider(s)` : "no providers";
    setStatus(`Hydrology snapshot updated ${updatedAt} (${providerSummary}).`, false);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    renderError(message);
    setStatus(message, true);
  } finally {
    state.loading = false;
    if (refreshButton) {
      refreshButton.disabled = false;
    }
  }
}

function renderProviders(providers) {
  if (!gridElement) {
    return;
  }

  if (!providers.length) {
    gridElement.innerHTML = `
    <article class="hydrology-card">
      <h2>No Data</h2>
      <p>No hydrology providers are configured.</p>
    </article>
    `;
    return;
  }

  gridElement.innerHTML = providers.map((provider) => renderProviderCard(provider)).join("");
}

function renderProviderCard(provider) {
  const status = normalizeStatus(provider?.status);
  const statusLabel =
    status === "ok" ? "Live" : status === "degraded" ? "Partial" : "Unavailable";
  const statusClass = `hydrology-chip ${status}`;
  const details = PROVIDER_DETAILS[String(provider?.id || "").toUpperCase()] || null;

  const updatedAt = provider?.updatedAt ? formatDateTime(provider.updatedAt) : "Unknown";
  const sourceUrl = safeHref(provider?.sourceUrl);
  const sourceLabel = sourceUrl
    ? `<a href="${escapeAttribute(sourceUrl)}" target="_blank" rel="noopener noreferrer">Source API</a>`
    : "Source API";
  const errorMessage =
    typeof provider?.error === "string" && provider.error
      ? `<p class="hydrology-provider-error">${escapeHtml(provider.error)}</p>`
      : "";

  const items = Array.isArray(provider?.items) ? provider.items : [];
  const rows = items.length
    ? items.map((item) => renderProviderRow(item)).join("")
    : `<tr><td colspan="4" class="hydrology-empty-row">No measurements available.</td></tr>`;

  return `
    <article class="hydrology-card">
      <div class="hydrology-card-head">
        <h2>${escapeHtml(String(provider?.name || "Hydrology Provider"))}</h2>
        <span class="${statusClass}">${statusLabel}</span>
      </div>
      <div class="hydrology-card-body">
        ${renderProviderDetails(details)}
        <p class="hydrology-provider-meta">Last observed: ${escapeHtml(updatedAt)}</p>
        <p class="hydrology-provider-link">${sourceLabel}</p>
        ${errorMessage}
        <div class="hydrology-table-wrap">
          <table class="hydrology-table">
            <thead>
              <tr>
                <th scope="col">Location</th>
                <th scope="col">Metric</th>
                <th scope="col">Value</th>
                <th scope="col">Observed</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      </div>
    </article>
  `;
}

function renderProviderDetails(details) {
  if (!details) {
    return "";
  }

  const points = Array.isArray(details.points) ? details.points : [];
  const itemsMarkup = points
    .map((entry) => `<li>${escapeHtml(String(entry || ""))}</li>`)
    .join("");

  return `
    <p class="hydrology-provider-summary">${escapeHtml(String(details.summary || ""))}</p>
    <ul class="hydrology-provider-notes">${itemsMarkup}</ul>
  `;
}

function renderProviderRow(item) {
  const location = item?.location || "Unknown";
  const metric = item?.metric || "Measurement";
  const observedAt = item?.observedAt ? formatDateTime(item.observedAt) : "--";
  const valueMarkup = formatValue(item?.value, item?.unit);
  const hasPoint = Number.isFinite(Number(item?.latitude)) && Number.isFinite(Number(item?.longitude));
  const note = typeof item?.note === "string" && item.note.trim() ? item.note.trim() : "";
  const locationMeta = hasPoint
    ? `<div class="hydrology-subtle">${Number(item.latitude).toFixed(4)}, ${Number(item.longitude).toFixed(4)}${
        note ? ` | ${escapeHtml(note)}` : ""
      }</div>`
    : note
      ? `<div class="hydrology-subtle">${escapeHtml(note)}</div>`
      : "";

  return `
    <tr>
      <td>
        <strong>${escapeHtml(String(location))}</strong>
        ${locationMeta}
      </td>
      <td>${escapeHtml(String(metric))}</td>
      <td>${valueMarkup}</td>
      <td>${escapeHtml(observedAt)}</td>
    </tr>
  `;
}

function renderError(message) {
  if (!gridElement) {
    return;
  }

  gridElement.innerHTML = `
    <article class="hydrology-card">
      <h2>Hydrology Feed Error</h2>
      <p>${escapeHtml(message)}</p>
    </article>
  `;
}

function setStatus(message, isError) {
  if (!statusElement) {
    return;
  }

  statusElement.textContent = message;
  statusElement.classList.toggle("error", Boolean(isError));
}

function formatValue(value, unit) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return "--";
  }

  const decimals = Math.abs(parsed) >= 100 ? 0 : Math.abs(parsed) >= 10 ? 1 : 2;
  const formatted = parsed.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  });
  const unitText = typeof unit === "string" && unit.trim() ? ` ${unit.trim()}` : "";
  return `${escapeHtml(formatted)}${escapeHtml(unitText)}`;
}

function normalizeStatus(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "ok" || normalized === "degraded" || normalized === "error") {
    return normalized;
  }

  return "error";
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString();
}

function safeHref(value) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
