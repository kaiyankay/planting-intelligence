// Geometry in local metres (x east, y north). Polygons are arrays of [x, y]; the last point is not repeated.
export const area = P => Math.abs(P.reduce((s, [x, y], i) => { const [x2, y2] = P[(i + 1) % P.length]; return s + x * y2 - x2 * y; }, 0)) / 2;
export const centroid = P => { const n = P.length; return [P.reduce((s, p) => s + p[0], 0) / n, P.reduce((s, p) => s + p[1], 0) / n]; };
export const bbox = P => { const xs = P.map(p => p[0]), ys = P.map(p => p[1]); return { minx: Math.min(...xs), maxx: Math.max(...xs), miny: Math.min(...ys), maxy: Math.max(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; };
export function pointInPolygon([x, y], P) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; }
  return inside;
}
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function distPointSeg(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1]; const l2 = dx * dx + dy * dy; let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return dist(p, [a[0] + t * dx, a[1] + t * dy]); }
export const segments = P => P.map((p, i) => [p, P[(i + 1) % P.length]]);
export function distToBoundary(p, P) { return Math.min(...segments(P).map(([a, b]) => distPointSeg(p, a, b))); }
// signed area > 0 means counter-clockwise (x east, y north)
export const signedArea = P => P.reduce((s, [x, y], i) => { const [x2, y2] = P[(i + 1) % P.length]; return s + x * y2 - x2 * y; }, 0) / 2;
export const ccw = P => signedArea(P) > 0 ? P : P.slice().reverse();
// outward unit normal of segment i of a ccw polygon
export function outwardNormal(P, i) { const Q = ccw(P); const [a, b] = [Q[i], Q[(i + 1) % Q.length]]; const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dy / l, -dx / l]; }
// compass heading (deg, 0 = north, 90 = east) of a vector, given the site's north angle (deg clockwise from +y)
export function headingOf([vx, vy], northDeg = 0) { const a = (Math.atan2(vx, vy) * 180 / Math.PI + 360 - northDeg) % 360; return a; }
export const DIRECTIONS = { north: 0, 'north-east': 45, east: 90, 'south-east': 135, south: 180, 'south-west': 225, west: 270, 'north-west': 315 };
export function angleDiff(a, b) { const d = Math.abs(((a - b) % 360 + 540) % 360 - 180); return d; }
// edges of a polygon whose outward normal faces a compass direction (within tol degrees)
export function edgesFacing(P, directionDeg, northDeg = 0, tol = 50) { const Q = ccw(P); return Q.map((p, i) => ({ i, a: p, b: Q[(i + 1) % Q.length], n: outwardNormal(Q, i) })).filter(e => angleDiff(headingOf(e.n, northDeg), directionDeg) <= tol); }
// the region of a polygon on one side of its bbox: 'right' = x in the top third, etc. (relative to the canvas, north up)
export function sideRegion(P, side, fraction = 1 / 3) {
  const B = bbox(P); const f = fraction;
  const r = side === 'right' || side === 'east' ? [[B.maxx - B.w * f, B.miny], [B.maxx, B.miny], [B.maxx, B.maxy], [B.maxx - B.w * f, B.maxy]]
    : side === 'left' || side === 'west' ? [[B.minx, B.miny], [B.minx + B.w * f, B.miny], [B.minx + B.w * f, B.maxy], [B.minx, B.maxy]]
    : side === 'top' || side === 'north' || side === 'back' ? [[B.minx, B.maxy - B.h * f], [B.maxx, B.maxy - B.h * f], [B.maxx, B.maxy], [B.minx, B.maxy]]
    : side === 'bottom' || side === 'south' || side === 'front' ? [[B.minx, B.miny], [B.maxx, B.miny], [B.maxx, B.miny + B.h * f], [B.minx, B.miny + B.h * f]]
    : side === 'middle' || side === 'centre' || side === 'center' ? [[B.minx + B.w * f, B.miny + B.h * f], [B.maxx - B.w * f, B.miny + B.h * f], [B.maxx - B.w * f, B.maxy - B.h * f], [B.minx + B.w * f, B.maxy - B.h * f]]
    : P.slice();
  return r;
}
// inset a (roughly convex) polygon by d metres: move each vertex along the inward bisector
export function inset(P, d) {
  const Q = ccw(P), n = Q.length; const out = [];
  for (let i = 0; i < n; i++) {
    const n1 = outwardNormal(Q, (i - 1 + n) % n), n2 = outwardNormal(Q, i);
    let bx = n1[0] + n2[0], by = n1[1] + n2[1]; const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl;
    const cos = Math.max(.35, (n1[0] * bx + n1[1] * by));   // avoid spikes at sharp corners
    out.push([Q[i][0] - bx * d / cos, Q[i][1] - by * d / cos]);
  }
  return out;
}
// points along a segment, spaced s metres apart, inset from both ends by `end`
export function alongSegment(a, b, s, end = 0) { const L = dist(a, b) - 2 * end; if (L < 0) return []; const n = Math.max(1, Math.floor(L / s) + 1); const step = n > 1 ? L / (n - 1) : 0; const dx = (b[0] - a[0]) / (dist(a, b) || 1), dy = (b[1] - a[1]) / (dist(a, b) || 1); return Array.from({ length: n }, (_, i) => [a[0] + dx * (end + i * step), a[1] + dy * (end + i * step)]); }
// deterministic pseudo-random (mulberry32)
export function rng(seed) { let t = seed >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
// hexagonal lattice over a bbox with seeded jitter
export function hexGrid(B, spacing, jitter, rand) { const pts = []; const dy = spacing * Math.sqrt(3) / 2; let row = 0; for (let y = B.miny + spacing / 2; y <= B.maxy; y += dy, row++) for (let x = B.minx + spacing / 2 + (row % 2 ? spacing / 2 : 0); x <= B.maxx; x += spacing) pts.push([x + (rand() - .5) * jitter * spacing, y + (rand() - .5) * jitter * spacing]); return pts; }
// smooth low-frequency field in [0,1) for drifts (value noise, seeded)
export function valueNoise(seed, cell = 1.2) { const r = rng(seed); const cache = new Map(); const g = (i, j) => { const k = `${i},${j}`; if (!cache.has(k)) cache.set(k, r()); return cache.get(k); }; const sm = t => t * t * (3 - 2 * t); return (x, y) => { const i = Math.floor(x / cell), j = Math.floor(y / cell), u = sm(x / cell - i), v = sm(y / cell - j); return (g(i, j) * (1 - u) + g(i + 1, j) * u) * (1 - v) + (g(i, j + 1) * (1 - u) + g(i + 1, j + 1) * u) * v; }; }
export const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
export const roundPt = p => [round(p[0]), round(p[1])];
export function polygonFromRect(w, h, x0 = 0, y0 = 0) { return [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]]; }
export function circlePolygon([cx, cy], r, n = 24) { return Array.from({ length: n }, (_, i) => [cx + r * Math.cos(i / n * 2 * Math.PI), cy + r * Math.sin(i / n * 2 * Math.PI)]); }
export function polygonsIntersect(A, B) { return A.some(p => pointInPolygon(p, B)) || B.some(p => pointInPolygon(p, A)); }
// polygon with holes: inside the outer ring and outside every hole
export function pointInShape(p, shape) { if (!shape?.polygon) return false; if (!pointInPolygon(p, shape.polygon)) return false; return !(shape.holes || []).some(h => pointInPolygon(p, h)); }
export const areaShape = s => s?.polygon ? area(s.polygon) - (s.holes || []).reduce((a, h) => a + area(h), 0) : 0;
// distance to the nearest edge of the outer ring or of any hole
export function distToShapeEdge(p, shape) { let d = distToBoundary(p, shape.polygon); for (const h of shape.holes || []) d = Math.min(d, distToBoundary(p, h)); return d; }
