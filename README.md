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

Open the local address printed by the server (default http://localhost:8123).

### Server safety defaults

- Binds to `127.0.0.1` only. Set `HOST=0.0.0.0` only if you really want it reachable on your network.
- Only serves the app files (`index.html`, `styles.css`, `app.js`, `data/startups.json`, `data/investor-overlays.json`); `.env`, `server.py`, notes and the cache are never served.
- The news endpoint only looks up companies that are in `data/startups.json`, results are cached for 6 hours, `refresh=1` can't bypass a cache younger than 15 minutes, and uncached Parallel searches are capped at 30 per hour (`NEWS_MAX_SEARCHES_PER_HOUR`) so it can't burn your API credits.
- Your `PARALLEL_API_KEY` stays in `.env` on the server and is never sent to the browser.

## Files

- `index.html`, `styles.css`, `app.js` — the browser application
- `data/startups.json` — startup records
- `data/investor-overlays.json` — investor map overlays
- `server.py` — static file server plus the news endpoint

The map data is research content. Review its sources and freshness before relying on it.
