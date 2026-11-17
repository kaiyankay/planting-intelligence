# Vendored geometry libraries (design workspace)

| library | version | source | licence | used for |
|---|---|---|---|---|
| polygon-clipping | 0.15.7 | https://github.com/mfogel/polygon-clipping (npm `polygon-clipping`, `dist/polygon-clipping.esm.js` from cdn.jsdelivr.net) | MIT (`LICENSE.md`) | union · difference · intersection · xor of the plantable area, beds, open areas (float metres, holes as rings) |
| splaytree (dependency) | 3.1.2 | https://github.com/w8r/splay-tree (`dist/splay.esm.js`) | MIT (package.json `license`) | sweep-line event queue inside polygon-clipping |
| robust-predicates (dependency) | 3.0.2 | https://github.com/mourner/robust-predicates (`esm/util.js` + `esm/orient2d.js`, concatenated) | Unlicense (`LICENSE-robust-predicates`) | exact orientation test inside polygon-clipping |

The two bare imports of the polygon-clipping ESM build (`'splaytree'`, `'robust-predicates'`) were rewritten to the relative files beside it; nothing else was changed. No Node toolchain exists on the build machine, so the files were fetched from the npm CDN by hand (2026-11-08).

## Evaluated, not adopted

* **clipper2-js 1.2.4** (Boost Software License, https://github.com/IRobot1/clipper2-ts): loads as one 190 kB ES module and its `ClipperOffset` and `Clipper.Difference` ran correctly in the browser proof (inset / outset of a 6 × 4 m rectangle, rectangle minus an inner rectangle). It needs integer coordinates (a 1 m = 1000 units scaling and the opposite orientation sign to this workspace's counter-clockwise, north-up rings) and returns holes as separate paths; polygon-clipping already returns `[outer, hole…]` in float metres, so offsets are built from booleans in `design/js/clip.js` (`inset` = shape − union of edge capsules; `outset` = shape ∪ edge capsules) and a second engine with its own coordinate convention was not worth the extra 190 kB.
* **@turf/turf 7.4.0** (MIT): geographic operations in longitude / latitude with geodesic distances. The design model is a local planar metre system; passing x / y metres as degrees would be wrong, and the only planar pieces needed (booleans, offsets, areas) are covered above.

Proof run (headless Chrome, 2026-11-08): polygon-clipping load 41 ms, five operations 8.6 ms; clipper2-js load 12 ms, three operations 9.3 ms.
