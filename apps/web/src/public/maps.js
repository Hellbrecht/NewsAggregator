const RIVER_RUNNER_API = "https://merit.internetofwater.app/processes/river-runner/execution";

const state = {
  map: null,
  stationLayer: null,
  riverLayer: null,
  clickMarker: null,
  stations: [],
  tracing: false,
  mode: "trace", // "browse" | "trace"
};

function setStatus(msg, isError = false) {
  const el = document.getElementById("maps-status");
  el.textContent = msg;
  el.classList.toggle("error", isError);
}

function setSidebarTracing(lat, lng) {
  document.getElementById("maps-detail").innerHTML = `
    <p class="maps-detail-label">Tracing from clicked point</p>
    <dl class="maps-detail-dl">
      <dt>Lat</dt><dd>${lat.toFixed(4)}</dd>
      <dt>Lng</dt><dd>${lng.toFixed(4)}</dd>
    </dl>
    <p class="maps-detail-muted" id="maps-river-note">Following water downstream...</p>`;
}

function setSidebarResult(lat, lng, featureCount) {
  const note = document.getElementById("maps-river-note");
  if (note) {
    note.textContent = featureCount > 0
      ? `${featureCount} river segment${featureCount !== 1 ? "s" : ""} traced to terminal point.`
      : "River path traced.";
  }
}

function setSidebarError(lat, lng) {
  document.getElementById("maps-detail").innerHTML = `
    <p class="maps-detail-label">No river found here</p>
    <p class="maps-detail-muted">This point may be outside the MERIT hydrographic network (ocean, dry land, or polar region). Try clicking on a river or watershed area.</p>`;
}

function setSidebarStation(item) {
  const valueStr = item.value !== null ? `${item.value} ${item.unit ?? ""}` : "No reading";
  const observedStr = item.observedAt ? new Date(item.observedAt).toLocaleString() : "—";
  document.getElementById("maps-detail").innerHTML = `
    <p class="maps-detail-label">${item.location}</p>
    <dl class="maps-detail-dl">
      <dt>Metric</dt><dd>${item.metric ?? "—"}</dd>
      <dt>Value</dt><dd>${valueStr}</dd>
      <dt>Observed</dt><dd>${observedStr}</dd>
    </dl>
    <p class="maps-detail-muted" id="maps-river-note">Following water downstream...</p>`;
}

const SVG_HAND = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3L19 12L12 13.5L9 21Z"/></svg>`;
const SVG_DROP = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6 10 4 14 4 16a8 8 0 0 0 16 0c0-2-2-6-8-14z"/></svg>`;


function setMode(mode) {
  state.mode = mode;
  const container = state.map.getContainer();
  container.style.cursor = mode === "trace" ? "url('/crosshair.svg') 16 16, crosshair" : "";
  document.getElementById("map-btn-browse").classList.toggle("maps-mode-active", mode === "browse");
  document.getElementById("map-btn-trace").classList.toggle("maps-mode-active", mode === "trace");
}

function initModeControl() {
  const ModeControl = L.Control.extend({
    options: { position: "topleft" },
    onAdd() {
      const container = L.DomUtil.create("div", "leaflet-bar maps-mode-control");
      L.DomEvent.disableClickPropagation(container);

      const browseBtn = L.DomUtil.create("a", "maps-mode-btn", container);
      browseBtn.id = "map-btn-browse";
      browseBtn.title = "Browse mode — pan and inspect";
      browseBtn.innerHTML = SVG_HAND;
      browseBtn.href = "#";
      L.DomEvent.on(browseBtn, "click", (e) => { L.DomEvent.preventDefault(e); setMode("browse"); });

      const traceBtn = L.DomUtil.create("a", "maps-mode-btn maps-mode-active", container);
      traceBtn.id = "map-btn-trace";
      traceBtn.title = "Trace mode — click map to trace river path";
      traceBtn.innerHTML = SVG_DROP;
      traceBtn.href = "#";
      L.DomEvent.on(traceBtn, "click", (e) => { L.DomEvent.preventDefault(e); setMode("trace"); });

      return container;
    },
  });
  new ModeControl().addTo(state.map);
}

function initMap() {
  state.map = L.map("map", { zoomControl: true }).setView([45, -95], 4);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18,
  }).addTo(state.map);

  state.stationLayer = L.layerGroup().addTo(state.map);
  state.riverLayer = L.layerGroup().addTo(state.map);

  state.map.on("click", (e) => {
    if (state.mode !== "trace" || state.tracing) return;
    traceFromLatLng(e.latlng.lat, e.latlng.lng);
  });

  initModeControl();
}

function placeClickMarker(lat, lng) {
  if (state.clickMarker) state.clickMarker.remove();
  state.clickMarker = L.circleMarker([lat, lng], {
    radius: 6,
    fillColor: "#f59e0b",
    color: "#fff",
    weight: 2,
    fillOpacity: 1,
  }).addTo(state.map);
}

function animateRiverPath(features, onDone) {
  state.riverLayer.clearLayers();

  const total = features.length;
  let i = 0;

  // Fit bounds to full path before animation starts
  const allCoords = features.flatMap(f => f.geometry.coordinates.map(c => [c[1], c[0]]));
  if (allCoords.length) {
    state.map.fitBounds(L.latLngBounds(allCoords), { padding: [60, 60], maxZoom: 10, animate: false });
  }

  // Batch size scales with feature count so animation finishes in ~3s
  const batchSize = Math.max(1, Math.ceil(total / 80));
  const delay = 30;

  function drawNext() {
    const end = Math.min(i + batchSize, total);
    while (i < end) {
      const feature = features[i];
      const coords = feature.geometry.coordinates.map(c => [c[1], c[0]]);
      L.polyline(coords, { color: "#0ea5e9", weight: 2.5, opacity: 0.85 }).addTo(state.riverLayer);
      i++;
    }
    if (i < total) {
      setStatus(`Tracing… ${Math.round((i / total) * 100)}%`);
      setTimeout(drawNext, delay);
    } else {
      onDone(total);
    }
  }

  drawNext();
}

async function traceFromLatLng(lat, lng, sidebarFn) {
  if (state.tracing) return;
  state.tracing = true;

  state.riverLayer.clearLayers();
  placeClickMarker(lat, lng);

  if (sidebarFn) {
    sidebarFn();
  } else {
    setSidebarTracing(lat, lng);
  }

  setStatus("Fetching river data...");

  try {
    const res = await fetch(
      `${RIVER_RUNNER_API}?lat=${lat}&lng=${lng}`,
      { headers: { Accept: "application/json" } }
    );

    if (!res.ok) throw new Error(`API ${res.status}`);

    const data = await res.json();
    const geojson = data.value ?? data;

    if (!geojson || !geojson.features) throw new Error("No features in response");

    animateRiverPath(geojson.features, (count) => {
      setSidebarResult(lat, lng, count);
      setStatus("River path traced.");
      state.tracing = false;
    });
  } catch (err) {
    setSidebarError(lat, lng);
    setStatus("Could not trace river path.", true);
    console.warn("River Runner error:", err);
    state.tracing = false;
  }
}

function renderStations(stations) {
  state.stationLayer.clearLayers();

  stations.forEach((item) => {
    if (item.latitude === null || item.longitude === null) return;

    const color = (item.value !== null && item.value !== undefined) ? "#075985" : "#8a9bb0";

    const marker = L.circleMarker([item.latitude, item.longitude], {
      radius: 7,
      fillColor: color,
      color: "#fff",
      weight: 1.5,
      opacity: 1,
      fillOpacity: 0.85,
    });

    marker.bindTooltip(
      `<strong>${item.location}</strong><br>${item.metric ?? "—"}: ${item.value !== null ? item.value + " " + (item.unit ?? "") : "no reading"}`,
      { direction: "top", offset: [0, -6] }
    );

    marker.on("click", (e) => {
      L.DomEvent.stopPropagation(e);
      traceFromLatLng(item.latitude, item.longitude, () => setSidebarStation(item));
    });

    state.stationLayer.addLayer(marker);
  });
}

async function loadStations() {
  setStatus("Loading stations...");

  try {
    const res = await fetch("/api/hydrology/realtime");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const withCoords = (data.providers ?? []).flatMap((p) =>
      (p.items ?? []).filter((i) => i.latitude !== null && i.longitude !== null)
    );

    state.stations = withCoords;
    renderStations(withCoords);

    const count = withCoords.length;
    setStatus(`${count} station${count !== 1 ? "s" : ""} loaded. Click anywhere on the map to trace a river.`);
  } catch (err) {
    setStatus("Failed to load stations.", true);
    console.error("loadStations error:", err);
  }
}

document.getElementById("maps-refresh-btn").addEventListener("click", loadStations);

document.getElementById("layer-stations").addEventListener("change", (e) => {
  if (e.target.checked) state.map.addLayer(state.stationLayer);
  else state.map.removeLayer(state.stationLayer);
});

document.getElementById("layer-riverpaths").addEventListener("change", (e) => {
  if (e.target.checked) state.map.addLayer(state.riverLayer);
  else state.map.removeLayer(state.riverLayer);
});

initMap();
loadStations();
