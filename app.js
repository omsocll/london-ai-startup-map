const state = {
  startups: [],
  selectedId: null,
  area: "All",
  category: "All",
  investor: "All",
  quality: "All",
  conceptOnly: false,
  query: "",
  mode: "map",
  map: null,
  markers: new Map(),
  news: new Map(),
  newsLoading: new Set(),
};

const NEWS_API_AVAILABLE = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const clusterOffsets = new Map();

const els = {
  count: document.querySelector("#startupCount"),
  list: document.querySelector("#startupList"),
  detail: document.querySelector("#detailPanel"),
  areaFilters: document.querySelector("#areaFilters"),
  categoryFilters: document.querySelector("#categoryFilters"),
  investorFilters: document.querySelector("#investorFilters"),
  qualityFilters: document.querySelector("#qualityFilters"),
  conceptOnly: document.querySelector("#conceptOnly"),
  exportCsv: document.querySelector("#exportCsv"),
  search: document.querySelector("#searchInput"),
  reset: document.querySelector("#resetFilters"),
  activeAreaTitle: document.querySelector("#activeAreaTitle"),
  mapMode: document.querySelector("#mapMode"),
  listMode: document.querySelector("#listMode"),
  mapPanel: document.querySelector(".map-panel"),
};

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function unique(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function dataQuality(startup) {
  const sourceCount = (startup.source_urls || []).length;
  if (startup.location_precision === "exact" && startup.website && sourceCount >= 2) return "Strong";
  if (startup.area_confidence === "sourced" && startup.website && sourceCount >= 2) return "Strong";
  if (startup.website && sourceCount >= 1) return "Usable";
  return "Needs research";
}

function locationLabel(startup) {
  if (startup.location_label) return startup.location_label;
  if (startup.location_precision === "exact") return "Verified office/HQ";
  if (startup.location_precision === "registered_office") return "Registered office";
  if (startup.area_confidence === "sourced") return "Sourced area";
  return "Area estimate";
}

function logoUrl(startup) {
  if (startup.logo) return startup.logo;
  if (!startup.website) return null;
  try {
    const domain = new URL(startup.website).hostname.replace(/^www\./, "");
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  } catch {
    return null;
  }
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function markerCoordinates(startup) {
  if (startup.location_precision === "exact" || startup.location_precision === "registered_office") {
    return [startup.lng, startup.lat];
  }
  const key = `${startup.area}:${startup.lat}:${startup.lng}`;
  const index = clusterOffsets.get(key) || 0;
  clusterOffsets.set(key, index + 1);
  const angle = index * 2.399963;
  const radius = Math.min(0.012, 0.0025 + index * 0.0011);
  return [
    startup.lng + Math.cos(angle) * radius,
    startup.lat + Math.sin(angle) * radius * 0.72,
  ];
}

function filteredStartups() {
  const query = state.query.trim().toLowerCase();
  return state.startups.filter((startup) => {
    const areaMatch = state.area === "All" || startup.area === state.area;
    const categoryMatch = state.category === "All" || startup.categories.includes(state.category);
    const investorMatch = state.investor === "All" || startup.investors.includes(state.investor);
    const qualityMatch = state.quality === "All" || startup.quality === state.quality;
    const conceptMatch = !state.conceptOnly || startup.concept_portfolio === true;
    const queryText = [startup.name, startup.area, startup.stage, startup.summary, ...startup.categories, ...startup.investors]
      .join(" ")
      .toLowerCase();
    return areaMatch && categoryMatch && investorMatch && qualityMatch && conceptMatch && (!query || queryText.includes(query));
  });
}

function renderFilters() {
  const areas = ["All", ...unique(state.startups.map((startup) => startup.area))];
  const categories = ["All", ...unique(state.startups.flatMap((startup) => startup.categories))];
  const investors = ["All", ...unique(state.startups.flatMap((startup) => startup.investors))];
  const qualities = ["All", "Strong", "Usable", "Needs research"];

  els.areaFilters.innerHTML = areas.map((area) => (
    `<button type="button" class="${area === state.area ? "active" : ""}" data-area="${area}">${area}</button>`
  )).join("");

  els.categoryFilters.innerHTML = categories.map((category) => (
    `<button type="button" class="${category === state.category ? "active" : ""}" data-category="${category}">${category}</button>`
  )).join("");

  els.investorFilters.innerHTML = investors.map((investor) => (
    `<button type="button" class="${investor === state.investor ? "active" : ""}" data-investor="${investor}">${investor}</button>`
  )).join("");

  els.qualityFilters.innerHTML = qualities.map((quality) => (
    `<button type="button" class="${quality === state.quality ? "active" : ""}" data-quality="${quality}">${quality}</button>`
  )).join("");
}

function renderList(items) {
  els.list.innerHTML = items.map((startup) => `
    <button type="button" class="startup-card ${startup.id === state.selectedId ? "active" : ""}" data-id="${startup.id}">
      <span class="card-logo">${renderLogo(startup)}</span>
      <span class="card-copy">
        <h3>${startup.name}</h3>
        <p>${startup.summary}</p>
        <span class="meta-row">
          <span class="pill">${startup.area}</span>
          <span class="pill">${startup.stage || "Stage unknown"}</span>
          ${startup.concept_portfolio ? '<span class="pill concept-pill">Concept</span>' : ""}
          <span class="pill quality-pill quality-${slugify(startup.quality)}">${startup.quality}</span>
          ${startup.categories.slice(0, 3).map((category) => `<span class="pill">${category}</span>`).join("")}
          ${startup.investors.slice(0, 2).map((investor) => `<span class="pill investor-pill">${investor}</span>`).join("")}
        </span>
      </span>
    </button>
  `).join("");
}

function renderNews(startup) {
  if (!NEWS_API_AVAILABLE) {
    return `
      <section class="news-panel">
        <div class="news-heading"><h3>Recent funding &amp; news</h3></div>
        <p class="news-muted">Live news updates are unavailable in this public map. Use the company source links to explore further.</p>
      </section>
    `;
  }
  const news = state.news.get(startup.id);
  const loading = state.newsLoading.has(startup.id);
  if (loading) {
    return `
      <section class="news-panel">
        <div class="news-heading">
          <h3>Recent funding & news</h3>
          <button type="button" disabled>Refreshing...</button>
        </div>
        <p class="news-muted">Checking recent funding rounds, investor updates and company news.</p>
      </section>
    `;
  }
  if (!news) {
    return `
      <section class="news-panel">
        <div class="news-heading">
          <h3>Recent funding & news</h3>
          <button type="button" data-news-refresh="${startup.id}">Check latest</button>
        </div>
        <p class="news-muted">Pulls recent updates with Parallel and caches them locally for 6 hours.</p>
      </section>
    `;
  }
  if (news.error) {
    return `
      <section class="news-panel">
        <div class="news-heading">
          <h3>Recent funding & news</h3>
          <button type="button" data-news-refresh="${startup.id}">Try again</button>
        </div>
        <p class="news-error">${escapeHtml(news.error)}</p>
      </section>
    `;
  }
  const results = news.results || [];
  return `
    <section class="news-panel">
      <div class="news-heading">
        <div>
          <h3>Recent funding & news</h3>
          <p class="news-muted">Updated ${escapeHtml(news.fetched_at || "recently")}${news.cached ? " (cached)" : ""}</p>
        </div>
        <button type="button" data-news-refresh="${startup.id}">Refresh</button>
      </div>
      ${results.length ? `
        <div class="news-list">
          ${results.map((item) => `
            <article class="news-item">
              <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>
              <p>${escapeHtml(item.excerpt || "No excerpt available.")}</p>
              ${item.publish_date ? `<span>${escapeHtml(item.publish_date)}</span>` : ""}
            </article>
          `).join("")}
        </div>
      ` : '<p class="news-muted">No recent funding or company news found yet.</p>'}
    </section>
  `;
}

function renderLogo(startup) {
  const url = logoUrl(startup);
  const fallback = `<span class="logo-fallback">${initials(startup.name)}</span>`;
  if (!url) return fallback;
  return `<span class="logo-image"><img src="${url}" alt="${startup.name} logo" loading="lazy" referrerpolicy="no-referrer" /></span>`;
}

function createMarker(startup) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "logo-marker";
  el.dataset.id = startup.id;
  el.title = startup.name;
  if (startup.concept_portfolio) el.classList.add("concept-marker");
  el.dataset.quality = startup.quality;
  el.innerHTML = renderLogo(startup);
  el.addEventListener("click", (event) => {
    event.stopPropagation();
    selectStartup(startup.id, true);
  });

  return new maplibregl.Marker({
    element: el,
    anchor: "center",
    pitchAlignment: "map",
    rotationAlignment: "viewport",
  }).setLngLat(startup.mapCoordinates);
}

function syncMarkers(items) {
  const visibleIds = new Set(items.map((startup) => startup.id));

  state.markers.forEach((marker, id) => {
    if (!visibleIds.has(id)) {
      marker.remove();
      state.markers.delete(id);
    }
  });

  items.forEach((startup) => {
    let marker = state.markers.get(startup.id);
    if (!marker) {
      marker = createMarker(startup).addTo(state.map);
      state.markers.set(startup.id, marker);
    }
    marker.getElement().classList.toggle("active", startup.id === state.selectedId);
  });
}

function fitToItems(items) {
  if (!state.map || !items.length) return;
  const bounds = new maplibregl.LngLatBounds();
  items.forEach((startup) => bounds.extend(startup.mapCoordinates));
  state.map.fitBounds(bounds, {
    padding: { top: 90, bottom: 90, left: 90, right: 90 },
    maxZoom: items.length === 1 ? 15.2 : 12.6,
    pitch: 58,
    bearing: -18,
    duration: 650,
  });
}

function renderDetail() {
  const startup = state.startups.find((item) => item.id === state.selectedId);
  if (!startup) {
    els.detail.innerHTML = `
      <p class="eyebrow">Select a startup</p>
      <h2>Click a logo marker or list item</h2>
      <p>The map is draggable, zoomable, and pitched over London. Cards show summary, stage, location precision, website, and sources.</p>
    `;
    return;
  }

  els.detail.innerHTML = `
    <div class="detail-heading">
      <span class="detail-logo">${renderLogo(startup)}</span>
      <span>
        <p class="eyebrow">${startup.area}${startup.concept_portfolio ? " · Concept Ventures portfolio" : ""}</p>
        <h2>${startup.name}</h2>
      </span>
    </div>
    <p>${startup.summary}</p>
    <div class="detail-grid">
      <div class="detail-cell"><strong>Stage</strong><span>${startup.stage || "Unknown"}</span></div>
      <div class="detail-cell"><strong>Categories</strong><span>${startup.categories.join(", ")}</span></div>
      <div class="detail-cell"><strong>Location</strong><span>${escapeHtml(locationLabel(startup))}</span></div>
      <div class="detail-cell"><strong>Data Quality</strong><span>${startup.quality}</span></div>
      <div class="detail-cell"><strong>Source Count</strong><span>${(startup.source_urls || []).length}</span></div>
      <div class="detail-cell"><strong>Map Precision</strong><span>${escapeHtml(startup.location_precision || "area")}</span></div>
      <div class="detail-cell"><strong>Concept Portfolio</strong><span>${startup.concept_portfolio ? "Yes" : "No"}</span></div>
      <div class="detail-cell"><strong>Investors</strong><span>${startup.investors.length ? startup.investors.join(", ") : "Unknown"}</span></div>
      <div class="detail-cell"><strong>Website</strong><span>${startup.website ? `<a href="${startup.website}" target="_blank" rel="noreferrer">Open</a>` : "Unknown"}</span></div>
    </div>
    ${startup.location_note ? `<p class="location-note">${escapeHtml(startup.location_note)}</p>` : ""}
    <div class="source-links">
      ${(startup.source_urls || []).slice(0, 4).map((url, index) => `<a href="${url}" target="_blank" rel="noreferrer">Source ${index + 1}</a>`).join("")}
    </div>
    ${renderNews(startup)}
  `;
}

function render({ fit = false } = {}) {
  const items = filteredStartups();
  els.count.textContent = items.length;
  els.activeAreaTitle.textContent = state.area === "All" ? "All London" : state.area;
  els.mapPanel.classList.toggle("list-only", state.mode === "list");
  els.mapMode.classList.toggle("active", state.mode === "map");
  els.listMode.classList.toggle("active", state.mode === "list");
  renderFilters();
  renderList(items);
  renderDetail();
  if (state.map) {
    syncMarkers(items);
    if (fit) fitToItems(items);
  }
}

function selectStartup(id, fly = false) {
  state.selectedId = id;
  render();
  const startup = state.startups.find((item) => item.id === id);
  if (NEWS_API_AVAILABLE && startup && !state.news.has(startup.id) && !state.newsLoading.has(startup.id)) {
    loadStartupNews(startup, false);
  }
  if (startup && fly && state.map) {
    state.map.flyTo({
      center: startup.mapCoordinates,
      zoom: 15,
      pitch: 62,
      bearing: -22,
      duration: 800,
    });
  }
}

function loadStartupNews(startup, refresh = false) {
  state.newsLoading.add(startup.id);
  if (refresh) state.news.delete(startup.id);
  render();
  const params = new URLSearchParams({
    name: startup.name,
    website: startup.website || "",
  });
  if (refresh) params.set("refresh", "1");

  fetch(`/api/startup-news?${params.toString()}`)
    .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
    .then(({ ok, data }) => {
      state.newsLoading.delete(startup.id);
      state.news.set(startup.id, ok ? data : { error: data.error || "Could not load startup news." });
      render();
    })
    .catch((error) => {
      state.newsLoading.delete(startup.id);
      state.news.set(startup.id, { error: error.message });
      render();
    });
}

function initMap() {
  state.map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [-0.105, 51.515],
    zoom: 11.4,
    pitch: 58,
    bearing: -18,
    maxPitch: 75,
    attributionControl: true,
  });

  state.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  state.map.addControl(new maplibregl.FullscreenControl(), "top-right");

  state.map.on("load", () => {
    const layers = state.map.getStyle().layers || [];
    const firstLabel = layers.find((layer) => layer.type === "symbol" && layer.layout && layer.layout["text-field"]);
    const buildingLayer = layers.find((layer) => layer["source-layer"] === "building" || layer.id.includes("building"));

    if (buildingLayer && !state.map.getLayer("london-3d-buildings")) {
      state.map.addLayer({
        id: "london-3d-buildings",
        source: buildingLayer.source,
        "source-layer": buildingLayer["source-layer"],
        filter: ["==", ["geometry-type"], "Polygon"],
        type: "fill-extrusion",
        minzoom: 10,
        paint: {
          "fill-extrusion-color": "#d8d1c5",
          "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 10, 8, 15, 48],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.58,
        },
      }, firstLabel?.id);
    }

    render({ fit: true });
    state.map.flyTo({
      center: [-0.105, 51.515],
      zoom: 12.25,
      pitch: 62,
      bearing: -22,
      duration: 500,
    });
  });
}

document.addEventListener("click", (event) => {
  const areaButton = event.target.closest("[data-area]");
  const categoryButton = event.target.closest("[data-category]");
  const investorButton = event.target.closest("[data-investor]");
  const qualityButton = event.target.closest("[data-quality]");
  const newsButton = event.target.closest("[data-news-refresh]");
  const startupButton = event.target.closest("[data-id]");

  if (areaButton) {
    state.area = areaButton.dataset.area;
    render({ fit: true });
    return;
  }
  if (categoryButton) {
    state.category = categoryButton.dataset.category;
    render({ fit: true });
    return;
  }
  if (investorButton) {
    state.investor = investorButton.dataset.investor;
    render({ fit: true });
    return;
  }
  if (qualityButton) {
    state.quality = qualityButton.dataset.quality;
    render({ fit: true });
    return;
  }
  if (newsButton) {
    const startup = state.startups.find((item) => item.id === newsButton.dataset.newsRefresh);
    if (startup) loadStartupNews(startup, true);
    return;
  }
  if (startupButton) {
    selectStartup(startupButton.dataset.id, true);
  }
});

els.search.addEventListener("input", (event) => {
  state.query = event.target.value;
  render({ fit: true });
});

els.reset.addEventListener("click", () => {
  state.area = "All";
  state.category = "All";
  state.investor = "All";
  state.quality = "All";
  state.conceptOnly = false;
  state.query = "";
  state.selectedId = state.startups[0]?.id || null;
  els.search.value = "";
  els.conceptOnly.checked = false;
  render({ fit: true });
});

function csvValue(value) {
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function exportFilteredCsv() {
  const headers = [
    "name",
    "website",
    "summary",
    "stage",
    "categories",
    "area",
    "area_confidence",
    "location_precision",
    "location_label",
    "location_note",
    "lat",
    "lng",
    "data_quality",
    "source_count",
    "concept_portfolio",
    "investors",
  ];
  const rows = filteredStartups().map((startup) => [
    startup.name,
    startup.website,
    startup.summary,
    startup.stage,
    startup.categories,
    startup.area,
    startup.area_confidence,
    startup.location_precision,
    startup.location_label,
    startup.location_note,
    startup.lat,
    startup.lng,
    startup.quality,
    (startup.source_urls || []).length,
    startup.concept_portfolio ? "yes" : "no",
    startup.investors,
  ].map(csvValue).join(","));
  const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "london-startup-map-filtered.csv";
  link.click();
  URL.revokeObjectURL(url);
}

els.exportCsv.addEventListener("click", exportFilteredCsv);

els.conceptOnly.addEventListener("change", (event) => {
  state.conceptOnly = event.target.checked;
  render({ fit: true });
});

els.mapMode.addEventListener("click", () => {
  state.mode = "map";
  render();
  requestAnimationFrame(() => state.map?.resize());
});

els.listMode.addEventListener("click", () => {
  state.mode = "list";
  render();
});

Promise.all([
  fetch("data/startups.json").then((response) => response.json()),
  fetch("data/investor-overlays.json").then((response) => response.json()).catch(() => ({ overlays: {} })),
])
  .then(([data, investorData]) => {
    clusterOffsets.clear();
    state.startups = data.startups.map((startup) => ({
      ...startup,
      id: slugify(startup.name),
      categories: startup.categories && startup.categories.length ? startup.categories : ["AI"],
      investors: investorData.overlays[startup.name] || [],
      quality: dataQuality(startup),
    }));
    state.startups.forEach((startup) => {
      startup.mapCoordinates = markerCoordinates(startup);
    });
    state.selectedId = state.startups[0]?.id || null;
    initMap();
    render();
  })
  .catch((error) => {
    els.detail.innerHTML = `<h2>Could not load startup data</h2><p>${error.message}</p>`;
  });
