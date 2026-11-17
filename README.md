# Planting Intelligence

Knowledge-driven planting design: describe a site in your own words, shape it into planting beds, say what the planting
should do, and generate an arrangement from a sourced, claim-level plant knowledge base. UBC MLA · ARCH 540.

**Open the website → <https://kaiyankay.github.io/planting-intelligence/>**

| Page | Address |
|---|---|
| Design: Imagine → Shape → Compose → Grow | <https://kaiyankay.github.io/planting-intelligence/> |
| Plants: the plant library | <https://kaiyankay.github.io/planting-intelligence/plants/> |
| Knowledge: evidence network, table, decision trace | <https://kaiyankay.github.io/planting-intelligence/knowledge/> |
| About: project, how it works, method | <https://kaiyankay.github.io/planting-intelligence/about/> |

## How the project is split

| Repository | What it holds |
|---|---|
| **planting-intelligence** (this one) | the published website (V4.3), a generated static build; see `BUILD.md` |
| [planting-db](https://github.com/kaiyankay/planting-db) | the knowledge base, design engine, platform source code, build tools, tests and reports |
| [planting-survey](https://github.com/kaiyankay/planting-survey) | the anonymous practitioner survey, a separate application |

Do not edit the site files here by hand: change the sources in planting-db and rebuild with `tools/build_platform.py`.
`package.json` and `tools/copy-to-dist.mjs` only exist so the existing Pages workflow can publish the files as they are.

## Earlier version

The October 2026 mid-review prototype (Assignment 2) is kept at <https://kaiyankay.github.io/planting-intelligence/a2/>
(video: [a2/video.html](https://kaiyankay.github.io/planting-intelligence/a2/video.html)); its source code is the tag
[`a2-prototype`](https://github.com/kaiyankay/planting-intelligence/tree/a2-prototype).
