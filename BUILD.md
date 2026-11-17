# Build notes

This site is a generated build. Sources, data and the build script live in [kaiyankay/planting-db](https://github.com/kaiyankay/planting-db) (`tools/build_platform.py`); copied here 2026-11-17 from planting-db `platform-v4-3-preview/`.

- built from `feature/platform-v4-3-visual-intelligence @ 698ebaa · built 2026-11-17 · knowledge 2026-11-13` by `tools/build_platform.py`
- one knowledge snapshot for every module: `data/explorer.json` (generated 2026-11-13, schema 0.4.3, 10 species, 501 claims), with `data/graph.json`, `data/diagnosis.json` and the canonical files in `data/db/` from the same pipeline run
- `/` Garden Studio · `/plants/` Plant Library · `/knowledge/` Explorer (table · matrix · network) · `/knowledge/trace/` Decision Trace · `/knowledge/neural/` 3D network · `/about/` Project · `/about/how-it-works/` · `/about/method/` · `/about/contribute/` (the V1–V3 addresses `/explore/`, `/knowledge/research/`, `/knowledge/method/`, `/contribute/`, `/how-it-works/` redirect)
- the overview's reference case is `data/designs/demo-a.json`, a project the Studio saved; the page re-checks it with the engine against this snapshot
- illustrations: `platform/art/`, listed in `platform/data/artwork.json` — AI-generated editorial artwork, not evidence; names are set in HTML from the snapshot
- photographs: `platform/img/`, credited in `platform/data/images.json` (Wikimedia Commons, CC BY / CC BY-SA / CC0)
- the survey is a separate application and is only linked
- `/design/` and `/studio-preview/` are not touched by this folder; the preview saves its project under its own browser-storage key

Do not edit files here by hand: change the sources on the development branch and rebuild.
