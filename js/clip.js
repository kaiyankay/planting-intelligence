// Polygon boolean operations for the spatial proposal engine, over polygon-clipping (Martinez–Rueda, MIT; vendored in
// design/vendor/polygon-clipping with its two dependencies). Everything here is in local metres: a `shape` is { polygon, holes }
// (outer ring + hole rings, last point not repeated, as the rest of the workspace draws them); a `multi` is polygon-clipping's
// MultiPolygon [[outer, hole, …], …] with closed rings. Offsets (inset / outset) are built from the booleans — the union of edge
// capsules — so concave polygons and holes come out right without an integer-scaled second library (see design/vendor/README.md).
import pc from '../vendor/polygon-clipping/polygon-clipping.esm.js';
import * as G from './geom.js';

const r3 = v => Math.round(v * 1000) / 1000;
const closeRing = ring => { const r = ring.map(p => [r3(p[0]), r3(p[1])]); if (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) r.push([r[0][0], r[0][1]]); return r; };
const openRing = ring => { const r = ring.map(p => [r3(p[0]), r3(p[1])]); if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop(); return r; };

export const toMulti = (polygon, holes = []) => polygon?.length >= 3 ? [[closeRing(polygon), ...holes.filter(h => h.length >= 3).map(closeRing)]] : [];
export const toMultiAll = shapes => shapes.flatMap(s => Array.isArray(s[0]?.[0]) === false && s.polygon ? toMulti(s.polygon, s.holes) : toMulti(s));
/** polygon-clipping result → [{ polygon, holes, area_m2 }], tiny pieces dropped (< minArea m²). */
export function fromMulti(multi, minArea = 1e-6) {
  const out = [];
  for (const poly of multi || []) { if (!poly.length) continue; const polygon = openRing(poly[0]); if (polygon.length < 3) continue; const holes = poly.slice(1).map(openRing).filter(h => h.length >= 3); const a = G.area(polygon) - holes.reduce((s, h) => s + G.area(h), 0); if (a >= minArea) out.push({ polygon, holes, area_m2: G.round(a) }); }
  return out;
}
const asMulti = x => Array.isArray(x) ? (x.length && Array.isArray(x[0]) && Array.isArray(x[0][0]) && Array.isArray(x[0][0][0]) ? x : toMulti(x)) : x?.polygon ? toMulti(x.polygon, x.holes) : [];
/* polygon-clipping can fail on nearly coincident points ("Unable to complete output ring"). The same operation is then repeated on
   the same geometry snapped to a grid — 1 mm, then 0.1 mm, then 2 mm — and only fails if every attempt does. No result is dropped. */
const snapMulti = (m, q) => (m || []).map(poly => poly.map(ring => { const r = []; for (const p of ring) { const v = [Math.round(p[0] / q) * q, Math.round(p[1] / q) * q]; if (!r.length || r[r.length - 1][0] !== v[0] || r[r.length - 1][1] !== v[1]) r.push(v); } if (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) r.push([r[0][0], r[0][1]]); return r; }).filter(r => r.length >= 4)).filter(p => p.length);
const safe = (fn, a, b) => { let err; for (const q of [0, 1e-3, 1e-4, 2e-3]) { try { const x = q ? snapMulti(a, q) : a; if (b === undefined) return x.length ? fn(x) : []; return fn(x, q ? snapMulti(b, q) : b); } catch (e) { err = e; } } throw err; };
export const union = (a, b) => b === undefined ? safe(pc.union, asMulti(a)) : safe(pc.union, asMulti(a), asMulti(b));
export const difference = (a, b) => asMulti(b).length ? safe(pc.difference, asMulti(a), asMulti(b)) : asMulti(a);
export const intersection = (a, b) => safe(pc.intersection, asMulti(a), asMulti(b));
export const xor = (a, b) => safe(pc.xor, asMulti(a), asMulti(b));
export function unionAll(list) { let m = []; for (const x of list) { const mx = asMulti(x); if (!mx.length) continue; m = m.length ? safe(pc.union, m, mx) : safe(pc.union, mx); } return m; }
export function cleanMulti(m) { return (m || []).map(poly => poly.map(ring => { const r = []; for (const p of ring) { const q = [r3(p[0]), r3(p[1])]; if (!r.length || r[r.length - 1][0] !== q[0] || r[r.length - 1][1] !== q[1]) r.push(q); } return r; }).filter(r => r.length >= 4)).filter(p => p.length); }
export const areaOf = m => fromMulti(m).reduce((s, p) => s + p.area_m2, 0);
export const areaShape = s => s?.polygon ? G.area(s.polygon) - (s.holes || []).reduce((a, h) => a + G.area(h), 0) : 0;

/** a capsule (rectangle + round caps as 10-gon arcs) around segment a–b with radius d */
function capsule(a, b, d, n = 8) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-9; const ux = dx / L, uy = dy / L; const nx = -uy, ny = ux;
  // half circles: around b from +n to −n through +u, then around a from −n to +n through −u
  const arc = (c, from, through, m) => { const out = []; for (let i = 0; i <= m; i++) { const t = Math.PI * i / m; out.push([c[0] + from[0] * Math.cos(t) * d + through[0] * Math.sin(t) * d, c[1] + from[1] * Math.cos(t) * d + through[1] * Math.sin(t) * d]); } return out; };
  return [...arc(b, [nx, ny], [ux, uy], n), ...arc(a, [-nx, -ny], [-ux, -uy], n)];
}
/** every edge of every ring of a shape as a capsule of radius d, unioned */
function edgeCapsules(shape, d) { const rings = [shape.polygon, ...(shape.holes || [])]; return unionAll(rings.flatMap(r => G.segments(r).map(([a, b]) => capsule(a, b, d)))); }
/** inward offset by d metres: the shape minus a band of width d along all its edges (works for concave rings and holes) */
export function inset(shape, d) { const s = shape.polygon ? shape : { polygon: shape, holes: [] }; if (d <= 0) return toMulti(s.polygon, s.holes); return difference(toMulti(s.polygon, s.holes), edgeCapsules(s, d)); }
/** outward offset by d metres (round corners) */
export function outset(shape, d) { const s = shape.polygon ? shape : { polygon: shape, holes: [] }; if (d <= 0) return toMulti(s.polygon, s.holes); return union(toMulti(s.polygon, s.holes), edgeCapsules(s, d)); }
/** a band of width w inside a ring along the given edges ([a, b, n] with outward normal n), clipped to the shape */
export function edgeBand(shape, edges, w) {
  const pieces = edges.map(e => { const ext = 0.02; const ax = e.a[0] + (e.a[0] - e.b[0]) / (G.dist(e.a, e.b) || 1) * ext, ay = e.a[1] + (e.a[1] - e.b[1]) / (G.dist(e.a, e.b) || 1) * ext; const bx = e.b[0] + (e.b[0] - e.a[0]) / (G.dist(e.a, e.b) || 1) * ext, by = e.b[1] + (e.b[1] - e.a[1]) / (G.dist(e.a, e.b) || 1) * ext; return [[ax + e.n[0] * .05, ay + e.n[1] * .05], [bx + e.n[0] * .05, by + e.n[1] * .05], [bx - e.n[0] * w, by - e.n[1] * w], [ax - e.n[0] * w, ay - e.n[1] * w]]; });
  const band = unionAll(pieces.map(p => toMulti(p))); return intersection(band, shape.polygon ? toMulti(shape.polygon, shape.holes) : shape);
}
/** the narrowest width of a shape ≈ 2 × the largest inset that still leaves something (bisection, 2 cm resolution) */
export function minWidth(shape, maxW = 6) { let lo = 0, hi = maxW / 2; if (!areaOf(inset(shape, 0.01))) return 0; for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2; if (areaOf(inset(shape, mid)) > 1e-4) lo = mid; else hi = mid; } return G.round(2 * lo); }
/** validity of a ring: ≥ 3 points, non-zero area, no self-intersection (the union of itself is one polygon with the same area) */
export function validRing(ring) {
  if (!ring || ring.length < 3) return { ok: false, why: 'fewer than 3 points' };
  const a = G.area(ring); if (a < 1e-4) return { ok: false, why: 'zero area' };
  const u = fromMulti(union(toMulti(ring))); if (u.length !== 1) return { ok: false, why: `self-intersecting (${u.length} pieces)` };
  if (Math.abs(u[0].area_m2 - a) > 0.01 + a * 0.01) return { ok: false, why: 'self-intersecting (area changes when cleaned)' };
  return { ok: true };
}
export function containsShape(outer, inner, tol = 0.02) { const d = difference(inner, outer); return areaOf(d) <= tol; }
export function overlapArea(a, b) { return areaOf(intersection(a, b)); }
export { pc };
