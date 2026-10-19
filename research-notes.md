# London AI Startup Map Research Notes

Captured: 2026-05-05

Primary structural reference: https://www.startupmap.london/

Startup Map London provides a public list/detail structure with company name, stage, categories, website, summaries, similar startups, category filters, stage filters, top-startup list, and list/map toggle. The checked pages did not expose exact office coordinates in the rendered text.

The map dataset therefore uses broad London area clusters, not office addresses. `area_confidence` should be read carefully:

- `sourced`: direct address or strong location signal found.
- `inferred`: London-level company location found, but neighborhood assigned as a useful map cluster pending stronger address research.

Parallel research run:

- Run ID: `trun_bd0af11b1edc45d1a429feb80b35d439`
- Processor: `pro-fast`
- Completed: 2026-05-05

Expansion pass:

- Dataset expanded from 20 to 60 startups on 2026-05-05.
- 50 of 60 entries include a website, so most map markers can render a brand favicon/logo.
- Added `concept_portfolio` boolean to the map dataset.
- Concept Ventures crossovers currently flagged in the map: ElevenLabs, Treefera, Anam, Arondite, Dex, Gendo, Sohar Health, Superlinked, V-Sim, and Waypoint.
- A second Parallel run for a 60-company structured Startup Map dataset (`trun_286d713d333d4336b00823f138a973d6`) returned useful citations but an empty structured payload, so the final expansion was merged deterministically from Startup Map-visible names, official sites, and the saved Concept Ventures portfolio CSV.

Product upgrades added after expansion:

- Investor overlay data lives in `data/investor-overlays.json`.
- The map now supports investor filtering, including Concept Ventures, Seedcamp, Entrepreneur First, Octopus Ventures, LocalGlobe, Lakestar, Madrona, and others where known.
- The map derives a visible data-quality label per startup: `Strong`, `Usable`, or `Needs research`.
- The sidebar can export the currently filtered view as CSV for external analysis.
- Investor overlays are partial. Missing investors mean unknown in this local dataset, not that the startup has no investors.

Live news feature:

- Added `server.py`, a local static server plus `/api/startup-news` endpoint.
- Startup detail panels can now fetch recent funding/news/product updates on click via Parallel Search.
- Results are cached in `data/news-cache/` for 6 hours to avoid repeatedly paying for the same lookup.
- The browser never sees `PARALLEL_API_KEY`; the key stays server-side in the workspace `.env`.
- The old static `python3 -m http.server` should be replaced with `python3 server.py` from `Startups and Venture/london-ai-map`.

Useful source URLs surfaced during research:

- https://www.startupmap.london/companies/fyxer-ai
- https://www.startupmap.london/companies/morta
- https://www.startupmap.london/companies/metris
- https://www.startupmap.london/companies/arda-biomaterials
- https://www.startupmap.london/companies/recurse-ml
- https://www.startupmap.london/companies/asteroid-ai
- https://www.startupmap.london/companies/wilsonai
- https://www.startupmap.london/companies/helmguard-ai
- https://www.startupmap.london/companies/neurosonic
- https://www.startupmap.london/companies/borderless
- https://www.fyxer.com/for-ai-assistants
- https://www.crunchbase.com/organization/fyxer
- https://www.compasslabs.ai/
- https://www.eu-startups.com/2024/01/london-based-metris-energy-bags-e2-3-million-pre-seed-to-power-up-the-uks-solar-economy/
- https://arda.bio/
- https://seedcamp.com/views/recurse-ml-raises-2-5m-to-build-machine-learning-models-for-large-codebase-maintenance/
- https://www.synthera.ai/
- https://www.geniefertility.com/
- https://helmguard.ai/
- https://www.assuric.com/
- https://tonk.xyz/
- https://www.phycobloom.com/
- https://graphica.bio/
- https://www.morta.io/
