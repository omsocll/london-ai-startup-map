# London AI Startup Map

An interactive map and directory of 60 London AI startups. Filter by area, category and investor, open company details with sources, and export the filtered view as CSV.

**Live:** https://london-ai-startup-map.honest-bream-6443.chatgpt.site

## Highlights

- **Data provenance:** each company has location precision, area confidence and a derived data-quality label (Strong / Usable / Needs research). See `research-notes.md` and `location-verification-2026-05-05.md`. Data captured May 2026.
- **Investor overlays:** filter by investors such as Concept Ventures, Seedcamp, Entrepreneur First, LocalGlobe and Octopus Ventures.
- **Live news lookup:** `server.py` exposes `/api/startup-news`, which calls the Parallel Search API server-side (so the key never reaches the browser) and caches results for 6 hours. The static live site doesn't run this server, so news lookup only works locally.

## Tech stack

Vanilla JavaScript with MapLibre GL JS, JSON data files, and a small Python standard-library server.

## Run locally

```sh
cp .env.example .env   # then add your own PARALLEL_API_KEY (optional, only needed for news lookup)
python3 server.py
```

Open the local address printed by the server (default port 8123).

## Files

- `index.html`, `styles.css`, `app.js` — the browser application
- `data/startups.json` — startup records
- `data/investor-overlays.json` — investor map overlays
- `server.py` — static file server plus the news endpoint

The map data is research content. Review its sources and freshness before relying on it.
