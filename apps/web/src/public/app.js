const state = {
  page: 1,
  selectedDate: null,
  dateGroups: [],
  expandedMonths: new Set(),
  hasInitializedDateMenu: false,
  sources: [],
  entries: [],
  scanInProgress: false
};

const newsList = document.querySelector("#news-list");
const pagination = document.querySelector("#pagination");
const dateList = document.querySelector("#date-list");
const dateMenu = document.querySelector(".date-menu");
const sourceManager = document.querySelector(".source-manager");
const sourceList = document.querySelector("#source-list");
const sourceForm = document.querySelector("#source-form");
const sourceNameInput = document.querySelector("#source-name");
const sourceUrlInput = document.querySelector("#source-url");
const sourceIntervalInput = document.querySelector("#source-interval");
const scanNowButton = document.querySelector("#scan-now-btn");
const scanStatus = document.querySelector("#scan-status");

void initialize();

async function initialize() {
  bindActions();
  await Promise.all([loadNews(), loadSources()]);
  updateSidebarStickyOffsets();
}

function bindActions() {
  scanNowButton?.addEventListener("click", () => {
    void triggerScanNow();
  });

  sourceForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void addSource();
  });

  dateList?.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) {
      return;
    }

    const month = target.getAttribute("data-month");
    if (month) {
      toggleMonth(month);
      return;
    }

    const nextDate = target.getAttribute("data-date");
    if (nextDate === null) {
      return;
    }

    state.selectedDate = nextDate || null;
    state.page = 1;
    if (nextDate) {
      state.expandedMonths.add(monthKeyFromDate(nextDate));
    }
    void loadNews();
  });

  window.addEventListener("resize", () => {
    updateSidebarStickyOffsets();
  });

  newsList?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-entry-id][data-relevance]");
    if (!button) {
      return;
    }

    const entryId = button.getAttribute("data-entry-id");
    const targetFeedback = button.getAttribute("data-relevance");
    if (!entryId || (targetFeedback !== "up" && targetFeedback !== "down")) {
      return;
    }

    const current = state.entries.find((entry) => entry.id === entryId);
    const nextFeedback =
      current?.relevanceFeedback === targetFeedback ? null : targetFeedback;
    void setRelevanceFeedback(entryId, nextFeedback);
  });
}

async function loadNews() {
  const params = new URLSearchParams();
  params.set("page", String(state.page));
  if (state.selectedDate) {
    params.set("date", state.selectedDate);
  }

  try {
    const response = await fetch(`/api/news?${params.toString()}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || "Failed to load news.");
    }

    state.entries = Array.isArray(payload.items) ? payload.items : [];
    state.dateGroups = Array.isArray(payload.dates) ? payload.dates : [];
    state.selectedDate = payload.selectedDate || null;
    renderEntries(state.entries);
    renderPagination(payload.page, payload.totalPages);
    renderDateMenu(state.dateGroups, state.selectedDate);
    updateSidebarStickyOffsets();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.entries = [];
    newsList.innerHTML = `<p class="empty">${escapeHtml(message)}</p>`;
    pagination.innerHTML = "";
    dateList.innerHTML = "";
  }
}

async function loadSources() {
  try {
    const response = await fetch("/api/sources");
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || "Failed to load sources.");
    }

    state.sources = Array.isArray(payload.items) ? payload.items : [];
    renderSources();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sourceList.innerHTML = `<li class="source-empty">${escapeHtml(message)}</li>`;
  }
}

function renderEntries(entries) {
  if (!entries.length) {
    newsList.innerHTML = '<p class="empty">No risk entries found for this filter.</p>';
    return;
  }

  newsList.innerHTML = entries
    .map((entry) => {
      const href = safeHref(entry.link);
      const title = escapeHtml(entry.title);
      const titleMarkup = href
        ? `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">${title}</a>`
        : `<span>${title}</span>`;

      return `
        <article class="news-card">
          <h3>${titleMarkup}</h3>
          <p class="meta">${escapeHtml(entry.source)} | ${formatDateTime(entry.publishedAt)}</p>
          <p>${escapeHtml(entry.summary)}</p>
          <p class="tags">${entry.riskTags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</p>
          <div class="relevance-actions" role="group" aria-label="Article relevance feedback">
            <button
              type="button"
              class="relevance-btn ${entry.relevanceFeedback === "up" ? "active" : ""}"
              data-entry-id="${escapeAttribute(entry.id)}"
              data-relevance="up"
              aria-pressed="${entry.relevanceFeedback === "up"}"
              title="Mark as relevant"
            >
              <svg class="relevance-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M8 11v9H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h3" />
                <path d="M8 20h9a2 2 0 0 0 1.9-1.37l2-6A2 2 0 0 0 19 10h-6V6a2.5 2.5 0 0 0-5 0v5" />
              </svg>
            </button>
            <button
              type="button"
              class="relevance-btn ${entry.relevanceFeedback === "down" ? "active" : ""}"
              data-entry-id="${escapeAttribute(entry.id)}"
              data-relevance="down"
              aria-pressed="${entry.relevanceFeedback === "down"}"
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
    })
    .join("");
}

function renderPagination(page, totalPages) {
  pagination.innerHTML = `
    <button data-action="prev" ${page <= 1 ? "disabled" : ""}>Previous</button>
    <span>Page ${page} of ${totalPages}</span>
    <button data-action="next" ${page >= totalPages ? "disabled" : ""}>Next</button>
  `;

  pagination.querySelector('[data-action="prev"]')?.addEventListener("click", () => {
    state.page = Math.max(1, state.page - 1);
    void loadNews();
  });

  pagination.querySelector('[data-action="next"]')?.addEventListener("click", () => {
    state.page += 1;
    void loadNews();
  });
}

function renderDateMenu(groups, selectedDate) {
  const monthGroups = buildMonthGroups(groups);
  syncExpandedMonths(monthGroups, selectedDate);

  const items = [
    `<li><button class="${selectedDate ? "" : "selected"}" data-date="">All Dates</button></li>`
  ];

  for (const monthGroup of monthGroups) {
    const expanded = state.expandedMonths.has(monthGroup.month);
    const dateItems = monthGroup.dates
      .map((group) => {
        const selectedClass = selectedDate === group.date ? "selected" : "";
        return `<li><button class="${selectedClass}" data-date="${group.date}">${formatDayLabel(
          group.date
        )} (${group.count})</button></li>`;
      })
      .join("");

    items.push(`
      <li class="date-month-group">
        <button class="date-month-toggle" data-month="${monthGroup.month}" aria-expanded="${expanded}">
          <span>${escapeHtml(monthGroup.label)}</span>
          <span class="date-month-count">${monthGroup.count}</span>
        </button>
        <ul class="date-submenu ${expanded ? "" : "collapsed"}">${dateItems}</ul>
      </li>
    `);
  }

  dateList.innerHTML = items.join("");
}

function renderSources() {
  if (!state.sources.length) {
    sourceList.innerHTML = '<li class="source-empty">No sources configured yet.</li>';
    return;
  }

  sourceList.innerHTML = state.sources
    .map((source) => {
      const href = safeHref(source.url);
      const linkLabel = href
        ? `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.url)}</a>`
        : `<span>${escapeHtml(source.url)}</span>`;

      return `
        <li class="source-item">
          <p class="source-name">${escapeHtml(source.name)}</p>
          <p class="source-meta">Every ${Number(source.intervalMinutes)} minute(s)</p>
          <p class="source-link">${linkLabel}</p>
          <div class="source-actions">
            <button type="button" data-source-scan="${escapeAttribute(source.id)}" ${
              state.scanInProgress ? "disabled" : ""
            }>Scan</button>
            <button type="button" class="danger" data-source-delete="${escapeAttribute(source.id)}" ${
              state.scanInProgress ? "disabled" : ""
            }>Delete</button>
          </div>
        </li>
      `;
    })
    .join("");

  sourceList.querySelectorAll("button[data-source-scan]").forEach((button) => {
    button.addEventListener("click", () => {
      const sourceId = button.getAttribute("data-source-scan");
      if (sourceId) {
        void triggerScanNow(sourceId);
      }
    });
  });

  sourceList.querySelectorAll("button[data-source-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const sourceId = button.getAttribute("data-source-delete");
      if (sourceId) {
        void deleteSource(sourceId);
      }
    });
  });
}

async function addSource() {
  const payload = {
    name: sourceNameInput?.value?.trim() ?? "",
    url: sourceUrlInput?.value?.trim() ?? "",
    intervalMinutes: Number(sourceIntervalInput?.value ?? "30")
  };

  try {
    const response = await fetch("/api/sources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result?.error || "Failed to add source.");
    }

    sourceForm?.reset();
    if (sourceIntervalInput) {
      sourceIntervalInput.value = "30";
    }

    setScanStatus(`Source added: ${result.item?.name ?? payload.name}`, false);
    await loadSources();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setScanStatus(message, true);
  }
}

async function deleteSource(sourceId) {
  try {
    const response = await fetch(`/api/sources/${encodeURIComponent(sourceId)}`, {
      method: "DELETE"
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result?.error || "Failed to delete source.");
    }

    setScanStatus("Source removed.", false);
    await loadSources();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setScanStatus(message, true);
  }
}

async function triggerScanNow(sourceId = null) {
  if (state.scanInProgress) {
    return;
  }

  state.scanInProgress = true;
  if (scanNowButton) {
    scanNowButton.disabled = true;
    scanNowButton.textContent = "Scanning...";
  }
  renderSources();
  setScanStatus("Scan started...", false);

  try {
    const response = await fetch("/api/scan-now", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sourceId ? { sourceId } : {})
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result?.error || "Scan failed.");
    }

    setScanStatus(
      `Scan complete: ${result.totalInserted} new entries from ${result.totalSources} source(s).`,
      false
    );
    await Promise.all([loadSources(), loadNews()]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setScanStatus(message, true);
  } finally {
    state.scanInProgress = false;
    if (scanNowButton) {
      scanNowButton.disabled = false;
      scanNowButton.textContent = "Scan All";
    }
    renderSources();
  }
}

async function setRelevanceFeedback(entryId, relevanceFeedback) {
  try {
    const response = await fetch(`/api/item/${encodeURIComponent(entryId)}/relevance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ relevanceFeedback })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result?.error || "Failed to update relevance feedback.");
    }

    state.entries = state.entries.map((entry) =>
      entry.id === entryId
        ? {
            ...entry,
            relevanceFeedback: normalizeRelevanceFeedback(result?.state?.relevanceFeedback)
          }
        : entry
    );

    await loadNews();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setScanStatus(message, true);
  }
}

function setScanStatus(message, isError) {
  if (!scanStatus) {
    return;
  }

  scanStatus.textContent = message;
  scanStatus.classList.toggle("error", Boolean(isError));
}

function buildMonthGroups(groups) {
  const byMonth = new Map();

  for (const group of groups) {
    if (!group || typeof group.date !== "string" || typeof group.count !== "number") {
      continue;
    }

    const month = monthKeyFromDate(group.date);
    const current = byMonth.get(month) || {
      month,
      label: formatMonthLabel(month),
      count: 0,
      dates: []
    };

    current.count += group.count;
    current.dates.push(group);
    byMonth.set(month, current);
  }

  return [...byMonth.values()];
}

function syncExpandedMonths(monthGroups, selectedDate) {
  const validMonths = new Set(monthGroups.map((monthGroup) => monthGroup.month));
  state.expandedMonths = new Set(
    [...state.expandedMonths].filter((month) => validMonths.has(month))
  );

  if (!state.hasInitializedDateMenu && monthGroups.length > 0) {
    const selectedMonth = selectedDate ? monthKeyFromDate(selectedDate) : null;
    if (selectedMonth && validMonths.has(selectedMonth)) {
      state.expandedMonths.add(selectedMonth);
    } else {
      state.expandedMonths.add(monthGroups[0].month);
    }

    state.hasInitializedDateMenu = true;
  }
}

function toggleMonth(month) {
  if (state.expandedMonths.has(month)) {
    state.expandedMonths.delete(month);
  } else {
    state.expandedMonths.add(month);
  }

  renderDateMenu(state.dateGroups, state.selectedDate);
  updateSidebarStickyOffsets();
}

function monthKeyFromDate(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return "unknown";
  }

  return date.slice(0, 7);
}

function formatMonthLabel(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return month;
  }

  const parsed = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return month;
  }

  return parsed.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatDayLabel(dateValue) {
  const parsed = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return dateValue;
  }

  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function updateSidebarStickyOffsets() {
  if (!dateMenu || !sourceManager) {
    return;
  }

  const dateMenuHeight = dateMenu.offsetHeight;
  document.documentElement.style.setProperty("--date-menu-height", `${dateMenuHeight}px`);
}

function formatDateTime(value) {
  return new Date(value).toLocaleString();
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

function safeHref(value) {
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

function normalizeRelevanceFeedback(value) {
  if (value === "up" || value === "down") {
    return value;
  }

  return null;
}
