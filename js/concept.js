// Conceptual site model (2026-11-14, methods M58): what the description says about the SPACE, as editable objects, before any
// size is known. It lives in its own unitless sketch frame (FRAME_W wide) and is stored at project.site.concept — never in
// site.boundary / site.features / site.beds, which hold metres. Nothing here is a measurement: no area, no length, no count is
// ever derived from it. It becomes site geometry only through convert(), once the user gives a size, a scale or a boundary.
//
// Every object says where each part of it comes from:
//   user-stated   the user said it ("a tree", "on the north side", "keep the middle open")
//   inferred      read out of the user's words by a rule (the spot inside the named side; "back" read as north)
//   suggested     put there by the sketch so there is something to correct (the outline's proportions, an extent, a planting area)
//   unknown       not said and not guessed (a tree whose position was never mentioned stays off the plan until it is placed)
//   user-placed   moved or drawn by the user in the sketch
// Any interpreter — the offline rule parser or a live model returning the same fact structure — feeds the same builder.

import * as C from './clip.js';

export const FRAME_W = 100;
const COMPASS = ['north', 'south', 'east', 'west'];
const CENTRE = ['middle', 'centre', 'center'];
const r1 = v => Math.round(v * 10) / 10;

export function newConcept(provenance = 'offline-parser') {
  return { schema: 'planting-intelligence/concept-site/0.1', status: 'active', units: 'sketch — unitless, not to scale', provenance,
    frame: { w: FRAME_W, h: 67, status: 'suggested', basis: 'proportions not stated — a 3 : 2 outline to correct' }, objects: [], seq: 0 };
}
export const isActive = site => !!site.concept && site.concept.status === 'active' && !site.boundary;
export const isUsable = site => !!site.concept && ['active', 'paused'].includes(site.concept.status);

/** where on the sketch a named side puts an object (the spot inside that side is inferred, never stated) */
export function sidePos(frame, side) {
  const { w, h } = frame;
  return side === 'north' ? [w * .28, h * .8] : side === 'south' ? [w * .5, h * .2] : side === 'east' ? [w * .82, h * .5] : side === 'west' ? [w * .18, h * .5] : [w * .5, h * .5];
}
const centreBox = frame => { const { w, h } = frame; return [[w * .3, h * .22], [w * .7, h * .22], [w * .7, h * .6], [w * .3, h * .6]].map(p => [r1(p[0]), r1(p[1])]); };

/** bring the concept up to date with what has been read (project.site.notes). Objects the user has edited or confirmed are kept. */
export function sync(project, provenance) {
  const site = project.site; if (site.boundary || site.scratch) return site.concept || null;
  const c = site.concept && site.concept.status !== 'converted' ? site.concept : (site.concept = newConcept(provenance)); if (provenance) c.provenance = provenance;
  for (const n of site.notes) {
    if (n.placed || c.objects.some(o => o.note === n.evidence && o.kind === (n.kind === 'no-plant-zone' ? 'open-area' : n.kind))) continue;
    const id = `c-${n.kind === 'existing-tree' ? 'tree' : 'open'}-${++c.seq}`;
    if (n.kind === 'existing-tree') {
      const word = (n.side_word || n.side || '').toLowerCase(); const mapped = COMPASS.includes(n.side) ? n.side : CENTRE.includes(n.side) ? 'centre' : null;
      const stated = COMPASS.includes(word) || CENTRE.includes(word); const relative = !!word && !stated && !!mapped;   // "back" / "front" → a compass side by the plan-up assumption
      const known = mapped && (stated || relative);
      c.objects.push({ id, kind: 'existing-tree', label: 'existing tree', note: n.evidence, exists: 'user-stated',
        relation: word ? { text: `on the ${word}${CENTRE.includes(word) ? '' : ' side'}`, side: known ? mapped : null, status: 'user-stated', reading: relative ? `"${word}" read as ${mapped} (plan up)` : !known ? `"${word}" names no compass side` : null } : { text: null, side: null, status: 'unknown' },
        pos: known ? sidePos(c.frame, mapped).map(r1) : null, pos_status: known ? 'inferred' : 'unknown', r: 11, r_status: 'unknown', confirmed: false });
    } else if (n.kind === 'no-plant-zone') {
      c.objects.push({ id, kind: 'open-area', label: `open (${n.reason})`, note: n.evidence, exists: 'user-stated',
        relation: { text: n.where_status === 'user-stated' ? 'in the middle' : 'place not stated — drawn in the middle', side: 'centre', status: n.where_status || 'suggested' },
        polygon: centreBox(c.frame), pos_status: n.where_status === 'user-stated' ? 'inferred' : 'suggested', extent_status: 'suggested', confirmed: false });
    }
  }
  return c;
}

// ---------------------------------------------------------------- edits in the sketch (all in sketch units)
const clampPt = (frame, p) => [r1(Math.max(0, Math.min(frame.w, p[0]))), r1(Math.max(0, Math.min(frame.h, p[1])))];
export const inFrame = (frame, p) => p[0] >= 0 && p[0] <= frame.w && p[1] >= 0 && p[1] <= frame.h;
export function addTree(c, pos) { const id = `c-tree-${++c.seq}`; c.objects.push({ id, kind: 'existing-tree', label: 'existing tree', note: null, exists: 'user-placed', relation: { text: null, side: null, status: 'unknown' }, pos: clampPt(c.frame, pos), pos_status: 'user-placed', r: 11, r_status: 'unknown', confirmed: true }); return id; }
export function addOpen(c, polygon) { const id = `c-open-${++c.seq}`; c.objects.push({ id, kind: 'open-area', label: 'open area', note: null, exists: 'user-placed', relation: { text: null, side: null, status: 'unknown' }, polygon: polygon.map(p => clampPt(c.frame, p)), pos_status: 'user-placed', extent_status: 'user-placed', confirmed: true }); return id; }
export function moveTo(c, id, pos) { const o = c.objects.find(x => x.id === id); if (!o) return null; if (o.kind === 'existing-tree') o.pos = clampPt(c.frame, pos); else { const cx = o.polygon.reduce((s, p) => s + p[0], 0) / o.polygon.length, cy = o.polygon.reduce((s, p) => s + p[1], 0) / o.polygon.length; o.polygon = o.polygon.map(p => clampPt(c.frame, [p[0] + pos[0] - cx, p[1] + pos[1] - cy])); } o.pos_status = 'user-placed'; o.confirmed = true; return o; }
export function setSide(c, id, side) { const o = c.objects.find(x => x.id === id); if (!o) return null; if (!side) { o.pos = null; o.pos_status = 'unknown'; o.relation = { text: null, side: null, status: 'unknown' }; o.confirmed = false; return o; } o.relation = { text: side === 'centre' ? 'in the middle' : `on the ${side} side`, side, status: 'user-stated', reading: null }; if (o.kind === 'existing-tree') o.pos = sidePos(c.frame, side).map(r1); o.pos_status = 'inferred'; o.confirmed = false; return o; }
export function confirm(c, id) { const o = c.objects.find(x => x.id === id); if (o && (o.pos || o.polygon)) o.confirmed = true; return o; }
export function remove(c, id) { const i = c.objects.findIndex(x => x.id === id); if (i >= 0) c.objects.splice(i, 1); }
/** change the outline's proportions; everything keeps its relative place */
export function setFrame(c, w, h, by = 'user-placed') {
  const f = c.frame; const nw = Math.max(30, Math.min(160, w)), nh = Math.max(30, Math.min(160, h)); const sx = nw / f.w, sy = nh / f.h;
  for (const o of c.objects) { if (o.pos) o.pos = [r1(o.pos[0] * sx), r1(o.pos[1] * sy)]; if (o.polygon) o.polygon = o.polygon.map(p => [r1(p[0] * sx), r1(p[1] * sy)]); }
  c.frame = { w: r1(nw), h: r1(nh), status: by, basis: by === 'user-placed' ? 'proportions adjusted by you in the sketch' : f.basis, ...(f.outline ? { outline: f.outline.map(p => [r1(p[0] * sx), r1(p[1] * sy)]) } : {}) };
}
// ---------------------------------------------------------------- an outline that is not a rectangle (V4.2) — still unitless
/** the sketch outline: the corners the user shaped, or the frame rectangle. Sketch units, never metres. */
export const outlineOf = c => c.frame.outline?.length >= 3 ? c.frame.outline.map(p => [p[0], p[1]]) : [[0, 0], [c.frame.w, 0], [c.frame.w, c.frame.h], [0, c.frame.h]];
/** store an edited outline. The frame becomes its bounding box (objects keep their place relative to the outline); nothing is measured. */
export function setOutline(c, ring) {
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]); const minx = Math.min(...xs), miny = Math.min(...ys); const w = Math.max(...xs) - minx, h = Math.max(...ys) - miny;
  const sh = p => [r1(p[0] - minx), r1(p[1] - miny)]; const out = ring.map(sh);
  for (const o of c.objects) { if (o.pos) o.pos = sh(o.pos); if (o.polygon) o.polygon = o.polygon.map(sh); }
  const rect = out.length === 4 && out.every(p => (p[0] === 0 || p[0] === r1(w)) && (p[1] === 0 || p[1] === r1(h)));
  c.frame = { w: r1(w), h: r1(h), status: 'user-placed', basis: 'outline shaped by you in the sketch — proportions only, no size', ...(rect ? {} : { outline: out }) };
  return c.frame;
}
/** the sketch outline carried to a stated size: the same corners in the same order, stretched to w × h metres. null for a plain rectangle. */
export function outlineMetres(c, w, h) { const f = c?.frame; if (!f?.outline || f.outline.length < 3) return null; const r2 = v => Math.round(v * 100) / 100; return f.outline.map(p => [r2(p[0] / f.w * w), r2(p[1] / f.h * h)]); }

// ---------------------------------------------------------------- suggested planting areas (diagram only: no width in metres, no area)
/** bands and rings that show WHERE planting is suggested, from the same intent the bed proposal reads. Drawn, never measured. */
export function hints(c, intent) {
  const { w, h } = c.frame; const d = Math.min(w, h); const out = []; const band = (side, k) => side === 'north' ? [[0, h - d * k], [w, h - d * k], [w, h], [0, h]] : side === 'south' ? [[0, 0], [w, 0], [w, d * k], [0, d * k]] : side === 'east' ? [[w - d * k, 0], [w, 0], [w, h], [w - d * k, h]] : [[0, 0], [d * k, 0], [d * k, h], [0, h]];
  const add = (name, polygon, fn, basis) => out.push({ id: `hint-${out.length + 1}`, name, polygon: polygon.map(p => [r1(p[0]), r1(p[1])]), holes: [], status: 'ai-suggested', functions: fn ? [{ function: fn, where: 'sketch', basis }] : [], hint: true, basis });
  const screened = intent?.screenSides || []; for (const s of screened) add(`${s} edge`, band(s, .2), 'z:screen', `privacy along the ${s} edge`);
  const rest = COMPASS.filter(s => !screened.includes(s) && s !== 'south');
  if (intent?.wantsOpen || intent?.habitat || !screened.length) for (const s of rest) add(`${s} edge`, band(s, .13), 'z:ground_cover', intent?.wantsOpen ? 'the centre stays open, so planting goes to the edges' : 'planting along the edges');
  for (const o of c.objects) if (o.kind === 'existing-tree' && o.pos) add('under the tree', circle(o.pos, o.r * 1.25), 'z:ground_cover', 'the tree is kept and underplanted');
  return out;
}
const circle = (c, r, n = 20) => Array.from({ length: n }, (_, i) => [c[0] + r * Math.cos(i / n * 2 * Math.PI), c[1] + r * Math.sin(i / n * 2 * Math.PI)]);

// ---------------------------------------------------------------- a view of the sketch for the plan renderer (no metres are created)
const posWord = o => o.pos_status === 'user-placed' ? 'placed by you' : o.confirmed ? 'confirmed' : o.pos_status === 'inferred' ? 'position estimated' : o.pos_status === 'suggested' ? 'position suggested' : 'position unknown';
/** the sketch in the shape render2D reads. Scale stays 'unknown', so the renderer draws no grid and no scale bar. */
export function viewProject(project, hintBeds = []) {
  const c = project.site.concept; const f = c.frame;
  const features = c.objects.filter(o => o.pos || o.polygon).map(o => o.kind === 'existing-tree'
    ? { id: o.id, kind: 'existing-tree', position_m: o.pos, radius_m: o.r, label: 'existing tree', status: o.confirmed || o.pos_status === 'user-placed' ? 'user-drawn' : 'inferred', concept_label: `existing tree · ${posWord(o)}`, concept: true }
    : { id: o.id, kind: 'no-plant-zone', polygon: o.polygon, label: o.label, status: o.confirmed || o.pos_status === 'user-placed' ? 'user-drawn' : 'inferred', concept_label: `${o.label} · ${o.confirmed || o.pos_status === 'user-placed' ? posWord(o) : 'extent suggested'}`, concept: true });
  const outline = outlineOf(c); if (f.outline) hintBeds = hintBeds.flatMap(b => { try { const parts = C.fromMulti(C.intersection(C.toMulti(b.polygon, b.holes), C.toMulti(outline)), 1).sort((x, y) => y.area_m2 - x.area_m2); return parts.length ? [{ ...b, polygon: parts[0].polygon.map(p => [r1(p[0]), r1(p[1])]), holes: parts[0].holes }] : []; } catch { return []; } });   /* a suggested band is drawn only where the shaped outline has ground */
  return { site: { boundary: outline, boundary_status: f.status === 'user-placed' ? 'sketch-adjusted' : 'suggested', features, beds: hintBeds, scale: { status: 'unknown' }, orientation: project.site.orientation, conditions: project.site.conditions } };
}
export const unplaced = c => c.objects.filter(o => !o.pos && !o.polygon);

// ---------------------------------------------------------------- from sketch to site geometry
/** carry the sketch into a boundary that now exists in metres. Each object keeps its relative place; what the user placed or
 *  confirmed arrives as user-drawn, the rest as inferred. Objects that were never placed are NOT given a position.
 *  Returns the list of features to add (the caller adds them through the model, so every mutation is recorded as usual). */
export function convert(project, bbox) {
  const c = project.site.concept; const f = c.frame; const out = []; const X = x => bbox.minx + x / f.w * bbox.w, Y = y => bbox.miny + y / f.h * bbox.h; const r2 = v => Math.round(v * 100) / 100;
  for (const o of c.objects) {
    const mine = o.confirmed || o.pos_status === 'user-placed'; const how = mine ? (o.pos_status === 'user-placed' ? 'placed by you in the sketch' : 'confirmed by you in the sketch') : 'estimated in the sketch from your words';
    if (o.kind === 'existing-tree' && o.pos) out.push({ kind: 'existing-tree', position_m: [r2(X(o.pos[0])), r2(Y(o.pos[1]))], radius_m: null, label: 'existing tree', status: mine ? 'user-drawn' : 'inferred', source: `${o.note ? `conversation: "${o.note}" — ` : ''}${how}; scaled with the sketch to the stated size, canopy not stated`, from_concept: o.id });
    else if (o.kind === 'open-area' && o.polygon) out.push({ kind: 'no-plant-zone', polygon: o.polygon.map(p => [r2(X(p[0])), r2(Y(p[1]))]), label: o.label, status: mine ? 'user-drawn' : 'inferred', source: `${o.note ? `conversation: "${o.note}" — ` : ''}${how}; extent scaled with the sketch, not stated in metres`, from_concept: o.id });
  }
  const left = unplaced(c); c.status = 'converted'; c.converted = { at: new Date().toISOString(), size_m: [r2(bbox.w), r2(bbox.h)], carried: out.length, left_unplaced: left.map(o => o.id) };
  return { features: out, unplaced: left };
}
