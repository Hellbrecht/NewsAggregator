const AUTO_REFRESH_MS = 60 * 1_000;
const PAGE_LIMIT = 40;

const state = {
  loading: false,
  cursor: null,
  items: [],
  timerId: null,
  filters: {
    timeRange: "72h",
    minRisk: 70,
    type: "BOTH",
    search: ""
  }
};

const elements = {
  timeRange: document.querySelector("#alerts-time-range"),
  minRisk: document.querySelector("#alerts-min-risk"),
  type: document.querySelector("#alerts-type"),
  search: document.querySelector("#alerts-search"),
  refreshButton: document.querySelector("#alerts-refresh-btn"),
  status: document.querySelector("#alerts-status"),
  summary: document.querySelector("#alerts-summary"),
  list: document.querySelector("#alerts-list"),
  loadMore: document.querySelector("#alerts-load-more-btn")
};

let searchDebounceId = null;

void initialize();

async function initialize() {
  bindActions();
  await loadAlerts(true);

  state.timerId = window.setInterval(() => {
    void loadAlerts(true, true);
  }, AUTO_REFRESH_MS);
}

function bindActions() {
  elements.timeRange?.addEventListener("change", (event) => {
    state.filters.timeRange = String(event.target.value || "72h");
    void loadAlerts(true);
  });

  elements.minRisk?.addEventListener("change", (event) => {
    const parsed = Number(event.target.value);
    state.filters.minRisk = Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 70;
    void loadAlerts(true);
  });

  elements.type?.addEventListener("change", (event) => {
    const value = String(event.target.value || "BOTH").toUpperCase();
    state.filters.type = value === "NEWS" || value === "DATA" ? value : "BOTH";
    void loadAlerts(true);
  });

  elements.search?.addEventListener("input", (event) => {
    state.filters.search = String(event.target.value || "").trim();
    window.clearTimeout(searchDebounceId);
    searchDebounceId = window.setTimeout(() => {
      void loadAlerts(true);
    }, 250);
  });

  elements.refreshButton?.addEventListener("click", () => {
    void loadAlerts(true);
  });

  elements.loadMore?.addEventListener("click", () => {
    void loadAlerts(false);
  });

  elements.list?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-item-id][data-relevance]");
    if (!button) {
      return;
    }

    const itemId = button.getAttribute("data-item-id");
    const targetFeedback = button.getAttribute("data-relevance");
    if (!itemId || (targetFeedback !== "up" && targetFeedback !== "down")) {
      return;
    }

    const current = state.items.find((item) => String(item?.id || "") === itemId);
    const nextFeedback =
      normalizeRelevanceFeedback(current?.relevanceFeedback) === targetFeedback
        ? null
        : targetFeedback;
    void setRelevanceFeedback(itemId, nextFeedback);
  });

  window.addEventListener("beforeunload", () => {
    if (state.timerId) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
  });
}

async function loadAlerts(reset, background = false) {
  if (state.loading) {
    return;
  }

  state.loading = true;
  toggleControls(true);
  if (!background) {
    setStatus("Loading alerts...", false);
  }

  if (reset) {
    state.cursor = null;
  }

  try {
    const params = buildQueryParams(reset ? null : state.cursor);
    const response = await fetch(`/api/combined-feed?${params.toString()}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || "Failed to load alerts.");
    }

    const incoming = (Array.isArray(payload?.items) ? payload.items : []).map((item) => ({
      ...item,
      relevanceFeedback: normalizeRelevanceFeedback(item?.relevanceFeedback)
    }));
    state.items = reset ? incoming : mergeById(state.items, incoming);
    state.cursor = typeof payload?.nextCursor === "string" ? payload.nextCursor : null;

    renderSummary(state.items, payload?.stats);
    renderAlerts(state.items);
    setStatus(
      `Updated ${formatDateTime(new Date().toISOString())} (${state.items.length} alert${state.items.length === 1 ? "" : "s"}).`,
      false
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (reset) {
      state.items = [];
      renderSummary([], null);
      renderAlerts([]);
    }
    setStatus(message, true);
  } finally {
    state.loading = false;
    toggleControls(false);
  }
}

function buildQueryParams(cursor) {
  const params = new URLSearchParams();
  params.set("sort", "risk");
  params.set("limit", String(PAGE_LIMIT));
  params.set("minRisk", String(state.filters.minRisk));
  params.set("type", state.filters.type);
  params.set("from", computeFromIso(state.filters.timeRange));
  params.set("to", new Date().toISOString());

  if (state.filters.search) {
    params.set("search", state.filters.search);
  }

  if (cursor) {
    params.set("cursor", cursor);
  }

  return params;
}

function computeFromIso(timeRange) {
  const now = Date.now();
  if (timeRange === "24h") {
    return new Date(now - 24 * 60 * 60 * 1_000).toISOString();
  }

  if (timeRange === "72h") {
    return new Date(now - 72 * 60 * 60 * 1_000).toISOString();
  }

  if (timeRange === "30d") {
    return new Date(now - 30 * 24 * 60 * 60 * 1_000).toISOString();
  }

  return new Date(now - 7 * 24 * 60 * 60 * 1_000).toISOString();
}

function renderSummary(items, stats) {
  if (!elements.summary) {
    return;
  }

  const critical = items.filter((item) => Number(item?.riskScore) >= 85).length;
  const high = items.filter((item) => Number(item?.riskScore) >= 70 && Number(item?.riskScore) < 85).length;
  const elevated = items.filter((item) => Number(item?.riskScore) >= 50 && Number(item?.riskScore) < 70).length;
  const topTag = selectTopTag(items);
  const filteredTotal = Number(stats?.filtered) || items.length;

  elements.summary.innerHTML = `
    <article class="alerts-summary-card">
      <h2>${critical}</h2>
      <p>Critical</p>
    </article>
    <article class="alerts-summary-card">
      <h2>${high}</h2>
      <p>High</p>
    </article>
    <article class="alerts-summary-card">
      <h2>${elevated}</h2>
      <p>Elevated</p>
    </article>
    <article class="alerts-summary-card">
      <h2>${escapeHtml(topTag)}</h2>
      <p>Top tag (${filteredTotal} matched)</p>
    </article>
  `;
}

function selectTopTag(items) {
  const counts = new Map();
  items.forEach((item) => {
    const tags = Array.isArray(item?.riskTags) ? item.riskTags : [];
    tags.forEach((tag) => {
      const key = String(tag || "").trim();
      if (!key) {
        return;
      }

      counts.set(key, (counts.get(key) || 0) + 1);
    });
  });

  let top = "none";
  let topCount = -1;
  counts.forEach((count, tag) => {
    if (count > topCount) {
      top = tag;
      topCount = count;
    }
  });
  return top;
}

function renderAlerts(items) {
  if (!elements.list) {
    return;
  }

  if (!items.length) {
    elements.list.innerHTML = '<p class="empty">No alerts for current filters.</p>';
    return;
  }

  elements.list.innerHTML = items.map((item) => renderAlertCard(item)).join("");
}

function renderAlertCard(item) {
  const risk = Number(item?.riskScore);
  const score = Number.isFinite(risk) ? Math.max(0, Math.min(100, Math.round(risk))) : 0;
  const level = toAlertLevel(score);
  const levelClass = `alert-level ${level.id}`;
  const source = String(item?.sourceName || "Unknown source");
  const topic = String(item?.topic || "Unknown topic");
  const region = String(item?.region || "Unknown region");
  const type = String(item?.type || "DATA");
  const timestamp = formatDateTime(item?.timestamp);
  const relevanceFeedback = normalizeRelevanceFeedback(item?.relevanceFeedback);
  const itemId = String(item?.id || "");

  const tags = Array.isArray(item?.riskTags) ? item.riskTags : [];
  const tagsMarkup = tags.length
    ? tags.map((tag) => `<span>${escapeHtml(String(tag || ""))}</span>`).join("")
    : "<span>untagged</span>";

  const href = safeHref(item?.originalUrl);
  const titleText = escapeHtml(String(item?.title || "Untitled alert"));
  const titleMarkup = href
    ? `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">${titleText}</a>`
    : `<span>${titleText}</span>`;

  return `
    <article class="alert-card">
      <div class="alert-card-head">
        <span class="${levelClass}">${escapeHtml(level.label)}</span>
        <span class="alert-risk-score">Risk ${score}</span>
      </div>
      <h3>${titleMarkup}</h3>
      <p class="meta">${escapeHtml(source)} | ${escapeHtml(type)} | ${escapeHtml(region)} | ${escapeHtml(topic)}</p>
      <p>${escapeHtml(String(item?.summary || ""))}</p>
      <p class="meta">Observed: ${escapeHtml(timestamp)}</p>
      <p class="tags">${tagsMarkup}</p>
      <div class="relevance-actions" role="group" aria-label="Alert relevance feedback">
        <button
          type="button"
          class="relevance-btn ${relevanceFeedback === "up" ? "active" : ""}"
          data-item-id="${escapeAttribute(itemId)}"
          data-relevance="up"
          aria-pressed="${relevanceFeedback === "up"}"
          title="Mark as relevant"
        >
          <svg class="relevance-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M8 11v9H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h3" />
            <path d="M8 20h9a2 2 0 0 0 1.9-1.37l2-6A2 2 0 0 0 19 10h-6V6a2.5 2.5 0 0 0-5 0v5" />
          </svg>
        </button>
        <button
          type="button"
          class="relevance-btn ${relevanceFeedback === "down" ? "active" : ""}"
          data-item-id="${escapeAttribute(itemId)}"
          data-relevance="down"
          aria-pressed="${relevanceFeedback === "down"}"
          title="Mark as irrelevant"
        >
          <svg
            class="relevance-icon down"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M8 11v9H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h3" />
            <path d="M8 20h9a2 2 0 0 0 1.9-1.37l2-6A2 2 0 0 0 19 10h-6V6a2.5 2.5 0 0 0-5 0v5" />
          </svg>
        </button>
      </div>
    </article>
  `;
}

function toAlertLevel(score) {
  if (score >= 85) {
    return { id: "critical", label: "Critical" };
  }

  if (score >= 70) {
    return { id: "high", label: "High" };
  }

  if (score >= 50) {
    return { id: "elevated", label: "Elevated" };
  }

  return { id: "watch", label: "Watch" };
}

function toggleControls(disabled) {
  if (elements.refreshButton) {
    elements.refreshButton.disabled = disabled;
  }
  if (elements.loadMore) {
    elements.loadMore.disabled = disabled || !state.cursor;
  }
}

function setStatus(message, isError) {
  if (!elements.status) {
    return;
  }

  elements.status.textContent = message;
  elements.status.classList.toggle("error", Boolean(isError));
}

async function setRelevanceFeedback(itemId, relevanceFeedback) {
  try {
    const response = await fetch(`/api/item/${encodeURIComponent(itemId)}/relevance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ relevanceFeedback })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result?.error || "Failed to update relevance feedback.");
    }

    state.items = state.items.map((item) =>
      String(item?.id || "") === itemId
        ? {
            ...item,
            relevanceFeedback: normalizeRelevanceFeedback(result?.state?.relevanceFeedback)
          }
        : item
    );

    await loadAlerts(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, true);
  }
}

function mergeById(existing, incoming) {
  const map = new Map(existing.map((item) => [String(item?.id || ""), item]));
  incoming.forEach((item) => {
    const id = String(item?.id || "");
    if (!id) {
      return;
    }
    map.set(id, item);
  });

  return [...map.values()].sort((left, right) => {
    const leftRisk = Number(left?.riskScore);
    const rightRisk = Number(right?.riskScore);
    if (Number.isFinite(leftRisk) && Number.isFinite(rightRisk) && leftRisk !== rightRisk) {
      return leftRisk < rightRisk ? 1 : -1;
    }

    const leftTime = Date.parse(String(left?.timestamp || ""));
    const rightTime = Date.parse(String(right?.timestamp || ""));
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return leftTime < rightTime ? 1 : -1;
    }

    return String(left?.id || "").localeCompare(String(right?.id || ""));
  });
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

function normalizeRelevanceFeedback(value) {
  if (value === "up" || value === "down") {
    return value;
  }

  return null;
}
