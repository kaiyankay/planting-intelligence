// SPATIAL PROPOSAL ENGINE (Level 2 of the workflow: Site Model → Planting Bed Proposal). Deterministic geometry over the site
// model and the brief: it computes the plantable area (site − excluded areas − clearances), composes planting beds from named
// spatial operations (edge band · island · ribbon · infill · modular), validates every polygon, and offers one recommended
// layout plus alternatives that differ in a stated way. It never invents a dimension: without a measured boundary it returns a
// conceptual proposal and the question that unblocks it. Bed edits requested in words (interpreted by intent.js or a live model)
// are previewed here as before / after geometry with the conflicts they raise, and applied only on the user's Apply.
// Nothing here chooses or places plants (that is engine.js, Level 3) and nothing here reads a plant fact.
import * as G from './geom.js';
import * as C from './clip.js';

export const DEFAULTS = {
  screen_band_m: 1.2,      // room for ONE Screen row. A staggered second row needs more than this for the species recorded today (the engine's row plan says how much, per bed) — never promised here
  side_band_m: 0.8,        // ground-layer border that frames an open centre
  perimeter_band_m: 1.0,   // habitat / low-maintenance perimeter when no open centre is asked for
  access_band_m: 0.9,      // kept free along the access edge (front / south by assumption) so the site can be entered
  path_clearance_m: 0.3, building_clearance_m: 0.3,
  min_bed_width_m: 0.5, min_bed_area_m2: 0.6, sliver_m2: 0.15,
  tree_island_pad_m: 0.6,  // island radius = canopy radius + pad
  small_site_m: 5,         // below this shortest side the screen band is reduced to 0.9 m
  alt_min_difference: 0.12,// an alternative must change at least this fraction of the plantable area
};
const SIDES = ['north', 'east', 'south', 'west'];
const OPPOSITE = { north: 'south', south: 'north', east: 'west', west: 'east' };
const EXCLUDE_KINDS = new Set(['no-plant-zone', 'building', 'path', 'paved', 'structure', 'patio', 'deck', 'shed']);
const CLEAR_KINDS = new Set(['building', 'path', 'paved', 'structure', 'patio', 'deck', 'shed']);
const iso = () => new Date().toISOString();
const fp = o => JSON.stringify(o);

// ---------------------------------------------------------------- Level 1 · derived site model
export function deriveSite(project, opts = {}) {
  const P = { ...DEFAULTS, ...opts }; const site = project.site; const north = site.orientation?.north_angle_degrees || 0;
  const out = { boundary: site.boundary, boundary_status: site.boundary_status, scale: site.scale, north, plantable: [], plantable_m2: 0, site_m2: 0, excluded: [], trees: [], open_areas: [], edges: {}, access_edge: null, questions: [], assumptions: [] };
  if (!site.boundary || site.boundary.length < 3) { out.questions.push({ key: 'dimensions', text: 'How big is the site? Type width × height in metres, draw the boundary, or trace a photo and calibrate a known length.' }); return out; }
  const v = C.validRing(site.boundary); if (!v.ok) { out.questions.push({ key: 'boundary', text: `The boundary is not a valid outline (${v.why}) — redraw it.` }); return out; }
  out.site_m2 = G.round(G.area(site.boundary));
  for (const f of site.features) {
    if (f.kind === 'existing-tree' && f.position_m) out.trees.push({ id: f.id, label: f.label || 'existing tree', centre: f.position_m, radius: f.radius_m ?? 1.5, radius_status: f.radius_m != null ? 'stated' : 'assumed 1.5 m', position_status: f.status === 'inferred' ? 'estimated from your words' : f.status || 'placed' });
    else if (f.polygon && EXCLUDE_KINDS.has(f.kind)) { const clearance = CLEAR_KINDS.has(f.kind) ? (f.kind === 'path' || f.kind === 'paved' ? P.path_clearance_m : P.building_clearance_m) : 0; out.excluded.push({ id: f.id, kind: f.kind, label: f.label || f.kind, polygon: f.polygon, clearance_m: clearance, status: f.status || 'drawn' }); if (f.kind === 'no-plant-zone') out.open_areas.push({ id: f.id, label: f.label || 'open area', polygon: f.polygon, status: f.status || 'drawn', area_m2: G.round(G.area(f.polygon)) }); }
  }
  let plantable = C.toMulti(site.boundary);
  for (const e of out.excluded) plantable = C.difference(plantable, e.clearance_m ? C.outset(e.polygon, e.clearance_m) : C.toMulti(e.polygon));
  out.plantable = plantable; out.plantable_m2 = G.round(C.areaOf(plantable));
  for (const s of SIDES) out.edges[s] = G.edgesFacing(site.boundary, G.DIRECTIONS[s], north, 45).map(e => ({ a: e.a, b: e.b, n: e.n, length_m: G.round(G.dist(e.a, e.b)) }));
  const stated = site.notes?.find(n => n.kind === 'access'); out.access_edge = stated ? { side: stated.side, basis: `stated: "${stated.evidence}"` } : { side: P.access_edge || 'south', basis: 'assumed: the site is entered from the south (front) edge until you say otherwise' };
  if (!stated) out.assumptions.push(`access from the ${out.access_edge.side} edge is an assumption — say "the gate is on the east side" to change it`);
  for (const t of out.trees) if (t.position_status.startsWith('estimated')) out.assumptions.push(`${t.label}: position estimated from your words, canopy ${t.radius_status} — drag it to where it stands`);
  if (site.scale.status === 'unknown') out.assumptions.push('scale unknown: the beds are conceptual until a length is calibrated');
  return out;
}
const bandWidthFor = (site, P) => { const B = G.bbox(site.boundary); return Math.min(B.w, B.h) < P.small_site_m ? Math.min(P.screen_band_m, 0.9) : P.screen_band_m; };

// ---------------------------------------------------------------- spatial operations (each returns pieces + a record of itself)
export function opEdgeBand(site, sides, width, fn, basis) {
  const edges = sides.flatMap(s => site.edges[s] || []); if (!edges.length) return { op: 'edge', params: { sides, width_m: width }, basis, pieces: [], note: `no edge of the boundary faces ${sides.join(' / ')}` };
  // one band per side (so each bed can be named and edited by its side); where two sides meet, the first side keeps the corner
  const pieces = []; let taken = [];
  for (const side of sides) { const es = site.edges[side] || []; if (!es.length) continue; let m = C.intersection(C.edgeBand({ polygon: site.boundary }, es, width), site.plantable); if (taken.length) m = C.difference(m, taken); for (const p of C.fromMulti(m)) pieces.push({ ...p, side, functions: fn ? [{ function: fn, where: `${side}-edge`, basis }] : [] }); taken = C.union(taken, m); }
  return { op: 'edge', params: { sides, width_m: width, function: fn }, basis, pieces };
}
export function opIsland(site, centre, radius, fn, basis) { return { op: 'island', params: { centre: G.roundPt(centre), radius_m: G.round(radius), function: fn }, basis, pieces: C.fromMulti(C.intersection(C.toMulti(G.circlePolygon(centre, radius, 28)), site.plantable)).map(p => ({ ...p, functions: fn ? [{ function: fn, where: 'bed-interior', basis }] : [] })) }; }
export function opRibbon(site, from, to, width, fn, basis) { const cap = C.outset({ polygon: [from, to, [to[0] + 1e-4, to[1] + 1e-4]] }, width / 2); return { op: 'ribbon', params: { from: G.roundPt(from), to: G.roundPt(to), width_m: width, function: fn }, basis, pieces: C.fromMulti(C.intersection(cap, site.plantable)).map(p => ({ ...p, functions: fn ? [{ function: fn, where: 'bed-interior', basis }] : [] })) }; }
export function opInfill(site, keepOut, fn, basis) { let m = site.plantable; for (const k of keepOut) m = C.difference(m, k); return { op: 'infill', params: { keep_out: keepOut.length, function: fn }, basis, pieces: C.fromMulti(m).map(p => ({ ...p, functions: fn ? [{ function: fn, where: 'bed-interior', basis }] : [] })) }; }
export function opModular(site, cell, gap, keepOut, fn, basis) {
  const B = G.bbox(site.boundary); const cells = []; const cols = Math.max(1, Math.floor((B.w + gap) / (cell + gap))), rows = Math.max(1, Math.floor((B.h + gap) / (cell + gap)));
  const w = (B.w - gap * (cols - 1)) / cols, h = (B.h - gap * (rows - 1)) / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { const x0 = B.minx + i * (w + gap), y0 = B.miny + j * (h + gap); cells.push(G.polygonFromRect(w, h, x0, y0)); }
  let m = C.unionAll(cells.map(c => C.toMulti(c))); m = C.intersection(m, site.plantable); for (const k of keepOut) m = C.difference(m, k);
  return { op: 'modular', params: { cols, rows, cell_w_m: G.round(w), cell_h_m: G.round(h), gap_m: gap, function: fn }, basis, pieces: C.fromMulti(m).map(p => ({ ...p, functions: fn ? [{ function: fn, where: 'bed-interior', basis }] : [] })) };
}

// ---------------------------------------------------------------- naming, tree overlap, validation
export function positionName(polygon, site) {
  const B = G.bbox(site.boundary); const c = G.centroid(polygon); const nx = (c[0] - (B.minx + B.w / 2)) / (B.w / 2 || 1), ny = (c[1] - (B.miny + B.h / 2)) / (B.h / 2 || 1);
  const north = site.north || 0; const h = G.headingOf([nx, ny], north); const r = Math.hypot(nx, ny);
  if (r < 0.3) return 'Centre'; const dir = Object.entries(G.DIRECTIONS).map(([k, d]) => [k, G.angleDiff(h, d)]).sort((a, b) => a[1] - b[1])[0][0];
  const cap = dir.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('-'); return dir.includes('-') && r > 0.75 ? `${cap} corner` : cap;
}
function treeOverlap(piece, site) { const out = []; for (const t of site.trees) { const m2 = G.round(C.overlapArea(C.toMulti(piece.polygon, piece.holes), C.toMulti(G.circlePolygon(t.centre, t.radius, 24)))); if (m2 > 0.05) out.push({ tree: t.id, label: t.label, m2, radius_status: t.radius_status }); } return out; }
export function validateBeds(beds, site, P = DEFAULTS) {
  const issues = []; const siteM = C.toMulti(site.boundary);
  beds.forEach((b, i) => {
    const v = C.validRing(b.polygon); if (!v.ok) { issues.push({ bed: b.id || b.name, severity: 'error', text: `invalid outline: ${v.why}` }); return; }
    for (const h of b.holes || []) { const vh = C.validRing(h); if (!vh.ok) issues.push({ bed: b.id || b.name, severity: 'error', text: `invalid hole: ${vh.why}` }); }
    const m = C.toMulti(b.polygon, b.holes);
    const outside = G.round(C.areaOf(C.difference(m, siteM))); if (outside > 0.01) issues.push({ bed: b.id || b.name, severity: 'error', text: `${outside} m² outside the site boundary`, m2: outside });
    for (const e of site.excluded) { const ov = G.round(C.overlapArea(m, C.toMulti(e.polygon))); if (ov > 0.01) issues.push({ bed: b.id || b.name, severity: 'error', text: `${ov} m² inside ${e.label}${e.kind === 'no-plant-zone' ? ' (open area)' : ''}`, m2: ov }); }
    for (let j = i + 1; j < beds.length; j++) { const ov = G.round(C.overlapArea(m, C.toMulti(beds[j].polygon, beds[j].holes))); if (ov > 0.01) issues.push({ bed: b.id || b.name, other: beds[j].id || beds[j].name, severity: 'error', text: `overlaps ${beds[j].name || beds[j].id} by ${ov} m²`, m2: ov }); }
    const a = C.areaShape(b); if (a < P.min_bed_area_m2) issues.push({ bed: b.id || b.name, severity: 'warning', text: `only ${G.round(a)} m² — too small for the engine's spacing` });
    const w = b.min_width_m ?? C.minWidth(b); if (w < P.min_bed_width_m) issues.push({ bed: b.id || b.name, severity: 'warning', text: `narrowest width ${w} m is below ${P.min_bed_width_m} m — one row at most` });
  });
  return { ok: !issues.some(i => i.severity === 'error'), issues };
}

// ---------------------------------------------------------------- candidate assembly from an ordered list of operations
function assembleCandidate(site, spec, P) {
  const beds = [], dropped = [], strategies = []; let placed = [];
  for (const op of spec.ops) {
    strategies.push({ op: op.op, params: op.params, basis: op.basis, note: op.note || null, produced: 0 });
    for (const piece of op.pieces) {
      let m = C.toMulti(piece.polygon, piece.holes); if (placed.length) m = C.difference(m, placed);   // earlier operations win the ground
      for (const part of C.fromMulti(m, P.sliver_m2)) {
        const width = C.minWidth(part);
        if (part.area_m2 < P.min_bed_area_m2 || width < P.min_bed_width_m) { dropped.push({ op: op.op, area_m2: part.area_m2, min_width_m: width, why: part.area_m2 < P.min_bed_area_m2 ? 'too small' : 'too narrow' }); continue; }
        const bed = { key: `${spec.id}-${beds.length + 1}`, polygon: part.polygon, holes: part.holes, area_m2: part.area_m2, min_width_m: width, functions: piece.functions || [], side: piece.side || null, strategy: op.op, strategy_params: op.params, basis: op.basis, reasoning: [op.basis], notes: [], under_canopy: [] };
        bed.under_canopy = treeOverlap(bed, site); for (const u of bed.under_canopy) bed.notes.push(`${u.m2} m² lies under the canopy of ${u.label} (${u.radius_status}) — planting there depends on the shade and roots, which are not recorded: treated as conditional, not excluded`);
        beds.push(bed); placed = C.union(placed, C.toMulti(part.polygon, part.holes)); strategies[strategies.length - 1].produced++;
      }
    }
  }
  const used = {}; for (const b of beds) { const base = b.strategy === 'island' ? 'Tree island' : b.side ? `${b.side[0].toUpperCase() + b.side.slice(1)} bed` : `${positionName(b.polygon, site)} bed`; used[base] = (used[base] || 0) + 1; b.name = used[base] > 1 ? `${base} ${used[base]}` : base; }
  const planting = G.round(beds.reduce((s, b) => s + b.area_m2, 0)); const open = C.fromMulti(C.difference(site.plantable, placed)).sort((a, b) => b.area_m2 - a.area_m2);
  const validation = validateBeds(beds, site, P);
  return { id: spec.id, label: spec.label, recommended: !!spec.recommended, summary: spec.summary, strategies, beds, dropped, open_centre: open[0] ? { polygon: open[0].polygon, area_m2: open[0].area_m2 } : null, metrics: { site_m2: site.site_m2, plantable_m2: site.plantable_m2, planting_m2: planting, open_m2: G.round(site.plantable_m2 - planting), planting_share: site.plantable_m2 ? G.round(planting / site.plantable_m2) : 0, beds: beds.length }, reasoning_summary: spec.reasoning, assumptions: [...site.assumptions, ...(spec.assumptions || [])], source_constraints: spec.constraints, validation, status: 'proposed', union: placed };
}
function differs(a, b, site, P) { const x = C.areaOf(C.xor(a.union, b.union)); return site.plantable_m2 ? x / site.plantable_m2 >= P.alt_min_difference : false; }
const isRectangular = poly => poly.length === 4 && G.segments(poly).every(([a, b], i, S) => { const [c, d] = S[(i + 1) % 4]; const v1 = [b[0] - a[0], b[1] - a[1]], v2 = [d[0] - c[0], d[1] - c[1]]; return Math.abs(v1[0] * v2[0] + v1[1] * v2[1]) < 1e-6 * (Math.hypot(...v1) * Math.hypot(...v2) + 1) + 0.02; });

// ---------------------------------------------------------------- Level 2 · the proposal
export function readIntent(project, site) {
  const b = project.brief; const vals = b.values || {};
  const screenFns = b.functions.filter(f => ['z:screen', 'z:scrim'].includes(f.function) && !f.alternative);
  const screenSides = []; const constraints = [];
  for (const f of screenFns) { const m = /^(north|south|east|west)-edge$/.exec(f.where); if (m) { if (!screenSides.includes(m[1])) screenSides.push(m[1]); constraints.push({ id: `fn:${f.function}@${f.where}`, text: `${f.function.replace('z:', '')} along the ${m[1]} edge`, from: f.evidence || 'brief' }); } else if (f.where === 'boundary') constraints.push({ id: `fn:${f.function}@boundary`, text: `${f.function.replace('z:', '')} along the boundary (no side named)`, from: f.evidence || 'brief' }); }
  const boundaryScreen = screenFns.some(f => f.where === 'boundary') && !screenSides.length;   // only when the user chose "outer boundary" themself
  const pendingScreen = screenFns.some(f => f.where === 'edge-unset') && !screenSides.length && !boundaryScreen;
  if (pendingScreen) constraints.push({ id: 'fn:screen@edge-unset', text: 'screen wanted — edge not chosen yet (no screen band is proposed until you choose it)', from: 'brief' });
  const keepOpen = b.hard_constraints.some(h => h.kind === 'no-plant-zone') || site.open_areas.length > 0 || (project.site.notes || []).some(n => n.kind === 'no-plant-zone');
  const wantsOpen = keepOpen || !!vals.openness;
  if (keepOpen) constraints.push({ id: 'keep-open', text: site.open_areas.length ? `keep ${site.open_areas.map(o => o.label).join(', ')} free of plants` : 'keep an open area (its extent is not stated)', from: b.hard_constraints.find(h => h.kind === 'no-plant-zone')?.evidence || 'site' });
  for (const t of site.trees) constraints.push({ id: `tree:${t.id}`, text: `${t.label} kept (${t.position_status}; canopy ${t.radius_status})`, from: 'site' });
  for (const e of site.excluded.filter(e => e.kind !== 'no-plant-zone')) constraints.push({ id: `excluded:${e.id}`, text: `${e.label} excluded with a ${e.clearance_m} m clearance`, from: 'site' });
  const habitat = !!(vals.ecology || vals.seasonal_interest || vals.maintenance_low || b.functions.some(f => f.function === 'z:ground_cover'));
  return { values: vals, screenSides, boundaryScreen, pendingScreen, wantsOpen, keepOpen, habitat, constraints, screenFn: screenFns[0]?.function || 'z:screen', shelter: !!vals.shelter };
}
export function propose(project, opts = {}) {
  const P = { ...DEFAULTS, ...opts }; const site = deriveSite(project, P); const intent = readIntent(project, site);
  const inputs_fp = fp([project.site.boundary, project.site.features.map(f => [f.kind, f.position_m, f.polygon, f.radius_m]), project.brief.values, project.brief.functions.map(f => [f.function, f.where, f.alternative]), project.site.orientation]);
  if (!site.boundary || !site.plantable.length) return conceptualProposal(project, site, intent, inputs_fp);
  const access = site.access_edge.side; const nonAccess = SIDES.filter(s => s !== access && site.edges[s]?.length);
  const screenSides = intent.screenSides.length ? intent.screenSides : intent.boundaryScreen ? nonAccess : [];
  const screenBasis = intent.screenSides.length ? `privacy → a ${intent.screenFn.replace('z:', '')} band along the ${screenSides.join(' and ')} edge, sized for one row of screening plants (a second, staggered row needs a deeper bed: Compose says how deep for the plants chosen)` : intent.boundaryScreen ? `privacy along the boundary, no side named → bands on every edge except the ${access} (access) edge` : null;
  const assumptions = []; if (intent.boundaryScreen) assumptions.push(`Screen was set on the outer boundary: every edge except the ${access} (access) edge gets a band`);
  if (intent.pendingScreen) assumptions.push('privacy was asked for but no edge was named: no screen band is proposed and no screen is planted until you choose the edge (Compose → Site-wide spatial functions)');
  const keepOut = site.open_areas.map(o => C.toMulti(o.polygon)); const accessBand = site.edges[access]?.length ? C.edgeBand({ polygon: site.boundary }, site.edges[access], P.access_band_m) : [];
  const sideSides = nonAccess.filter(s => !screenSides.includes(s));
  const wScreen = bandWidthFor(site, P); const Bs = G.bbox(site.boundary); const islandR = (t, pad) => Math.min(t.radius + pad, Math.max(t.radius, 0.35 * Math.min(Bs.w, Bs.h)));   // the island never grows past about a third of the site's shorter side
  const treeIsland = (pad, fn) => site.trees.map(t => opIsland(site, t.centre, islandR(t, pad), fn, `the tree becomes a planted island (${islandR(t, pad) > t.radius ? `its canopy plus ${G.round(islandR(t, pad) - t.radius, 1)} m` : 'its canopy'}), so the ground under it is planted rather than left as a hole (its light is checked as a range under the canopy, not assumed to be shade)`));
  const specs = [];
  // A — recommended
  {
    const ops = [];
    if (screenSides.length) ops.push(opEdgeBand(site, screenSides, wScreen, intent.screenFn, screenBasis));
    if (intent.wantsOpen) { if (sideSides.length) ops.push(opEdgeBand(site, sideSides, P.side_band_m, 'z:ground_cover', `an open centre is wanted → the remaining edges get a ${P.side_band_m} m ground-layer border that frames it; the middle stays open`)); }
    else if (intent.habitat || !screenSides.length) ops.push(opEdgeBand(site, sideSides.length ? sideSides : nonAccess, P.perimeter_band_m, 'z:ground_cover', `${intent.habitat ? 'habitat / low-maintenance planting' : 'no spatial intent was read'} → a ${P.perimeter_band_m} m perimeter bed on the edges that are not the access edge; the centre is left for use`));
    ops.push(...treeIsland(P.tree_island_pad_m, 'z:ground_cover'));
    specs.push({ id: 'A', label: 'Recommended', recommended: true, summary: intent.wantsOpen ? 'Planting at the edges, open centre kept' : 'Perimeter planting, centre left for use', ops, reasoning: [screenBasis, intent.wantsOpen ? 'the centre is kept open as asked; beds frame it rather than fill it' : (intent.habitat ? 'habitat value comes from a continuous perimeter layer rather than scattered patches' : 'with no stated spatial wish, a perimeter keeps the ground usable while planting every edge'), site.trees.length ? 'the existing tree is kept and underplanted as an island' : null, `the ${access} edge stays free as access (${site.access_edge.basis.split(':')[0]})`].filter(Boolean), assumptions, constraints: intent.constraints });
  }
  // B — more open centre (or, without an open wish, a modular / ribbon alternative)
  if (intent.wantsOpen || screenSides.length) {
    const ops = []; if (screenSides.length) ops.push(opEdgeBand(site, screenSides, G.round(wScreen * 0.75), intent.screenFn, `${screenBasis} — narrowed to ${G.round(wScreen * 0.75)} m: one row only`)); ops.push(...treeIsland(Math.max(0.2, P.tree_island_pad_m - 0.3), 'z:ground_cover'));
    specs.push({ id: 'B', label: 'More open centre', summary: 'Narrower screen band only; no side borders', ops, reasoning: ['the screen band is cut to one row and the side borders are dropped, so the open ground is as large as the brief allows', 'trade-off: less ground-layer planting and a thinner screen'], assumptions, constraints: intent.constraints });
  } else {
    const ops = isRectangular(site.boundary) ? [opModular(site, Math.max(1.2, Math.min(2.4, Math.min(G.bbox(site.boundary).w, G.bbox(site.boundary).h) / 2.2)), 0.7, [...keepOut, accessBand], 'z:ground_cover', 'a regular site → modular rectangular beds separated by 0.7 m paths, each reachable from both sides for maintenance')] : [(() => { const B = G.bbox(site.boundary); const long = B.w >= B.h; const from = long ? [B.minx + .3, B.miny + B.h / 2] : [B.minx + B.w / 2, B.miny + .3], to = long ? [B.maxx - .3, B.miny + B.h / 2] : [B.minx + B.w / 2, B.maxy - .3]; return opRibbon(site, from, to, Math.max(1, Math.min(B.w, B.h) * 0.35), 'z:ground_cover', 'an irregular site → one ribbon bed along the long axis, so the planting reads as a continuous drift and the edges stay walkable'); })()];
    specs.push({ id: 'B', label: isRectangular(site.boundary) ? 'Modular beds' : 'Ribbon', summary: isRectangular(site.boundary) ? 'Rectangular beds with maintenance paths between' : 'One ribbon along the long axis', ops, reasoning: ['an alternative organisation of the same plantable area', 'trade-off: more edge to maintain, less continuous ground layer'], assumptions, constraints: intent.constraints });
  }
  // C — more planting area
  {
    const ops = []; if (screenSides.length) ops.push(opEdgeBand(site, screenSides, G.round(wScreen * 1.25), intent.screenFn, `${screenBasis} — widened to ${G.round(wScreen * 1.25)} m for a fuller screen`));
    ops.push(...treeIsland(P.tree_island_pad_m + 0.3, 'z:ground_cover'));
    const keep = [...keepOut]; if (!site.open_areas.length && intent.wantsOpen) { const B = G.bbox(site.boundary); keep.push(C.toMulti([[B.minx + B.w * .3, B.miny + B.h * .2], [B.maxx - B.w * .3, B.miny + B.h * .2], [B.maxx - B.w * .3, B.miny + B.h * .55], [B.minx + B.w * .3, B.miny + B.h * .55]])); }
    ops.push(opInfill(site, [...keep, accessBand], 'z:ground_cover', site.open_areas.length || intent.wantsOpen ? `everything plantable except the open area and the ${access} access strip becomes bed` : `everything plantable except a ${P.access_band_m} m access strip becomes bed — the largest planted area, the least open ground`));
    specs.push({ id: 'C', label: 'More planting area', summary: 'Beds fill the plantable ground except the open area and access', ops, reasoning: ['maximises planted area; the open area and the access strip are the only ground left', 'trade-off: little room to move, more to maintain'], assumptions: [...assumptions, !site.open_areas.length && intent.wantsOpen ? 'the open centre is drawn as a suggested rectangle (30–70 % of the width, 20–55 % of the depth) because its extent was not stated' : null].filter(Boolean), constraints: intent.constraints });
  }
  let candidates = specs.map(s => assembleCandidate(site, s, P)).filter(c => c.beds.length);
  if (!candidates.length) { const c = assembleCandidate(site, { id: 'A', label: 'Recommended', recommended: true, summary: 'Nothing plantable', ops: [], reasoning: ['no bed of at least the minimum size fits the plantable area'], constraints: intent.constraints }, P); candidates = [c]; }
  const A = candidates.find(c => c.recommended) || candidates[0]; A.recommended = true;
  candidates = [A, ...candidates.filter(c => c !== A && differs(c, A, site, P))];
  for (const c of candidates) delete c.union;
  // a site-wide function "in the bed interior" (Ground Cover from an ecology / low-maintenance goal) belongs to every proposed bed:
  // the bed's own function list is what the planting engine reads, so it has to be complete (M55)
  const interior = project.brief.functions.filter(f => !f.alternative && f.where === 'bed-interior');
  for (const c of candidates) for (const b of c.beds) for (const f of interior) if (!b.functions.some(x => x.function === f.function)) b.functions = [...b.functions, { function: f.function, where: 'bed-interior', basis: `site-wide — ${f.basis}`, evidence: 'site-wide' }];
  return { generated: iso(), engine: 'spatial.js (polygon-clipping booleans, metre units)', inputs_fp, conceptual: false, site: { site_m2: site.site_m2, plantable_m2: site.plantable_m2, excluded: site.excluded.map(e => ({ id: e.id, kind: e.kind, label: e.label, clearance_m: e.clearance_m })), open_areas: site.open_areas.map(o => ({ id: o.id, label: o.label, area_m2: o.area_m2, status: o.status })), trees: site.trees, access_edge: site.access_edge, assumptions: site.assumptions, questions: site.questions }, intent: { screen_sides: screenSides, wants_open: intent.wantsOpen, habitat: intent.habitat, values: intent.values }, candidates, recommended_id: A.id, params: P };
}
function conceptualProposal(project, site, intent, inputs_fp) {
  const moves = [];
  if (intent.screenSides.length || intent.boundaryScreen) moves.push({ op: 'edge', text: `a ${intent.screenFn.replace('z:', '')} band along the ${intent.screenSides.length ? intent.screenSides.join(' and ') + ' edge' : 'boundary'} (width in metres once the site is sized)` });
  if (intent.wantsOpen) moves.push({ op: 'infill', text: 'an open centre, framed by low borders on the remaining edges' });
  if (intent.habitat && !intent.wantsOpen) moves.push({ op: 'edge', text: 'a continuous perimeter bed for a layered, low-upkeep ground layer; the centre left for use' });
  if (site.trees.length || (project.site.notes || []).some(n => n.kind === 'existing-tree')) moves.push({ op: 'island', text: 'the existing tree kept and underplanted as an island' });
  if (!moves.length) moves.push({ op: 'edge', text: 'a perimeter bed on every edge except the access edge (default move when no spatial wish is stated)' });
  const questions = [...site.questions]; if (intent.pendingScreen) questions.push({ key: 'screen-edge', text: 'Which edge should be screened (north / south / east / west)? No side was named, so none is assumed.' });
  if (!intent.wantsOpen && !intent.screenSides.length && !intent.boundaryScreen && !intent.pendingScreen) questions.push({ key: 'spatial', text: 'Should any part stay open (seating, play, a path), and is there an edge that needs screening?' });
  return { generated: iso(), engine: 'spatial.js', inputs_fp, conceptual: true, site: { site_m2: null, plantable_m2: null, questions, assumptions: [] }, intent: { screen_sides: intent.screenSides, wants_open: intent.wantsOpen, habitat: intent.habitat, values: intent.values }, concept: { moves, text: 'No dimensions were given, so nothing is drawn to scale: these are the spatial moves the layout would make, in order.' }, candidates: [], recommended_id: null };
}

// ---------------------------------------------------------------- materialise a candidate into the project's beds (model-level helper used by the app)
export function candidateBeds(candidate) { return candidate.beds.map(b => ({ polygon: b.polygon, holes: b.holes, name: b.name, functions: b.functions, strategy: b.strategy, strategy_params: b.strategy_params, reasoning: b.reasoning, notes: b.notes, under_canopy: b.under_canopy, min_width_m: b.min_width_m, proposal_key: b.key })); }

// ---------------------------------------------------------------- bed editing (Level 2 revision): locate → preview → apply
export function locateBed(project, ref = {}) {
  const site = deriveSite(project); const beds = project.site.beds; if (!beds.length) return { bed: null, why: 'there is no planting bed yet' };
  if (ref.bed_id) { const b = beds.find(x => x.id === ref.bed_id); return b ? { bed: b, how: 'by id' } : { bed: null, why: `no bed ${ref.bed_id}` }; }
  if (ref.name) { const n = ref.name.toLowerCase(); const b = beds.find(x => (x.name || '').toLowerCase() === n) || beds.find(x => (x.name || '').toLowerCase().includes(n)) || beds.find(x => x.id === n.replace(/\s+/, '-')); if (b) return { bed: b, how: `named "${b.name}"` }; }
  if (ref.tree) { const b = beds.find(x => x.strategy === 'island' || (x.under_canopy || []).length); if (b) return { bed: b, how: 'the bed at the tree' }; }
  if (ref.side) {
    const side = ref.side; const B = G.bbox(site.boundary || beds.flatMap(b => b.polygon)); const north = site.north || 0; const c0 = [B.minx + B.w / 2, B.miny + B.h / 2];
    const scored = beds.map(b => { const c = G.centroid(b.polygon); const v = [c[0] - c0[0], c[1] - c0[1]]; const h = G.headingOf(v, north); const d = G.angleDiff(h, G.DIRECTIONS[side] ?? 0); const named = (b.name || '').toLowerCase().startsWith(side); return { b, d: named ? -1 : d, r: Math.hypot(...v) }; }).sort((a, b) => a.d - b.d || b.r - a.r);
    if (scored[0] && scored[0].d <= 60) return { bed: scored[0].b, how: scored[0].d < 0 ? `named "${scored[0].b.name}"` : `the bed whose centre lies to the ${side} of the site centre`, alternatives: scored.slice(1).filter(s => s.d <= 60).map(s => s.b.name) };
    return { bed: null, why: `no bed lies to the ${side}; beds: ${beds.map(b => b.name).join(', ')}` };
  }
  if (beds.length === 1) return { bed: beds[0], how: 'the only bed' };
  return { bed: null, why: `which bed? ${beds.map(b => b.name).join(', ')}` };
}
const boundaryStrip = (site, d) => site.boundary ? C.difference(C.toMulti(site.boundary), C.inset({ polygon: site.boundary }, d)) : [];
export function bedEditPreview(project, req, opts = {}) {
  const P = { ...DEFAULTS, ...opts }; const site = deriveSite(project, P); const beds = project.site.beds; const out = { ok: false, request: req, changes: [], conflicts: [], notes: [], removed: [], added: [], located: null };
  const amount = req.amount_m ?? 0.5; const others = id => C.unionAll(beds.filter(b => b.id !== id).map(b => C.toMulti(b.polygon, b.holes)));
  const finish = (bedId, name, before, afterM, why) => {
    const siteM = C.toMulti(site.boundary); let m = C.intersection(afterM, siteM); const cut = { boundary: G.round(C.areaOf(afterM) - C.areaOf(m)) };
    for (const o of site.open_areas) { const ov = G.round(C.overlapArea(m, C.toMulti(o.polygon))); if (ov > 0.01) { m = C.difference(m, C.toMulti(o.polygon)); out.conflicts.push({ kind: 'open-area', text: `${ov} m² would enter ${o.label} — kept out (say "let the bed into the open area" to override)`, m2: ov }); } }
    for (const e of site.excluded.filter(e => e.kind !== 'no-plant-zone')) { const ov = G.round(C.overlapArea(m, C.outset(e.polygon, e.clearance_m))); if (ov > 0.01) { m = C.difference(m, C.outset(e.polygon, e.clearance_m)); out.conflicts.push({ kind: 'excluded', text: `${ov} m² would cover ${e.label} (incl. ${e.clearance_m} m clearance) — kept out`, m2: ov }); } }
    const oth = others(bedId); if (oth.length) { const ov = G.round(C.overlapArea(m, oth)); if (ov > 0.01) { m = C.difference(m, oth); out.conflicts.push({ kind: 'bed', text: `${ov} m² would overlap another bed — kept out`, m2: ov }); } }
    if (cut.boundary > 0.01) out.notes.push(`${cut.boundary} m² of the growth fell outside the site boundary and was clipped (the bed already sits on that edge)`);
    const parts = C.fromMulti(m, P.sliver_m2).sort((a, b) => b.area_m2 - a.area_m2); const after = parts[0]; if (parts.length > 1) out.notes.push(`the result splits into ${parts.length} pieces; the largest (${after.area_m2} m²) is kept as ${name}`);
    if (!after) { out.conflicts.push({ kind: 'empty', text: 'nothing would be left of the bed' }); return; }
    for (const t of site.trees) { const was = G.round(C.overlapArea(C.toMulti(before.polygon, before.holes), C.toMulti(G.circlePolygon(t.centre, t.radius, 24)))); const now = G.round(C.overlapArea(C.toMulti(after.polygon, after.holes), C.toMulti(G.circlePolygon(t.centre, t.radius, 24)))); if (now > was + 0.05) out.conflicts.push({ kind: 'tree', text: `${G.round(now - was)} m² more of the bed lies under ${t.label} (canopy ${t.radius_status}) — allowed, but shade planting is conditional there`, m2: G.round(now - was) }); }
    out.changes.push({ bed_id: bedId, name, why, before: { polygon: before.polygon, holes: before.holes || [], area_m2: G.round(C.areaShape(before)) }, after: { polygon: after.polygon, holes: after.holes, area_m2: after.area_m2, min_width_m: C.minWidth(after) } });
  };
  if (req.op === 'add') {
    const side = req.side || 'north'; const edges = site.edges[side] || []; if (!edges.length) { out.conflicts.push({ kind: 'locate', text: `no boundary edge faces ${side}` }); return out; }
    const band = C.edgeBand({ polygon: site.boundary }, edges, req.width_m || P.side_band_m); const parts = C.fromMulti(C.difference(C.intersection(band, site.plantable), others(null)), P.sliver_m2).sort((a, b) => b.area_m2 - a.area_m2);
    if (!parts[0]) { out.conflicts.push({ kind: 'empty', text: `no plantable room along the ${side} edge` }); return out; }
    out.added.push({ polygon: parts[0].polygon, holes: parts[0].holes, area_m2: parts[0].area_m2, name: `${side[0].toUpperCase() + side.slice(1)} bed`, functions: [{ function: req.function || 'z:ground_cover', where: `${side}-edge`, basis: 'added by request' }], strategy: 'edge', min_width_m: C.minWidth(parts[0]) }); out.located = { how: `a new band along the ${side} edge` }; out.ok = true; return out;
  }
  if (req.op === 'open_resize') {
    const o = site.open_areas[0]; if (!o) { out.conflicts.push({ kind: 'locate', text: 'there is no open area to resize — draw one with the Open area tool or say "keep the middle open"' }); return out; }
    const grow = req.direction === 'bigger'; const m = grow ? C.outset(o.polygon, amount) : C.inset({ polygon: o.polygon }, amount); const parts = C.fromMulti(C.intersection(m, C.toMulti(site.boundary))).sort((a, b) => b.area_m2 - a.area_m2);
    if (!parts[0]) { out.conflicts.push({ kind: 'empty', text: 'the open area would vanish' }); return out; }
    out.open_area = { id: o.id, before: { polygon: o.polygon, area_m2: o.area_m2 }, after: { polygon: parts[0].polygon, area_m2: parts[0].area_m2 } }; out.located = { how: `the open area "${o.label}"` };
    for (const b of beds) { const ov = G.round(C.overlapArea(C.toMulti(b.polygon, b.holes), C.toMulti(parts[0].polygon))); if (ov > 0.01) { const rest = C.fromMulti(C.difference(C.toMulti(b.polygon, b.holes), C.toMulti(parts[0].polygon)), P.sliver_m2).sort((x, y) => y.area_m2 - x.area_m2); out.conflicts.push({ kind: 'bed', text: `${b.name} loses ${ov} m² to the larger open area`, m2: ov }); if (rest[0]) out.changes.push({ bed_id: b.id, name: b.name, why: 'clipped by the open area', before: { polygon: b.polygon, holes: b.holes || [], area_m2: b.area_m2 }, after: { polygon: rest[0].polygon, holes: rest[0].holes, area_m2: rest[0].area_m2, min_width_m: C.minWidth(rest[0]) } }); else out.removed.push({ bed_id: b.id, name: b.name, why: 'entirely inside the larger open area' }); } }
    out.ok = true; return out;
  }
  const loc = locateBed(project, req.target || {}); out.located = loc; if (!loc.bed) { out.conflicts.push({ kind: 'locate', text: loc.why }); return out; }
  const bed = loc.bed; const bm = C.toMulti(bed.polygon, bed.holes);
  if (req.op === 'delete') { out.removed.push({ bed_id: bed.id, name: bed.name, why: 'removed by request' }); out.ok = true; return out; }
  if (req.op === 'resize') {
    const d = req.direction; const grow = /wider|bigger|larger|deeper|longer/.test(d);
    if (grow) finish(bed.id, bed.name, bed, C.outset({ polygon: bed.polygon, holes: bed.holes }, amount), `${d} by ${amount} m: the free edges move ${amount} m outward; the boundary, the open area and other beds hold it back`);
    else { const strip = site.boundary ? C.intersection(bm, boundaryStrip(site, amount)) : []; finish(bed.id, bed.name, bed, C.union(C.inset({ polygon: bed.polygon, holes: bed.holes }, amount), strip), `${d} by ${amount} m: the free edges move ${amount} m inward; edges on the site boundary stay`); }
    out.ok = out.changes.length > 0; return out;
  }
  if (req.op === 'move') {
    const dir = req.direction || 'north'; const north = site.north || 0; const deg = G.DIRECTIONS[dir] ?? 0; const a = (deg + north) * Math.PI / 180; const dx = Math.sin(a) * amount, dy = Math.cos(a) * amount;
    const moved = { polygon: bed.polygon.map(p => [p[0] + dx, p[1] + dy]), holes: (bed.holes || []).map(h => h.map(p => [p[0] + dx, p[1] + dy])) }; finish(bed.id, bed.name, bed, C.toMulti(moved.polygon, moved.holes), `moved ${amount} m ${dir}`); out.ok = out.changes.length > 0; return out;
  }
  if (req.op === 'split') {
    const B = G.bbox(bed.polygon); const gap = 0.6; const vertical = B.w >= B.h; const cutter = vertical ? G.polygonFromRect(gap, B.h + 1, B.minx + B.w / 2 - gap / 2, B.miny - .5) : G.polygonFromRect(B.w + 1, gap, B.minx - .5, B.miny + B.h / 2 - gap / 2);
    const parts = C.fromMulti(C.difference(bm, C.toMulti(cutter)), P.sliver_m2).sort((a, b) => b.area_m2 - a.area_m2); if (parts.length < 2) { out.conflicts.push({ kind: 'empty', text: 'the bed is too small to split with a 0.6 m path' }); return out; }
    out.changes.push({ bed_id: bed.id, name: bed.name, why: 'split: first half', before: { polygon: bed.polygon, holes: bed.holes || [], area_m2: bed.area_m2 }, after: { polygon: parts[0].polygon, holes: parts[0].holes, area_m2: parts[0].area_m2, min_width_m: C.minWidth(parts[0]) } });
    for (const p of parts.slice(1)) out.added.push({ polygon: p.polygon, holes: p.holes, area_m2: p.area_m2, name: `${bed.name} (split)`, functions: bed.functions || [], strategy: bed.strategy || 'split', min_width_m: C.minWidth(p) });
    out.ok = true; return out;
  }
  out.conflicts.push({ kind: 'op', text: `unknown operation ${req.op}` }); return out;
}
/** which plants of a design version would be affected by applying a bed preview */
export function designImpact(version, preview) {
  if (!version) return null; const changed = new Set(preview.changes.map(c => c.bed_id)), removed = new Set(preview.removed.map(r => r.bed_id)); const by = {};
  for (const p of version.plant_objects) { if (removed.has(p.bed_id)) { by[p.bed_id] = by[p.bed_id] || { bed_id: p.bed_id, plants: 0, outside_after: 0, removed_bed: true }; by[p.bed_id].plants++; by[p.bed_id].outside_after++; continue; } if (!changed.has(p.bed_id)) continue; const ch = preview.changes.find(c => c.bed_id === p.bed_id); by[p.bed_id] = by[p.bed_id] || { bed_id: p.bed_id, plants: 0, outside_after: 0, removed_bed: false }; by[p.bed_id].plants++; const inside = G.pointInPolygon(p.position_m, ch.after.polygon) && !(ch.after.holes || []).some(h => G.pointInPolygon(p.position_m, h)); if (!inside) by[p.bed_id].outside_after++; }
  const beds = Object.values(by); return { beds, plants_affected: beds.reduce((s, b) => s + b.plants, 0), plants_outside_after: beds.reduce((s, b) => s + b.outside_after, 0), untouched_beds: [...new Set(version.plant_objects.map(p => p.bed_id))].filter(id => !changed.has(id) && !removed.has(id)) };
}
export { SIDES, OPPOSITE };
