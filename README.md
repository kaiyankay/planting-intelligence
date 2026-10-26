# Planting Intelligence

*Exploring knowledge-driven AI for planting design.* UBC ARCH 540, Assignment 2 (mid review, October 2026).

A runnable web prototype that treats **planting intelligence** as the core capability and **negotiation between stakeholders** as the first application. Three parties describe what they want from a public planting bed in plain language. The system interprets those intentions, checks them against a small, traceable plant database and a set of sourced planting-design principles, works out which goals can be met together and which depend on conditions, and proposes distinct design strategies. A reviewer can select a strategy, give feedback in plain language, and see a revised version with every change explained and recorded.

> Research prototype. The three stakeholders are **synthetic roles**, not interview subjects. East Park (Southeast False Creek, Vancouver) is a **design-context reference only**; nothing here is a design for that park and no site data was taken from City of Vancouver documents. All site conditions are labelled synthetic assumptions or unknown.

## Mid-review video

**[Watch the mid-review presentation](https://kaiyankay.github.io/planting-intelligence/video.html)** (9 min 35 s, English captions, 11 chapters), narrated by the author. The MP4 and an `.srt` caption file are attached to the [`mid-review-video` release](https://github.com/kaiyankay/planting-intelligence/releases/tag/mid-review-video) rather than committed, so cloning the repository stays light.

Chapter 09 shows this prototype in Offline Demonstration Mode, edited from captures of the website and timed to the narration; it is not one continuous live recording.

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
Stakeholder statements ──► Intentions (model or rule parser; each carries its quoted evidence,
                            strength, and how far it can be checked against plant data)
                                 │
Plant database (12 records) ────►│  Deterministic validation: light, water vs. site; colour,
Site assumptions (synthetic) ───►│  pollinator evidence, season, nativity, lifespan, hazards
                                 ▼
                     Pairwise relations (compatible · conditional · conflict · insufficient data)
                     + season coverage + open questions
                                 │
                                 ▼
                     Negotiation summary: common ground · potential trade-offs · needs confirmation
                     (sentences assembled from the computed results, grouped and de-duplicated)
                                 │
Design principles (15) ─────────►│  principle-gated design moves (applied only when the
                                 ▼  principle's conditions hold for the live intentions)
                     Three strategies by design approach:
                     A seasonal relay of the lead quality · B native framework with the
                     lead quality concentrated at thresholds · C low-input shrub structure
                                 │
Reviewer feedback ──► adjustments ──► revision operators ──► re-validation ──► version n+1
                     (or an explicit "could not interpret" notice, with no new version)
```

### One working view
The interface is one screen: **Design intentions** (left) → **AI negotiation** summary (centre, the visual focus) → **Design strategies** (three short cards) → **Feedback** on the selected strategy. Everything else (how statements were read, every goal pair, season coverage, knowledge references, full requirement outcomes, plant records, earlier versions) is available on demand under *Details and evidence* or *Show full details*.

### Negotiation summary
Three columns answer the designer's first questions. *Common ground*: goal pairs verified together by site-fit plants, with the season in which that holds. *Potential trade-offs*: seasons in which the goals depend on plants with unknown or conditional fields, conflicts, and knowledge-base limits ("no record provides blue flowers"). *Needs confirmation*: site unknowns, design judgements the system cannot verify, and plant fields the sources do not state. If a pair can be met together the summary says so; unknown values are reported as unknown, never as failures.

### Strategies
Each card shows a conceptual layer diagram (labelled conceptual: no dimensions, no counts), the strategy name, a one-sentence approach, the key plants, which goals it meets and its main trade-off. The three approaches are pre-authored design moves; the plants inside them, the outcomes and the trade-offs are computed. Several moves are **gated by a principle**: the evergreen-framework rule (K-06) applies only when winter or year-round interest is wanted; the warm-colour-at-the-threshold rule (K-13) applies only to warm colours and is explicitly withheld for white or cool colours; the maintenance-load exclusions (K-11) and the establishment-watering condition (K-08) apply only when those goals are present. A strategy lists exactly the principles that changed a decision in it, each with the decision in plain words.

### Feedback
Plain-language feedback is read into revision operators, applied to the selected strategy, and re-validated. The result pane shows *What changed* (removed and added plants with reasons), *Why it changed*, and *What trade-off remains*. Feedback that maps to no operator produces a clear notice and no new version. Earlier versions stay available.

**Tested revision example** (offline mode, default synthetic site, strategy B): *"Can we reduce watering without losing too much summer colour?"* removes *Mahonia nervosa*, *Ribes sanguineum* and *Symphoricarpos albus* (moist-preferring per source) and keeps *Rudbeckia* 'Goldsturm' as the one explicitly conditional plant, because it is the only yellow in summer and autumn under partial shade and its source states it becomes more drought-tolerant once established. With plain *"Please reduce watering."* the Rudbeckia goes too, and the engine records that *Achillea millefolium* would pass every filter if the bed proves sunnier than assumed.

### Does the negotiation respond to different inputs?
Checked by running the engine on alternative statements (see `tests/engine.test.ts`): *white flowers + hummingbirds + no staking* yields white-flowering natives, a literal hummingbird check against the source text, and a different strategy set; *blue flowers + native only + no irrigation* yields a knowledge-base limit ("no record provides blue flowers"), strategy A is dropped, and the remaining strategies no longer promise a colour accent; *winter interest + habitat + no toxic plants* yields an evergreen-led relay. The approaches are fixed; their content, outcomes and naming are not.

## Visual design notes

The interface is meant to read as a contemporary landscape-design workspace rather than an analytics dashboard: warm off-white paper, forest green, a restrained ochre for conditions and slate for unknowns, serif for statements and headings, Inter for interface text, and a monospace face only for record ids.

Decisions and where they came from:
- **Conceptual composition diagrams** (`src/components/ConceptDiagram.tsx`) use three drawing languages so the strategies differ at a glance: a left-to-right season relay of flower-coloured drifts in front of a continuous evergreen band (A); a body of overlapping native masses with the colour accent gathered as a cluster of dots at the threshold (B); few large, evenly spaced single-species groups, evergreen solid and deciduous dashed (C). The abstraction level follows concept-stage landscape sketches rather than planting plans: no boundary, no dimensions, no counts, and every drawing is labelled "Conceptual composition · Not to scale". Shapes, colours and labels are generated from the strategy's layers and the records' flower colour, flowering season and evergreen fields, and the diagram redraws when a revision changes the plants.
- **Plant palette** rows (thumbnail, common name, scientific name) borrow AsterSketch's plant-palette organisation: a compact, consistent block of representative species per scheme rather than a long list. Photographs are licensed Wikimedia Commons images (see `docs/IMAGE-CREDITS.md`); a species without a licensed photo gets a labelled illustration mark, never a stand-in photo.
- **Seasonal interest matrix** adapts the Plant Matrix idea of reading seasonality as a grid: rows are plants, columns are the four seasons, a coloured dot marks a flowering season the source records, a square marks evergreen foliage (structure, not flowers), and "?" marks a value the source does not state; a small legend under each matrix states this. Nothing is interpolated into months.
- **Card structure** follows Milanote-style visual cards and shadcn/ui's restraint: identical section order on every card (diagram, name, approach, palette, matrix, main benefit, main trade-off), subtle borders, one radius, no shadows or gradients.
- **Negotiation summary** keeps one quiet icon per class (check, triangle, question mark; a cross for knowledge-base limits), two points per column by default, and record ids in small monospace below each sentence so evidence is present but not competing with the conclusion.
- **Before / after comparison** in the feedback pane shows the previous and revised diagrams and matrices side by side, with removed plants struck through and added plants emphasised, all drawn from the stored revision snapshot.

Chart libraries were not needed; the diagrams and matrix are plain SVG and CSS.

## Knowledge base

### Plant database: `src/knowledge/plants.verified.json`
12 records. Every field value quotes the page it came from; fields the page did not state are `"unknown"`. Sources used: NC State Extension Plant Toolbox, Oregon State University Landscape Plants, E-Flora BC, Royal Horticultural Society. Pages were fetched on 22 October 2026. `src/knowledge/normalise.ts` maps the quoted wording onto the controlled vocabulary the engine checks (light, water, seasons) with visible rules, and derives a pollinator flag by keyword from the quoted ecological text. The raw wording stays available in the interface.

Known data limits: *Digitalis grandiflora* and *Helianthus* 'Lemon Queen' have unknown flowering seasons (RHS seasonal tables are not machine readable); nativity of *Achillea millefolium* is recorded unknown because sources disagree; Great Plant Picks and Missouri Botanical Garden could not be fetched. Toxicity, local invasive status, availability, quantities and spacing are not covered.

### Design knowledge: `src/knowledge/principles.json`
15 items. 14 are **sourced principles**, each supported by a fetched page: UF/IFAS Extension (right plant right place; vertical layering; year-round colour; massing and repetition), University of Georgia Extension (spacing by mature spread), Robinson *The Planting Design Handbook* (Routledge, layered plant communities), RHS (evergreen structure), Xerces Society (pollinator diversity, overlapping bloom, native clumps), WSU Extension (hydrozoning and 1–3 years of establishment watering), Metro Vancouver (summer water restrictions, 1 May–15 October), Clemson Extension (maintenance load; zoning by maintenance intensity), Oudolf & Kingsbury *Planting: A New Perspective* with UF/IFAS (dense ground layers reduce weeding), Mississippi State Extension (warm colours advance). One item, **K-15 reconciling ornamental, ecological and maintenance goals by zoning**, is an explicit **proposed heuristic** with no source. Statements are paraphrased at the generality the fetched page supports; for example the colour principle does *not* claim that warm colours are visible from farther away, because no source for that was found.

### Plant photographs
Palette thumbnails are photographs from Wikimedia Commons under CC0, public-domain, CC BY or CC BY-SA licences, one per record, chosen because the file's description or categories name the species (cultivar photos were found for *Solidago rugosa* 'Fireworks' and *Rudbeckia* 'Goldsturm'). Metadata (file, author, licence, licence URL) is kept in `src/knowledge/plant-images.json`, read by the interface for alt text and tooltips, and listed in [docs/IMAGE-CREDITS.md](docs/IMAGE-CREDITS.md); `scripts/fetch-plant-images.mjs` downloads the 500 px renditions into `public/plants/` and regenerates the credits file. No AI-generated or substitute-species images are used; a record without a licensed photo would show a labelled illustration mark.

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
| Intention extraction with evidence spans and checkability | implemented; live model path written but not exercised; offline rule parser tested |
| Deterministic validation against sourced plant fields and synthetic site | implemented, tested |
| Pairwise relationship analysis and negotiation summary | implemented, tested; sentences assembled from results, not pre-written |
| Season coverage, open questions, principle retrieval | implemented |
| Three strategies with computed outcomes, trade-offs, applied principles | implemented, tested; the three approaches are pre-authored |
| Principle-gated design moves | implemented for K-01, K-02, K-05, K-06, K-07, K-08, K-10, K-11, K-12, K-13, K-14, K-15; hand-encoded rules, not inferred |
| Plain-language feedback → revision → new version with reasons | implemented, tested (offline parser); unsupported feedback is refused explicitly |
| Conceptual layer diagrams | implemented; schematic only, no dimensions |
| Negotiation and revision narrative | **simulated** in offline mode (template, shown under details); live mode written, not exercised |
| Server-side API key handling | implemented (`.env`, never exposed to the browser) |
| Quantities, spacing, planting plan, 3D or CAD output | not implemented, out of scope |
| Toxicity screening, invasive status, availability | not implemented; cautions shown only where a source states them |
| Comparison against general-purpose ChatGPT; user testing | not done; the research hypothesis to test next |

### What is still missing for a real AI negotiator
- **The design moves are authored, not generated.** The system chooses plants, checks facts and applies principles within three fixed approaches. A negotiator would propose new moves (a moist pocket, a sunnier bed, a different layer logic) from the knowledge base itself.
- **Principles are encoded as rules by hand.** Twelve of fifteen principles change decisions, but each link was written by the developer. Retrieving a principle and deriving a design move from its text is future work.
- **Language understanding is a rule parser offline.** Statements outside the rule vocabulary are flagged as unparsed rather than understood. The live model path (structured output) exists but is unverified.
- **The knowledge base is small.** Twelve records and one site assumption set; many "conditional" findings are really data gaps.
- **No evaluation yet.** Whether this is more useful than asking a general-purpose chatbot is untested.

## Research integrity notes
- Plant records and principles were compiled by fetching the cited pages; nothing was filled from model memory. Where fetches failed the field is unknown and the README says so.
- The screenshots in `docs/screenshots/` are real captures of the running application in Offline Demonstration Mode (`01-core-view.png` is the 1920×1080 presentation frame; `02-strategies.png` the complete strategies section captured as a region; `03-feedback-revision.png` the before/after revision; `05-layout-1440x900.png` a laptop-viewport check).
- The visual refinement added no data: diagrams, palettes and the season matrix are drawn from the existing plant records and strategy layers; no percentages, scores or inferred flowering months appear anywhere.
- Stakeholder statements are the synthetic test inputs from the project brief, not East Park consultation records.
- Whether this process is more valuable than asking a general-purpose chatbot is an open hypothesis for a later comparison study, not a finding of this prototype.

## Publishing

The static build (`npm run build` → `dist/`) runs entirely in the browser in Offline Demonstration Mode, because there is no server to hold an API key. A GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) builds and deploys it to GitHub Pages on every push to `main`; enable Pages with source "GitHub Actions" in the repository settings once. Live LLM mode needs the Vite server (`npm run dev` or `npm run preview`) with `ANTHROPIC_API_KEY` in `.env`.
