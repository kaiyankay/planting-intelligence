// V4.3 · stylised botanical forms for the 3D garden and the specimen sheet. Illustrative proxies, never a growth simulation.
// What comes from the records (through plantforms.js → formOf): growth form (which builder), the plant object's own crown radius
// and height (the envelope every form is fitted into), leaf retention (tone, and bare in the winter view), the recorded form /
// habit / texture words (crown shape, shrub habit, leaf grain, flower-head type) and the recorded colour words (accent colours).
// What is drawing only: branch count and angles, the number of leaf masses, their facets and shading, blade and frond curves.
// Nothing is written per species by name. One plant = one mesh (merged, vertex-coloured) on one shared material.
import * as THREE from 'three';
import { mixHex } from './render.js';
import { seeded, PALETTE } from './plantforms.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .92, metalness: 0, side: THREE.DoubleSide });
const ICO1 = new THREE.IcosahedronGeometry(1, 1), ICO0 = new THREE.IcosahedronGeometry(1, 0);
const unit = g => { const a = g.attributes.position, out = []; for (let i = 0; i < a.count; i++) out.push(V(a.getX(i), a.getY(i), a.getZ(i)).normalize()); return out; };
const U1 = unit(ICO1), U0 = unit(ICO0);
const rgb = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const wob = (u, s) => { const x = Math.sin((u.x * 7.31 + s) * 12.9898 + (u.y * 5.17 - s) * 78.233 + (u.z * 6.53 + s * .5) * 37.719) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };

/** the geometry of one plant, gathered triangle by triangle */
class Mass {
  constructor() { this.p = []; this.c = []; }
  tri(a, b, c, ca, cb = ca, cc = ca) { this.p.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); this.c.push(...ca, ...cb, ...cc); }
  /** a leaf mass: a faceted, slightly irregular ellipsoid, lighter above and darker below (painted, not lit) */
  blob(c, rx, ry, rz, hex, rand, { jitter = .13, fine = false, shade = .26 } = {}) {
    const U = fine ? U0 : U1; const s = rand() * 40; const yaw = rand() * Math.PI * 2, cs = Math.cos(yaw), sn = Math.sin(yaw); const hi = rgb(mixHex(hex, '#f1e9b4', .2)), lo = rgb(mixHex(hex, '#1d3327', shade));
    const pts = U.map(u => { const k = 1 + jitter * wob(u, s); const x = (u.x * cs - u.z * sn) * rx * k, z = (u.x * sn + u.z * cs) * rz * k; return [V(c.x + x, c.y + u.y * ry * k, c.z + z), lerp3(lo, hi, (u.y + 1) / 2)]; });
    for (let i = 0; i < pts.length; i += 3) this.tri(pts[i][0], pts[i + 1][0], pts[i + 2][0], pts[i][1], pts[i + 1][1], pts[i + 2][1]);
  }
  /** a stem or branch between two points, tapering */
  limb(a, b, r0, r1, hex, sides = 5) {
    const ax = b.clone().sub(a); if (ax.lengthSq() < 1e-8) return; const n = ax.clone().normalize(); const t = Math.abs(n.y) > .9 ? V(1, 0, 0) : V(0, 1, 0); const e1 = t.clone().cross(n).normalize(), e2 = n.clone().cross(e1); const c0 = rgb(mixHex(hex, '#1c1712', .22)), c1 = rgb(mixHex(hex, '#f1e9d4', .1));
    const ring = (o, r) => Array.from({ length: sides }, (_, i) => { const q = i / sides * Math.PI * 2; return o.clone().addScaledVector(e1, Math.cos(q) * r).addScaledVector(e2, Math.sin(q) * r); }); const A = ring(a, r0), B = ring(b, r1);
    for (let i = 0; i < sides; i++) { const j = (i + 1) % sides; this.tri(A[i], B[i], A[j], c0, c1, c0); this.tri(A[j], B[i], B[j], c0, c1, c1); }
  }
  /** a curved limb through several points */
  path(pts, r0, r1, hex, sides = 5) { for (let i = 0; i < pts.length - 1; i++) { const t0 = i / (pts.length - 1), t1 = (i + 1) / (pts.length - 1); this.limb(pts[i], pts[i + 1], r0 + (r1 - r0) * t0, r0 + (r1 - r0) * t1, hex, sides); } }
  /** a blade or frond: a ribbon along a curve, folded along its midrib, tapering to the tip */
  ribbon(pts, width, hexA, hexB, fold = .3) {
    const ca = rgb(hexA), cb = rgb(hexB); const L = [], R = [];
    for (let i = 0; i < pts.length; i++) { const d = (pts[Math.min(i + 1, pts.length - 1)].clone().sub(pts[Math.max(i - 1, 0)])).normalize(); const side = V(-d.z, 0, d.x); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize(); const w = width(i / (pts.length - 1)); L.push(pts[i].clone().addScaledVector(side, w).add(V(0, w * fold, 0))); R.push(pts[i].clone().addScaledVector(side, -w).add(V(0, w * fold, 0))); }
    for (let i = 0; i < pts.length - 1; i++) { this.tri(pts[i], L[i], pts[i + 1], ca); this.tri(L[i], L[i + 1], pts[i + 1], ca); this.tri(pts[i], pts[i + 1], R[i], cb); this.tri(R[i], pts[i + 1], R[i + 1], cb); }
  }
  mesh() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.computeVertexNormals(); return new THREE.Mesh(g, MAT); }
  get triangles() { return this.p.length / 9; }
}

/** foliage tones for one plant: leaf retention sets the family (recorded), the rest is paint */
function tones(rec) {
  const base = rec.foliage || '#4f7a4a'; const f = rec.evergreen === true ? mixHex(base, '#2b4a3c', .2) : rec.evergreen === false ? mixHex(base, '#8fae4e', .16) : base;
  return { f, light: mixHex(f, '#dcd58c', .2), dark: mixHex(f, '#213a2c', .2), bark: mixHex('#6a5140', f, .12), twig: PALETTE.winterTwig };
}
const flecks = (M, rand, n, size, hex, at) => { for (let i = 0; i < n; i++) { const p = at(i); if (p) M.blob(p, size, size * .7, size, hex, rand, { fine: true, jitter: .05, shade: .12 }); } };

// ---------------------------------------------------------------- tree: trunk, limbs, leaf masses inside a crown envelope
const ENV = {   // crown radius (share of r) at height u (0 = crown base, 1 = top). Which one: the recorded form / habit words.
  round: u => Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, u * .92 + .04))), .62),
  dome: u => u < .5 ? .58 + .42 * Math.pow(u / .5, .8) : Math.sqrt(Math.max(.16, 1 - Math.pow((u - .5) / .5, 2) * .84)),
  pyramidal: u => u < .22 ? .62 + .38 * (u / .22) : 1 - .7 * Math.pow((u - .22) / .78, 1.1),
  tiered: u => u < .3 ? .7 + .3 * (u / .3) : 1 - .52 * Math.pow((u - .3) / .7, 1.25),
};
export function buildTree(rec, r, h, opts = {}) {
  const M = new Mass(); const rand = seeded(`${rec.id}|tree`); const T = tones(rec); const style = ENV[rec.crown] ? rec.crown : 'dome'; const env = ENV[style]; const leader = style === 'pyramidal' || style === 'tiered';
  const trunkH = h * ({ pyramidal: .2, tiered: .26, round: .34, dome: .3 })[style]; const crownH = h - trunkH; const tr = Math.max(.035, Math.min(r * .1, h * .034)); const bark = rec.winter ? mixHex(T.bark, T.twig, .3) : T.bark;
  const lean = V((rand() - .5) * r * .08, 0, (rand() - .5) * r * .08); const yAt = u => trunkH + crownH * u; const leaf = !rec.winter; const masses = [];
  const mass = (p, cr, flatness, tone) => { masses.push(p); if (leaf) M.blob(p, cr, cr * flatness, cr, tone, rand, { jitter: .12 }); else for (let k = 0; k < 3; k++) { const q = rand() * Math.PI * 2; M.limb(p, p.clone().add(V(Math.cos(q) * cr * .7, cr * (.2 + rand() * .5), Math.sin(q) * cr * .7)), tr * .16, tr * .05, T.twig, 4); } };
  if (leader) {
    // one leader, limbs in tiers that shorten upward; flat leaf plates for a horizontal habit, fuller ones otherwise
    const top = V(lean.x * 2, h * .93, lean.z * 2); M.path([V(0, 0, 0), V(lean.x, trunkH, lean.z), V(lean.x * 1.6, yAt(.55), lean.z * 1.6), top], tr, tr * .18, bark, 6);
    const nt = style === 'tiered' ? 4 : 5; const flatness = style === 'tiered' ? .34 : .56;
    for (let t = 0; t < nt; t++) {
      const u = .1 + .7 * t / (nt - 1); const R = env(u) * r; const nb = Math.max(3, 6 - t); const cr = R * (style === 'tiered' ? .46 : .44); const y = yAt(u); const o = V(lean.x * (1 + u), y - cr * .2, lean.z * (1 + u));
      for (let i = 0; i < nb; i++) { const a = (i + (t % 2) * .5 + (rand() - .5) * .3) / nb * Math.PI * 2; const d = R - cr; const rise = style === 'tiered' ? cr * .1 : (R - cr) * .22; const tip = V(o.x + Math.cos(a) * d, y + rise, o.z + Math.sin(a) * d); const mid = o.clone().lerp(tip, .55).add(V(0, rise * .4, 0)); M.path([o, mid, tip], tr * (.42 - .05 * t), tr * .1, bark, 4); mass(tip, cr * (.9 + rand() * .2), flatness, [T.f, T.light, T.dark][(i + t) % 3]); }
      mass(V(o.x, y + cr * .15, o.z), R * .5, flatness, T.dark);
    }
    const cr = env(.92) * r * .8; mass(V(top.x, h - cr * .62, top.z), cr, .66, T.light);
  } else {
    // a short trunk that forks low; each limb carries two or three leaf masses out to the envelope
    const fork = V(lean.x, trunkH, lean.z); M.path([V(0, 0, 0), V(lean.x * .5, trunkH * .5, lean.z * .5), fork], tr, tr * .72, bark, 6);
    const n = 5 + Math.floor(rand() * 2); const flatness = style === 'dome' ? .46 : .62;
    for (let i = 0; i < n; i++) {
      const a = (i + (rand() - .5) * .35) / n * Math.PI * 2; const elbow = V(fork.x + Math.cos(a) * r * .3, yAt(.28 + rand() * .1), fork.z + Math.sin(a) * r * .3); M.path([fork, fork.clone().lerp(elbow, .5).add(V(0, crownH * .03, 0)), elbow], tr * .6, tr * .32, bark, 5);
      const levels = [.3 + rand() * .08, .58 + rand() * .1]; levels.forEach((u, k) => { const R = env(u) * r; const cr = R * (k ? .4 : .43) * (.92 + rand() * .16); const aa = a + (k ? .32 : -.28) + (rand() - .5) * .2; const tip = V(Math.cos(aa) * (R - cr) + lean.x, yAt(u), Math.sin(aa) * (R - cr) + lean.z); M.path([elbow, elbow.clone().lerp(tip, .6).add(V(0, crownH * .05, 0)), tip], tr * .3, tr * .08, bark, 4); mass(tip, cr, flatness, [T.f, T.light, T.dark][(i + k) % 3]); });
    }
    for (let i = 0; i < 3; i++) { const u = .78 + i * .04; const R = env(u) * r; const a = i / 3 * Math.PI * 2 + rand(); const cr = R * .52; const p = V(Math.cos(a) * R * .34 + lean.x, yAt(u), Math.sin(a) * R * .34 + lean.z); M.limb(V(fork.x, yAt(.4), fork.z), p, tr * .2, tr * .06, bark, 4); mass(p, cr, flatness, i ? T.f : T.light); }
    const cr = env(.96) * r * .62; mass(V(lean.x, h - cr * flatness * .95, lean.z), cr, flatness, T.light); mass(V(lean.x, yAt(.45), lean.z), r * .5, .5, T.dark);
  }
  if (rec.accent && leaf) flecks(M, rand, 16, Math.max(.05, r * .045), rec.accent, () => { const m = masses[Math.floor(rand() * masses.length)]; const a = rand() * Math.PI * 2; const d = r * .22 * Math.sqrt(rand()); return V(m.x + Math.cos(a) * d, m.y + r * .13, m.z + Math.sin(a) * d); });
  const g = new THREE.Group(); g.add(M.mesh()); g.userData.form = { builder: 'tree', crown: style, triangles: M.triangles }; return g;
}

// ---------------------------------------------------------------- shrub: canes (spreading), a mound (dense), or an upright oval
export function buildShrub(rec, r, h) {
  if (rec.shrub === 'mat') return buildGround(rec, r, h);
  const M = new Mass(); const rand = seeded(`${rec.id}|shrub`); const T = tones(rec); const leaf = !rec.winter; const fine = rec.texture === 'fine'; const stem = rec.winter ? T.twig : T.bark; const spots = [];
  const mass = (p, rx, ry, tone) => { spots.push([p, rx, ry]); if (leaf) M.blob(p, rx, ry, rx, tone, rand, { jitter: fine ? .1 : .15 }); };
  const habit = rec.shrub === 'cane' ? 'cane' : rec.shrub === 'upright' || h > r * 2.6 ? 'upright' : 'mound';
  if (habit === 'cane') {
    // many stems from the base, fanning and arching outward; leaf masses on the upper part only, so the stems read (bare in winter)
    const n = 13; const sr = Math.max(.012, r * .02);
    for (let i = 0; i < n; i++) { const a = (i + (rand() - .5) * .5) / n * Math.PI * 2; const reach = i % 3 === 0 ? 1 : .55 + rand() * .35; const top = i % 4 === 1 ? 1 : .72 + rand() * .24; const cr = r * (fine ? .24 : .3); const D = (r - cr) * reach, H = h * top - cr * .55; const b = V(Math.cos(a) * r * .08, 0, Math.sin(a) * r * .08);
      const pt = t => V(b.x + Math.cos(a) * D * Math.pow(t, 1.5), H * Math.pow(t, .82), b.z + Math.sin(a) * D * Math.pow(t, 1.5)); M.path([pt(0), pt(.3), pt(.62), pt(1)], sr, sr * .4, stem, 4);
      mass(pt(1), cr, cr * .8, [T.f, T.light, T.dark][i % 3]); mass(pt(.66), cr * .82, cr * .66, [T.dark, T.f, T.light][i % 3]); if (i % 3 === 0) mass(pt(.4), cr * .6, cr * .5, T.dark); if (!leaf) for (let k = 0; k < 2; k++) { const q = a + (k ? .5 : -.5); M.limb(pt(.7), pt(.7).add(V(Math.cos(q) * r * .22, h * .16, Math.sin(q) * r * .22)), sr * .5, sr * .2, stem, 4); } }
    if (leaf) { mass(V(0, h * .56, 0), r * .42, h * .26, T.dark); mass(V(0, h * .82, 0), r * .36, h * .16, T.f); }
  } else if (habit === 'upright') {
    // taller than wide: a few stems, and many small overlapping leaf masses through an egg-shaped envelope (widest near the middle,
    // tapering to the top, foliage down to the ground), so a row of them closes into one hedge-like mass
    const egg = u => u < .5 ? .62 + .38 * Math.sin(Math.PI / 2 * u / .5) : Math.max(.2, Math.pow(Math.cos(Math.PI / 2 * (u - .5) / .5), .7));
    for (let i = 0; i < 5; i++) { const a = (i + rand() * .6) / 5 * Math.PI * 2; const p0 = V(Math.cos(a) * r * .1, 0, Math.sin(a) * r * .1), p1 = V(Math.cos(a) * r * .34, h * .45, Math.sin(a) * r * .34), p2 = V(Math.cos(a + .3) * r * .3, h * .86, Math.sin(a + .3) * r * .3); M.path([p0, p1, p2], Math.max(.012, r * .04), Math.max(.005, r * .012), stem, 4); if (!leaf) for (let k = 0; k < 4; k++) { const t = .35 + k * .17, q = a + k * 2.1; const o = p0.clone().lerp(p2, t); M.limb(o, o.clone().add(V(Math.cos(q) * r * .5 * egg(t), h * .1, Math.sin(q) * r * .5 * egg(t))), r * .014, r * .005, stem, 3); } }
    const N = Math.max(14, Math.min(34, Math.round(10 + 4.5 * h / r))); const GA = 2.399963;
    for (let k = 0; k < N; k++) { const u = (k + .2 + rand() * .6) / N; const R = egg(u) * r; const cr = R * (fine ? .5 : .56) * (.88 + rand() * .24); const ry = Math.min(cr * .82, h * .2); const d = (R - cr) * (.62 + .38 * rand()); const a = k * GA + rand() * .5; mass(V(Math.cos(a) * d, ry + u * (h - 2 * ry), Math.sin(a) * d), cr, ry, [T.f, T.light, T.dark, T.f, mixHex(T.f, T.light, .5)][Math.floor(rand() * 5)]); }
    { const cr = r * .3, ry = Math.min(cr * .8, h * .12); mass(V(0, h - ry, 0), cr, ry, T.light); for (const u of [.2, .5, .78]) mass(V(0, h * u, 0), egg(u) * r * .74, h * .19, u === .5 ? T.dark : T.f); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + rand(); const cr2 = r * .34; mass(V(Math.cos(a) * (egg(.06) * r - cr2), cr2 * .62, Math.sin(a) * (egg(.06) * r - cr2)), cr2, cr2 * .64, i % 2 ? T.dark : T.f); } }
  } else {
    // a dense mound: overlapping leaf masses from the ground up, widest low
    const k = fine ? 1.35 : 1; const n1 = Math.round(7 * k), n2 = Math.round(4 * k); const c1 = r * (fine ? .36 : .42), c2 = r * (fine ? .34 : .4);
    for (let i = 0; i < n1; i++) { const a = (i + (rand() - .5) * .4) / n1 * Math.PI * 2; mass(V(Math.cos(a) * (r - c1), h * .34, Math.sin(a) * (r - c1)), c1, Math.max(c1 * .5, h * .34), [T.f, T.dark, T.light][i % 3]); }
    for (let i = 0; i < n2; i++) { const a = (i + .5 + (rand() - .5) * .4) / n2 * Math.PI * 2; mass(V(Math.cos(a) * r * .34, h * .64, Math.sin(a) * r * .34), c2, Math.max(c2 * .45, h * .3), [T.light, T.f][i % 2]); }
    const ry = Math.max(r * .2, h * .26); mass(V((rand() - .5) * r * .1, h - ry * .95, (rand() - .5) * r * .1), r * .44, ry, T.light); for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + rand(); M.limb(V(Math.cos(a) * r * .1, 0, Math.sin(a) * r * .1), V(Math.cos(a) * r * .32, h * .4, Math.sin(a) * r * .32), r * .03, r * .012, stem, 4); if (!leaf) { const p = V(Math.cos(a) * r * .32, h * .4, Math.sin(a) * r * .32); M.limb(p, V(Math.cos(a) * r * .6, h * .9, Math.sin(a) * r * .6), r * .014, r * .006, stem, 4); M.limb(p, V(Math.cos(a + 1) * r * .4, h * .8, Math.sin(a + 1) * r * .4), r * .014, r * .006, stem, 4); } }
  }
  if (rec.accent && leaf) flecks(M, rand, fine ? 14 : 10, Math.max(.03, r * .06), rec.accent, () => { const [p, rx, ry] = spots[Math.floor(rand() * spots.length)]; const a = rand() * Math.PI * 2; const d = rx * .7 * Math.sqrt(rand()); return V(p.x + Math.cos(a) * d, p.y + ry * .78, p.z + Math.sin(a) * d); });
  const g = new THREE.Group(); g.add(M.mesh()); g.userData.form = { builder: 'shrub', habit, triangles: M.triangles }; g.userData.proxy = { footprint_radius_m: r, height_m: h }; return g;
}

// ---------------------------------------------------------------- fern: fronds arching from one crown
export function buildFern(rec, r, h) {
  const M = new Mass(); const rand = seeded(`${rec.id}|fern`); const T = tones(rec); const n = rec.density > 1 ? 16 : 13; const W = r * .13; const T7 = Array.from({ length: 11 }, (_, i) => i / 10);
  // outer fronds arch over and reach the crown radius; inner ones stand nearer upright; each edge is notched so it reads as pinnae
  const frond = (a, R, H, droop, w, ca, cb) => { const pts = T7.map(t => V(Math.cos(a) * R * Math.pow(t, .9), .02 + (t < .5 ? H * (1 - Math.pow((.5 - t) / .5, 2.2)) : H * (1 - droop * Math.pow((t - .5) / .5, 1.8))), Math.sin(a) * R * Math.pow(t, .9))); M.ribbon(pts, t => w * Math.pow(Math.sin(Math.PI * Math.min(1, .1 + .9 * t)), .55) * (Math.round(t * 10) % 2 ? 1 : .72), ca, cb, .22); };
  for (let i = 0; i < n; i++) { const a = (i + (rand() - .5) * .5) / n * Math.PI * 2; frond(a, r * (i % 3 === 0 ? 1 : .8 + rand() * .18), h * (.5 + rand() * .22), .45 + rand() * .2, W, i % 2 ? T.f : T.light, T.dark); }
  for (let i = 0; i < 7; i++) { const a = (i + .5 + (rand() - .5) * .4) / 7 * Math.PI * 2; frond(a, r * (.42 + rand() * .2), h * (i === 0 ? 1 : .8 + rand() * .18), .12 + rand() * .12, W * .85, T.light, T.f); }
  const g = new THREE.Group(); g.add(M.mesh()); g.userData.form = { builder: 'fern', fronds: n + 7, triangles: M.triangles }; return g;
}

// ---------------------------------------------------------------- herbaceous perennial: basal blades, flower stalks, heads by leaf grain
export function buildHerb(rec, r, h) {
  const M = new Mass(); const rand = seeded(`${rec.id}|herb`); const T = tones(rec); const fine = rec.texture === 'fine'; const winter = !!rec.winter; const leafA = winter ? PALETTE.deciduousWinter : T.f, leafB = winter ? mixHex(PALETTE.deciduousWinter, '#6a5a44', .3) : T.dark;
  const nb = fine ? 20 : 13; const bw = r * (fine ? .09 : .17); const bh = h * (winter ? .16 : .34);
  if (!winter) M.blob(V(0, bh * .42, 0), r * .5, bh * .5, r * .5, T.dark, rand, { fine: true, jitter: .1 });
  for (let i = 0; i < nb; i++) { const a = (i + (rand() - .5) * .6) / nb * Math.PI * 2; const L = r * (i % 3 === 0 ? 1 : .6 + rand() * .34) * (i % 2 ? 1 : .8); const pts = [0, .3, .62, 1].map(t => V(Math.cos(a) * L * t, bh * (1 - Math.pow((t - .5) / .5, 2)) * (t < .5 ? 1 : .95) + .01, Math.sin(a) * L * t)); M.ribbon(pts, t => bw * Math.sin(Math.PI * (.1 + .88 * t)), i % 2 ? leafA : mixHex(leafA, '#dcd58c', .14), leafB, .25); }
  const ns = rec.density > 1 ? 8 : 6; const sr = Math.max(.006, r * .02); const stalk = winter ? T.twig : mixHex(T.f, '#dcd58c', .22); const acc = !winter && rec.accent ? rec.accent : null; const eye = rec.accent2 || mixHex(rec.accent || '#6a5140', '#3a2a1c', .55);
  for (let i = 0; i < ns; i++) {
    const a = (i + rand() * .7) / ns * Math.PI * 2, d = i === 0 ? r * .08 : r * (.2 + .5 * rand()); const H = h * (i === 0 ? 1 : .7 + rand() * .27); const hr = Math.max(.04, r * (fine ? .34 : .3)); const top = V(Math.cos(a) * d, H - (fine ? hr * .12 : hr * .1), Math.sin(a) * d); const b = V(Math.cos(a) * d * .3, 0, Math.sin(a) * d * .3);
    M.path([b, b.clone().lerp(top, .5).add(V(Math.cos(a) * d * .08, 0, Math.sin(a) * d * .08)), top], sr, sr * .6, stalk, 4);
    if (!acc) { M.blob(top, hr * .34, hr * .28, hr * .34, winter ? mixHex(T.twig, '#4a3b2c', .35) : T.light, rand, { fine: true, jitter: .05 }); continue; }
    if (fine) { // fine-textured: a flat-topped cluster of many small flowers
      M.blob(top, hr * .42, hr * .13, hr * .42, acc, rand, { fine: true, jitter: .04, shade: .1 }); for (let k = 0; k < 6; k++) { const q = k / 6 * Math.PI * 2 + rand() * .4; const o = V(top.x + Math.cos(q) * hr * .62, top.y - hr * .03, top.z + Math.sin(q) * hr * .62); M.limb(top.clone().add(V(0, -hr * .5, 0)), o, sr * .4, sr * .3, stalk, 3); M.blob(o, hr * .38, hr * .12, hr * .38, k % 2 ? acc : mixHex(acc, '#ffffff', .25), rand, { fine: true, jitter: .04, shade: .1 }); }
    } else {   // coarse-textured: one head of rays around a centre, tilted to the light
      const tilt = V(Math.cos(a) * .35, 1, Math.sin(a) * .35).normalize(); const e1 = V(-Math.sin(a), 0, Math.cos(a)), e2 = tilt.clone().cross(e1).normalize(); const ca = rgb(acc), cb = rgb(mixHex(acc, eye, .45)); const rays = 11;
      for (let k = 0; k < rays; k++) { const q0 = (k - .36) / rays * Math.PI * 2, q1 = (k + .36) / rays * Math.PI * 2, qm = k / rays * Math.PI * 2; const at = (q, len, drop) => top.clone().addScaledVector(e1, Math.cos(q) * len).addScaledVector(e2, Math.sin(q) * len).addScaledVector(tilt, drop); M.tri(at(q0, hr * .3, 0), at(qm, hr, -hr * .1), at(q1, hr * .3, 0), cb, ca, cb); }
      M.blob(top.clone().addScaledVector(tilt, hr * .06), hr * .34, hr * .2, hr * .34, eye, rand, { fine: true, jitter: .04, shade: .2 });
    }
  }
  const g = new THREE.Group(); g.add(M.mesh()); g.userData.form = { builder: 'herb', head: !rec.accent ? 'none (no colour recorded)' : fine ? 'flat cluster (fine texture)' : 'ray head (coarse texture)', triangles: M.triangles }; return g;
}

// ---------------------------------------------------------------- mat-forming ground cover: a low sheet of small leaf masses with trailing shoots
export function buildGround(rec, r, h) {
  const M = new Mass(); const rand = seeded(`${rec.id}|mat`); const T = tones(rec); const hh = Math.max(.07, Math.min(h, .45)); const spots = [];
  const mass = (p, rr, tone) => { spots.push(p); M.blob(p, rr, hh * .5, rr, tone, rand, { jitter: .18 }); };
  mass(V(0, hh * .5, 0), r * .5, T.f); const n = 8; for (let i = 0; i < n; i++) { const a = (i + (rand() - .5) * .5) / n * Math.PI * 2; const rr = r * (.3 + rand() * .1); const d = (i % 2 ? r : r * .86) - rr; mass(V(Math.cos(a) * d, hh * (.4 + rand() * .12), Math.sin(a) * d), rr, [T.f, T.light, T.dark][i % 3]); }
  for (let i = 0; i < 6; i++) { const a = rand() * Math.PI * 2; const p0 = V(Math.cos(a) * r * .55, hh * .3, Math.sin(a) * r * .55), p1 = V(Math.cos(a + .25) * r * .98, hh * .12, Math.sin(a + .25) * r * .98); M.limb(p0, p1, r * .014, r * .008, T.bark, 3); M.blob(p1, r * .1, hh * .22, r * .1, T.light, rand, { fine: true }); }
  if (rec.accent) flecks(M, rand, 9, Math.max(.022, r * .05), rec.accent, () => { const p = spots[Math.floor(rand() * spots.length)]; const a = rand() * Math.PI * 2; const d = r * .2 * Math.sqrt(rand()); return V(p.x + Math.cos(a) * d, p.y + hh * .42, p.z + Math.sin(a) * d); });
  const g = new THREE.Group(); g.add(M.mesh()); g.userData.form = { builder: 'mat', triangles: M.triangles }; return g;
}

/** one plant object → its form. r and h are the object's own crown radius and height; an unknown height is drawn nominal and translucent. */
export function buildPlant(f, p, opts = {}) {
  const r = Math.max(.12, p.proxy_radius_m); const unknownH = p.height_m == null; const h = unknownH ? (f.kind === 'tree' ? r * 2.2 : f.kind === 'ground' ? .25 : r * 1.2) : Math.max(.12, p.height_m);
  const winter = !!opts.winter && f.evergreen === false; const rec = { ...f, id: p.id, winter };
  const g = f.kind === 'tree' ? buildTree(rec, r, h) : f.kind === 'fern' ? buildFern(rec, r, h) : f.kind === 'herb' ? buildHerb(rec, r, h) : f.kind === 'ground' ? buildGround(rec, r, h) : buildShrub(rec, r, h);
  g.traverse(o => { if (o.isMesh) { o.castShadow = !opts.ghost; o.receiveShadow = !opts.ghost; if (opts.ghost) o.material = new THREE.MeshBasicMaterial({ color: 0xb4553a, wireframe: true, transparent: true, opacity: .4 }); else if (unknownH) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = .55; } } });
  g.userData.height_status = unknownH ? 'nominal (unknown)' : 'claim proxy'; g.userData.envelope = { radius_m: r, height_m: h }; return g;
}

/** a standing figure, 1.7 m, as a scale cue (a flat slab; not a person, not part of the design) */
export function scaleFigure(height = 1.7) {
  const k = height / 1.7; const s = new THREE.Shape(); const P = [[.06, 0], [.1, .02], [.085, .78], [.135, .86], [.19, 1.36], [.15, 1.43], [.06, 1.45], [.045, 1.49]]; s.moveTo(-P[0][0] * k, 0); for (const [x, y] of P) s.lineTo(-x * k, y * k); s.absarc(0, 1.59 * k, .105 * k, Math.PI * 1.36, Math.PI * -.36, true); for (const [x, y] of [...P].reverse()) s.lineTo(x * k, y * k); s.lineTo(-P[0][0] * k, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: .05 * k, bevelEnabled: false, curveSegments: 14 }); geo.translate(0, 0, -.025 * k); const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color('#b3ac9e'), roughness: 1, flatShading: true })); m.castShadow = true; m.userData.scaleFigure = height; return m;
}
