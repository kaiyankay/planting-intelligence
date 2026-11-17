// The V4.2 plant proxies (stacked flat-shaded primitives), kept unchanged so the specimen sheet and ?proxy=v42 can show them beside
// the V4.3 forms of botanical.js. Not used by the garden unless asked for.
import * as THREE from 'three';
import { mixHex } from './render.js';
import { seeded, PALETTE } from './plantforms.js';
const col = h => new THREE.Color(h);
const flat = (hex, extra = {}) => new THREE.MeshStandardMaterial({ color: col(hex), flatShading: true, roughness: .85, metalness: 0, ...extra });
export function buildPlantV42(f, p, opts = {}) {
  const r = Math.max(.12, p.proxy_radius_m); const unknownH = p.height_m == null; const h = unknownH ? (f.kind === 'tree' ? r * 2.2 : f.kind === 'ground' ? .25 : r * 1.2) : Math.max(.12, p.height_m);
  const winter = opts.winter && f.evergreen === false; const fol = winter ? PALETTE.deciduousWinter : f.foliage;
  let g; const rec = { ...f, foliage: fol, id: p.id, ghost: opts.ghost, nominal: unknownH, winter };
  if (f.kind === 'tree') g = buildTreeV42(rec, r, h, { nominal: unknownH, ghost: opts.ghost, winter }); else if (f.kind === 'shrub') g = buildShrubV42(rec, r, h); else if (f.kind === 'fern') g = buildFernV42(rec, r, h); else if (f.kind === 'herb') g = buildHerbV42(rec, r, h); else g = buildGroundV42(rec, r, h);
  g.traverse(o => { if (o.isMesh) { o.castShadow = !opts.ghost; o.receiveShadow = !opts.ghost; if (opts.ghost) { o.material = new THREE.MeshBasicMaterial({ color: 0xb4553a, wireframe: true, transparent: true, opacity: .55 }); } else if (unknownH) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = .55; } } });
  g.userData.height_status = unknownH ? 'nominal (unknown)' : 'claim proxy'; return g;
}
export function buildTreeV42(rec, r, h, opts = {}) {
  const g = new THREE.Group(); const rand = seeded(rec.id); const trunkH = h * .38; const bark = flat(mixHex(rec.foliage || '#4f7a4a', '#3a2a1c', .75));
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * .07, r * .11, trunkH, 7), bark); trunk.position.y = trunkH / 2; g.add(trunk);
  const crownMat = flat(rec.foliage || '#4f7a4a'); const n = rec.winter ? 0 : 4 + Math.round(rand() * 2);
  if (rec.winter) { for (let i = 0; i < 7; i++) { const a = rand() * Math.PI * 2, t = .4 + rand() * .5; const br = new THREE.Mesh(new THREE.CylinderGeometry(.015, .035, h * .6, 5), flat(PALETTE.winterTwig)); br.position.set(Math.cos(a) * r * .35 * t, trunkH + h * .25, Math.sin(a) * r * .35 * t); br.rotation.set(Math.cos(a) * .7, 0, -Math.sin(a) * .7); g.add(br); } }
  for (let i = 0; i < n; i++) { const t = i / Math.max(1, n - 1); const rr = r * (0.55 + 0.5 * Math.sin(Math.PI * (0.25 + t * .6))) * (0.9 + rand() * .2); const y = trunkH + (h - trunkH) * (0.15 + t * .7); const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rr, 1), i % 2 ? crownMat : flat(mixHex(rec.foliage || '#4f7a4a', '#ffffff', .12))); m.position.set((rand() - .5) * r * .3, y, (rand() - .5) * r * .3); m.scale.y = .72; g.add(m); }
  if (rec.accent && !rec.winter) for (let i = 0; i < 10; i++) { const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r * .8; const dot = new THREE.Mesh(new THREE.IcosahedronGeometry(r * .07, 0), flat(rec.accent)); dot.position.set(Math.cos(a) * d, trunkH + (h - trunkH) * (0.4 + rand() * .5), Math.sin(a) * d); g.add(dot); }
  return g;
}
/* V4.1 · a shrub is a billowing mass, not a column. Its footprint is the crown circle of the plan (lobes reach exactly the proxy radius r
   at the widest tier), its top is the claimed height h; between the two, tiers of lobes that keep near-round proportions, so a tall
   narrow species reads as stacked foliage and a row of them closes the way the 2D crowns do. Silhouette, lobes and taper are illustrative. */
function buildShrubV42(rec, r, h) {
  const g = new THREE.Group(); const rand = seeded(rec.id); const mat = flat(rec.foliage), mat2 = flat(mixHex(rec.foliage, '#ffffff', .14)), mat3 = flat(mixHex(rec.foliage, '#1f2a1c', .18));
  const tiers = Math.max(1, Math.min(4, Math.round(h / (r * 1.1)))); const perTier = h / tiers; const n0 = rec.density > 1 ? 7 : rec.density < 1 ? 5 : 6; const taper = rec.upright ? .18 : .3;
  for (let t = 0; t < tiers; t++) {
    const u = tiers === 1 ? 0 : t / (tiers - 1); const w = 1 - taper * Math.pow(u, 1.4); const n = Math.max(3, n0 - t); const rr = r * w * .5; const d = r * w - rr; const y = tiers === 1 ? h * .52 : h * (.2 + .56 * u);
    const sy = Math.max(.9, Math.min(1.45, perTier * .95 / rr));
    for (let i = 0; i < n; i++) { const a = (i + (t % 2) * .5) / n * Math.PI * 2 + (rand() - .5) * .35; const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rr * (.92 + rand() * .16), 1), [mat, mat2, mat3][(i + t) % 3]); m.position.set(Math.cos(a) * d, y + (rand() - .5) * perTier * .18, Math.sin(a) * d); m.scale.y = sy; g.add(m); }
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(r * w * .74, 1), mat3); core.position.y = y; core.scale.y = Math.max(.9, Math.min(1.6, perTier * 1.05 / (r * w * .74))); g.add(core);
  }
  const tr = r * (1 - taper) * .8; const top = new THREE.Mesh(new THREE.IcosahedronGeometry(tr, 1), mat2); top.position.y = h - tr * .7; top.scale.y = .7; g.add(top);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(r * .62, r * .78, Math.min(h * .3, r * .7), 9), mat3); skirt.position.y = Math.min(h * .3, r * .7) / 2; g.add(skirt);
  if (rec.accent) for (let i = 0; i < 8; i++) { const a = rand() * Math.PI * 2, u = rand(); const d = r * (1 - taper * Math.pow(u, 1.4)) * (.75 + rand() * .2); const dot = new THREE.Mesh(new THREE.IcosahedronGeometry(r * .08, 0), flat(rec.accent)); dot.position.set(Math.cos(a) * d, h * (.25 + u * .65), Math.sin(a) * d); g.add(dot); }
  g.userData.proxy = { footprint_radius_m: r, height_m: h, tiers }; return g;
}
function buildFernV42(rec, r, h) {
  const g = new THREE.Group(); const rand = seeded(rec.id); const n = 11; const mat = flat(rec.foliage), mat2 = flat(mixHex(rec.foliage, '#1f2a1c', .22));
  const frond = new THREE.ConeGeometry(r * .13, r * 1.05, 4); frond.translate(0, r * .52, 0);
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + rand() * .3; const m = new THREE.Mesh(frond, i % 2 ? mat : mat2); m.position.y = .05; m.rotation.set(0, -a, Math.PI / 2 - (0.55 + rand() * .35)); m.rotation.order = 'YXZ'; m.scale.y = (0.85 + rand() * .3) * Math.min(1.4, h / r); g.add(m); }
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(r * .18, 0), mat2); crown.position.y = r * .12; g.add(crown); return g;
}
function buildHerbV42(rec, r, h) {
  const g = new THREE.Group(); const rand = seeded(rec.id); const mat = flat(rec.foliage), mat2 = flat(mixHex(rec.foliage, '#ffffff', .16));
  const mound = new THREE.Mesh(new THREE.IcosahedronGeometry(r * .8, 1), mat); mound.scale.set(1, Math.max(.18, h * .35 / r), 1); mound.position.y = h * .18; g.add(mound);
  const stems = rec.accent ? 7 : 4; const stemGeo = new THREE.CylinderGeometry(.012, .018, h, 5);
  for (let i = 0; i < stems; i++) { const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r * .6; const s = new THREE.Mesh(stemGeo, mat2); s.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d); s.rotation.set((rand() - .5) * .2, 0, (rand() - .5) * .2); g.add(s); if (rec.accent) { const head = new THREE.Mesh(new THREE.IcosahedronGeometry(Math.max(.04, r * .16), 0), flat(rec.accent)); head.position.set(Math.cos(a) * d, h, Math.sin(a) * d); head.scale.y = .55; g.add(head); } else { const head = new THREE.Mesh(new THREE.IcosahedronGeometry(Math.max(.03, r * .1), 0), mat2); head.position.set(Math.cos(a) * d, h, Math.sin(a) * d); g.add(head); } }
  return g;
}
function buildGroundV42(rec, r, h) {
  const g = new THREE.Group(); const rand = seeded(rec.id); const mat = flat(rec.foliage), mat2 = flat(mixHex(rec.foliage, '#ffffff', .14)); const hh = Math.max(.08, Math.min(h, .45));
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + rand() * .5, d = i ? r * .4 : 0; const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r * (i ? .5 : .7), 1), i % 2 ? mat : mat2); m.position.set(Math.cos(a) * d, hh * .45, Math.sin(a) * d); m.scale.y = hh / r * .9; g.add(m); }
  if (rec.accent) for (let i = 0; i < 6; i++) { const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r * .85; const dot = new THREE.Mesh(new THREE.IcosahedronGeometry(Math.max(.025, r * .07), 0), flat(rec.accent)); dot.position.set(Math.cos(a) * d, hh * .9, Math.sin(a) * d); g.add(dot); }
  return g;
}
