const WATCHLIST_KEY = "waternews.stocks.watchlist";
const DEFAULT_WATCHLIST = [
  { symbol: "AWK", market: "US" },
  { symbol: "XYL", market: "US" },
  { symbol: "PNR", market: "US" },
  { symbol: "ECL", market: "US" },
  { symbol: "WTRG", market: "US" },
  { symbol: "RY.TO", market: "CA" },
  { symbol: "ENB.TO", market: "CA" }
];
const PRIMARY_MARKET_ORDER = ["US", "CA", "EU", "ASIA"];
const FORM_MARKETS = ["US", "CA", "EU", "ASIA"];
const EXTENDED_MARKETS = ["LATAM", "OCEANIA", "AFRICA"];
const AUTO_REFRESH_MS = 5 * 60_000;
const SUGGESTION_MIN_CHARS = 1;
const SUGGESTION_LIMIT = 10;
const SUGGESTION_DEBOUNCE_MS = 160;
const YAHOO_QUOTE_BASE = "https://finance.yahoo.com/quote/";

const SORT_LABELS = {
  symbol: "Symbol",
  close: "Price",
  change: "Change",
  changePercent: "Change %",
  open: "Open",
  high: "High",
  low: "Low",
  updated: "Updated"
};

const state = {
  watchlist: [],
  loading: false,
  timerId: null,
  activeMarket: "ALL",
  searchQuery: "",
  sortBy: "symbol",
  sortDirection: "asc",
  rows: [],
  suggestions: [],
  highlightedSuggestionIndex: -1
};

const watchlistElement = document.querySelector("#watchlist");
const resultsContainer = document.querySelector("#stocks-results");
const sidebarElement = document.querySelector(".stocks-layout .sidebar");
const watchlistMenu = document.querySelector(".watchlist-menu");
const addForm = document.querySelector("#stocks-form");
const symbolFieldElement = document.querySelector(".stocks-symbol-field");
const symbolInput = document.querySelector("#stock-symbol-input");
const suggestionsElement = document.querySelector("#stock-symbol-suggestions");
const marketSelect = document.querySelector("#stock-market-select");
const refreshButton = document.querySelector("#refresh-stocks-btn");
const statusElement = document.querySelector("#stocks-status");
const searchInput = document.querySelector("#stocks-search-input");
const marketTabs = Array.from(document.querySelectorAll(".market-tab"));
let suggestionDebounceHandle = null;
let suggestionRequestToken = 0;

void initialize();

async function initialize() {
  state.watchlist = loadSavedWatchlist();
  await mergeConfiguredWatchlist();
  bindActions();
  renderMarketTabs();
  renderWatchlist();
  renderRows();
  syncWatchlistOffset();
  void loadStocks();

  state.timerId = window.setInterval(() => {
    void loadStocks(true);
  }, AUTO_REFRESH_MS);
}

function bindActions() {
  addForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const selectedMarket = normalizeFormMarket(marketSelect?.value);
    const symbol = normalizeSymbol(symbolInput?.value || "", selectedMarket);
    if (!symbol) {
      setStatus("Use a valid symbol (letters/numbers, up to 15 chars).", true);
      return;
    }

    const duplicateExists = state.watchlist.some(
      (entry) => entry.symbol === symbol && entry.market === selectedMarket
    );
    if (duplicateExists) {
      setStatus(`${symbol} already exists in ${marketName(selectedMarket)}.`, true);
      return;
    }

    state.watchlist.push({
      symbol,
      market: selectedMarket
    });
    persistWatchlist();

    if (symbolInput) {
      symbolInput.value = "";
    }
    clearSuggestions();

    state.activeMarket = selectedMarket;
    renderMarketTabs();
    renderWatchlist();
    setStatus(`${symbol} added to ${marketName(selectedMarket)}.`, false);
    void loadStocks();
  });

  symbolInput?.addEventListener("input", () => {
    scheduleSuggestionsFetch();
  });

  symbolInput?.addEventListener("keydown", (event) => {
    if (!isSuggestionsOpen()) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      state.highlightedSuggestionIndex = Math.min(
        state.suggestions.length - 1,
        state.highlightedSuggestionIndex + 1
      );
      renderSuggestions();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      state.highlightedSuggestionIndex = Math.max(0, state.highlightedSuggestionIndex - 1);
      renderSuggestions();
      return;
    }

    if (event.key === "Enter" && state.highlightedSuggestionIndex >= 0) {
      event.preventDefault();
      applySuggestion(state.highlightedSuggestionIndex);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      clearSuggestions();
    }
  });

  marketSelect?.addEventListener("change", () => {
    if ((symbolInput?.value || "").trim().length >= SUGGESTION_MIN_CHARS) {
      scheduleSuggestionsFetch();
    } else {
      clearSuggestions();
    }
  });

  suggestionsElement?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-suggestion-index]");
    if (!button) {
      return;
    }

    const index = Number(button.getAttribute("data-suggestion-index"));
    if (!Number.isFinite(index)) {
      return;
    }

    applySuggestion(index);
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (symbolFieldElement?.contains(target)) {
      return;
    }

    clearSuggestions();
  });

  watchlistElement?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-remove-symbol]");
    if (!button) {
      return;
    }

    const symbol = button.getAttribute("data-remove-symbol");
    const market = normalizeAnyMarket(button.getAttribute("data-remove-market"));
    if (!symbol) {
      return;
    }

    state.watchlist = state.watchlist.filter(
      (entry) => !(entry.symbol === symbol && entry.market === market)
    );
    persistWatchlist();
    renderWatchlist();
    void loadStocks();
  });

  refreshButton?.addEventListener("click", () => {
    void loadStocks();
  });

  searchInput?.addEventListener("input", (event) => {
    state.searchQuery = String(event.target.value || "").trim();
    renderRows();
  });

  resultsContainer?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-sort-by]");
    if (!button) {
      return;
    }

    const nextSortBy = button.getAttribute("data-sort-by");
    if (!nextSortBy || !(nextSortBy in SORT_LABELS)) {
      return;
    }

    if (state.sortBy === nextSortBy) {
      state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
    } else {
      state.sortBy = nextSortBy;
      state.sortDirection = nextSortBy === "symbol" ? "asc" : "desc";
    }

    renderRows();
  });

  marketTabs.forEach((button) => {
    button.addEventListener("click", () => {
      const market = normalizeTabMarket(button.getAttribute("data-market-tab"));
      if (state.activeMarket === market) {
        return;
      }

      state.activeMarket = market;
      renderMarketTabs();
      renderWatchlist();
      renderRows();
      void loadStocks();
    });
  });

  window.addEventListener("beforeunload", () => {
    if (state.timerId) {
      window.clearInterval(state.timerId);
    }
  });

  window.addEventListener("resize", () => {
    syncWatchlistOffset();
  });
}

function renderMarketTabs() {
  marketTabs.forEach((tabButton) => {
    const market = normalizeTabMarket(tabButton.getAttribute("data-market-tab"));
    const active = market === state.activeMarket;
    tabButton.classList.toggle("active", active);
    tabButton.setAttribute("aria-selected", String(active));
  });

  if (marketSelect && isFormMarket(state.activeMarket)) {
    marketSelect.value = state.activeMarket;
  }
}

function scheduleSuggestionsFetch() {
  if (suggestionDebounceHandle) {
    window.clearTimeout(suggestionDebounceHandle);
  }

  suggestionDebounceHandle = window.setTimeout(() => {
    suggestionDebounceHandle = null;
    void loadSuggestions();
  }, SUGGESTION_DEBOUNCE_MS);
}

async function loadSuggestions() {
  const query = String(symbolInput?.value || "").trim();
  if (query.length < SUGGESTION_MIN_CHARS) {
    clearSuggestions();
    return;
  }

  const market = normalizeFormMarket(marketSelect?.value);
  const requestToken = suggestionRequestToken + 1;
  suggestionRequestToken = requestToken;

  try {
    const params = new URLSearchParams();
    params.set("q", query);
    params.set("market", market);
    params.set("limit", String(SUGGESTION_LIMIT));

    const response = await fetch(`/api/stocks/symbol-search?${params.toString()}`);
    const payload = await response.json();
    if (requestToken !== suggestionRequestToken) {
      return;
    }

    if (!response.ok) {
      clearSuggestions();
      return;
    }

    const items = Array.isArray(payload?.items) ? payload.items : [];
    state.suggestions = items;
    state.highlightedSuggestionIndex = items.length > 0 ? 0 : -1;
    renderSuggestions();
  } catch {
    if (requestToken === suggestionRequestToken) {
      clearSuggestions();
    }
  }
}

function renderSuggestions() {
  if (!suggestionsElement) {
    return;
  }

  if (!state.suggestions.length) {
    suggestionsElement.classList.add("hidden");
    suggestionsElement.innerHTML = "";
    return;
  }

  suggestionsElement.innerHTML = state.suggestions
    .map((entry, index) => {
      const activeClass = index === state.highlightedSuggestionIndex ? "active" : "";
      const namePart = entry.name ? ` | ${escapeHtml(entry.name)}` : "";
      const exchangePart = entry.exchange ? ` | ${escapeHtml(entry.exchange)}` : "";
      return `
        <li>
          <button type="button" class="stock-suggestion-btn ${activeClass}" data-suggestion-index="${index}">
            <span class="stock-suggestion-symbol">${escapeHtml(entry.symbol)}</span>
            <span class="stock-suggestion-meta">${escapeHtml(marketName(entry.market))}${exchangePart}${namePart}</span>
          </button>
        </li>
      `;
    })
    .join("");
  suggestionsElement.classList.remove("hidden");
}

function clearSuggestions() {
  state.suggestions = [];
  state.highlightedSuggestionIndex = -1;
  renderSuggestions();
}

function isSuggestionsOpen() {
  return Boolean(suggestionsElement) && !suggestionsElement.classList.contains("hidden");
}

function applySuggestion(index) {
  const entry = state.suggestions[index];
  if (!entry) {
    return;
  }

  if (symbolInput) {
    symbolInput.value = entry.symbol;
    symbolInput.focus();
  }

  const suggestedMarket = normalizeFormMarket(entry.market);
  if (marketSelect && isFormMarket(suggestedMarket)) {
    marketSelect.value = suggestedMarket;
  }

  clearSuggestions();
}

async function loadStocks(isBackgroundRefresh = false) {
  if (state.loading) {
    return;
  }

  const watchlistEntries = getWatchlistForActiveMarket();
  if (!watchlistEntries.length) {
    state.rows = [];
    renderRows();
    setStatus(`${marketName(state.activeMarket)} watchlist is empty.`, false);
    return;
  }

  state.loading = true;
  if (refreshButton) {
    refreshButton.disabled = true;
  }

  if (!isBackgroundRefresh) {
    setStatus(`Loading ${marketName(state.activeMarket)} quotes...`, false);
  }

  try {
    const params = new URLSearchParams();
    params.set(
      "symbols",
      watchlistEntries.map((entry) => entry.symbol).join(",")
    );

    const response = await fetch(`/api/stocks?${params.toString()}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || "Failed to load stock quotes.");
    }

    const items = Array.isArray(payload.items) ? payload.items : [];
    state.rows = items.map((item, index) => ({
      ...item,
      market: watchlistEntries[index]?.market || inferMarketFromSymbol(item.symbol)
    }));
    renderRows();

    const updatedAt = formatTimestamp(payload.requestedAt);
    setStatus(`${marketName(state.activeMarket)} quotes updated ${updatedAt}.`, false);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.rows = [];
    renderRows();
    setStatus(message, true);
  } finally {
    state.loading = false;
    if (refreshButton) {
      refreshButton.disabled = false;
    }
  }
}

function renderRows() {
  const preparedRows = prepareRows(state.rows);

  if (state.activeMarket === "ALL") {
    const markets = getAllViewMarkets();
    resultsContainer.innerHTML = markets.map((market) => {
      const marketRows = preparedRows.filter((row) => row.market === market);
      const watchlistCount = getWatchlistForMarket(market).length;
      return renderMarketBlock(market, marketRows, watchlistCount, true);
    }).join("");
    syncWatchlistOffset();
    return;
  }

  const watchlistCount = getWatchlistForMarket(state.activeMarket).length;
  resultsContainer.innerHTML = renderMarketBlock(
    state.activeMarket,
    preparedRows,
    watchlistCount,
    false
  );
  syncWatchlistOffset();
}

function renderMarketBlock(market, rows, watchlistCount, showHeading) {
  const headingMarkup = showHeading
    ? `
      <div class="market-results-head">
        <h3>${escapeHtml(marketName(market))}</h3>
        <p>${rows.length} quote${rows.length === 1 ? "" : "s"}</p>
      </div>
    `
    : "";

  const bodyMarkup = rows.length
    ? rows.map((item) => renderTableRow(item)).join("")
    : `<tr><td colspan="8" class="stocks-empty">${escapeHtml(
        emptyMessageForMarket(market, watchlistCount)
      )}</td></tr>`;

  return `
    <section class="stocks-table-wrap market-results-block">
      ${headingMarkup}
      <table class="stocks-table">
        ${renderTableHead()}
        <tbody>${bodyMarkup}</tbody>
      </table>
    </section>
  `;
}

function renderTableHead() {
  return `
    <thead>
      <tr>
        <th scope="col">${renderSortButton("symbol")}</th>
        <th scope="col">${renderSortButton("close")}</th>
        <th scope="col">${renderSortButton("change")}</th>
        <th scope="col">${renderSortButton("changePercent")}</th>
        <th scope="col">${renderSortButton("open")}</th>
        <th scope="col">${renderSortButton("high")}</th>
        <th scope="col">${renderSortButton("low")}</th>
        <th scope="col">${renderSortButton("updated")}</th>
      </tr>
    </thead>
  `;
}

function renderSortButton(sortBy) {
  const isActive = state.sortBy === sortBy;
  const arrow = isActive ? (state.sortDirection === "asc" ? " ▲" : " ▼") : "";
  const className = isActive ? "sort-btn active" : "sort-btn";
  return `<button type="button" class="${className}" data-sort-by="${sortBy}">${SORT_LABELS[sortBy]}${arrow}</button>`;
}

function renderTableRow(item) {
  const unavailable = item.status !== "ok";
  const changeClass = item.change > 0 ? "positive" : item.change < 0 ? "negative" : "neutral";
  const open = unavailable ? "--" : formatNumber(item.open, 2);
  const high = unavailable ? "--" : formatNumber(item.high, 2);
  const low = unavailable ? "--" : formatNumber(item.low, 2);
  const close = unavailable ? "--" : formatNumber(item.close, 2);
  const change = unavailable ? "--" : formatSignedNumber(item.change, 2);
  const changePct = unavailable ? "--" : formatSignedPercent(item.changePercent);
  const updated = unavailable ? "Unavailable" : [item.date, item.time].filter(Boolean).join(" ");
  const marketLabel = marketName(item.market);
  const symbolHref = buildYahooQuoteUrl(item.symbol);

  return `
    <tr>
      <td>
        <a class="stocks-symbol-link" href="${escapeAttribute(symbolHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.symbol)}</a>
        <div class="stocks-subtle">${escapeHtml(marketLabel)} | ${escapeHtml(item.name || item.sourceSymbol)}</div>
        ${renderSparkline(item.history, item.change)}
      </td>
      <td>${close}</td>
      <td class="${changeClass}">${change}</td>
      <td class="${changeClass}">${changePct}</td>
      <td>${open}</td>
      <td>${high}</td>
      <td>${low}</td>
      <td>${escapeHtml(updated)}</td>
    </tr>
  `;
}

function emptyMessageForMarket(market, watchlistCount) {
  if (watchlistCount === 0) {
    return `No ${watchlistLabel(market)} symbols in watchlist.`;
  }

  if (state.searchQuery) {
    return "No matching quotes for the current search.";
  }

  return "No quotes available.";
}

function prepareRows(rows) {
  const normalizedSearch = state.searchQuery.toLowerCase();
  const filtered = rows.filter((item) => {
    if (!normalizedSearch) {
      return true;
    }

    const haystack =
      `${item.symbol} ${item.name || ""} ${item.sourceSymbol || ""} ${marketName(item.market)}`.toLowerCase();
    return haystack.includes(normalizedSearch);
  });

  const direction = state.sortDirection === "asc" ? 1 : -1;
  filtered.sort((left, right) => compareRows(left, right) * direction);
  return filtered;
}

function compareRows(left, right) {
  const leftValue = readSortValue(left, state.sortBy);
  const rightValue = readSortValue(right, state.sortBy);

  if (leftValue === null && rightValue === null) {
    return `${left.symbol}|${left.market}`.localeCompare(`${right.symbol}|${right.market}`);
  }
  if (leftValue === null) {
    return 1;
  }
  if (rightValue === null) {
    return -1;
  }

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    if (leftValue === rightValue) {
      return `${left.symbol}|${left.market}`.localeCompare(`${right.symbol}|${right.market}`);
    }

    return leftValue > rightValue ? 1 : -1;
  }

  const leftText = String(leftValue);
  const rightText = String(rightValue);
  const textComparison = leftText.localeCompare(rightText);
  if (textComparison !== 0) {
    return textComparison;
  }

  return `${left.symbol}|${left.market}`.localeCompare(`${right.symbol}|${right.market}`);
}

function readSortValue(item, sortBy) {
  if (sortBy === "symbol") {
    return `${item.symbol} ${marketName(item.market)}`;
  }

  if (sortBy === "updated") {
    if (!item.date) {
      return null;
    }

    const dateValue = item.time ? `${item.date}T${item.time}Z` : `${item.date}T00:00:00Z`;
    const timestamp = Date.parse(dateValue);
    return Number.isFinite(timestamp) ? timestamp : item.date;
  }

  const value = item[sortBy];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function renderWatchlist() {
  const entries = getWatchlistForActiveMarket();
  if (!entries.length) {
    watchlistElement.innerHTML = `<li class="watchlist-empty">No ${watchlistLabel(state.activeMarket)} symbols selected.</li>`;
    return;
  }

  watchlistElement.innerHTML = entries
    .map(
      (entry) =>
        `<li class="watchlist-item"><span>${escapeHtml(entry.symbol)}</span><button type="button" data-remove-symbol="${escapeAttribute(entry.symbol)}" data-remove-market="${escapeAttribute(entry.market)}">Remove</button></li>`
    )
    .join("");
}

function getWatchlistForActiveMarket() {
  if (state.activeMarket === "ALL") {
    return [...state.watchlist];
  }

  return getWatchlistForMarket(state.activeMarket);
}

function getWatchlistForMarket(market) {
  return state.watchlist.filter((entry) => entry.market === market);
}

function getAllViewMarkets() {
  const seen = new Set();
  state.watchlist.forEach((entry) => {
    seen.add(normalizeAnyMarket(entry.market));
  });
  state.rows.forEach((row) => {
    seen.add(normalizeAnyMarket(row.market));
  });

  if (seen.size === 0) {
    return [...PRIMARY_MARKET_ORDER];
  }

  const prioritized = PRIMARY_MARKET_ORDER.filter((market) => seen.has(market));
  const extra = [...seen]
    .filter((market) => !PRIMARY_MARKET_ORDER.includes(market))
    .sort((left, right) => marketName(left).localeCompare(marketName(right)));

  return [...prioritized, ...extra];
}

async function mergeConfiguredWatchlist() {
  try {
    const response = await fetch("/api/stocks/watchlist");
    const payload = await response.json();
    if (!response.ok) {
      return;
    }

    const configured = normalizeConfiguredEntries(payload?.items);
    if (!configured.length) {
      return;
    }

    const merged = dedupeWatchlist([...state.watchlist, ...configured]);
    if (merged.length === state.watchlist.length) {
      return;
    }

    state.watchlist = merged;
    persistWatchlist();
  } catch {
    // Ignore catalog sync failures and keep local watchlist.
  }
}

function loadSavedWatchlist() {
  try {
    const raw = window.localStorage.getItem(WATCHLIST_KEY);
    if (!raw) {
      return [...DEFAULT_WATCHLIST];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [...DEFAULT_WATCHLIST];
    }

    const normalized = parsed
      .map(normalizeStoredEntry)
      .filter((entry) => Boolean(entry));

    const deduped = dedupeWatchlist(normalized);
    return deduped.length ? deduped : [...DEFAULT_WATCHLIST];
  } catch {
    return [...DEFAULT_WATCHLIST];
  }
}

function normalizeStoredEntry(entry) {
  if (typeof entry === "string") {
    const market = inferMarketFromSymbol(entry);
    const symbol = normalizeSymbol(entry, market);
    if (!symbol) {
      return null;
    }

    return { symbol, market };
  }

  if (!entry || typeof entry !== "object") {
    return null;
  }

  const market = normalizeAnyMarket(entry.market || inferMarketFromSymbol(entry.symbol));
  const symbol = normalizeSymbol(entry.symbol || "", market);
  if (!symbol) {
    return null;
  }

  return { symbol, market };
}

function normalizeConfiguredEntries(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((entry) => normalizeStoredEntry(entry))
    .filter((entry) => Boolean(entry));
}

function dedupeWatchlist(entries) {
  const seen = new Set();
  const unique = [];

  entries.forEach((entry) => {
    if (!entry) {
      return;
    }

    const key = `${entry.symbol}|${entry.market}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    unique.push(entry);
  });

  return unique;
}

function persistWatchlist() {
  window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(state.watchlist));
}

function normalizeTabMarket(value) {
  const normalized = String(value || "").toUpperCase();
  if (FORM_MARKETS.includes(normalized)) {
    return normalized;
  }

  return "ALL";
}

function normalizeFormMarket(value) {
  const normalized = String(value || "").toUpperCase();
  if (FORM_MARKETS.includes(normalized)) {
    return normalized;
  }

  return "US";
}

function normalizeAnyMarket(value) {
  const normalized = String(value || "").toUpperCase();
  if (normalized === "ALL") {
    return "ALL";
  }
  if (normalized === "SOUTH_AMERICA") {
    return "LATAM";
  }
  if (FORM_MARKETS.includes(normalized) || EXTENDED_MARKETS.includes(normalized)) {
    return normalized;
  }

  return normalizeFormMarket(normalized);
}

function isFormMarket(value) {
  return FORM_MARKETS.includes(String(value || "").toUpperCase());
}

function normalizeSymbol(value, market) {
  let normalized = String(value || "").trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  if (market === "CA" && !normalized.includes(".")) {
    normalized = `${normalized}.TO`;
  }

  if (!/^[A-Z0-9.-]{1,15}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function inferMarketFromSymbol(symbol) {
  const value = String(symbol || "").trim().toUpperCase();
  if (/\.(TO|V|CN)$/.test(value)) {
    return "CA";
  }

  if (/\.(DE|FR|AS|BR|LS|MC|MI|OL|VI|HE|ST|CO|IC|IR|WA|AT|SW|PA|L)$/.test(value)) {
    return "EU";
  }

  if (/\.(HK|T|JP|SS|SZ|KS|KQ|TW|SI)$/.test(value)) {
    return "ASIA";
  }

  return "US";
}

function marketName(market) {
  const normalized = normalizeAnyMarket(market);
  if (normalized === "US") {
    return "US";
  }
  if (normalized === "CA") {
    return "Canada";
  }
  if (normalized === "EU") {
    return "Europe";
  }
  if (normalized === "ASIA") {
    return "Asia";
  }
  if (normalized === "LATAM") {
    return "Latin America";
  }
  if (normalized === "OCEANIA") {
    return "Oceania";
  }
  if (normalized === "AFRICA") {
    return "Africa";
  }

  return "All Markets";
}

function watchlistLabel(market) {
  const normalized = normalizeAnyMarket(market);
  if (normalized === "ALL") {
    return "all markets";
  }
  return marketName(normalized);
}

function buildYahooQuoteUrl(symbol) {
  return `${YAHOO_QUOTE_BASE}${encodeURIComponent(String(symbol || "").trim().toUpperCase())}`;
}

function syncWatchlistOffset() {
  if (!watchlistMenu || !resultsContainer || !sidebarElement) {
    return;
  }

  const sidebarRect = sidebarElement.getBoundingClientRect();
  const resultsRect = resultsContainer.getBoundingClientRect();
  const offset = Math.max(0, Math.round(resultsRect.top - sidebarRect.top));
  watchlistMenu.style.setProperty("--watchlist-offset", `${offset}px`);
}

function renderSparkline(history, change) {
  if (!Array.isArray(history) || history.length < 2) {
    return `
      <svg class="sparkline" viewBox="0 0 120 28" aria-hidden="true" focusable="false">
        <line class="baseline" x1="1" y1="26" x2="119" y2="26"></line>
      </svg>
    `;
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  history.forEach((value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return;
    }

    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  });

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return "";
  }

  const range = max - min || 1;
  const width = 118;
  const height = 24;
  const points = history
    .map((value, index) => {
      const x = (index / (history.length - 1)) * width + 1;
      const y = (1 - (value - min) / range) * height + 2;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const trendColor = change > 0 ? "#0a7f4f" : change < 0 ? "#b42318" : "#0f6fbf";

  return `
    <svg class="sparkline" viewBox="0 0 120 28" aria-label="Recent trend" role="img">
      <line class="baseline" x1="1" y1="26" x2="119" y2="26"></line>
      <polyline points="${points}" style="stroke:${trendColor};"></polyline>
    </svg>
  `;
}

function setStatus(message, isError) {
  if (!statusElement) {
    return;
  }

  statusElement.textContent = message;
  statusElement.classList.toggle("error", Boolean(isError));
}

function formatNumber(value, decimals) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatSignedNumber(value, decimals) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatNumber(value, decimals)}`;
}

function formatSignedPercent(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "just now";
  }

  return date.toLocaleTimeString();
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
