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
      const summaryMarkup = renderNewsSummary(entry.summary, entry.link);
      const infoChipsMarkup = `
        <div class="news-chip-row">
          ${renderNewsInfoChip("source", entry.source || "Unknown outlet")}
          ${renderNewsInfoChip("region", resolveLocationLabel(entry))}
        </div>
      `;
      const titleMarkup = href
        ? `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">${title}</a>`
        : `<span>${title}</span>`;
      const riskTagsMarkup = entry.riskTags.length
        ? `<p class="tags">${entry.riskTags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</p>`
        : "";

      return `
        <article class="news-card">
          ${infoChipsMarkup}
          <p class="meta">${formatDateTime(entry.publishedAt)}</p>
          <h3>${titleMarkup}</h3>
          ${summaryMarkup}
          ${riskTagsMarkup}
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

function renderNewsInfoChip(kind, value) {
  return `
    <span class="news-chip news-chip-${escapeAttribute(kind)}">
      ${newsChipIcon(kind)}
      <span>${escapeHtml(value)}</span>
    </span>
  `;
}

function newsChipIcon(kind) {
  if (kind === "region") {
    return `
      <svg class="news-chip-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 21s6-5.33 6-11a6 6 0 1 0-12 0c0 5.67 6 11 6 11z"></path>
        <circle cx="12" cy="10" r="2.5"></circle>
      </svg>
    `;
  }

  return `
    <svg class="news-chip-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 6.5h16v11H4z"></path>
      <path d="M7 9.5h6"></path>
      <path d="M7 12.5h10"></path>
      <path d="M7 15.5h8"></path>
    </svg>
  `;
}

function renderNewsSummary(summary, fallbackLink) {
  const { paragraphs, links } = extractNewsSummaryContent(summary);
  const linkItems = [...links];
  const safeFallback = safeHref(fallbackLink);

  if (safeFallback && !linkItems.some((link) => link.href === safeFallback)) {
    linkItems.push({
      href: safeFallback,
      label: "Open full story"
    });
  }

  const paragraphMarkup = (paragraphs.length ? paragraphs : ["No summary available."])
    .slice(0, 2)
    .map((paragraph) => `<p class="news-summary-paragraph">${escapeHtml(paragraph)}</p>`)
    .join("");

  const linkMarkup = linkItems
    .slice(0, 2)
    .map((link) => renderNewsSummaryLink(link))
    .join("");

  return `
    <div class="news-summary">
      ${paragraphMarkup}
      ${linkMarkup ? `<div class="news-summary-links">${linkMarkup}</div>` : ""}
    </div>
  `;
}

function extractNewsSummaryContent(summary) {
  const decoded = decodeHtmlEntities(String(summary || "")).trim();
  if (!decoded) {
    return { paragraphs: [], links: [] };
  }

  if (typeof DOMParser === "undefined" || !looksLikeHtml(decoded)) {
    const text = normalizeWhitespace(decoded);
    return {
      paragraphs: text && !isPromotionalSummaryText(text) ? [text] : [],
      links: []
    };
  }

  const parser = new DOMParser();
  const documentFragment = parser.parseFromString(`<div>${decoded}</div>`, "text/html");
  const container = documentFragment.body.firstElementChild || documentFragment.body;

  const paragraphs = dedupeTextValues(
    Array.from(container.querySelectorAll("p"))
      .map((element) => normalizeWhitespace(element.textContent || ""))
      .filter((text) => text && !isPromotionalSummaryText(text))
  );

  const links = [];
  const seenHrefs = new Set();
  Array.from(container.querySelectorAll("a[href]")).forEach((anchor) => {
    const href = safeHref(anchor.getAttribute("href"));
    const label = normalizeWhitespace(anchor.textContent || "");
    if (!href || !label || isPromotionalSummaryText(label) || seenHrefs.has(href)) {
      return;
    }

    seenHrefs.add(href);
    links.push({
      href,
      label: trimText(label, 64)
    });
  });

  if (paragraphs.length === 0) {
    const fallbackText = normalizeWhitespace(container.textContent || "");
    if (fallbackText && !isPromotionalSummaryText(fallbackText)) {
      paragraphs.push(trimText(fallbackText, 280));
    }
  }

  return {
    paragraphs: paragraphs.map((text) => trimText(text, 280)),
    links
  };
}

function renderNewsSummaryLink(link) {
  const href = safeHref(link.href);
  if (!href) {
    return "";
  }

  const domain = readHostnameLabel(href);
  const label = trimText(link.label || "Open source", 52);
  return `
    <a class="news-summary-link" href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">
      <span class="news-summary-link-domain">${escapeHtml(domain)}</span>
      <span class="news-summary-link-label">${escapeHtml(label)}</span>
    </a>
  `;
}

function resolveLocationLabel(entry) {
  if (entry?.locationLabel) {
    return entry.locationLabel;
  }

  const inferredCountry = inferCountryLabel(entry);
  if (inferredCountry) {
    return inferredCountry;
  }

  return formatRegionLabel(entry?.region || "global");
}

function inferCountryLabel(entry) {
  const searchText = normalizeWhitespace(
    [
      entry?.title,
      decodeHtmlEntities(String(entry?.summary || "")),
      entry?.source,
      entry?.link
    ]
      .filter(Boolean)
      .join(" ")
  ).toLowerCase();

  if (!searchText) {
    return null;
  }

  const countryMatchers = [
    {
      label: "Canada",
      patterns: [
        /\bcanada\b/,
        /\bcanadian\b/,
        /\bontario\b/,
        /\bquebec\b/,
        /\balberta\b/,
        /\bbritish columbia\b/,
        /\bmanitoba\b/,
        /\bsaskatchewan\b/,
        /\bnew brunswick\b/,
        /\bnova scotia\b/,
        /\bprince edward island\b/,
        /\bnewfoundland\b/,
        /\byukon\b/,
        /\bnunavut\b/,
        /\bnorthwest territories\b/,
        /\btoronto\b/,
        /\bvancouver\b/,
        /\bmontreal\b/,
        /\bottawa\b/
      ]
    },
    {
      label: "American",
      patterns: [
        /\bunited states\b/,
        /\busa\b/,
        /\bu\.s\.\b/,
        /\bamerican\b/,
        /\bcalifornia\b/,
        /\btexas\b/,
        /\bflorida\b/,
        /\bnew york\b/,
        /\bwashington\b/,
        /\bcolorado\b/,
        /\barizona\b/,
        /\bnevada\b/,
        /\butah\b/,
        /\boregon\b/,
        /\bidaho\b/,
        /\bwyoming\b/,
        /\bmontana\b/,
        /\bseattle\b/,
        /\blos angeles\b/,
        /\bchicago\b/,
        /\bmiami\b/
      ]
    },
    {
      label: "Australia",
      patterns: [
        /\baustralia\b/,
        /\baustralian\b/,
        /\bqueensland\b/,
        /\bnew south wales\b/,
        /\bvictoria\b/,
        /\btasmania\b/,
        /\bnorthern territory\b/,
        /\bdarwin\b/,
        /\bbrisbane\b/,
        /\bmelbourne\b/,
        /\bsydney\b/
      ]
    },
    {
      label: "UK",
      patterns: [
        /\bunited kingdom\b/,
        /\buk\b/,
        /\bbritain\b/,
        /\bbritish\b/,
        /\bengland\b/,
        /\bscotland\b/,
        /\bwales\b/,
        /\bnorthern ireland\b/,
        /\blondon\b/
      ]
    },
    {
      label: "France",
      patterns: [/\bfrance\b/, /\bfrench\b/, /\bparis\b/]
    },
    {
      label: "Germany",
      patterns: [/\bgermany\b/, /\bgerman\b/, /\bberlin\b/]
    },
    {
      label: "Japan",
      patterns: [/\bjapan\b/, /\bjapanese\b/, /\btokyo\b/]
    },
    {
      label: "China",
      patterns: [/\bchina\b/, /\bchinese\b/, /\bbeijing\b/]
    },
    {
      label: "India",
      patterns: [/\bindia\b/, /\bindian\b/, /\bdelhi\b/, /\bmumbai\b/]
    },
    {
      label: "Brazil",
      patterns: [/\bbrazil\b/, /\bbrazilian\b/, /\bsao paulo\b/]
    },
    {
      label: "Mexico",
      patterns: [/\bmexico\b/, /\bmexican\b/, /\bmexico city\b/]
    },
    {
      label: "South Africa",
      patterns: [/\bsouth africa\b/, /\bsouth african\b/, /\bcape town\b/, /\bjohannesburg\b/]
    }
  ];

  for (const matcher of countryMatchers) {
    if (matcher.patterns.some((pattern) => pattern.test(searchText))) {
      return matcher.label;
    }
  }

  return null;
}

function formatRegionLabel(value) {
  const normalized = normalizeWhitespace(String(value || "global")).toLowerCase();
  const labels = {
    global: "Global",
    usa: "American",
    united_states: "American",
    "united states": "American",
    uk: "UK",
    united_kingdom: "UK",
    "united kingdom": "UK",
    eu: "Europe",
    canada: "Canada",
    australia: "Australia",
    "north america": "North America",
    north_america: "North America",
    "south america": "South America",
    south_america: "South America"
  };

  if (labels[normalized]) {
    return labels[normalized];
  }

  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function readHostnameLabel(value) {
  const href = safeHref(value);
  if (!href) {
    return "link";
  }

  try {
    const parsed = new URL(href);
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return "link";
  }
}

function isPromotionalSummaryText(value) {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) {
    return true;
  }

  return (
    normalized.includes("continue reading") ||
    (normalized.includes("follow our") && normalized.includes("live blog")) ||
    (normalized.includes("sign up") && normalized.includes("newsletter"))
  );
}

function looksLikeHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function decodeHtmlEntities(value) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeTextValues(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function trimText(value, maxLength) {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}...`;
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
