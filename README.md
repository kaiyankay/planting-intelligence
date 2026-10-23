# Planting Intelligence

*Exploring knowledge-driven AI for planting design.* UBC ARCH 540, Assignment 2 (mid review, October 2026).

A runnable web prototype that treats **planting intelligence** as the core capability and **negotiation between stakeholders** as the first application. Three parties describe what they want from a public planting bed in plain language. The system interprets those intentions, checks them against a small, traceable plant database and a set of sourced planting-design principles, works out which goals can be met together and which depend on conditions, and proposes distinct design strategies. A reviewer can select a strategy, give feedback in plain language, and see a revised version with every change explained and recorded.

> Research prototype. The three stakeholders are **synthetic roles**, not interview subjects. East Park (Southeast False Creek, Vancouver) is a **design-context reference only**; nothing here is a design for that park and no site data was taken from City of Vancouver documents. All site conditions are labelled synthetic assumptions or unknown.

## Run it

Requires Node 20 or newer (the build machine used Node 24, installed in `~/.local/node`).

```bash
cd planting-intelligence
npm install
npm run dev          # http://localhost:5173
```

Other commands:

```bash
npm test             # 11 engine tests (node:test, native TypeScript)
npm run typecheck    # strict TypeScript
npm run build && npm run preview
npm run screenshots  # 1920x1080 screenshots with the system Chrome (dev server must be running)
```

### Live LLM mode vs Offline Demonstration Mode

| | Live LLM mode | Offline Demonstration Mode |
|---|---|---|
| How to enable | copy `.env.example` to `.env`, set `ANTHROPIC_API_KEY` (server-side only; never sent to the browser) | default when no key is configured |
| Intention extraction | Claude, structured output (zod schema), model `claude-opus-5-5` by default | transparent keyword/pattern parser (`src/engine/interpret.ts`, every rule listed) |
| Feedback interpretation | Claude, structured output | the same rule parser |
| Narrative text | Claude, constrained to engine facts; citations to unknown ids are stripped and flagged | template sentences composed from engine facts, labelled "not AI generated" |
| Plant facts, validation, relations, strategies, revisions | **code, identical in both modes** | **code, identical in both modes** |

The interface shows which mode is running in the masthead and on every generated text block. Preset results are never presented as live model output.

**Status at hand-in:** no API key was available on the build machine, so the live path is implemented and type-checked but **has not been exercised against the API**. All screenshots and the tested demonstration are from Offline Demonstration Mode.

## What the prototype does

```
Stakeholder statements ──► Intentions (LLM or rule parser; each carries its quoted evidence,
                            strength, and how far it can be checked against plant data)
                                 │
Plant database (12 records) ────►│  Deterministic validation: light, water vs. site; colour,
Site assumptions (synthetic) ───►│  pollinator evidence, season, nativity, lifespan, hazards
                                 ▼
                     Relationship analysis per pair of goals:
                     compatible · conditional · conflict · insufficient data
                     + season coverage + open questions
                                 │
Design principles (15) ─────────►│  retrieval by intention tags
                                 ▼
                     Three strategies by design approach (not by weights):
                     A seasonal colour relay · B native framework with colour at thresholds
                     C low-input evergreen structure (shrubs only, three species, no perennial layer)
                                 │
Reviewer feedback ──► adjustments ──► revision operators ──► re-validation ──► version n+1
```

### Panel 01 · Design Intentions
Editable natural-language statements for any number of stakeholders (the three synthetic roles load by default). Synthetic site assumptions (light, irrigation, drainage) can be changed; soil, bed area and existing vegetation stay unknown on purpose.

### Panel 02 · AI Negotiation
- **Interpreted intentions** with the quoted span they came from, hard limit vs preference, and whether the goal is checkable in the database, partly checkable, or a design judgement.
- **Relationship analysis**, computed from the database: which plants satisfy both goals of a pair, in which seasons that is verified, and which plants could close a gap if their unknown fields were confirmed. When goals can be met together the system says so; it does not manufacture trade-offs.
- **Season coverage** of plants meeting every checkable goal.
- **Negotiation reasoning** (live model text or labelled template text).
- **Planting knowledge retrieved**, each item marked *sourced* or *heuristic* with its source.
- **Needs confirmation**: the site and plant unknowns that block decisions.

### Panel 03 · Design Strategies
Three strategies with different leading intentions and spatial approaches. Each card shows composition by layer, flowering by season, the outcome for every requirement (satisfied / partially / unmet / unknown with the reason), trade-offs drawn from unmet outcomes and source cautions, evidence used, and unresolved questions. Selecting a strategy opens the evidence list, the plant records with links, a feedback box, and the version history.

**Tested revision example** (offline mode, default synthetic site, strategy B *Native framework, yellow at the threshold*): the feedback *"Can we reduce watering without losing too much summer colour?"* is read as `reduce_water` + `keep_summer_colour`. The engine removes *Mahonia nervosa*, *Ribes sanguineum* and *Symphoricarpos albus* (their sources describe moist soil with only occasional dryness) and keeps *Rudbeckia* 'Goldsturm' as the one explicitly conditional plant, because it is the only yellow in summer and autumn under partial shade and its source states that it becomes more drought-tolerant once established. The change, its reasons and the remaining trade-off are stored as version 2. With the plain feedback *"Please reduce watering."* the same operator removes *Rudbeckia* too, summer and autumn lose all flowering, and the engine records that *Achillea millefolium* would pass every filter if the bed proves sunnier than assumed, so confirming the actual light is the move that could close the gap.

## Knowledge base

### Plant database: `src/knowledge/plants.verified.json`
12 records. Every field value quotes the page it came from; fields the page did not state are `"unknown"`. Sources used: NC State Extension Plant Toolbox, Oregon State University Landscape Plants, E-Flora BC, Royal Horticultural Society. Pages were fetched on 22 October 2026. `src/knowledge/normalise.ts` maps the quoted wording onto the controlled vocabulary the engine checks (light, water, seasons) with visible rules, and derives a pollinator flag by keyword from the quoted ecological text. The raw wording stays available in the interface.

Known data limits: *Digitalis grandiflora* and *Helianthus* 'Lemon Queen' have unknown flowering seasons (RHS seasonal tables are not machine readable); nativity of *Achillea millefolium* is recorded unknown because sources disagree; Great Plant Picks and Missouri Botanical Garden could not be fetched. Toxicity, local invasive status, availability, quantities and spacing are not covered.

### Design knowledge: `src/knowledge/principles.json`
15 items. 14 are **sourced principles**, each supported by a fetched page: UF/IFAS Extension (right plant right place; vertical layering; year-round colour; massing and repetition), University of Georgia Extension (spacing by mature spread), Robinson *The Planting Design Handbook* (Routledge, layered plant communities), RHS (evergreen structure), Xerces Society (pollinator diversity, overlapping bloom, native clumps), WSU Extension (hydrozoning and 1–3 years of establishment watering), Metro Vancouver (summer water restrictions, 1 May–15 October), Clemson Extension (maintenance load; zoning by maintenance intensity), Oudolf & Kingsbury *Planting: A New Perspective* with UF/IFAS (dense ground layers reduce weeding), Mississippi State Extension (warm colours advance). One item, **K-15 reconciling ornamental, ecological and maintenance goals by zoning**, is an explicit **proposed heuristic** with no source. Statements are paraphrased at the generality the fetched page supports; for example the colour principle does *not* claim that warm colours are visible from farther away, because no source for that was found.

### Status labels used throughout
| Label | Meaning |
|---|---|
| Verified plant fact | field value quoted from a fetched source page |
| Sourced principle | design principle supported by a fetched extension, society, regulator or publisher page |
| Proposed heuristic | project working hypothesis, no source |
| Rule parser / template | offline stand-ins for language understanding and narrative, labelled in the interface |
| LLM | live model output, only when a key is configured |
| Unknown | the source did not state it; the engine reports unknown rather than guessing |

## Architecture

```
planting-intelligence/
  index.html, vite.config.ts        Vite + React 18 + TypeScript; a Vite plugin serves /api/*
  server/api.ts                     /api/status, /api/interpret, /api/adjust, /api/narrate
  server/llm.ts                     Anthropic SDK calls (structured outputs via zod; server-side key)
  src/types.ts                      domain types
  src/knowledge/                    plants.verified.json, principles.json, normalise.ts, site.ts
  src/engine/interpret.ts           offline rule parser for intentions and feedback (all rules visible)
  src/engine/validate.ts            deterministic checks of plants against site and intentions
  src/engine/relations.ts           pairwise relationship analysis, season coverage, retrieval, open questions
  src/engine/strategies.ts          three strategy generators + outcome/trade-off computation
  src/engine/revise.ts              revision operators + version log
  src/engine/narrate.ts             narrative grounding (citation checking) + offline templates
  src/engine/run.ts                 orchestration; LLM/offline switching with visible notices
  src/components/                   Panel01Intentions, Panel02Negotiation, Panel03Strategies
  tests/engine.test.ts              11 tests
  scripts/screenshots.mjs           Playwright (system Chrome) screenshot script
  docs/screenshots/                 1920x1080 captures of the running prototype
```

Separation of concerns, as required by the brief: the model (or the offline parser) handles **language**; the **knowledge base** holds facts and principles with sources; the **engine** validates conditions in code and computes relations, strategies and revisions; the **narrative** layer may only cite ids that exist. Humans keep the decision: strategies are proposals, revisions produce a new version rather than replacing the old one, and nothing is marked accepted by the system.

## Implemented, simulated, not implemented

| Item | Status |
|---|---|
| Multi-stakeholder natural-language input, editable, add/remove | implemented |
| Intention extraction with evidence spans and checkability | implemented; LLM path written but not exercised live; offline parser tested |
| Deterministic validation against sourced plant fields and synthetic site | implemented, tested |
| Pairwise relationship analysis (compatible / conditional / conflict / insufficient data) | implemented, tested |
| Season coverage, open questions, principle retrieval | implemented |
| Three strategies by design approach with outcomes, trade-offs, evidence, unresolved items | implemented, tested |
| Plain-language feedback → revision operators → new version with reasons | implemented, tested (offline parser) |
| Negotiation narrative | **simulated** in offline mode (labelled template); live mode written, not exercised |
| Server-side API key handling | implemented (`.env`, never exposed to the browser) |
| Version history per strategy | implemented (in memory for the session; not persisted) |
| Quantities, spacing, planting plan, 3D or CAD output | not implemented, out of scope |
| Toxicity screening, invasive status, availability | not implemented; cautions shown only where a source states them |
| Comparison against general-purpose ChatGPT | not done; this is the research hypothesis to test next |
| User testing with practitioners | not done |

## Research integrity notes
- Plant records and principles were compiled by fetching the cited pages; nothing was filled from model memory. Where fetches failed the field is unknown and the README says so.
- The screenshots in `docs/screenshots/` are real captures of the running application in Offline Demonstration Mode.
- Stakeholder statements are the synthetic test inputs from the project brief, not East Park consultation records.
- Whether this process is more valuable than asking a general-purpose chatbot is an open hypothesis for a later comparison study, not a finding of this prototype.

## Publishing

The static build (`npm run build` → `dist/`) runs entirely in the browser in Offline Demonstration Mode, because there is no server to hold an API key. A GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) builds and deploys it to GitHub Pages on every push to `main`; enable Pages with source "GitHub Actions" in the repository settings once. Live LLM mode needs the Vite server (`npm run dev` or `npm run preview`) with `ANTHROPIC_API_KEY` in `.env`.
