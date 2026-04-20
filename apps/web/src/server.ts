import "./load-env";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";

import { groupEntriesByDate, paginate, tryToDateKey } from "../../../packages/shared/src";
import { getCombinedFeed, getItemDetails, parseCombinedFeedQuery } from "./feed-service";
import { loadFeedSnapshot, readIngestionHealth } from "./feed-store";
import {
  loadItemStateMap,
  resolveItemState,
  setItemRelevance,
  setItemReviewed,
  setItemStarred
} from "./item-state-store";
import { scanSourcesNow } from "./manual-scan";
import { loadEntries } from "./news-repository";
import { getStockQuotes, parseRequestedSymbols } from "./stocks-service";
import { loadConfiguredStockWatchlist } from "./stocks-watchlist";
import { searchSymbolUniverse } from "./symbol-universe-service";
import { getHydrologyRealtimeSnapshot } from "./hydrology-realtime-service";
import { applyRelevanceFeedback } from "../../../src/services/relevance_profile_store";
import {
  createUniqueSourceId,
  loadSources,
  parseSourceDraft,
  saveSources
} from "./source-config";
import { RelevanceFeedback } from "./feed-types";

const PORT = Number(process.env.PORT ?? 3000);
const PAGE_SIZE = 20;
const MAX_STOCK_SYMBOLS = 500;
const PUBLIC_DIR = path.resolve(__dirname, "public");
const MAX_BODY_BYTES = 64_000;

let scanInProgress = false;

const MIME_BY_EXTENSION: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

const server = createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 400, { error: "Bad request." });
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname === "/api/news") {
    try {
      await handleNewsApi(url, response);
    } catch (error) {
      console.error("Failed to handle /api/news", error);
      sendJson(response, 500, { error: "Internal server error." });
    }

    return;
  }

  if (url.pathname === "/api/combined-feed") {
    try {
      if (request.method !== "GET") {
        sendMethodNotAllowed(response, "GET");
        return;
      }

      const query = parseCombinedFeedQuery(url);
      const payload = await getCombinedFeed(query);
      sendJson(response, 200, payload);
    } catch (error) {
      console.error("Failed to handle /api/combined-feed", error);
      sendJson(response, 500, { error: "Internal server error." });
    }

    return;
  }

  if (url.pathname === "/api/stocks") {
    try {
      if (request.method !== "GET") {
        sendMethodNotAllowed(response, "GET");
        return;
      }

      await handleStocksApi(url, response);
    } catch (error) {
      console.error("Failed to handle /api/stocks", error);
      sendJson(response, 500, { error: "Internal server error." });
    }

    return;
  }

  if (url.pathname === "/api/stocks/watchlist") {
    try {
      if (request.method !== "GET") {
        sendMethodNotAllowed(response, "GET");
        return;
      }

      await handleStocksWatchlistApi(response);
    } catch (error) {
      console.error("Failed to handle /api/stocks/watchlist", error);
      sendJson(response, 500, { error: "Internal server error." });
    }

    return;
  }

  if (url.pathname === "/api/stocks/symbol-search") {
    try {
      if (request.method !== "GET") {
        sendMethodNotAllowed(response, "GET");
        return;
      }

      await handleStockSymbolSearchApi(url, response);
    } catch (error) {
      console.error("Failed to handle /api/stocks/symbol-search", error);
      sendJson(response, 500, { error: "Internal server error." });
    }

    return;
  }

  if (url.pathname === "/api/hydrology/realtime") {
    try {
      if (request.method !== "GET") {
        sendMethodNotAllowed(response, "GET");
        return;
      }

      await handleHydrologyRealtimeApi(url, response);
    } catch (error) {
      console.error("Failed to handle /api/hydrology/realtime", error);
      sendJson(response, 500, { error: "Internal server error." });
    }

    return;
  }

  const itemMatch = url.pathname.match(/^\/api\/item\/([^/]+)$/);
  if (itemMatch) {
    try {
      if (request.method !== "GET") {
        sendMethodNotAllowed(response, "GET");
        return;
      }

      const itemId = decodeURIComponent(itemMatch[1]);
      const payload = await getItemDetails(itemId);
      if (!payload.item) {
        sendJson(response, 404, { error: "Item not found." });
        return;
      }

      sendJson(response, 200, payload);
    } catch (error) {
      console.error("Failed to handle /api/item/:id", error);
      sendJson(response, 500, { error: "Internal server error." });
    }

    return;
  }

  const reviewedMatch = url.pathname.match(/^\/api\/item\/([^/]+)\/reviewed$/);
  if (reviewedMatch) {
    try {
      if (request.method !== "POST") {
        sendMethodNotAllowed(response, "POST");
        return;
      }

      const payload = await readJsonBody(request);
      const reviewed = readBooleanField(payload, "reviewed");
      if (reviewed === null) {
        sendJson(response, 400, { error: "Field reviewed must be a boolean." });
        return;
      }

      const itemId = decodeURIComponent(reviewedMatch[1]);
      const state = await setItemReviewed(itemId, reviewed);
      sendJson(response, 200, { id: itemId, state });
    } catch (error) {
      console.error("Failed to handle /api/item/:id/reviewed", error);
      sendJson(response, 500, { error: "Internal server error." });
    }

    return;
  }

  const starMatch = url.pathname.match(/^\/api\/item\/([^/]+)\/star$/);
  if (starMatch) {
    try {
      if (request.method !== "POST") {
        sendMethodNotAllowed(response, "POST");
        return;
      }

      const payload = await readJsonBody(request);
      const starred = readBooleanField(payload, "starred");
      if (starred === null) {
        sendJson(response, 400, { error: "Field starred must be a boolean." });
        return;
      }

      const itemId = decodeURIComponent(starMatch[1]);
      const state = await setItemStarred(itemId, starred);
      sendJson(response, 200, { id: itemId, state });
    } catch (error) {
      console.error("Failed to handle /api/item/:id/star", error);
      sendJson(response, 500, { error: "Internal server error." });
    }

    return;
  }

  const relevanceMatch = url.pathname.match(/^\/api\/item\/([^/]+)\/relevance$/);
  if (relevanceMatch) {
    try {
      if (request.method !== "POST") {
        sendMethodNotAllowed(response, "POST");
        return;
      }

      const payload = await readJsonBody(request);
      const relevanceFeedback = readRelevanceFeedbackField(payload, "relevanceFeedback");
      if (relevanceFeedback === undefined) {
        sendJson(response, 400, {
          error: "Field relevanceFeedback must be one of: up, down, or null."
        });
        return;
      }

      const itemId = decodeURIComponent(relevanceMatch[1]);
      const previousStateMap = await loadItemStateMap();
      const previousRelevance = resolveItemState(previousStateMap, itemId).relevanceFeedback;
      const state = await setItemRelevance(itemId, relevanceFeedback);

      if (previousRelevance !== relevanceFeedback) {
        const contextText = await buildItemLearningText(itemId);
        if (contextText) {
          await applyRelevanceFeedback({
            text: contextText,
            previousFeedback: previousRelevance,
            nextFeedback: relevanceFeedback
          });
        }
      }

      sendJson(response, 200, { id: itemId, state });
    } catch (error) {
      console.error("Failed to handle /api/item/:id/relevance", error);
      sendJson(response, 500, { error: "Internal server error." });
    }

    return;
  }

  if (url.pathname === "/api/health") {
    try {
      if (request.method !== "GET") {
        sendMethodNotAllowed(response, "GET");
        return;
      }

      const health = await readIngestionHealth();
      sendJson(response, 200, {
        ok: true,
        ...health
      });
    } catch (error) {
      console.error("Failed to handle /api/health", error);
      sendJson(response, 500, { error: "Internal server error." });
    }

    return;
  }

  if (url.pathname === "/api/sources") {
    try {
      if (request.method === "GET") {
        await handleGetSources(response);
        return;
      }

      if (request.method === "POST") {
        await handleCreateSource(request, response);
        return;
      }

      sendMethodNotAllowed(response, "GET, POST");
    } catch (error) {
      console.error("Failed to handle /api/sources", error);
      sendJson(response, 500, { error: "Internal server error." });
    }

    return;
  }

  const sourceDeleteMatch = url.pathname.match(/^\/api\/sources\/([^/]+)$/);
  if (sourceDeleteMatch) {
    try {
      if (request.method !== "DELETE") {
        sendMethodNotAllowed(response, "DELETE");
        return;
      }

      await handleDeleteSource(decodeURIComponent(sourceDeleteMatch[1]), response);
    } catch (error) {
      console.error("Failed to handle source delete", error);
      sendJson(response, 500, { error: "Internal server error." });
    }

    return;
  }

  if (url.pathname === "/api/scan-now") {
    try {
      if (request.method !== "POST") {
        sendMethodNotAllowed(response, "POST");
        return;
      }

      await handleScanNow(request, response);
    } catch (error) {
      console.error("Failed to handle /api/scan-now", error);
      sendJson(response, 500, { error: "Internal server error." });
    }

    return;
  }

  if (url.pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === "/") {
    await sendStaticFile(path.join(PUBLIC_DIR, "index.html"), response);
    return;
  }

  if (url.pathname === "/stocks") {
    await sendStaticFile(path.join(PUBLIC_DIR, "stocks.html"), response);
    return;
  }

  if (url.pathname === "/hydrology") {
    await sendStaticFile(path.join(PUBLIC_DIR, "hydrology.html"), response);
    return;
  }

  if (url.pathname === "/alerts") {
    await sendStaticFile(path.join(PUBLIC_DIR, "alerts.html"), response);
    return;
  }

  if (url.pathname === "/maps") {
    await sendStaticFile(path.join(PUBLIC_DIR, "maps.html"), response);
    return;
  }

  const staticFilePath = path.join(PUBLIC_DIR, url.pathname);
  await sendStaticFile(staticFilePath, response);
});

server.listen(PORT, () => {
  console.log(`Web app listening on http://localhost:${PORT}`);
});

async function handleNewsApi(url: URL, response: ServerResponse<IncomingMessage>): Promise<void> {
  const requestedPage = Number(url.searchParams.get("page") ?? 1);
  const page = Number.isFinite(requestedPage) ? requestedPage : 1;
  const rawDateFilter = url.searchParams.get("date");
  const dateFilter = isValidDateFilter(rawDateFilter) ? rawDateFilter : null;

  const [entries, stateMap] = await Promise.all([loadEntries(), loadItemStateMap()]);
  const visibleEntries = entries
    .map((entry) => {
      const state = resolveItemState(stateMap, entry.id);
      return {
        ...entry,
        relevanceFeedback: state.relevanceFeedback
      };
    })
    .filter((entry) => entry.relevanceFeedback !== "down");

  const filtered = dateFilter
    ? visibleEntries.filter((entry) => tryToDateKey(entry.publishedAt).startsWith(dateFilter))
    : visibleEntries;

  const paged = paginate(filtered, page, PAGE_SIZE);
  const dates = groupEntriesByDate(visibleEntries);

  sendJson(response, 200, {
    page: paged.page,
    pageSize: PAGE_SIZE,
    totalItems: paged.totalItems,
    totalPages: paged.totalPages,
    selectedDate: dateFilter,
    dates,
    items: paged.items
  });
}

async function handleStocksApi(
  url: URL,
  response: ServerResponse<IncomingMessage>
): Promise<void> {
  const symbols = parseRequestedSymbols(url.searchParams.get("symbols"));
  if (symbols.length === 0) {
    sendJson(response, 400, { error: "Provide at least one stock symbol via ?symbols=..." });
    return;
  }

  if (symbols.length > MAX_STOCK_SYMBOLS) {
    sendJson(response, 400, {
      error: `Maximum ${MAX_STOCK_SYMBOLS} symbols per request.`
    });
    return;
  }

  const items = await getStockQuotes(symbols);
  sendJson(response, 200, {
    requestedAt: new Date().toISOString(),
    items
  });
}

async function handleStocksWatchlistApi(
  response: ServerResponse<IncomingMessage>
): Promise<void> {
  const items = await loadConfiguredStockWatchlist();
  sendJson(response, 200, { items });
}

async function handleStockSymbolSearchApi(
  url: URL,
  response: ServerResponse<IncomingMessage>
): Promise<void> {
  const query = String(url.searchParams.get("q") || "").trim();
  if (!query) {
    sendJson(response, 200, { updatedAt: null, totalSymbols: 0, items: [] });
    return;
  }

  const market = String(url.searchParams.get("market") || "ALL").trim().toUpperCase();
  const requestedLimit = Number(url.searchParams.get("limit") || 8);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(25, Math.max(1, Math.floor(requestedLimit)))
    : 8;

  const payload = await searchSymbolUniverse(query, market, limit);
  sendJson(response, 200, payload);
}

async function handleHydrologyRealtimeApi(
  url: URL,
  response: ServerResponse<IncomingMessage>
): Promise<void> {
  const refreshValue = String(url.searchParams.get("refresh") || "").trim().toLowerCase();
  const forceRefresh = refreshValue === "1" || refreshValue === "true" || refreshValue === "yes";
  const payload = await getHydrologyRealtimeSnapshot(forceRefresh);
  sendJson(response, 200, payload);
}

async function handleGetSources(response: ServerResponse<IncomingMessage>): Promise<void> {
  const sources = await loadSources();
  sendJson(response, 200, { items: sources });
}

async function handleCreateSource(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>
): Promise<void> {
  let payload: Record<string, unknown>;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    handleBodyError(error, response);
    return;
  }

  const draft = parseSourceDraft(payload);
  if (!draft) {
    sendJson(response, 400, { error: "Invalid source payload." });
    return;
  }

  const sources = await loadSources();
  const normalizedIncomingUrl = normalizeUrl(draft.url);
  const urlExists = sources.some((source) => normalizeUrl(source.url) === normalizedIncomingUrl);
  if (urlExists) {
    sendJson(response, 409, { error: "A source with the same URL already exists." });
    return;
  }

  const id = createUniqueSourceId(draft.name, sources, draft.id);
  const created = {
    ...draft,
    id
  };

  await saveSources([...sources, created]);
  sendJson(response, 201, { item: created });
}

async function handleDeleteSource(
  sourceId: string,
  response: ServerResponse<IncomingMessage>
): Promise<void> {
  const sources = await loadSources();
  const filtered = sources.filter((source) => source.id !== sourceId);

  if (filtered.length === sources.length) {
    sendJson(response, 404, { error: "Source not found." });
    return;
  }

  await saveSources(filtered);
  sendJson(response, 200, { ok: true });
}

async function handleScanNow(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>
): Promise<void> {
  if (scanInProgress) {
    sendJson(response, 409, { error: "Scan already in progress." });
    return;
  }

  let payload: Record<string, unknown>;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    handleBodyError(error, response);
    return;
  }

  const sourceId =
    payload && typeof payload === "object" && typeof payload.sourceId === "string"
      ? payload.sourceId
      : null;

  const sources = await loadSources();
  const selected = sourceId ? sources.filter((source) => source.id === sourceId) : sources;
  if (sourceId && selected.length === 0) {
    sendJson(response, 404, { error: "Source not found." });
    return;
  }

  scanInProgress = true;
  try {
    const result = await scanSourcesNow(selected);
    sendJson(response, 200, result);
  } finally {
    scanInProgress = false;
  }
}

async function sendStaticFile(filePath: string, response: ServerResponse<IncomingMessage>): Promise<void> {
  if (!isPathInside(PUBLIC_DIR, filePath)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    const extension = path.extname(filePath);
    const mime = MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
    response.writeHead(200, { "content-type": mime });
    response.end(data);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not Found");
  }
}

function sendJson(response: ServerResponse<IncomingMessage>, status: number, payload: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendMethodNotAllowed(
  response: ServerResponse<IncomingMessage>,
  allowedMethods: string
): void {
  response.writeHead(405, {
    "content-type": "application/json; charset=utf-8",
    allow: allowedMethods
  });
  response.end(JSON.stringify({ error: "Method not allowed." }));
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const normalizedParent = path.resolve(parentPath);
  const normalizedChild = path.resolve(childPath);
  return normalizedChild.startsWith(normalizedParent);
}

function isValidDateFilter(value: string | null): value is string {
  if (!value) {
    return false;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{4}-\d{2}$/.test(value);
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (request.method === "GET" || request.method === "HEAD") {
    return {};
  }

  let size = 0;
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += piece.length;
    if (size > MAX_BODY_BYTES) {
      throw new RequestBodyError(413, "Request body too large.");
    }

    chunks.push(piece);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return parsed as Record<string, unknown>;
  } catch {
    throw new RequestBodyError(400, "Invalid JSON payload.");
  }
}

function normalizeUrl(value: string): string {
  return value.trim().toLowerCase().replace(/\/+$/, "");
}

function handleBodyError(
  error: unknown,
  response: ServerResponse<IncomingMessage>
): void {
  if (error instanceof RequestBodyError) {
    sendJson(response, error.statusCode, { error: error.message });
    return;
  }

  throw error;
}

function readBooleanField(payload: Record<string, unknown>, key: string): boolean | null {
  const value = payload[key];
  if (typeof value !== "boolean") {
    return null;
  }

  return value;
}

function readRelevanceFeedbackField(
  payload: Record<string, unknown>,
  key: string
): RelevanceFeedback | undefined {
  const value = payload[key];
  if (value === null) {
    return null;
  }

  if (value === "up" || value === "down") {
    return value;
  }

  return undefined;
}

async function buildItemLearningText(itemId: string): Promise<string | null> {
  const normalizedId = itemId.trim();
  if (!normalizedId) {
    return null;
  }

  const snapshot = await loadFeedSnapshot();
  const feedItem = snapshot.items.find((item) => item.id === normalizedId);
  if (feedItem) {
    return `${feedItem.title} ${feedItem.summary} ${feedItem.topic} ${feedItem.region}`.trim();
  }

  const entries = await loadEntries();
  const newsEntry = entries.find((entry) => entry.id === normalizedId);
  if (!newsEntry) {
    return null;
  }

  return `${newsEntry.title} ${newsEntry.summary} ${newsEntry.riskTags.join(" ")}`.trim();
}

class RequestBodyError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}
