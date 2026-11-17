// Planting Intelligence · Shape · editing the site outline (V4.2, 2026-11-16).
//
// The outline of a site is a ring of corners in project.site.boundary (metres) or, while the site is still a sketch, in
// project.site.concept.frame (unitless). This module edits that ring — drag a corner, add one on an edge, delete one, cut a corner
// off, cut a notch into one — and nothing else: no CSS mask, no second geometry. A session works on a copy; the project changes only
// on Apply, through the model (snapshot → boundary → beds and zones clipped by clip.js → proposal), so Undo takes it back as one step.
//
//   pure geometry      moveVertex · insertVertex · deleteVertex · trimCorner · notchCorner · check
//   what it would do   impact(project, ring)   which beds and zones the new outline cuts, how much planted ground goes, which plants
//                                              of the current arrangement would stand outside — read, never applied
//   commit             apply(project, ring, impact)   refused when check() or impact().blockers say why
//   sketch             the same edits on the unitless outline; no length, area or count is shown or derived until a size is given
//   UI                 an overlay of handles on the plan and a panel in the inspector, driven by one session object S.be
//   Screen depth       deepenOffer / deepen: what a staggered second row needs on this bed, from the engine's own row plan
//   replay             script(out)  → ?script=v42shape
//
// Nothing here knows a plant fact or sets a threshold of its own: sizes come from spatial.js DEFAULTS and the engine's row plan.
import * as G from './geom.js';
import * as C from './clip.js';
import * as M from './model.js';
import * as CM from './concept.js';
import * as SP from './spatial.js';
import * as E from './engine.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const $ = s => document.querySelector(s);
export const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V6h9l5 5v8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="5" cy="19" r="1.8" fill="currentColor"/><circle cx="5" cy="6" r="1.8" fill="currentColor"/><circle cx="14" cy="6" r="1.8" fill="currentColor"/><circle cx="19" cy="11" r="1.8" fill="currentColor"/><circle cx="19" cy="19" r="1.8" fill="currentColor"/></svg>';

// ---------------------------------------------------------------- pure geometry on a ring of [x, y]
const cp = ring => ring.map(p => [p[0], p[1]]);
const unit = (a, b) => { const d = G.dist(a, b) || 1; return [(b[0] - a[0]) / d, (b[1] - a[1]) / d]; };
export function moveVertex(ring, i, p) { const r = cp(ring); r[i] = [p[0], p[1]]; return r; }
/** a new corner on the edge that starts at corner i (at p, or at the middle of the edge) */
export function insertVertex(ring, i, p = null) { const r = cp(ring); const a = r[i], b = r[(i + 1) % r.length]; r.splice(i + 1, 0, p ? [p[0], p[1]] : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); return r; }
export function deleteVertex(ring, i) { if (ring.length <= 3) return null; const r = cp(ring); r.splice(i, 1); return r; }
/** how far a cut may reach along the two edges that meet at corner i (never past the middle of the shorter one) */
export function cornerRoom(ring, i) { const n = ring.length; const v = ring[i], a = ring[(i - 1 + n) % n], b = ring[(i + 1) % n]; return Math.min(G.dist(v, a), G.dist(v, b)) / 2; }
/** cut the corner off: corner i becomes two corners, d back along each edge — a diagonal edge */
export function trimCorner(ring, i, d) { const n = ring.length; const v = ring[i], a = ring[(i - 1 + n) % n], b = ring[(i + 1) % n]; const ua = unit(v, a), ub = unit(v, b); const r = cp(ring); r.splice(i, 1, [v[0] + ua[0] * d, v[1] + ua[1] * d], [v[0] + ub[0] * d, v[1] + ub[1] * d]); return r; }
/** cut a notch into the corner: corner i becomes three corners — da back along the edge before it, db along the edge after it, and
 *  the inner corner where the two cuts meet. On a right angle this is a rectangular bite: an L-shaped site. */
export function notchCorner(ring, i, da, db = da) { const n = ring.length; const v = ring[i], a = ring[(i - 1 + n) % n], b = ring[(i + 1) % n]; const ua = unit(v, a), ub = unit(v, b); const A = [v[0] + ua[0] * da, v[1] + ua[1] * da], B = [v[0] + ub[0] * db, v[1] + ub[1] * db]; const r = cp(ring); r.splice(i, 1, A, [A[0] + ub[0] * db, A[1] + ub[1] * db], B); return r; }
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const properCross = (a, b, c, d) => { const d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b); return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)); };
/** is this ring a site outline? → { ok, reasons[] } in words a person can act on. `min_area` and `min_edge` are in the ring's own unit. */
export function check(ring, { min_area = 0.5, min_edge = 0.05, unit: u = 'm' } = {}) {
  const reasons = []; const n = ring?.length || 0;
  if (n < 3) return { ok: false, reasons: [`An outline needs at least 3 corners; this one has ${n}.`] };
  for (let i = 0; i < n; i++) if (G.dist(ring[i], ring[(i + 1) % n]) < min_edge) { reasons.push(`Corners ${i + 1} and ${(i + 1) % n + 1} sit on the same spot. Move one or delete it.`); break; }
  let crossing = null; for (let i = 0; i < n && !crossing; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (properCross(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) { crossing = [i, j]; break; } }
  if (crossing) reasons.push(`The outline crosses itself: the edge after corner ${crossing[0] + 1} cuts the edge after corner ${crossing[1] + 1}. Move a corner so the edges no longer cross.`);
  const a = G.area(ring);
  if (!crossing && a < min_area) reasons.push(u === 'm' ? `The outline encloses almost no ground (${G.round(a, 2)} m²).` : 'The outline encloses almost no ground: its corners lie nearly on one line.');
  if (!reasons.length) { const v = C.validRing(ring.map(p => [p[0], p[1]])); if (!v.ok) reasons.push(/self-intersect/.test(v.why) ? 'The outline touches or crosses itself. Move a corner so every edge is clear of the others.' : `The outline is not a usable shape (${v.why}).`); }
  return { ok: !reasons.length, reasons };
}

// ---------------------------------------------------------------- what a new outline would do to a measured site
const r2 = v => G.round(v, 2);
const confirmed = b => b.status !== 'ai-suggested';
/** read only. `blockers` refuse the commit; `beds` / `zones` are what Apply would clip, with before and after. */
export function impact(project, ring) {
  const site = project.site; const out = { site: { before_m2: r2(G.area(site.boundary)), after_m2: r2(G.area(ring)) }, beds: [], zones: [], blockers: [], plants_outside: 0, plants_in_changed_beds: 0, lost_m2: 0, stale: false, resuggest: false };
  const ringM = C.toMulti(ring); const P = SP.DEFAULTS; const userBeds = M.activeBeds(project).filter(confirmed);
  out.resuggest = !userBeds.length && M.activeBeds(project).length > 0;   // only suggestions on the plan: the proposal is computed again for the new outline
  for (const b of M.activeBeds(project)) {
    if (!confirmed(b) && out.resuggest) continue;
    const before = C.areaShape(M.bedShape(b)); const parts = C.fromMulti(C.intersection(C.toMulti(b.polygon, b.holes), ringM), 0.01).sort((x, y) => y.area_m2 - x.area_m2); const kept = parts[0] || null; const total = parts.reduce((s, x) => s + x.area_m2, 0);
    if (Math.abs(before - total) <= 0.02 && parts.length === 1) continue;   // untouched
    let after = kept, why = null;
    if (!kept || kept.area_m2 < P.min_bed_area_m2) { after = null; why = kept ? `only ${r2(kept.area_m2)} m² would be left, less than the smallest bed (${P.min_bed_area_m2} m²)` : 'it lies entirely outside the new outline'; }
    else { const mw = C.minWidth({ polygon: kept.polygon, holes: kept.holes }); if (mw < P.min_bed_width_m) { after = null; why = `what is left would be ${r2(mw)} m at its narrowest, less than the narrowest bed (${P.min_bed_width_m} m)`; } }
    const rec = { bed_id: b.id, name: b.name, confirmed: confirmed(b), before_m2: r2(before), after_m2: after ? r2(after.area_m2) : 0, lost_m2: r2(before - (after ? after.area_m2 : 0)), removed: !after, why, pieces: parts.length, after: after ? { polygon: after.polygon.map(G.roundPt), holes: after.holes.map(h => h.map(G.roundPt)) } : null, cut: C.fromMulti(C.difference(C.toMulti(b.polygon, b.holes), ringM), 0.005).map(x => x.polygon) };
    out.beds.push(rec); out.lost_m2 = r2(out.lost_m2 + rec.lost_m2);
  }
  for (const f of site.features) {
    if (f.kind === 'existing-tree' && f.position_m) { if (!G.pointInPolygon(f.position_m, ring)) out.blockers.push(`The ${f.label || 'existing tree'} would stand outside the outline. A tree is not moved or removed by an outline: keep it inside, or move the tree first.`); continue; }
    if (!f.polygon) continue; const before = G.area(f.polygon); const parts = C.fromMulti(C.intersection(C.toMulti(f.polygon), ringM), 0.01).sort((x, y) => y.area_m2 - x.area_m2); const total = parts.reduce((s, x) => s + x.area_m2, 0);
    if (Math.abs(before - total) <= 0.02 && parts.length === 1) continue;
    out.zones.push({ id: f.id, label: f.label || f.kind, kind: f.kind, before_m2: r2(before), after_m2: parts[0] ? r2(parts[0].area_m2) : 0, removed: !parts[0], after: parts[0] ? parts[0].polygon.map(G.roundPt) : null });
  }
  const v = M.currentVersion(project); if (v) { const changed = new Set(out.beds.map(b => b.bed_id)); out.plants_outside = v.plant_objects.filter(o => !G.pointInPolygon(o.position_m, ring)).length; out.plants_in_changed_beds = v.plant_objects.filter(o => changed.has(o.bed_id)).length; out.stale = true; out.version = { id: v.id, plants: v.plant_objects.length }; }
  out.changed = out.site.before_m2 !== out.site.after_m2 || JSON.stringify(ring.map(G.roundPt)) !== JSON.stringify(site.boundary.map(G.roundPt));
  out.touches = out.beds.length + out.zones.length;
  return out;
}
/** commit an outline to a measured site. Returns { ok, reasons } — nothing is written unless ok. */
export function apply(project, ring, imp = null, { label = 'outline edited' } = {}) {
  const site = project.site; const rr = ring.map(G.roundPt); const ck = check(rr); if (!ck.ok) return { ok: false, reasons: ck.reasons };
  imp = imp || impact(project, rr); if (imp.blockers.length) return { ok: false, reasons: imp.blockers };
  M.snapshotSite(project, label, { outline: true });
  const was = site.boundary_status; M.setBoundary(project, rr, 'user-drawn'); site.boundary_source = `outline shaped on the plan (${rr.length} corners)${was && was !== 'user-drawn' ? `; before that it was ${was.replace('user-', '')}` : ''}`;
  for (const c of imp.beds) { const b = site.beds.find(x => x.id === c.bed_id); if (!b) continue;
    if (c.removed) { b.status = 'rejected'; b.confirmation = 'rejected'; b.source = `outside the edited site outline (${c.why}) — removed when you applied the outline`; }
    else { const nb = M.setBedGeometry(project, b.id, c.after.polygon, c.after.holes, 'user-edited', `clipped to the edited site outline (${c.before_m2} → ${c.after_m2} m²) — applied by you after the preview`); if (nb) { nb.min_width_m = C.minWidth(M.bedShape(nb)); nb.under_canopy = []; } } }
  for (const z of imp.zones) { if (z.removed) site.features = site.features.filter(f => f.id !== z.id); else { const f = site.features.find(x => x.id === z.id); if (f) { f.polygon = z.after; f.source = `${f.source || ''}${f.source ? '; ' : ''}clipped to the edited site outline`; } } }
  if (imp.resuggest) site.beds = site.beds.filter(b => b.status !== 'ai-suggested');
  if (site.proposals) site.proposals.stale = true;
  return { ok: true, impact: imp, boundary: rr };
}
/** the sketch: objects must stay inside the shaped outline (a tree is never moved for the user; an open area is trimmed to it) */
export function conceptImpact(c, ring) {
  const out = { blockers: [], zones: [] }; const ringM = C.toMulti(ring);
  for (const o of c.objects) {
    if (o.kind === 'existing-tree' && o.pos && !G.pointInPolygon(o.pos, ring)) out.blockers.push('The tree would be outside the outline. Keep it inside, or drag the tree first.');
    if (o.kind === 'open-area' && o.polygon) { const parts = C.fromMulti(C.intersection(C.toMulti(o.polygon), ringM), 1).sort((x, y) => y.area_m2 - x.area_m2); const total = parts.reduce((s, x) => s + x.area_m2, 0); if (Math.abs(G.area(o.polygon) - total) > 1 || parts.length !== 1) out.zones.push({ id: o.id, label: o.label, removed: !parts[0], after: parts[0] ? parts[0].polygon : null }); }
  }
  return out;
}
export function applyConcept(project, ring) {
  const c = project.site.concept; const ck = check(ring, { min_area: 150, min_edge: 1, unit: 'sketch' }); if (!ck.ok) return { ok: false, reasons: ck.reasons };
  const imp = conceptImpact(c, ring); if (imp.blockers.length) return { ok: false, reasons: imp.blockers };
  M.snapshotSite(project, 'sketch outline shaped', { outline: true });
  for (const z of imp.zones) { const o = c.objects.find(x => x.id === z.id); if (!o) continue; if (z.removed) CM.remove(c, o.id); else { o.polygon = z.after.map(p => [G.round(p[0], 1), G.round(p[1], 1)]); o.extent_status = 'suggested'; } }
  CM.setOutline(c, ring); return { ok: true, impact: imp, frame: c.frame };
}
/** the outline a stated size gives: the sketch's shaped outline stretched to w × h, or the plain rectangle. Same corners, same order. */
export function outline(project, w, h) { const c = project.site.concept; const o = c && CM.isUsable(project.site) ? CM.outlineMetres(c, w, h) : null; if (o) { const ck = check(o); if (ck.ok) { project.site.boundary_source = `the outline you shaped in the sketch (${o.length} corners), stretched to ${w} × ${h} m`; return o; } } return G.polygonFromRect(w, h); }

/** one line for "what the model knows": what kind of outline this is, in words */
export function outlineWord(site, sketch) {
  const isRect = r => r.length === 4 && (b => r.every(p => (p[0] === b.minx || p[0] === b.maxx) && (p[1] === b.miny || p[1] === b.maxy)))(G.bbox(r));
  if (site.boundary) return isRect(site.boundary) ? (/^user/.test(site.boundary_status) ? 'a rectangle from the size you gave' : 'follows the sketch proportions') : `${site.boundary.length} corners, ${/shaped/.test(site.boundary_source || '') ? 'shaped by you' : 'as drawn'}`;
  if (sketch) return sketch.frame?.outline ? `${sketch.frame.outline.length} corners, shaped by you · no size yet` : 'a 3 : 2 stand-in';
  return 'not drawn';
}

// ---------------------------------------------------------------- the editing session (S.be) and its UI
let X = null;   // { S, update, renderCanvas, ensureProposal, acceptLayout, undoShape, resetProject, setStage, generate, handleSay, cur, checkStop }
export const active = () => !!X?.S.be;
const sketching = () => CM.isActive(X.S.project.site);
const snapTo = (st, p) => st.concept ? [G.round(Math.max(0, p[0]), 0), G.round(Math.max(0, p[1]), 0)] : st.snap === false ? [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000] : [Math.round(p[0] * 20) / 20, Math.round(p[1] * 20) / 20];   // 5 cm on a measured site (the default; it can be switched off: then 1 mm); whole sketch units on a sketch
const defSize = st => { if (st.sel == null) return 0; const room = cornerRoom(st.ring, st.sel); return st.concept ? Math.max(4, Math.round(room * .6)) : Math.max(.2, Math.min(1.5, Math.floor(room * .6 * 10) / 10)); };

export function begin() {
  const S = X.S, site = S.project.site; const concept = sketching();
  if (!concept && !site.boundary) return false;
  const ring = concept ? CM.outlineOf(site.concept) : cp(site.boundary);
  S.be = { concept, ring, base: cp(ring), sel: null, hist: [], redo: [], drag: null, review: false, msg: null, size: null, snap: S.beSnap !== false, okRemove: false }; S.tool = 'outline'; S.sel = null; S.conceptSel = null; S.editBed = null; S.draft = [];
  X.update(); sync(); return true;
}
const changed = st => JSON.stringify(st.ring) !== JSON.stringify(st.base);
function push(st) { st.hist.push(cp(st.ring)); if (st.hist.length > 60) st.hist.shift(); st.redo = []; st.review = false; st.msg = null; st.okRemove = false; }
export function undo() { const st = X.S.be; if (!st?.hist.length) return; st.redo.push(cp(st.ring)); st.ring = st.hist.pop(); st.sel = null; st.review = false; st.okRemove = false; sync(); }
export function redo() { const st = X.S.be; if (!st?.redo.length) return; st.hist.push(cp(st.ring)); st.ring = st.redo.pop(); st.sel = null; st.review = false; st.okRemove = false; sync(); }
export function cancel() { const S = X.S; if (!S.be) return; S.be = null; S.tool = 'select'; clearUi(); X.update(); }
/** one edit of the working copy, by name — the panel, the keyboard, the pointer and the replay all come through here */
export function edit(op, ...a) {
  const st = X.S.be; if (!st) return false; let r = null; const i = a[0];
  if (op === 'move') r = moveVertex(st.ring, i, snapTo(st, a[1]));
  else if (op === 'insert') { r = insertVertex(st.ring, i, a[1] ? snapTo(st, a[1]) : null); st.sel = i + 1; }
  else if (op === 'delete') { r = deleteVertex(st.ring, i); if (!r) { st.msg = 'An outline keeps at least 3 corners.'; sync(); return false; } st.sel = null; }
  else if (op === 'trim' || op === 'notch') { const room = cornerRoom(st.ring, i); const d = Math.min(a[1] ?? defSize(st), room * (op === 'trim' ? 1.9 : 1.9)); if (!(d > 0)) return false; r = op === 'trim' ? trimCorner(st.ring, i, d) : notchCorner(st.ring, i, d, a[2] ?? d); r = r.map(p => st.concept ? [G.round(p[0], 1), G.round(p[1], 1)] : G.roundPt(p)); st.sel = op === 'notch' ? i + 1 : null; }
  else if (op === 'set') r = a[0].map(p => [p[0], p[1]]);
  if (!r) return false; push(st); st.ring = r; sync(); return true;
}
const verdict = st => { const ck = st.concept ? check(st.ring, { min_area: 150, min_edge: 1, unit: 'sketch' }) : check(st.ring); const imp = !ck.ok ? null : st.concept ? conceptImpact(X.S.project.site.concept, st.ring) : impact(X.S.project, st.ring); return { ck, imp, reasons: [...ck.reasons, ...(imp?.blockers || [])] }; };
/** Apply. With beds or zones in the way the first press only opens the review; the second commits. */
export function commit({ confirm = false } = {}) {
  const S = X.S, st = S.be; if (!st) return { ok: false }; const { imp, reasons } = verdict(st);
  if (reasons.length) { st.msg = null; sync(); return { ok: false, reasons }; }
  if (!changed(st)) { cancel(); return { ok: true, unchanged: true }; }
  const touches = st.concept ? imp.zones.length : imp.touches + (imp.plants_outside ? 1 : 0);
  if (touches && !st.review && !confirm) { st.review = true; sync(); return { ok: false, review: true, impact: imp }; }
  /* V4.3 · a bed that the new outline would leave too small is never dropped in passing: the review names it and Apply waits for the user's own tick */
  const going = st.concept ? [] : imp.beds.filter(b => b.removed); if (going.length && !st.okRemove && !confirm) { st.review = true; st.msg = null; sync(); return { ok: false, review: true, impact: imp, needs_removal_confirm: going.map(b => b.name) }; }
  const p = S.project; const res = st.concept ? applyConcept(p, st.ring) : apply(p, st.ring, imp);
  if (!res.ok) { sync(); return res; }
  const n = st.ring.length;
  if (st.concept) M.say(p, 'sys', `sketch outline shaped: ${n} corners${imp.zones.length ? `; ${imp.zones.map(z => `${z.label} ${z.removed ? 'removed (outside)' : 'trimmed to the outline'}`).join('; ')}` : ''}. Still a sketch: no size, no area.`);
  else M.say(p, 'sys', `site outline changed: ${n} corners, ${imp.site.before_m2} → ${imp.site.after_m2} m²${imp.beds.length ? `; ${imp.beds.map(b => b.removed ? `${b.name} removed (${b.why})` : `${b.name} clipped ${b.before_m2} → ${b.after_m2} m²`).join('; ')}` : ''}${imp.zones.length ? `; ${imp.zones.map(z => `${z.label} ${z.removed ? 'removed (outside)' : 'trimmed'}`).join('; ')}` : ''}${imp.version ? '. The arrangement was made for the outline before this change: it is kept as it was and needs generating again.' : ''}`);
  S.be = null; S.tool = 'select'; S.sel = null; clearUi(); if (!st.concept) { S.pz = { x: 0, y: 0, k: 1 }; X.ensureProposal(); } X.update(); return res;
}
/** setTool passes through here: 'outline' opens a session, any other tool closes one without applying it */
export function toolHook(t) { if (!X) return false; if (t === 'outline') { if (!X.S.be && !begin()) { M.say(X.S.project, 'sys', 'there is no outline to edit yet: give the site a size or draw the boundary first'); X.S.tool = 'select'; X.update(); } return true; } if (X.S.be) { X.S.be = null; clearUi(); } return false; }

// ---- overlay on the plan
const NS = 'http://www.w3.org/2000/svg';
function clearUi() { document.getElementById('be-ov')?.remove(); document.getElementById('be-panel')?.remove(); document.getElementById('shape-side')?.classList.remove('be-on'); document.getElementById('svg')?.classList.remove('be-on'); document.body.classList.remove('be-editing'); }
function draw() {
  const S = X.S, st = S.be; const svg = document.getElementById('svg'); if (!svg) return; let g = document.getElementById('be-ov');
  if (!st || S.stage !== 'site' || !S.T) { g?.remove(); svg.classList.remove('be-on'); return; }
  if (!g || g.parentNode !== svg) { g = document.createElementNS(NS, 'g'); g.id = 'be-ov'; }
  const P = p => S.T.toPx(p); const pts = r => r.map(p => P(p).map(v => v.toFixed(1)).join(',')).join(' '); const { ck, imp, reasons } = verdict(st); const bad = reasons.length > 0; const n = st.ring.length; let h = '';
  if (changed(st)) h += `<polygon class="be-base" points="${pts(st.base)}"/>`;
  if (imp && !st.concept) for (const b of imp.beds) for (const c of b.cut) h += `<polygon class="be-cut" points="${pts(c)}"/>`;
  h += `<polygon class="be-ring ${bad ? 'bad' : ''}" points="${pts(st.ring)}"/>`;
  if (!st.concept) for (let i = 0; i < n; i++) { const a = st.ring[i], b = st.ring[(i + 1) % n]; const L = G.dist(a, b); const pa = P(a), pb = P(b); if (Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) < 64) continue; const mid = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2]; const nx = -(pb[1] - pa[1]), ny = pb[0] - pa[0]; const nl = Math.hypot(nx, ny) || 1; const cen = P(G.centroid(st.ring)); const sgn = ((mid[0] - cen[0]) * nx + (mid[1] - cen[1]) * ny) >= 0 ? 1 : -1; h += `<text class="be-len" x="${(mid[0] + sgn * nx / nl * 26).toFixed(1)}" y="${(mid[1] + sgn * ny / nl * 22 + 4).toFixed(1)}" text-anchor="middle">${G.round(L, 2)} m</text>`; }
  for (let i = 0; i < n; i++) { const a = P(st.ring[i]), b = P(st.ring[(i + 1) % n]); if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 44) continue; h += `<g class="be-mid" data-be-m="${i}" tabindex="0" role="button" aria-label="add a corner on the edge after corner ${i + 1}"><circle cx="${((a[0] + b[0]) / 2).toFixed(1)}" cy="${((a[1] + b[1]) / 2).toFixed(1)}" r="11" class="hit"/><circle cx="${((a[0] + b[0]) / 2).toFixed(1)}" cy="${((a[1] + b[1]) / 2).toFixed(1)}" r="4.5"/><title>drag or press Enter to add a corner here</title></g>`; }
  for (let i = 0; i < n; i++) { const c = P(st.ring[i]); h += `<g class="be-v ${st.sel === i ? 'on' : ''}" data-be-v="${i}" tabindex="0" role="button" aria-pressed="${st.sel === i}" aria-label="corner ${i + 1} of ${n}${st.concept ? '' : ` at ${G.round(st.ring[i][0], 2)}, ${G.round(st.ring[i][1], 2)} m`}"><circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="14" class="hit"/><circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="6.5"/><text x="${(c[0] + 11).toFixed(1)}" y="${(c[1] - 10).toFixed(1)}">${i + 1}</text></g>`; }
  g.innerHTML = h; if (g.parentNode !== svg || svg.lastElementChild !== g) { busy = true; svg.appendChild(g); busy = false; } svg.classList.add('be-on');
  void ck;
}
// ---- panel in the inspector
function panel() {
  const S = X.S, st = S.be; const side = document.getElementById('shape-side'); if (!side) return; let el = document.getElementById('be-panel');
  if (!st || S.stage !== 'site') { el?.remove(); side.classList.remove('be-on'); document.body.classList.remove('be-editing'); return; }
  const keep = document.activeElement?.closest?.('#be-panel') ? (document.activeElement.dataset.beKey || null) : null;
  if (!el || el.parentNode !== side) { el = document.createElement('div'); el.id = 'be-panel'; }
  const { imp, reasons } = verdict(st); const n = st.ring.length; const sel = st.sel; const size = st.size ?? defSize(st); const room = sel != null ? cornerRoom(st.ring, sel) : 0; const u = st.concept ? '' : ' m';
  const head = st.concept ? `<p class="be-lede">A sketch, not to scale. Shape the outline here; lengths and areas appear once you give the site a size.</p>` : `<p class="be-lede">${n} corners · <b>${G.round(G.area(st.ring), 1)} m²</b>${changed(st) ? ` <span class="be-was">was ${G.round(G.area(st.base), 1)} m²</span>` : ''}</p>`;
  const tools = `<div class="be-tools" role="group" aria-label="change the selected corner">
      <button class="btn small" data-be="trim" data-be-key="trim" ${sel == null ? 'disabled' : ''} title="cut the corner off with a diagonal edge">Trim corner</button>
      <button class="btn small" data-be="notch" data-be-key="notch" ${sel == null ? 'disabled' : ''} title="cut a notch into the corner: an L-shaped outline">Notch corner</button>
      <button class="btn small" data-be="delete" data-be-key="delete" ${sel == null || n <= 3 ? 'disabled' : ''} title="${n <= 3 ? 'an outline keeps at least 3 corners' : 'remove the selected corner'}">Delete corner</button>
      ${sel != null ? `<label class="be-size">by <input type="number" data-be-size data-be-key="size" min="${st.concept ? 1 : 0.1}" step="${st.concept ? 1 : 0.1}" max="${G.round(room * 1.9, st.concept ? 0 : 1)}" value="${size}" aria-label="${st.concept ? 'size of the cut, in sketch units (not metres)' : 'size of the cut in metres'}">${st.concept ? '<span>sketch units</span>' : '<span>m</span>'}</label>` : ''}
    </div><p class="be-hint">${sel == null ? 'Click a corner to select it. Drag a corner to move it; drag a small dot on an edge to add a corner there.' : `Corner ${sel + 1} selected. Arrow keys nudge it, Delete removes it.`}</p>`;
  const rows = st.ring.map((p, i) => `<tr class="${sel === i ? 'on' : ''}"><th scope="row"><button class="link" data-be-pick="${i}" data-be-key="pick${i}" aria-label="select corner ${i + 1}">${i + 1}</button></th><td><input type="number" step="${st.concept ? 1 : 0.05}" value="${G.round(p[0], st.concept ? 1 : 2)}" data-be-xy="${i}|0" data-be-key="x${i}" aria-label="corner ${i + 1}, across${u}"></td><td><input type="number" step="${st.concept ? 1 : 0.05}" value="${G.round(p[1], st.concept ? 1 : 2)}" data-be-xy="${i}|1" data-be-key="y${i}" aria-label="corner ${i + 1}, up${u}"></td></tr>`).join('');
  const table = `<details class="be-pts" ${st.ptsOpen ? 'open' : ''}><summary data-be-key="pts">Corners as numbers</summary><table><thead><tr><th scope="col">#</th><th scope="col">across${st.concept ? '' : ' (m)'}</th><th scope="col">up${st.concept ? '' : ' (m)'}</th></tr></thead><tbody>${rows}</tbody></table>${st.concept ? '<p class="be-hint">Sketch units — proportions only, not metres.</p>' : '<p class="be-hint">Metres from the south-west corner of the plan.</p>'}</details>`;
  let status = '', removal = '';
  if (reasons.length) status = `<div class="be-status bad" role="alert"><b>This outline cannot be applied.</b><ul>${reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul><p>Move a corner, or step back with Undo.</p></div>`;
  else if (st.msg) status = `<div class="be-status note" role="status">${esc(st.msg)}</div>`;
  else if (!changed(st)) status = '';
  else if (st.concept) status = imp.zones.length ? `<div class="be-status warn"><b>${st.review ? 'Applying will also change' : 'In the way'}</b><ul>${imp.zones.map(z => `<li><b>${esc(z.label)}</b> ${z.removed ? 'falls outside the outline and would be removed' : 'reaches past the outline and would be trimmed to it'}</li>`).join('')}</ul></div>` : '';
  else {
    const li = [];
    for (const b of imp.beds) li.push(`<li data-be-bed="${esc(b.bed_id)}"><b>${esc(b.name)}</b>${b.confirmed ? ' <span class="be-tag">confirmed</span>' : ''} ${b.removed ? `would be removed: ${esc(b.why)}` : `${b.before_m2} → <b>${b.after_m2} m²</b> (${b.lost_m2} m² of bed lost)${b.pieces > 1 ? ' · the outline splits it; the larger part is kept' : ''}`}</li>`);
    for (const z of imp.zones) li.push(`<li><b>${esc(z.label)}</b> ${z.removed ? 'falls outside and would be removed' : `${z.before_m2} → ${z.after_m2} m², trimmed to the outline`}</li>`);
    if (imp.version) li.push(`<li class="be-stale"><b>Planting</b> ${imp.plants_outside ? `${imp.plants_outside} of ${imp.version.plants} plants would stand outside the outline. ` : ''}The arrangement was made for the outline as it is now. It stays as an old version until you generate again.</li>`);
    if (imp.resuggest) li.push('<li>The suggested beds are worked out again for the new outline.</li>');
    const going = imp.beds.filter(b => b.removed); removal = going.length ? `<div class="be-status bad be-remove" data-be-remove role="alert"><b>${going.length === 1 ? 'One bed' : `${going.length} beds`} would be removed by this outline.</b><ul>${going.map(b => `<li><b>${esc(b.name)}</b>, ${b.before_m2} m² now: ${esc(b.why)}.</li>`).join('')}</ul><p>A removed bed takes its planting choices with it. Undo brings it back.</p>${st.review ? `<label class="be-ok"><input type="checkbox" data-be-okremove data-be-key="okremove" ${st.okRemove ? 'checked' : ''}> Remove ${going.length === 1 ? esc(going[0].name) : 'these beds'} and apply</label>` : ''}</div>` : '';
    status = li.length ? `<div class="be-status ${imp.touches || imp.plants_outside ? 'warn' : 'note'}" ${st.review ? 'role="alert"' : ''}><b>${st.review ? 'Applying this outline will' : imp.touches ? 'In the way of this outline' : 'What follows'}</b><ul>${li.join('')}</ul>${imp.touches ? `<p>Site ${imp.site.before_m2} → ${imp.site.after_m2} m² · ${imp.lost_m2} m² of planting bed lost. Nothing is changed until you apply.</p>` : ''}</div>` : `<div class="be-status ok" role="status">Site ${imp.site.before_m2} → ${imp.site.after_m2} m². No bed or open area is touched.</div>`;
  }
  const dirty = changed(st); const blocked = reasons.length > 0;
  const needOk = !!removal && !st.okRemove; const actions = st.review && !blocked ? `<button class="btn primary" data-be="apply" data-be-key="apply" ${needOk ? 'disabled title="tick the box above first"' : ''}>Apply and clip</button><button class="btn" data-be="keep" data-be-key="keep">Keep editing</button>` : `<button class="btn primary" data-be="apply" data-be-key="apply" ${!dirty || blocked ? 'disabled' : ''}>${!st.concept && imp && (imp.touches || imp.plants_outside) ? 'Review changes' : 'Apply outline'}</button><button class="btn" data-be="cancel" data-be-key="cancel">Cancel</button>`;
  el.innerHTML = `<div class="insp-kind">Site outline · editing</div><h3>${st.concept ? 'Shape the sketch' : 'Edit outline'}</h3>${head}${st.review ? '' : tools}
    <div class="be-undo"><button class="btn small ghost" data-be="undo" data-be-key="undo" ${st.hist.length ? '' : 'disabled'}>Undo</button><button class="btn small ghost" data-be="redo" data-be-key="redo" ${st.redo.length ? '' : 'disabled'}>Redo</button><span>${st.hist.length ? `${st.hist.length} step${st.hist.length === 1 ? '' : 's'} in this edit` : 'nothing changed yet'}</span></div>
    ${st.concept || st.review ? '' : `<label class="be-snap"><input type="checkbox" data-be-snap data-be-key="snap" ${st.snap !== false ? 'checked' : ''}> Snap corners to 5 cm<span>${st.snap !== false ? 'on' : 'off: corners land to the millimetre'}</span></label>`}
    ${status}${removal}${st.review ? '' : table}<div class="be-actions">${actions}</div>`;
  if (el.parentNode !== side || side.firstElementChild !== el) { busy = true; side.prepend(el); busy = false; } side.classList.add('be-on'); document.body.classList.add('be-editing');
  if (keep) el.querySelector(`[data-be-key="${keep}"]`)?.focus();
}
let busy = false;
export function sync() { if (!X) return; draw(); panel(); const hint = document.getElementById('site-hint'); if (hint && X.S.be && X.S.stage === 'site') hint.textContent = X.S.be.review ? 'Red: the parts of beds the outline would cut off.' : 'Drag a corner · a dot on an edge adds one'; }

function pointer() {
  const svg = document.getElementById('svg'); const mp = ev => { const r = svg.getBoundingClientRect(); return X.S.T ? X.S.T.toM([ev.clientX - r.left, ev.clientY - r.top]) : null; };
  const on = () => X.S.be && X.S.stage === 'site'; const stop = ev => { ev.stopImmediatePropagation(); ev.preventDefault(); };
  svg.addEventListener('pointerdown', ev => {
    if (!on() || ev.button !== 0) return; const st = X.S.be; if (st.review) { stop(ev); return; }
    const v = ev.target.closest?.('[data-be-v]'), m = ev.target.closest?.('[data-be-m]'); stop(ev);
    if (v) { st.sel = +v.dataset.beV; st.size = null; st.drag = { i: st.sel, from: cp(st.ring), moved: false }; try { svg.setPointerCapture(ev.pointerId); } catch { /* synthetic */ } sync(); return; }
    if (m) { const at = mp(ev); const i = +m.dataset.beM; const from = cp(st.ring); st.ring = insertVertex(st.ring, i, at ? snapTo(st, at) : null); st.sel = i + 1; st.size = null; st.drag = { i: i + 1, from, moved: true, inserted: true }; try { svg.setPointerCapture(ev.pointerId); } catch { /* synthetic */ } sync(); return; }
    if (st.sel != null) { st.sel = null; st.size = null; sync(); }
  }, true);
  svg.addEventListener('pointermove', ev => { if (!on() || !X.S.be.drag) return; stop(ev); const st = X.S.be, at = mp(ev); if (!at) return; const q = snapTo(st, at); const c = st.ring[st.drag.i]; if (c[0] === q[0] && c[1] === q[1]) return; st.ring = moveVertex(st.ring, st.drag.i, q); st.drag.moved = true; draw(); }, true);
  const up = ev => { if (!on() || !X.S.be.drag) return; stop(ev); const st = X.S.be, d = st.drag; st.drag = null; if (d.moved) { st.hist.push(d.from); st.redo = []; st.review = false; st.msg = null; } sync(); };
  svg.addEventListener('pointerup', up, true); svg.addEventListener('pointercancel', up, true);
  svg.addEventListener('dblclick', ev => { if (on()) stop(ev); }, true);
  svg.addEventListener('keydown', ev => {
    if (!on()) return; const st = X.S.be; const v = ev.target.closest?.('[data-be-v]'), m = ev.target.closest?.('[data-be-m]'); if (!v && !m) return;
    if (m && (ev.key === 'Enter' || ev.key === ' ')) { stop(ev); edit('insert', +m.dataset.beM); svg.querySelector(`[data-be-v="${st.sel}"]`)?.focus(); return; }
    if (!v) return; const i = +v.dataset.beV; const step = (st.concept ? 1 : .1) * (ev.shiftKey ? 5 : 1); const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[ev.key];
    if (d) { stop(ev); st.sel = i; const p = st.ring[i]; edit('move', i, [p[0] + d[0], p[1] + d[1]]); svg.querySelector(`[data-be-v="${i}"]`)?.focus(); }
    else if (ev.key === 'Enter' || ev.key === ' ') { stop(ev); st.sel = i; st.size = null; sync(); svg.querySelector(`[data-be-v="${i}"]`)?.focus(); }
    else if (ev.key === 'Delete' || ev.key === 'Backspace') { stop(ev); edit('delete', i); }
  }, true);
  document.addEventListener('keydown', ev => {
    if (!on()) return; const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName || '');
    if (ev.key === 'Escape' && !typing) { ev.stopImmediatePropagation(); ev.preventDefault(); const st = X.S.be; if (st.review) { st.review = false; sync(); } else if (st.sel != null) { st.sel = null; sync(); } else cancel(); }
    else if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'z' && !typing) { ev.stopImmediatePropagation(); ev.preventDefault(); if (ev.shiftKey) redo(); else undo(); }
  }, true);
  document.addEventListener('click', ev => {
    const t = ev.target.closest?.('[data-be],[data-be-pick],[data-be-deepen]'); if (!t) return;
    if (t.dataset.beDeepen) { ev.stopImmediatePropagation(); ev.preventDefault(); deepen(t.dataset.beDeepen); return; }
    if (!on()) return; ev.stopImmediatePropagation(); ev.preventDefault(); const st = X.S.be; const a = t.dataset.be;
    if (t.dataset.bePick != null) { st.sel = +t.dataset.bePick; st.size = null; sync(); return; }
    if (a === 'trim' || a === 'notch') { if (st.sel != null) { const s = st.size ?? defSize(st); st.size = null; edit(a, st.sel, s); } }
    else if (a === 'delete') { if (st.sel != null) edit('delete', st.sel); }
    else if (a === 'undo') undo(); else if (a === 'redo') redo(); else if (a === 'cancel') cancel(); else if (a === 'keep') { st.review = false; sync(); } else if (a === 'apply') commit();
  }, true);
  document.addEventListener('change', ev => {
    if (!on()) return; const t = ev.target; const st = X.S.be;
    if (t.dataset?.beSnap !== undefined) { st.snap = t.checked; X.S.beSnap = t.checked; sync(); return; }
    if (t.dataset?.beOkremove !== undefined) { st.okRemove = t.checked; sync(); return; }
    if (t.dataset?.beSize !== undefined) { const v = parseFloat(t.value); if (v > 0) st.size = v; return; }
    if (t.dataset?.beXy) { const [i, k] = t.dataset.beXy.split('|').map(Number); const v = parseFloat(t.value); if (!Number.isFinite(v)) { sync(); return; } const p = [...st.ring[i]]; p[k] = v; st.sel = i; st.ptsOpen = true; edit('move', i, p); }
  }, true);
  document.addEventListener('toggle', ev => { if (on() && ev.target.classList?.contains('be-pts')) X.S.be.ptsOpen = ev.target.open; }, true);
  // the app redraws the plan and the inspector by replacing their content: the handles and the panel are put back after each redraw
  new MutationObserver(() => { if (!busy && X.S.be && !document.getElementById('be-ov')) draw(); }).observe(svg, { childList: true });
  const side = document.getElementById('shape-side'); if (side) new MutationObserver(() => { if (!busy && X.S.be && !document.getElementById('be-panel')) panel(); }).observe(side, { childList: true });
}
export function install(ctx) { X = ctx; if (typeof document !== 'undefined' && document.getElementById('svg')) pointer(); return true; }

// ---------------------------------------------------------------- Screen: what a second row would take (the engine's row plan, this bed)
/** the Compose note under a disabled "double": how deep this bed would have to be, and what deepening it costs — computed, not promised.
 *  `plan` is the engine's row plan of the bed's Screen edge (E.rowPlan through generate): staggered_row.needs_depth_m is for this
 *  bed's own lead and inner species, so a mixed row asks for more than a single-species one. */
export function deepenOffer(project, bed, plan) {
  const need = plan?.staggered_row?.needs_depth_m; if (!bed || !(need > 0) || !(plan.depth_m >= 0) || plan.staggered_row?.feasible) return '';
  const by = Math.ceil((need - plan.depth_m) * 10) / 10; if (!(by > 0)) return '';
  let cost = ''; let ok = false;
  try { const pv = SP.bedEditPreview(project, { op: 'resize', target: { bed_id: bed.id }, direction: 'deeper', amount_m: by }); const c = pv.ok ? pv.changes.find(x => x.bed_id === bed.id) : null;
    if (c) { const gain = r2(c.after.area_m2 - c.before.area_m2); const reach = c.after.min_width_m; ok = gain > 0.05; const short = reach + 0.005 < need;
      cost = `${by} m deeper, the bed would go ${c.before.area_m2} → ${c.after.area_m2} m² and take ${gain} m² of the ground that is free now${short ? `; it would still be ${reach} m at its narrowest, so the second row may not fit everywhere` : ''}${pv.conflicts.length ? `. ${pv.conflicts.map(x => x.text).join(' ')}` : ''}`; }
    else cost = pv.conflicts.map(x => x.text).join(' ') || 'the bed cannot be made deeper where it is'; } catch { cost = ''; }
  return `<div class="be-deepen" data-be-deepen-offer="${esc(bed.id)}"><p>A second row needs <b>${need} m</b> of depth for this row of plants; the bed has ${plan.depth_m} m.${cost ? ` ${esc(cost)}.` : ''}</p>${ok ? `<button class="btn small" data-be-deepen="${esc(bed.id)}" data-need="${need}" data-by="${by}">Preview a bed ${by} m deeper</button>` : ''}</div>`;
}
/** the offer taken: the same spatial edit a typed "make the bed deeper" runs — it opens as a preview in Shape; nothing is applied here */
export async function deepen(bedId) {
  const S = X.S, p = S.project; const bed = p.site.beds.find(b => b.id === bedId); const btn = document.querySelector(`[data-be-deepen="${CSS.escape(bedId)}"]`); const by = parseFloat(btn?.dataset.by), need = parseFloat(btn?.dataset.need); if (!bed || !(by > 0)) return null;
  const req = { op: 'resize', target: { bed_id: bed.id }, direction: 'deeper', amount_m: by, amount_basis: `what a staggered second row needs on this bed: ${need} m of depth, from the engine's row plan` };
  const pv = SP.bedEditPreview(p, req); pv.impact = SP.designImpact(X.cur(), pv);
  S.bedCmd = { utterance: `make the ${bed.name} ${by} m deeper, for a second Screen row`, request: req, provenance: 'Compose · Rows', evidence: [{ rule: 'engine row plan', text: `needs ${need} m` }] }; S.bedPreview = pv.ok ? pv : null;
  M.say(p, 'ai', '', { html: pv.ok ? `<b>Proposed change — preview, nothing applied yet.</b> ${esc(bed.name)} ${by} m deeper, so that a staggered second row fits (${need} m of depth).<ul>${pv.changes.map(c => `<li>${esc(c.name)}: ${c.before.area_m2} → ${c.after.area_m2} m² (narrowest ${c.after.min_width_m} m)</li>`).join('')}${pv.conflicts.map(c => `<li class="warn">${esc(c.text)}</li>`).join('')}</ul>Apply it in Shape, or cancel: the bed stays as it is.` : `<b>No change made.</b> ${esc(pv.conflicts.map(c => c.text).join(' '))}`, mode: 'geometry: spatial engine' });
  X.setStage('site'); X.update(); return { request: req, preview: pv };
}

// ---------------------------------------------------------------- replay: ?script=v42shape[&fresh=1][&stop=…]
/** An irregular site, driven through the same session the pointer drives. Every figure is read back from the project or the engine.
 *    A  sketch      a description without a size → the sketch outline gets a notch → no metre, area or count anywhere → a size is said →
 *                   the same corners arrive in metres
 *    B  measured    8 × 6 m → layout accepted → the north-east corner is trimmed (five corners) → review, keep editing, apply → two corners
 *                   are dragged in to an L → a keep-out in the inner corner → outlines that are refused, with their reasons → undo / redo →
 *                   generate → every plant inside the outline and its bed → saved and read back identical → a further trim marks the arrangement old
 *    C  Screen depth   a 6 × 4 m garden whose north bed is too shallow for a second row: Compose says what the engine's row plan needs for this
 *                      bed and offers a preview of a deeper bed; nothing is applied by the offer
 *  stops: sketch | sketch-metric | rect | trim | review | pentagon | lshape | keepout | refused | generated | stale | depth | deepen */
export async function script(out) {
  const S = X.S; const tick = (ms = 80) => new Promise(r => setTimeout(r, ms)); const k = out.v42shape = {}; const stop = X.checkStop;
  const page = () => ({ panel: document.getElementById('be-panel')?.innerText.replace(/\s+/g, ' ').trim() || null, handles: document.querySelectorAll('#be-ov [data-be-v]').length, mids: document.querySelectorAll('#be-ov [data-be-m]').length, overflow_x: document.documentElement.scrollWidth - innerWidth, apply: (b => b ? { text: b.textContent.trim(), disabled: b.disabled, visible: (r => r.width > 0 && r.bottom <= innerHeight + 1 && r.top >= 0)(b.getBoundingClientRect()) } : null)(document.querySelector('#be-panel [data-be="apply"]')) });
  const bedsNow = () => M.activeBeds(S.project).map(b => ({ id: b.id, name: b.name, status: b.status, area_m2: b.area_m2, n: b.polygon.length, inside: C.containsShape(C.toMulti(S.project.site.boundary), C.toMulti(b.polygon, b.holes)) }));
  const say = async t => { const f = document.getElementById('say1'); f.value = t; document.getElementById('site-form').requestSubmit(); await tick(250); };
  // ---- A · the sketch
  X.resetProject('V4.2 sketch outline', 'script-v42shape-a'); document.getElementById('say0').value = 'I have a backyard with an old tree on the north side. I want privacy along the north edge and an open centre.'; document.getElementById('welcome-form').requestSubmit(); await tick(300);
  const a = k.sketch = { concept: CM.isActive(S.project.site), boundary: S.project.site.boundary, frame0: { ...S.project.site.concept.frame } };
  X.setStage('site', { scroll: false }); X.update(); await tick(120); a.began = begin(); a.corners0 = S.be.ring.length;
  const ne = S.be.ring.findIndex(p => p[0] === Math.max(...S.be.ring.map(q => q[0])) && p[1] === Math.max(...S.be.ring.map(q => q[1])));
  S.be.sel = ne; edit('notch', ne, 24, 18); a.corners1 = S.be.ring.length; a.page_editing = page();
  a.metric_text_while_editing = /\d\s*m²|\d\s*m\b/.test(a.page_editing.panel || ''); stop('sketch');
  a.commit = (r => ({ ok: r.ok, review: !!r.review }))(commit()); if (S.be) a.commit2 = commit().ok; await tick(120);
  a.frame = JSON.parse(JSON.stringify(S.project.site.concept.frame)); a.still_concept = CM.isActive(S.project.site); a.boundary_after = S.project.site.boundary;
  a.side_text = document.getElementById('shape-side')?.innerText.replace(/\s+/g, ' ').slice(0, 1500); a.metric_text_in_sketch = /\d\s*m²/.test(a.side_text || ''); a.versions = S.project.versions.length;
  await say('The site is 8 by 6 m.'); a.metric = { boundary: S.project.site.boundary, status: S.project.site.boundary_status, source: S.project.site.boundary_source || null, corners: S.project.site.boundary?.length, area_m2: S.project.site.boundary ? r2(G.area(S.project.site.boundary)) : null, bbox: S.project.site.boundary ? G.bbox(S.project.site.boundary) : null, tree_inside: S.project.site.features.filter(f => f.kind === 'existing-tree').every(f => G.pointInPolygon(f.position_m, S.project.site.boundary)), beds: bedsNow() };
  a.same_topology = a.metric.corners === a.frame.outline?.length; stop('sketch-metric');
  // ---- B · a measured site
  X.resetProject('V4.2 irregular site', 'script-v42shape'); document.getElementById('say0').value = 'I have a 8 × 6 m backyard. I want privacy along the north edge and an open centre.'; document.getElementById('welcome-form').requestSubmit(); await tick(300);
  X.setStage('site', { scroll: false }); X.update(); await tick(120); X.acceptLayout(); await tick(120);
  const b = k.metric = { rect: { boundary: cp(S.project.site.boundary), area_m2: r2(G.area(S.project.site.boundary)), beds: bedsNow() } }; stop('rect');
  const corner = (ring, sx, sy) => { const B = G.bbox(ring); const t = [sx > 0 ? B.maxx : B.minx, sy > 0 ? B.maxy : B.miny]; let best = 0; ring.forEach((p, i) => { if (G.dist(p, t) < G.dist(ring[best], t)) best = i; }); return best; };
  // trim the north-east corner: a pentagon
  begin(); S.be.sel = corner(S.be.ring, 1, 1); edit('trim', S.be.sel, 1.5); b.trim = { corners: S.be.ring.length, ring: cp(S.be.ring), page: page() }; stop('trim');
  const r1 = commit(); b.review = { opened: !!r1.review, applied: r1.ok, impact: r1.impact ? { beds: r1.impact.beds.map(x => ({ name: x.name, confirmed: x.confirmed, before_m2: x.before_m2, after_m2: x.after_m2, removed: x.removed })), lost_m2: r1.impact.lost_m2, site: r1.impact.site } : null, boundary_unchanged: JSON.stringify(S.project.site.boundary) === JSON.stringify(b.rect.boundary), beds_unchanged: JSON.stringify(bedsNow()) === JSON.stringify(b.rect.beds), page: page() }; stop('review');
  document.querySelector('#be-panel [data-be="keep"]')?.click(); await tick(60); b.kept_editing = { session: !!S.be, review: S.be?.review, boundary_unchanged: JSON.stringify(S.project.site.boundary) === JSON.stringify(b.rect.boundary) };
  cancel(); await tick(60); b.cancelled = { session: !!S.be, boundary_unchanged: JSON.stringify(S.project.site.boundary) === JSON.stringify(b.rect.boundary), beds_unchanged: JSON.stringify(bedsNow()) === JSON.stringify(b.rect.beds) };
  begin(); S.be.sel = corner(S.be.ring, 1, 1); edit('trim', S.be.sel, 1.5); commit(); const r2c = commit(); await tick(150);
  b.pentagon = { applied: r2c.ok, boundary: cp(S.project.site.boundary), corners: S.project.site.boundary.length, area_m2: r2(G.area(S.project.site.boundary)), status: S.project.site.boundary_status, beds: bedsNow(), history: S.project.site.history.length }; stop('pentagon');
  // an L: a corner on the south edge, a corner on the east edge, and the south-east corner dragged in to where they meet
  begin(); { const st = S.be; const se = corner(st.ring, 1, -1); const n = st.ring.length; const prev = (se - 1 + n) % n; const sIsPrev = st.ring[prev][1] === st.ring[se][1];   /* which neighbour lies along the south edge */
    const B = G.bbox(st.ring); const sx = B.maxx - 3, ey = B.miny + 2;
    if (sIsPrev) { edit('insert', prev, [sx, B.miny]); const se2 = se + 1; edit('insert', se2, [B.maxx, ey]); edit('move', se2, [sx, ey]); }
    else { edit('insert', se, [sx, B.miny]); edit('insert', prev, [B.maxx, ey]); edit('move', se + 1, [sx, ey]); }
    b.l_edit = { corners: st.ring.length, ring: cp(st.ring), steps: st.hist.length }; }
  undo(); undo(); b.session_undo = { corners: S.be.ring.length, redo_available: S.be.redo.length }; redo(); redo(); b.session_redo = { corners: S.be.ring.length, same: JSON.stringify(S.be.ring) === JSON.stringify(b.l_edit.ring) };
  let rl = commit(); if (rl.review) { b.l_review = { beds: rl.impact.beds.map(x => ({ name: x.name, before_m2: x.before_m2, after_m2: x.after_m2, removed: x.removed })), zones: rl.impact.zones.map(z => ({ label: z.label, removed: z.removed })) }; rl = commit(); } await tick(150);
  b.lshape = { applied: rl.ok, boundary: cp(S.project.site.boundary), corners: S.project.site.boundary.length, area_m2: r2(G.area(S.project.site.boundary)), concave: C.fromMulti(C.difference(C.toMulti(G.polygonFromRect(G.bbox(S.project.site.boundary).w, G.bbox(S.project.site.boundary).h, G.bbox(S.project.site.boundary).minx, G.bbox(S.project.site.boundary).miny)), C.toMulti(S.project.site.boundary))).length, beds: bedsNow() }; { X.update(); await tick(60); const ds = SP.deriveSite(S.project); const meta = document.querySelector('#shape-side [data-site-now]')?.textContent || ''; b.lshape.inspector = { text: meta, was: document.querySelector('#shape-side [data-site-was]')?.textContent || null, current: { site_m2: G.round(ds.site_m2, 1), plantable_m2: G.round(ds.plantable_m2, 1), bed_m2: G.round(M.activeBeds(S.project).reduce((t, x) => t + (x.area_m2 || 0), 0), 1) }, proposal_plantable_m2: S.project.site.proposals?.site?.plantable_m2 ?? null, stale: !!S.project.site.proposals?.stale }; } stop('lshape');
  // a keep-out in the inner corner
  { const B = G.bbox(S.project.site.boundary); const ix = B.maxx - 3, iy = B.miny + 2; M.snapshotSite(S.project, 'keep-out drawn'); M.addFeature(S.project, { kind: 'no-plant-zone', polygon: [[ix - 1.2, iy], [ix, iy], [ix, iy + 1], [ix - 1.2, iy + 1]].map(G.roundPt), label: 'keep clear (inner corner)', source: 'drawn on the canvas', status: 'user-drawn' }); X.ensureProposal(); X.update(); await tick(120);
    b.keepout = { zone: S.project.site.features.filter(f => f.kind === 'no-plant-zone').map(f => ({ label: f.label, inside: C.containsShape(C.toMulti(S.project.site.boundary), C.toMulti(f.polygon)) })), beds: bedsNow() }; } stop('keepout');
  // outlines that are refused (the project is not changed by any of them)
  { const before = JSON.stringify(S.project.site.boundary); const B = G.bbox(S.project.site.boundary); const tryRing = ring => { begin(); edit('set', ring); const pg = page(); const r = commit(); const res = { ok: r.ok, reasons: r.reasons || [], apply_disabled: pg.apply?.disabled, alert: !!document.querySelector('#be-panel .be-status.bad') }; cancel(); return res; };
    b.refused = { crossing: tryRing([[B.minx, B.miny], [B.maxx, B.maxy], [B.maxx, B.miny], [B.minx, B.maxy]]), two_corners: (() => { const c = check([[0, 0], [4, 0]]); return { ok: c.ok, reasons: c.reasons }; })(), cannot_delete_below_three: deleteVertex([[0, 0], [4, 0], [4, 3]], 0) === null, zero_area: tryRing([[B.minx, B.miny], [B.maxx, B.miny], [B.maxx / 2, B.miny + 0.001]]), tree_outside: null, unchanged: null };
    { const pj = JSON.parse(JSON.stringify(S.project)); pj.site.features.push({ id: 'tree-probe', kind: 'existing-tree', position_m: [B.minx + .6, B.maxy - .6], radius_m: null, label: 'existing tree' }); const ring = trimCorner(pj.site.boundary, corner(pj.site.boundary, -1, 1), 2); const im = impact(pj, ring); const ap = apply(pj, ring, im); b.refused.tree_outside = { ok: ap.ok, reasons: ap.reasons || [], boundary_unchanged: JSON.stringify(pj.site.boundary) === before }; }   /* on a copy of the project: a tree in the corner that the trim would cut off */
    b.refused.unchanged = JSON.stringify(S.project.site.boundary) === before; } stop('refused');
  // site undo / re-apply through the page's own Undo
  { const beforeUndo = JSON.stringify(S.project.site.boundary); X.undoShape(); await tick(80); X.undoShape(); await tick(80); b.site_undo = { boundary_back_to_pentagon: JSON.stringify(S.project.site.boundary) === JSON.stringify(b.pentagon.boundary), corners: S.project.site.boundary.length };
    begin(); edit('set', JSON.parse(beforeUndo)); let r = commit(); if (r.review) r = commit(); await tick(120); b.site_redo = { applied: r.ok, same: JSON.stringify(S.project.site.boundary) === beforeUndo };
    const B = G.bbox(S.project.site.boundary); const ix = B.maxx - 3, iy = B.miny + 2; M.snapshotSite(S.project, 'keep-out drawn'); M.addFeature(S.project, { kind: 'no-plant-zone', polygon: [[ix - 1.2, iy], [ix, iy], [ix, iy + 1], [ix - 1.2, iy + 1]].map(G.roundPt), label: 'keep clear (inner corner)', source: 'drawn on the canvas', status: 'user-drawn' }); X.ensureProposal(); X.update(); await tick(100); }
  // generate on the irregular site
  { document.getElementById('to-intent').click(); await tick(250); const v = await X.generate({ seed: 42 }); await tick(200); const ring = S.project.site.boundary; const zones = S.project.site.features.filter(f => f.kind === 'no-plant-zone');
    b.generated = v ? { version: v.id, plants: v.plant_objects.length, all_inside_outline: v.plant_objects.every(o => G.pointInPolygon(o.position_m, ring)), crowns_inside_outline: v.plant_objects.filter(o => G.distToBoundary(o.position_m, ring) < 0).length === 0, all_in_their_bed: v.plant_objects.every(o => { const bd = S.project.site.beds.find(x => x.id === o.bed_id); return bd && G.pointInShape(o.position_m, M.bedShape(bd)); }), in_keep_out: v.plant_objects.filter(o => zones.some(z => G.pointInPolygon(o.position_m, z.polygon))).length, beds: bedsNow(), stale: E.geometryImpact(S.project, v).stale, screen: S.project.site.beds.filter(bd => (bd.functions || []).some(f => f.function === 'z:screen')).map(bd => { const z = v.zones.find(x => x.kind === 'edge' && x.bed_id === bd.id); const ez = v.evaluation.edge_zones.find(x => x.bed_id === bd.id); return { bed: bd.name, polygon: bd.polygon, placed: v.plant_objects.filter(o => o.bed_id === bd.id && /^screen/.test(o.role)).length, covered_m: ez?.covered_m ?? null, edge_length_m: ez?.edge_length_m ?? null, status: ez?.status || null, stretches: (z?.row_plans || []).map(pl => ({ length_m: pl.edge_length_m, depth_m: pl.depth_m, rows: pl.rows, placed: pl.placed, reason: pl.reason })), said: v.unresolved.filter(u => u.includes(bd.name) && /stretch|does not fit|no eligible/.test(u)), errors: v.validation.issues.filter(i => i.severity === 'error').length }; }) } : null; } stop('generated');
  // saved and read back
  { const text = JSON.stringify(S.project); const back = JSON.parse(text); M.saveLocal(S.project); const loc = M.loadLocal(); const geo = p => JSON.stringify([p.site.boundary, p.site.boundary_status, p.site.beds.map(x => [x.id, x.polygon, x.holes, x.status]), p.site.features.map(f => [f.kind, f.polygon, f.position_m]), p.versions.map(v => v.plant_objects.map(o => o.position_m))]);
    b.reload = { export_identical: geo(back) === geo(S.project), local_identical: !!loc && geo(loc) === geo(S.project), corners: back.site.boundary.length }; }
  // one more trim: the arrangement is now for an older outline
  { X.setStage('site', { scroll: false }); X.update(); await tick(120); begin(); S.be.sel = corner(S.be.ring, -1, 1); edit('trim', S.be.sel, 1); const pg = page(); let r = commit(); const first = r; if (r.review) r = commit(); await tick(150); const v = M.currentVersion(S.project); const gi = E.geometryImpact(S.project, v);
    b.stale = { review_named_planting: /Planting/.test(pg.panel || '') || !!first.review, applied: r.ok, corners: S.project.site.boundary.length, geometry_stale: gi.stale, changed_beds: gi.changed.length + gi.removed.length, plants_outside_outline: v.plant_objects.filter(o => !G.pointInPolygon(o.position_m, S.project.site.boundary)).length, version_kept: v.id === b.generated?.version };
    X.setStage('garden', { scroll: false }); X.update(); await tick(200); const ban = document.getElementById('banner'); b.stale.banner = ban && !ban.hidden ? ban.textContent.replace(/\s+/g, ' ').slice(0, 160) : null; } stop('stale');
  // ---- C · a Screen bed too shallow for a second row: what the engine's row plan asks for, offered — never applied by itself
  { X.resetProject('V4.2 screen depth', 'script-v42shape-c'); document.getElementById('say0').value = 'I have a 6 × 4 m backyard. I want privacy along the north edge and an open centre.'; document.getElementById('welcome-form').requestSubmit(); await tick(300);
    const basis = S.project.site.beds.flatMap(x => x.functions || []).find(f => f.function === 'z:screen')?.basis || ''; document.getElementById('to-intent').click(); await tick(300);
    const nb = M.activeBeds(S.project).find(x => (x.functions || []).some(f => f.function === 'z:screen')); if (nb) { S.bedId = nb.id; S.composeNone = false; X.update(); await tick(300); }   /* the bed opened in Compose, as a click on it does */ const offer = document.querySelector('[data-be-deepen-offer]'); const btn = document.querySelector('[data-be-deepen]'); const dbl = document.querySelector(`[data-arr-set='{"rows":"double"}']`);
    const c = k.depth = { basis, promises_second_row: /deep enough for a row and a staggered second row/.test(basis), bed: nb?.name, bed_area0: nb?.area_m2, double_disabled: dbl ? dbl.disabled : null, offer: offer?.innerText.replace(/\s+/g, ' ').trim() || null, need_m: btn ? +btn.dataset.need : null, by_m: btn ? +btn.dataset.by : null };
    const dry = E.generate(S.project, S.K, M.activeBeds(S.project).map(x => x.id), 42, { density: 1, stagger: true, id_start: 0 }); const plan = dry.zones.find(z => z.kind === 'edge' && z.bed_id === nb?.id)?.row_plans?.[0]; c.engine = plan ? { depth_m: plan.depth_m, needs_depth_m: plan.staggered_row.needs_depth_m, feasible: plan.staggered_row.feasible } : null;
    stop('depth'); if (btn) { btn.click(); await tick(300); const pv = S.bedPreview; c.offered = { stage: S.stage, preview: !!pv, change: pv?.changes.map(x => ({ name: x.name, before_m2: x.before.area_m2, after_m2: x.after.area_m2, narrowest_m: x.after.min_width_m })) || [], bed_unchanged: M.activeBeds(S.project).find(x => x.id === nb.id).area_m2 === c.bed_area0, card: document.getElementById('site-preview')?.innerText.replace(/\s+/g, ' ').slice(0, 300) || null }; } stop('deepen'); }
  // ---- D · V4.3: the 5 cm snap can be switched off; a bed the outline would leave too small is named and needs the user's own tick
  { S.bedPreview = null; S.bedCmd = null; X.setStage('site', { scroll: false }); X.update(); await tick(120); const d = k.v43 = {}; begin(); const lbl = () => document.querySelector('#be-panel [data-be-snap]');
    d.snap = { offered: !!lbl(), on_by_default: lbl()?.checked === true }; const i0 = corner(S.be.ring, 1, 1); const c0 = [...S.be.ring[i0]]; edit('move', i0, [c0[0] - 0.123, c0[1]]); d.snap.on = [...S.be.ring[i0]]; undo();
    { const box = lbl(); box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true })); await tick(40); } edit('move', i0, [c0[0] - 0.123, c0[1]]); d.snap.off = [...S.be.ring[i0]]; d.snap.label = document.querySelector('#be-panel .be-snap')?.innerText.replace(/\s+/g, ' ').trim(); undo(); stop('snap');
    { const box = lbl(); box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); await tick(40); }
    const B = G.bbox(S.be.ring); const east = M.activeBeds(S.project).find(x => /East/.test(x.name)); const eb = east ? G.bbox(east.polygon) : null; const cut = eb ? G.round(eb.maxx - eb.minx - 0.15, 2) : 0.65;   /* pull the east side in until only a 15 cm strip of the East bed is left */
    edit('set', [[B.minx, B.miny], [B.maxx - cut, B.miny], [B.maxx - cut, B.maxy], [B.minx, B.maxy]]); const beds0 = JSON.stringify(bedsNow());
    const r1 = commit(); const pg1 = page(); const r2 = commit(); const pg2 = page(); const warn = document.querySelector('#be-panel [data-be-remove]');
    d.remove = { east: east?.name || null, review_first: !!r1.review, refused_without_tick: r2.ok === false && (r2.needs_removal_confirm || []).length > 0, named: r2.needs_removal_confirm || [], warning: warn?.innerText.replace(/\s+/g, ' ').trim() || null, apply_disabled: pg2.apply?.disabled === true, beds_unchanged: JSON.stringify(bedsNow()) === beds0 }; stop('remove');
    { const box = document.querySelector('#be-panel [data-be-okremove]'); if (box) { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); await tick(40); } } const r3 = commit(); await tick(150);
    d.remove.applied = r3.ok === true; d.remove.bed_gone = !M.activeBeds(S.project).some(x => x.id === east?.id); X.undoShape(); await tick(100); d.remove.undo_restores = M.activeBeds(S.project).some(x => x.id === east?.id) && JSON.stringify(bedsNow()) === beds0; }
  // ---- E · V4.3: the Site page offers the two precise shade words; Compose says why a light result is conditional or does not match
  { const e = k.light = {}; const setLight = async v => { X.setStage('site', { scroll: false }); S.wsPanel = 'conditions'; X.update(); await tick(150); const sel = document.querySelector('#site-conditions [data-cond="light"]'); sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); await tick(200); return sel; };
    const openBed = async () => { X.setStage('intent', { scroll: false }); X.update(); await tick(150); const bd = M.activeBeds(S.project).find(x => (x.functions || []).some(f => f.function === 'z:ground_cover')); document.querySelector(`#compose-beds [data-selbed="${bd.id}"]`)?.click(); await tick(250); return bd; };
    const read = bd => { const a = E.assemble(S.project, S.K, bd); return { why: [...document.querySelectorAll('#brief-right [data-gate-why]')].map(x => ({ kind: x.dataset.gateWhy, text: x.textContent.trim() })), picks: [...a.picks.screen, ...a.picks.ground, ...a.picks.accent].map(r => ({ id: r.id, light: r.gate.light.result, kind: r.gate.light.kind, short: r.gate.light.short })), light: Object.fromEntries(a.rows.map(r => [r.id.replace('plant:', ''), r.gate.light.result + ' / ' + r.gate.light.kind])), excluded: a.rows.filter(r => r.gate.light.result === 'fail').map(r => r.id.replace('plant:', '')) }; };
    const sel = await setLight('filtered-shade'); e.options = [...sel.options].map(o => ({ value: o.value, label: o.textContent })); e.stored = S.project.site.conditions.light; document.querySelector('#site-conditions [data-cond="light"]')?.scrollIntoView({ block: 'center' }); stop('light');
    e.filtered = read(await openBed()); await setLight('deep-shade'); e.deep = read(await openBed()); await setLight('shade'); e.vague = read(await openBed()); stop('conditional');
    await setLight('part-shade'); e.part = read(await openBed()); }
  k.overflow_x = document.documentElement.scrollWidth - innerWidth; k.inner = [innerWidth, innerHeight];
}
