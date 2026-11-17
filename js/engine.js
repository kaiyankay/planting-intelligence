// Spatial design engine (Level 3: Plant Arrangement): deterministic, in metres, over the model and the knowledge adapter. It
// never invents a plant fact — species come from the adapter with their gate result, function status and size proxy — and it
// never places a plant outside a bed, inside a hole or a no-plant zone, or under a locked tree. It runs per planting bed and
// composes one DesignVersion from any number of beds (plant ids continue across beds; every object carries its bed_id).
// Operators (each a real geometric rule, named on the group it makes):
//   along_edge      a row on the inside of chosen bed edges, spacing from the species' spread proxy (massing overlap 15 %)
//   stagger         a second, offset row behind the first where the bed is deep enough (layer_by_height: the first row is the taller)
//   fill_drift      a jittered hexagonal lattice over the remaining area, species assigned by a low-frequency noise field → drifts
//   repeat_accent   every n-th fill position toward the open side becomes an accent plant (repetition)
//   avoid_obstacle / keep_open   filters applied to every operator
// Local edits (reduce / increase density, remove / swap species, move away) act only on the plants inside the resolved scope and
// never move the rest. Geometry updates regenerate only the beds whose outline changed and keep every other bed's plants, user
// edits included. Everything carries the seed, the operator and its parameters so a version can be regenerated.
import * as G from './geom.js';
import { effectiveConditions, nextPlantId, clonePlants, diff as versionDiff, schedule, bedShape, bedFingerprint } from './model.js';

const FN_LABEL = { 'z:screen': 'Screen', 'z:scrim': 'Scrim', 'z:ceiling_canopy': 'Ceiling / Canopy', 'z:ground_cover': 'Ground Cover', 'z:barrier': 'Barrier' };
const STATUS_RANK = { documented: 0, derived: 1, candidate: 2, unknown: 3 };
const GATE_RANK = { pass: 0, conditional: 1, unknown: 2, fail: 9 };
const bedOf = (project, id) => project.site.beds.find(b => b.id === id) || null;
const bedAt = (project, p) => project.site.beds.find(b => b.status !== 'rejected' && G.pointInShape(p, bedShape(b))) || null;

// ---------------------------------------------------------------- obstacles and placement checks
export function obstaclesFor(project) {
  const out = [];
  for (const f of project.site.features) {
    if (f.kind === 'existing-tree') out.push({ id: f.id, kind: 'tree', centre: f.position_m, radius: f.radius_m ?? 1.5, radius_status: f.radius_m != null ? f.radius_status || 'user-stated' : 'assumed 1.5 m — canopy not stated', label: f.label || 'existing tree' });
    else if (f.polygon) out.push({ id: f.id, kind: f.kind, polygon: f.polygon, label: f.label || f.kind });
  }
  return out;
}
export function placeable(p, r, bed, obstacles, site) {
  if (!bed) return { ok: false, why: 'no bed' };
  const shape = bedShape(bed);
  if (!G.pointInShape(p, shape)) return { ok: false, why: (bed.holes || []).some(h => G.pointInPolygon(p, h)) ? 'inside a hole of the bed' : 'outside the bed' };
  if (G.distToShapeEdge(p, shape) < r * 0.5) return { ok: false, why: 'too close to the bed edge' };
  if (site?.boundary && !G.pointInPolygon(p, site.boundary)) return { ok: false, why: 'outside the site' };
  for (const o of obstacles) {
    if (o.kind === 'tree' && G.dist(p, o.centre) < o.radius * 0.6 + r * 0.5) return { ok: false, why: `under the canopy of ${o.label}` };
    if (o.polygon && G.pointInPolygon(p, o.polygon)) return { ok: false, why: `inside the no-plant zone ${o.label}` };
  }
  return { ok: true };
}
const wantedFunctions = (project, bed) => {   // the bed's own list, else the site-wide one; a Screen without its own requirement takes the site-wide one
  const site = project.brief.functions.filter(f => !f.alternative); const own = bed?.functions?.length ? bed.functions.filter(f => !f.alternative) : site; const sreq = site.find(f => f.function === 'z:screen' && (f.target_height_m != null || f.year_round != null));
  return own.map(f => f.function === 'z:screen' && sreq ? { ...f, target_height_m: f.target_height_m ?? sreq.target_height_m, target_basis: f.target_height_m != null ? f.target_basis : sreq.target_basis, year_round: f.year_round ?? sreq.year_round } : f);
};
/** which spatial functions the engine can turn into an arrangement today (M55). The others are recorded on the bed and reported,
 *  never planted: no arrangement rule exists for them yet, and none is invented. */
export const FUNCTION_SUPPORT = {
  'z:screen': { arranged: true, operators: ['along_edge', 'stagger'] },
  'z:ground_cover': { arranged: true, operators: ['fill_drift', 'repeat_accent'] },
  'z:scrim': { arranged: false, why: 'recorded only — there is no rule yet for a filtering (porous) row, so nothing is placed for it' },
  'z:ceiling_canopy': { arranged: false, why: 'recorded only — there is no tree-placement rule yet, so no canopy tree is placed' },
  'z:barrier': { arranged: false, why: 'recorded only — there is no barrier arrangement rule yet, so nothing is placed for it' },
};
export const functionArranged = fn => !!FUNCTION_SUPPORT[fn]?.arranged;

// ---------------------------------------------------------------- light under an existing canopy (M55)
/** HEURISTICS — thresholds chosen by the implementer, NOT taken from a source or a claim. Kept until reviewed (methods M55); each is
 *  named wherever it decides something (assemblage notes, version assumptions, the Compose message). */
export const HEURISTICS = {
  canopy_share_min: { value: 0.5, text: 'heuristic: a bed counts as "under the canopy" when at least 50 % of its area lies under existing tree crowns (threshold not from a source)' },
  edge_share_min: { value: 0.5, text: 'heuristic: a bed counts as lying along a site edge when at least 50 % of its longest side runs on that edge (threshold not from a source)' },
};
export const CANOPY_SHARE_MIN = HEURISTICS.canopy_share_min.value;

/** ARRANGEMENT RULES (round 2, methods M56) — every number the arrangement uses, with where it comes from:
 *    claim      read from the database, with the claim id carried on the plant object
 *    geometry   follows from the shapes, no judgement in it
 *    heuristic  chosen by the implementer; no professional source or claim backs it (the database holds no spacing claim) */
export const ARRANGEMENT_RULES = {
  size_proxy: { value: 0.5, unit: '× claimed mature spread = crown radius', source: 'claim', note: 'one claimed range per species (the median species-level range, or the range stated for the bed light); its claim id is on every plant object' },
  screen_spacing: { value: 0.75, unit: '× claimed mature spread, centre to centre', source: 'heuristic', note: 'mature crowns overlap by a quarter so the row closes; the database holds no spacing claim' },
  ground_spacing: { value: 0.65, unit: '× mean claimed mature spread of the ground species', source: 'heuristic', note: 'the database holds no spacing claim' },
  row_inset: { value: 1.0, unit: '× crown radius between the screened edge and the stems', source: 'geometry', note: 'the mature crown touches the edge without crossing it' },
  row_end_margin: { value: 0.9, unit: '× crown radius kept free at each end of a row', source: 'heuristic' },
  edge_tolerance: { value: 0.5, unit: '× crown radius: least distance of a stem from any bed edge', source: 'heuristic', note: 'a mature crown may overhang the inner bed edge by up to half its radius' },
  stagger_offset: { value: 1.6, unit: '× inner-row crown radius between the two rows', source: 'heuristic' },
  stagger_clearance: { value: 0.9, unit: '× inner-row crown radius between the inner row and the inner bed edge', source: 'heuristic' },
  neighbour_clearance: { value: 0.6, unit: '× sum of two crown radii: least distance between stems', source: 'heuristic' },
  ground_jitter: { value: 0.35, unit: '× spacing (seeded)', source: 'heuristic', note: 'breaks the lattice into drifts' },
  rhythm_band: { value: 2, unit: '× spacing: length of one species band along the bed (medium grain; bold 4, fine 1)', source: 'heuristic', note: 'a composition choice, not a horticultural rule' },
  patch_radius: { value: 1.7, unit: '× spacing: radius of one patch (medium grain; bold 2.4, fine 1.15)', source: 'heuristic', note: 'a composition choice, not a horticultural rule' },
  patch_gap: { value: 1.1, unit: '× spacing of open ground between two patches', source: 'heuristic', note: 'the ground between patches is left unplanted on purpose; the cover estimate counts it as uncovered' },
  tree_keepout: { value: 0.6, unit: '× existing canopy radius kept free around the trunk', source: 'heuristic' },
  screen_target_height: { value: 1.8, unit: 'm, used only when no target height is stated', source: 'heuristic', note: 'a standing eye-level default; state the height to replace it' },
  gap_report_min: { value: 0.05, unit: 'm: shortest uncovered stretch reported as a gap', source: 'heuristic', note: 'below the 1 cm × 5 drawing precision' },
  area_sample: { value: 0.1, unit: 'm sample grid for plantable area and cover', source: 'geometry' },
};
const RV = k => ARRANGEMENT_RULES[k].value;
/** COMPOSITION (methods M64) — what the user may choose for one bed in Compose. Every option is an instruction to the operators below;
 *  none of them changes which species qualify, the spacing rule, the clearances or the obstacles. A bed without a composition is planted
 *  with the defaults (drifts · medium · rows as the site rule says · density 1 · variation 0), exactly as before this existed. */
export const COMPOSITION = {
  patterns: {
    drifts: { label: 'Naturalistic drifts', operator: 'fill_drift', text: 'a loose lattice; the species change in soft-edged drifts' },
    rhythm: { label: 'Rhythmic rows', operator: 'fill_rhythm', text: 'a regular lattice along the bed; the species repeat in even bands' },
    patches: { label: 'Clustered patches', operator: 'fill_patch', text: 'one-species clusters with open ground left between them' },
  },
  rows: { single: { label: 'Single row', text: 'one row along the screened edge' }, double: { label: 'Staggered double row', text: 'a second row behind the first, set in the gaps' } },
  grain: { bold: { label: 'Bold', cell: 2.2, band: 4, patch: 2.4 }, medium: { label: 'Medium', cell: 1.4, band: RV('rhythm_band'), patch: RV('patch_radius') }, fine: { label: 'Fine', cell: 0.7, band: 1, patch: 1.15 } },
  density: [{ id: 0.8, label: 'Open' }, { id: 1, label: 'Standard' }, { id: 1.25, label: 'Close' }],
  max_species: { ground: 3, screen: 2 },
};
export const compositionOf = bed => { const c = bed?.composition || {}; return { pattern: COMPOSITION.patterns[c.pattern] ? c.pattern : 'drifts', grain: COMPOSITION.grain[c.grain] ? c.grain : 'medium', rows: COMPOSITION.rows[c.rows] ? c.rows : 'auto', density: c.density > 0 ? +c.density : 1, variation: Number.isInteger(c.variation) && c.variation > 0 ? c.variation : 0, ground_species: Array.isArray(c.ground_species) ? c.ground_species : null, screen_species: Array.isArray(c.screen_species) ? c.screen_species : null, custom: !!bed?.composition }; };
/** what a Screen function asks for. A target height that was not stated falls back to the heuristic default and says so; a year-round
 *  requirement that was not stated is NOT assumed (winter cover is then reported, not required). */
export function screenRequirement(fns) {
  const list = (Array.isArray(fns) ? fns : [fns]).filter(f => f && f.function === 'z:screen'); const stated = list.filter(f => f.target_height_m != null);
  const yr = list.some(f => f.year_round === true); const yrStated = list.some(f => f.year_round != null);
  return { target_height_m: stated.length ? Math.max(...stated.map(f => +f.target_height_m)) : RV('screen_target_height'), target_basis: stated.length ? (stated[0].target_basis || 'stated') : 'heuristic default — no target height stated', year_round: yr, year_round_basis: yr ? 'required' : yrStated ? 'not required' : 'not stated — winter cover is reported, not required' };
}
/** depth of the bed behind an edge: the shortest inward run (5 probes along the edge, 5 cm steps) before leaving the bed */
export function edgeDepth(bed, e) {
  const shape = bedShape(bed); let best = Infinity;
  for (const k of [0.15, 0.3, 0.5, 0.7, 0.85]) { const p0 = [e.a[0] + (e.b[0] - e.a[0]) * k, e.a[1] + (e.b[1] - e.a[1]) * k]; let d = 0; for (let t = 0.025; t <= 40; t += 0.05) { if (!G.pointInShape([p0[0] - e.n[0] * t, p0[1] - e.n[1] * t], shape)) break; d = t + 0.025; } best = Math.min(best, d); }
  return G.round(best === Infinity ? 0 : best);
}
/** can a single row, and a staggered second row, stand behind an edge — and how many plants at what spacing? Pure arithmetic on the
 *  bed depth, the edge length and the crown radii; the placement itself still checks every point against holes, obstacles and neighbours. */
export function rowPlan({ depth_m, edge_length_m, r_lead, r_alt = r_lead, r_inner = r_lead, density = 1, stagger = true, spacing_factor = RV('screen_spacing') }) {
  const mixed = r_alt !== r_lead; const rmax = Math.max(r_lead, r_alt); const single_need = G.round(rmax * (RV('row_inset') + RV('edge_tolerance'))); const stagger_need = G.round(rmax * RV('row_inset') + r_inner * (RV('stagger_offset') + RV('stagger_clearance')));
  const spread = r_lead + r_alt;   // = the claimed mature spread for one species; the mean of the two spreads when the row alternates two
  const spacing = spread * spacing_factor / density; const margin = r_lead * RV('row_end_margin'); const usable = edge_length_m - 2 * margin;   // the row starts and ends with the lead species, so both ends close
  const single = depth_m >= single_need && usable >= 0; let n1 = single ? Math.max(1, Math.floor(usable / spacing) + 1) : 0; if (mixed && n1 > 1 && n1 % 2 === 0) n1 -= 1;
  const step = n1 > 1 ? usable / (n1 - 1) : 0; const row1 = Array.from({ length: n1 }, (_, i) => G.round(margin + step * i, 3));
  const second = single && stagger && depth_m >= stagger_need && n1 > 1; const row2 = second ? row1.slice(0, -1).map(t => G.round(t + step / 2, 3)) : [];
  const why = !single ? (usable < 0 ? `the edge (${G.round(edge_length_m)} m) is shorter than one crown with its end margins` : `a single row needs ${single_need} m of bed depth (crown radius ${rmax} m × ${RV('row_inset') + RV('edge_tolerance')}), the bed has ${depth_m} m`) : !stagger ? 'one row; the second row is switched off' : !second ? (n1 > 1 ? `one row; a staggered second row needs ${stagger_need} m of bed depth, the bed has ${depth_m} m` : 'one plant only — no second row') : 'two rows fit';
  return { depth_m, edge_length_m: G.round(edge_length_m), spacing_m: G.round(spacing), step_m: G.round(step), spacing_rule: `${spacing_factor} × claimed mature spread (${mixed ? `mean of the two species, ${G.round(spread)} m` : `${G.round(spread)} m`})${density !== 1 ? ` ÷ density ${density}` : ''}; the plants are then spread evenly over the edge${mixed ? ', an odd number so both ends are the lead species' : ''}`, spacing_source: ARRANGEMENT_RULES.screen_spacing.source, end_margin_m: G.round(margin), single_row: { feasible: single, needs_depth_m: single_need }, staggered_row: { feasible: second, needs_depth_m: stagger_need, enabled: !!stagger }, rows: single ? (second ? 2 : 1) : 0, expected: [row1.length, row2.length], row1_t: row1, row2_t: row2, reason: why };
}
const FIT_RANK = { meets: 0, uncertain: 1, fails: 9 };
const fitOf = checks => { const rs = Object.values(checks).map(c => c.result); return rs.includes('fails') ? 'fails' : rs.every(r => r === 'meets') ? 'meets' : 'uncertain'; };
const siteCheck = r => r.gate.overall === 'fail' ? { result: 'fails', detail: `fails a site gate: ${['light', 'water', 'soil'].filter(k => r.gate[k].result === 'fail').map(k => r.gate[k].detail).join('; ')}` } : r.gate.overall === 'pass' ? { result: 'meets', detail: 'passes the light, water and soil gates' } : { result: 'uncertain', detail: `site gates ${r.gate.overall}: ${['light', 'water', 'soil'].filter(k => r.gate[k].result !== 'pass').map(k => `${k} ${r.gate[k].result}${r.gate[k].result === 'conditional' ? ` (${r.gate[k].detail})` : ''}`).join(', ')}` };
const evidenceCheck = e => ({ result: e.result === 'supported' ? 'meets' : e.result === 'none' ? 'fails' : 'uncertain', detail: e.detail, verified: e.verified, conflict: e.conflict, link: e.link });
const candidate = (r, checks, extra = {}) => { const fit = fitOf(checks); return { id: r.id, name: r.name, fit, checks, reasons: Object.entries(checks).filter(([, c]) => c.result !== 'meets').map(([k, c]) => `${k}: ${c.detail}`), verified: Object.values(checks).every(c => c.verified !== false), proxy_radius_m: r.proxy.radius_m, ...extra }; };
/** share of the bed's area under existing tree crowns (0.2 m sample grid), with the tree that covers most of it; null when none */
export function canopyCover(project, bed) {
  const trees = obstaclesFor(project).filter(o => o.kind === 'tree'); if (!trees.length || !bed?.polygon) return null;
  const B = G.bbox(bed.polygon), shape = bedShape(bed), per = trees.map(() => 0); let n = 0, any = 0;
  for (let y = B.miny + 0.1; y < B.maxy; y += 0.2) for (let x = B.minx + 0.1; x < B.maxx; x += 0.2) { const q = [x, y]; if (!G.pointInShape(q, shape)) continue; n++; let hit = false; trees.forEach((t, i) => { if (G.dist(q, t.centre) <= t.radius) { per[i]++; hit = true; } }); if (hit) any++; }
  if (!n || !any) return null; const t = trees[per.indexOf(Math.max(...per))];
  return { share: G.round(any / n), tree_id: t.id, label: t.label, radius_m: t.radius, radius_status: /assumed/.test(t.radius_status) ? `canopy ${t.radius_status}` : `canopy radius ${t.radius} m, ${t.radius_status}` };
}
/** the conditions a bed is checked against: the site's, the bed's own overrides, and — when the bed lies mostly under an existing
 *  canopy and no light was stated for the bed itself — the site light marked as "under canopy" (the gate then reads it as a range
 *  from the stated light to one step shadier, conditional at best; it is never turned into full shade). */
export function bedConditions(project, bed) {
  const c = effectiveConditions(project, bed?.id); if (!bed || bed.conditions_overrides?.light) return c;
  const cov = canopyCover(project, bed); if (!cov || cov.share < CANOPY_SHARE_MIN) return c;
  return { ...c, light: { ...c.light, canopy: cov } };
}
/** the bed edges a function's `where` names: '<compass>-edge' → edges facing that way (those on the site boundary when there are
 *  any); 'boundary' → edges facing out of the site; anything else (an unknown direction, 'bed-interior') → none. Never a default side. */
export function edgesFor(project, bed, where) {
  const north = project.site.orientation.north_angle_degrees || 0; const site = project.site.boundary; const sc = site ? G.centroid(site) : G.centroid(bed.polygon);
  const onBoundary = e => !site || G.distToBoundary([(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2], site) < 0.15; let edges;
  if (/-edge$/.test(where || '')) { const deg = G.DIRECTIONS[where.replace('-edge', '')]; if (deg == null) return []; edges = G.edgesFacing(bed.polygon, deg, north, 50); }
  else if (where === 'boundary') { const Q = G.ccw(bed.polygon); edges = Q.map((q, i) => ({ i, a: q, b: Q[(i + 1) % Q.length], n: G.outwardNormal(Q, i) })).filter(e => { const m = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]; return (m[0] - sc[0]) * e.n[0] + (m[1] - sc[1]) * e.n[1] > 0; }); }
  else return [];
  const ob = edges.filter(onBoundary); return ob.length ? ob : edges;
}
/** does a site-wide function with this `where` concern this bed? (used when a site-wide function is added on the Compose page) */
export function bedMatchesWhere(project, bed, where) {
  if (where === 'bed-interior') return true; const site = project.site.boundary; const es = edgesFor(project, bed, where); if (!site) return es.length > 0;
  const Q = bed.polygon; const longest = Math.max(...Q.map((q, i) => G.dist(q, Q[(i + 1) % Q.length])));
  const on = es.filter(e => G.distToBoundary([(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2], site) < 0.15).reduce((s, e) => s + G.dist(e.a, e.b), 0);
  return on >= longest * HEURISTICS.edge_share_min.value;   // HEURISTIC (see HEURISTICS): the short end of a side border does not count
}

// ---------------------------------------------------------------- candidate assemblage per bed (reasons kept)
export function assemble(project, K, bed) {
  const conds = bedConditions(project, bed); const prefs = { maintenance_low: !!project.brief.values.maintenance_low };
  const wanted = wantedFunctions(project, bed).map(f => f.function);
  const rows = K.species.map(s => { const gate = K.gate(s.id, conds, prefs); const proxy = K.proxy(s.id, conds.light?.value); const fns = Object.fromEntries(K.d.functions.map(f => [f.id, K.functionSupport(s.id, f.id)])); return { id: s.id, name: s.scientific_name, form: s.growth_form_label, gate, proxy, fns, evergreen: K.evergreen(s.id), interest: K.interest(s.id), ecology: gate.ecology, why: [], excluded: null }; });
  const B = G.bbox(bed.polygon); const narrow = bed.min_width_m != null ? bed.min_width_m : Math.min(B.w, B.h);
  for (const r of rows) {
    if (r.gate.overall === 'fail') r.excluded = `fails a site gate: ${['light', 'water', 'soil'].filter(k => r.gate[k].result === 'fail').map(k => r.gate[k].detail).join('; ')}`;
    else if (r.form === 'Tree' && 2 * r.proxy.radius_m > Math.min(B.w, B.h)) r.excluded = `a tree whose claimed mature spread (${r.proxy.spread.min}–${r.proxy.spread.max} m, ${r.proxy.spread.claim}) exceeds the bed (${G.round(B.w, 1)} × ${G.round(B.h, 1)} m)`;
    else if (r.form !== 'Tree' && 2 * r.proxy.radius_m > narrow * 1.6 && narrow < 1.2) r.excluded = `claimed mature spread ${r.proxy.spread.min}–${r.proxy.spread.max} m is wider than this ${narrow} m bed allows`;
  }
  const pool = rows.filter(r => !r.excluded);
  const rank = (r, fn) => (STATUS_RANK[r.fns[fn]?.status] ?? 3) * 10 + (r.fns[fn]?.conflict ? 4 : 0) + GATE_RANK[r.gate.overall] * 2 + (r.evergreen?.includes('Evergreen') ? 0 : 1);
  const picks = { screen: [], ground: [], accent: [], canopy: [] };
  const used = new Set();
  const take = (role, list, n, why) => { for (const r of list.slice(0, n)) { if (used.has(r.id)) continue; used.add(r.id); r.role = role; r.why.push(why(r)); picks[role].push(r); } };
  const wantGround = wanted.includes('z:ground_cover'); const candidates = { screen: [], ground: [] }; let requirement = null; const comp = compositionOf(bed); const eligible = { screen: [], ground: [] };
  const mix = (role, ok, auto) => { const want = comp[`${role}_species`]; const mine = want ? want.map(id => ok.find(r => r.id === id)).filter(Boolean).slice(0, COMPOSITION.max_species[role]) : []; return mine.length ? mine : auto; };   /* a chosen species that no longer qualifies is dropped; an empty choice falls back to the engine's own */
  const byFit = (a, b, fn) => FIT_RANK[a.cand.fit] - FIT_RANK[b.cand.fit] || rank(a, fn) - rank(b, fn);
  if (wanted.includes('z:screen')) {
    // Screen: every species is checked against the requirement (target height, year-round), the evidence for the function, the site
    // and the bed depth behind the screened edge; 'fails' is never planted, 'uncertain' may be planted and is reported as such
    requirement = screenRequirement(wantedFunctions(project, bed)); const edges = wantedFunctions(project, bed).filter(f => f.function === 'z:screen').flatMap(f => edgesFor(project, bed, f.where));
    /* V4.3 · the depth is read stretch by stretch. Before, the shallowest stretch decided for the whole bed, so a short chamfered corner (0.25 m deep at its taper) ruled out every species on a 6.5 m edge that is 1.2 m deep. Generation already plans each stretch on its own. */
    const stretches = edges.map(e => ({ len: G.dist(e.a, e.b), depth: edgeDepth(bed, e) })); const totalLen = G.round(stretches.reduce((t, x) => t + x.len, 0)); const depth = stretches.length ? Math.max(...stretches.map(x => x.depth)) : null;
    for (const r of rows) {
      const ev = K.functionEvidence(r.id, 'z:screen'); const checks = { evidence: evidenceCheck(ev) };
      if (ev.result !== 'none') {
        if (r.form === 'Tree') checks.form = { result: 'fails', detail: 'a tree — the row operators arrange shrubs and perennials; there is no tree-placement rule' };
        checks.site = siteCheck(r); const h = K.heightAgainst(r.id, requirement.target_height_m, conds.light?.value); checks.height = { result: h.result === 'unknown' ? 'uncertain' : h.result, detail: h.detail, verified: h.verified, claims: h.claims };
        if (requirement.year_round) { const y = K.yearRound(r.id); checks.year_round = { result: y.result, detail: y.detail, verified: y.verified, claims: y.claims }; }
        if (depth != null) { const need = G.round(r.proxy.radius_m * (RV('row_inset') + RV('edge_tolerance'))); const fitS = stretches.filter(x => x.depth >= need), shortS = stretches.filter(x => x.depth < need); const fitLen = G.round(fitS.reduce((t, x) => t + x.len, 0));
          checks.geometry = fitS.length ? { result: 'meets', detail: shortS.length ? `a row fits on ${fitLen} m of the ${totalLen} m edge: needs ${need} m of bed depth, has ${G.round(Math.max(...fitS.map(x => x.depth)))} m there; ${G.round(totalLen - fitLen)} m of the edge is only ${G.round(Math.min(...shortS.map(x => x.depth)))} m deep and stays without a row` : `a row fits: needs ${need} m of bed depth, has ${G.round(Math.min(...fitS.map(x => x.depth)))} m`, fits_m: fitLen, edge_m: totalLen } : { result: 'fails', detail: `the row does not fit: crown radius ${r.proxy.radius_m} m (${r.proxy.spread.claim || 'no spread claim'}) needs ${need} m of bed depth, the bed has ${depth} m` }; }
      }
      r.cand = candidate(r, checks, { function: 'z:screen' }); candidates.screen.push(r.cand);
    }
    const ok = rows.filter(r => r.cand.fit !== 'fails').sort((a, b) => byFit(a, b, 'z:screen')); const chosen = mix('screen', ok, ok.length ? [ok[0], ...ok.slice(1, 2).filter(x => x.cand.fit === ok[0].cand.fit)] : []);   // a second species only when it is as good as the first — or when the user chose it among those that qualify
    eligible.screen = ok.map(r => r.id);
    take('screen', chosen, 2, r => `Screen (${r.cand.fit}${r.cand.fit === 'uncertain' ? ' — ' + r.cand.reasons.join('; ') : ''}): target ${requirement.target_height_m} m (${requirement.target_basis})${requirement.year_round ? ', year-round' : ''}; ${r.cand.checks.height.detail}; evidence ${r.cand.checks.evidence.detail}; ${r.cand.checks.site.detail}`);
  }
  if (wantGround) {
    for (const r of rows) {
      if (used.has(r.id)) continue; const ev = K.functionEvidence(r.id, 'z:ground_cover'); const checks = { evidence: evidenceCheck(ev) };
      if (ev.result !== 'none') { checks.site = siteCheck(r); checks.geometry = r.excluded && !/site gate/.test(r.excluded) ? { result: 'fails', detail: r.excluded } : { result: 'meets', detail: `crown radius ${r.proxy.radius_m} m (${r.proxy.spread.claim || 'spread not recorded'}) fits the bed` }; if (r.proxy.spread.value_m == null) checks.size = { result: 'uncertain', detail: 'mature spread not recorded — radius assumed 0.3 m' }; }
      r.gcand = candidate(r, checks, { function: 'z:ground_cover' }); candidates.ground.push(r.gcand);
    }
    const ok = rows.filter(r => r.gcand && r.gcand.fit !== 'fails').sort((a, b) => FIT_RANK[a.gcand.fit] - FIT_RANK[b.gcand.fit] || rank(a, 'z:ground_cover') - rank(b, 'z:ground_cover'));
    eligible.ground = ok.map(r => r.id);
    take('ground', mix('ground', ok, ok.slice(0, 2)), COMPOSITION.max_species.ground, r => `Ground Cover (${r.gcand.fit}${r.gcand.fit === 'uncertain' ? ' — ' + r.gcand.reasons.join('; ') : ''}): evidence ${r.gcand.checks.evidence.detail}; ${r.gcand.checks.site.detail}; spread ${r.proxy.spread.min ?? '?'}–${r.proxy.spread.max ?? '?'} m (${r.proxy.spread.claim || 'not recorded'})`);
  }
  if (wantGround && (project.brief.values.ecology || project.brief.values.seasonal_interest)) {   // the accent replaces ground positions, so it needs a ground layer
    const list = pool.filter(r => !used.has(r.id) && r.form !== 'Tree' && r.proxy.radius_m <= 0.6 && (r.ecology.result === 'documented' || r.interest)).sort((a, b) => GATE_RANK[a.gate.overall] - GATE_RANK[b.gate.overall] || (b.ecology.result === 'documented') - (a.ecology.result === 'documented'));
    take('accent', list, 1, r => `accent: ${r.ecology.result === 'documented' ? `ecological value recorded — ${r.ecology.detail}` : ''}${r.interest ? `${r.ecology.result === 'documented' ? '; ' : ''}interest recorded — ${r.interest.join(', ')}` : ''}; gate ${r.gate.overall}`);
  }
  const notes = []; const unsupported = [...new Set(wanted)].filter(fn => !functionArranged(fn)).map(fn => ({ function: fn, label: FN_LABEL[fn] || fn, why: FUNCTION_SUPPORT[fn]?.why || 'recorded only — no arrangement rule' }));
  for (const u of unsupported) notes.push(`${bed.name}: ${u.label} is ${u.why}`);
  if (!wanted.length) notes.push(`${bed.name}: no spatial function is set for this bed or site-wide — nothing is planted here until one is chosen`);
  if (conds.light?.canopy) notes.push(`${bed.name}: ${Math.round(conds.light.canopy.share * 100)} % under ${conds.light.canopy.label} (${conds.light.canopy.radius_status}) — light is checked as a range from ${conds.light.value || 'unknown'} to one step shadier; candidates are conditional at best (${HEURISTICS.canopy_share_min.text})`);
  const whyNone = list => list.filter(c => c.checks.evidence.result !== 'fails').map(c => `${c.name} — ${c.reasons.filter(x => c.checks[x.split(':')[0]].result === 'fails').join('; ')}`).join(' · ') || 'no species is linked to it';
  if (wantGround && !picks.ground.length) notes.push(`${bed.name}: no Ground Cover species can be used — the bed interior stays unplanted (${whyNone(candidates.ground)})`);
  if (wanted.includes('z:screen') && !picks.screen.length) notes.push(`${bed.name}: no species meets the Screen requirement (target ${requirement.target_height_m} m${requirement.year_round ? ', year-round' : ''}) — the screened edge stays unplanted (${whyNone(candidates.screen)})`);
  if (rows.some(r => r.form === 'Tree' && r.excluded?.startsWith('a tree'))) notes.push(`${bed.name}: no new tree placed — ${rows.filter(r => r.form === 'Tree' && r.excluded?.startsWith('a tree')).map(r => r.name).join(', ')} exceed the bed at claimed mature spread`);
  return { rows, picks, notes, conditions: conds, prefs, wanted, unsupported, candidates, requirement, eligible, composition: comp };
}

// ---------------------------------------------------------------- zones from the bed's functions (or the brief's) and its geometry
export function zonesFor(project, bed) {
  const zones = []; const wanted = wantedFunctions(project, bed);
  for (const f of wanted) {
    if (f.function !== 'z:screen') continue;   // Screen is the only edge function with an arrangement rule (FUNCTION_SUPPORT)
    const edges = edgesFor(project, bed, f.where); if (!edges.length) continue;
    zones.push({ id: `zone-${f.function.split(':')[1]}-${f.where}-${bed.id}`, bed_id: bed.id, kind: 'edge', function: f.function, label: `${FN_LABEL[f.function]} along the ${f.where.replace('-', ' ')} (${bed.name})`, edges: edges.map(e => ({ a: e.a, b: e.b, n: e.n })), priority: 1, basis: f.basis, requirement: screenRequirement(wanted) });
  }
  for (const feat of project.site.features) if (feat.kind === 'no-plant-zone' && feat.polygon) zones.push({ id: `zone-open-${feat.id}-${bed.id}`, bed_id: bed.id, kind: 'open', label: feat.label || 'open (no-plant) zone', polygon: feat.polygon, priority: 1 });
  if (wanted.some(f => f.function === 'z:ground_cover')) zones.push({ id: `zone-fill-${bed.id}`, bed_id: bed.id, kind: 'fill', label: `ground layer (${bed.name})`, polygon: bed.polygon, priority: 2 });
  return zones;
}

// ---------------------------------------------------------------- generation (one bed → plants; many beds → one version)
function generateBed(project, K, bed, seed, params, nid, existing) {
  const comp = compositionOf(bed); const grain = COMPOSITION.grain[comp.grain]; const vseed = seed + comp.variation * 7919;   /* variation: another roll of the same rules for this bed only */
  const density = (params.density ?? 1) * comp.density; const rand = G.rng(vseed + hashId(bed.id)); const noise = G.valueNoise(vseed + 7 + hashId(bed.id), params.drift_cell ?? grain.cell);
  const SPACING = { screen: params.spacing_screen ?? 0.75, ground: params.spacing_ground ?? 0.65 };
  const obstacles = obstaclesFor(project); const asm = assemble(project, K, bed); const zones = zonesFor(project, bed);
  const plants = [], groups = [], unresolved = []; const shape = bedShape(bed);
  const ok = (p, r) => placeable(G.roundPt(p), r, bed, obstacles, project.site).ok;   // checked on the rounded point the object will carry
  const clear = (p, r) => plants.every(q => G.dist(p, q.position_m) >= (r + q.proxy_radius_m) * 0.6) && existing.every(q => G.dist(p, q.position_m) >= (r + q.proxy_radius_m) * 0.6);
  const mk = (species, p, role, group, zone) => ({ id: nid(), species_id: species.id, bed_id: bed.id, position_m: G.roundPt(p), proxy_radius_m: species.proxy.radius_m, proxy_source: { claim: species.proxy.spread.claim, range_m: [species.proxy.spread.min, species.proxy.spread.max], status: species.proxy.radius_status, note: species.proxy.spread.note }, height_m: species.proxy.height_m, height_source: { claim: species.proxy.height.claim, range_m: [species.proxy.height.min, species.proxy.height.max], status: species.proxy.height_status, max_claimed_m: species.proxy.height_max_claimed_m }, role, group_id: group, zone_id: zone, locked: false, origin: 'generated' });
  for (const z of zones.filter(z => z.kind === 'edge')) {
    const sp = asm.picks.screen; if (!sp.length) { unresolved.push(`${z.label}: no eligible species — left unplanted. ${asm.notes.find(n => /no species meets the Screen requirement/.test(n)) || ''}`.trim()); continue; }
    const lead = sp[0], back = sp[sp.length - 1]; const r = lead.proxy.radius_m, r2 = back.proxy.radius_m; z.row_plans = [];
    const g1 = { id: `group-${bed.id}-${groups.length + 1}`, bed_id: bed.id, zone_id: z.id, role: 'screen', operator: 'along_edge', params: { spacing: `${SPACING.screen} × claimed mature spread`, spacing_source: ARRANGEMENT_RULES.screen_spacing.source, inset: 'proxy radius', species: sp.map(s => s.id), alternate: sp.length > 1, fit: sp.map(s => s.cand?.fit) }, plant_ids: [] };
    const g2 = { id: `group-${bed.id}-${groups.length + 2}`, bed_id: bed.id, zone_id: z.id, role: 'screen-layer', operator: 'stagger', params: { offset: `${RV('stagger_offset')} × radius inward`, offset_source: ARRANGEMENT_RULES.stagger_offset.source, species: [back.id] }, plant_ids: [] };
    z.edges.forEach((e, ei) => {
      const alt = sp.length > 1 ? sp[1] : lead; const plan = rowPlan({ depth_m: edgeDepth(bed, e), edge_length_m: G.dist(e.a, e.b), r_lead: r, r_alt: alt.proxy.radius_m, r_inner: r2, density, stagger: comp.rows === 'single' ? false : comp.rows === 'double' ? true : params.stagger !== false, spacing_factor: SPACING.screen }); const rmax = Math.max(r, alt.proxy.radius_m); const n0 = [g1.plant_ids.length, g2.plant_ids.length];
      const len = G.dist(e.a, e.b) || 1; const at = (t, d) => [e.a[0] + (e.b[0] - e.a[0]) * t / len - e.n[0] * d, e.a[1] + (e.b[1] - e.a[1]) * t / len - e.n[1] * d];
      plan.row1_t.forEach((t, i) => { const s = i % 2 === 0 ? lead : alt; const p = at(t, s.proxy.radius_m * RV('row_inset')); if (ok(p, s.proxy.radius_m) && clear(p, s.proxy.radius_m)) { const o = mk(s, p, 'screen', g1.id, z.id); plants.push(o); g1.plant_ids.push(o.id); } });
      const off = rmax * RV('row_inset') + r2 * RV('stagger_offset'); plan.row2_t.forEach(t => { const p = at(t, off); if (ok(p, r2) && clear(p, r2)) { const o = mk(back, p, 'screen-layer', g2.id, z.id); plants.push(o); g2.plant_ids.push(o.id); } });
      plan.edge = ei; plan.placed = [g1.plant_ids.length - n0[0], g2.plant_ids.length - n0[1]]; plan.lead = { species_id: lead.id, radius_m: r, claim: lead.proxy.spread.claim }; plan.alternate = { species_id: alt.id, radius_m: alt.proxy.radius_m, claim: alt.proxy.spread.claim }; plan.inner = { species_id: back.id, radius_m: r2, claim: back.proxy.spread.claim };
      if (plan.placed[0] < plan.expected[0] || plan.placed[1] < plan.expected[1]) plan.shortfall = `${plan.expected[0] - plan.placed[0] + plan.expected[1] - plan.placed[1]} position(s) dropped by a hole, an obstacle, a no-plant zone or a neighbouring plant`;
      z.row_plans.push(plan);
    });
    g1.params.row_plans = z.row_plans; if (g1.plant_ids.length) groups.push(g1); if (g2.plant_ids.length) groups.push(g2);
    if (!g1.plant_ids.length) unresolved.push(`${z.label}: the screen row does not fit — ${z.row_plans.map(pl => pl.reason).join('; ')}; left unplanted`);
    else for (const pl of z.row_plans) if (!pl.rows) unresolved.push(`${z.label}: no row on a ${pl.edge_length_m} m stretch of the edge — ${pl.reason}; that stretch is left unplanted`);   /* V4.3 · a stretch that cannot take a row is said, not silently skipped */
  }
  for (const f of wantedFunctions(project, bed)) if (f.function === 'z:screen' && !zones.some(z => z.kind === 'edge' && z.id === `zone-screen-${f.where}-${bed.id}`)) unresolved.push(f.where === 'edge-unset' ? `${bed.name}: Screen is wanted but its edge has not been chosen — no row is placed until you choose the edge` : `${bed.name}: Screen is wanted along "${f.where.replace('-', ' ')}" but this bed has no edge there — no row is placed (set the edge on the bed)`);
  for (const u of asm.unsupported) unresolved.push(`${bed.name}: ${u.label} — ${u.why}`);
  const gp = asm.picks.ground; const wantGround = asm.wanted.includes('z:ground_cover');
  if (!wantGround) { /* Ground Cover was not asked for on this bed: no ground layer is added on the engine's own initiative */ }
  else if (gp.length) {
    const B = G.bbox(bed.polygon); const rg = gp.reduce((a, s) => a + s.proxy.radius_m, 0) / gp.length; const spacing = 2 * rg * SPACING.ground / density;
    const free = freeArea(project, bed, obstacles, plants.filter(q => /^screen/.test(q.role)));
    const pattern = comp.pattern; const PT = COMPOSITION.patterns[pattern]; const cell = spacing * spacing * Math.sqrt(3) / 2;
    const g = { id: `group-${bed.id}-${groups.length + 1}`, bed_id: bed.id, zone_id: `zone-fill-${bed.id}`, role: 'ground', operator: PT.operator, params: { pattern, pattern_label: PT.label, grain: comp.grain, lattice: 'hexagonal', spacing_m: G.round(spacing), spacing_rule: `${SPACING.ground} × the mean claimed mature spread of the ground species (${G.round(2 * rg)} m)${density !== 1 ? ` ÷ density ${G.round(density)}` : ''}`, spacing_source: ARRANGEMENT_RULES.ground_spacing.source, plantable_m2: free.plantable_m2, area_for_ground_m2: free.free_m2, area_basis: free.basis, expected_count: Math.round(free.free_m2 / cell), expected_note: 'lattice estimate: area ÷ one hexagonal cell; the placed count is lower because stems keep their distance from the bed edge and from each other', fit: gp.map(s => s.gcand?.fit), species: gp.map(s => s.id), seed, variation: comp.variation }, plant_ids: [] };
    const rmin = Math.min(...gp.map(s => s.proxy.radius_m)) * 0.6; const inside = p => G.pointInShape(p, shape) && G.distToShapeEdge(p, shape) >= rmin; const n = gp.length;
    const put = (p, s) => { if (ok(p, s.proxy.radius_m) && clear(p, s.proxy.radius_m)) { const o = mk(s, p, 'ground', g.id, g.zone_id); plants.push(o); g.plant_ids.push(o.id); return true; } return false; };
    // Rhythm and patches set each species out on its own lattice — 0.65 × that species' claimed mature spread, the same factor as the drift
    // rule — because a band or a patch holds one species only. (Drifts keep one lattice at the mean spread: the species share it.)
    const sOf = sp => 2 * sp.proxy.radius_m * SPACING.ground / density; const insideOf = (p, sp) => G.pointInShape(p, shape) && G.distToShapeEdge(p, shape) >= sp.proxy.radius_m * 0.6;
    const bySpecies = Object.fromEntries(gp.map(sp => [sp.id, G.round(sOf(sp))]));
    if (pattern === 'rhythm') {
      // bands of equal length across the bed's long side, one species per band in turn; inside a band a square grid, centred, no jitter
      const ax = B.w >= B.h ? 0 : 1; const u0 = ax ? B.miny : B.minx, uL = ax ? B.h : B.w, v0 = ax ? B.minx : B.miny, vL = ax ? B.w : B.h; const band = grain.band * spacing; const nb = Math.max(1, Math.round(uL / band)); const bl = uL / nb; let expected = 0;
      for (let k = 0; k < nb; k++) { const sp = gp[k % n], d = sOf(sp); const nu = Math.max(1, Math.floor((bl - d) / d + 1e-6) + 1), nv = Math.max(1, Math.floor((vL - d) / d + 1e-6) + 1); const us = u0 + k * bl + (bl - (nu - 1) * d) / 2, vs = v0 + (vL - (nv - 1) * d) / 2;
        for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const u = us + i * d, v = vs + j * d; const p = ax ? [v, u] : [u, v]; if (!insideOf(p, sp)) continue; expected++; put(p, sp); } }
      Object.assign(g.params, { lattice: 'square, per band', jitter: 0, axis: ax ? 'north–south' : 'east–west', band_m: G.round(bl), bands: nb, spacing_by_species: bySpecies, expected_count: expected, expected_note: 'grid points inside the bed, band by band; the placed count is lower where a point is too close to an edge, an obstacle or a neighbour', pattern_rule: `${nb} band${nb === 1 ? '' : 's'} of ${G.round(bl)} m across the bed's long side (${grain.band} × the mean spacing, fitted to the bed — heuristic)${n > 1 ? `, the ${n} species in turn` : ', one species'}; inside a band a square grid at ${SPACING.ground} × that species' claimed mature spread, no jitter`, random: false });
    } else if (pattern === 'patches') {
      // one-species clusters with open ground between them: patch centres are taken along the bed, each at least (2 × patch radius + gap)
      // from the others; around a centre the species stands on its own lattice inside the patch radius; nothing is placed between patches
      const Rp = grain.patch * spacing, gap = RV('patch_gap') * spacing, C = 2 * Rp + gap; const ax = B.w >= B.h ? 0 : 1; const small = gp.reduce((m, x) => x.proxy.radius_m < m.proxy.radius_m ? x : m, gp[0]);
      const cand = G.hexGrid(B, spacing / 2, 0.15, rand).filter(p => insideOf(p, small) && ok(p, small.proxy.radius_m));   /* a finer grid for the centres, so a large species finds the middle of a narrow bed */
      const order = cand.map(p => ({ p, k: p[ax] + (rand() - .5) * C * 0.5 })).sort((x, y) => x.k - y.k); const centres = [], owner = []; let turn = Math.floor(rand() * n);
      const stands = (p, sp) => insideOf(p, sp) && ok(p, sp.proxy.radius_m) && clear(p, sp.proxy.radius_m);
      for (const { p } of order) { if (!centres.every(c => G.dist(c, p) >= C)) continue; for (let t = 0; t < n; t++) { const sp = gp[(turn + t) % n]; if (stands(p, sp)) { centres.push(p); owner.push(sp); turn = (turn + t + 1) % n; break; } } }   /* the species take turns; one that cannot stand at this centre gives its turn to the next */
      let expected = 0;
      centres.forEach((c, ci) => { const sp = owner[ci], d = sOf(sp), dy = d * Math.sqrt(3) / 2, m = Math.ceil(Rp / dy) + 1;
        for (let j = -m; j <= m; j++) for (let i = -m; i <= m; i++) { const q = [c[0] + i * d + (Math.abs(j) % 2 ? d / 2 : 0), c[1] + j * dy]; if (G.dist(q, c) > Rp) continue; const p = i || j ? [q[0] + (rand() - .5) * 0.15 * d, q[1] + (rand() - .5) * 0.15 * d] : q; if (!insideOf(p, sp)) continue; expected++; put(p, sp); } });
      Object.assign(g.params, { lattice: 'hexagonal, per patch', jitter: 0.15, patches: centres.length, patch_radius_m: G.round(Rp), patch_gap_m: G.round(gap), spacing_by_species: bySpecies, expected_count: expected, expected_note: 'lattice points that fall inside a patch; the ground between patches is left open on purpose', pattern_rule: `${centres.length} patch${centres.length === 1 ? '' : 'es'} of radius ${G.round(Rp)} m (${grain.patch} × the mean spacing) with at least ${G.round(gap)} m of open ground between them (heuristics); one species per patch${n > 1 ? ', taken in turn' : ''}, at ${SPACING.ground} × its own claimed mature spread`, random: true });
    } else {
      const pts = G.hexGrid(B, spacing, 0.35, rand).filter(inside);
      const thr = n > 1 ? 0.5 : 2; const cut = [0.42, 0.58];   /* three species: the drift field is cut in three (value noise gathers around 0.5, so the cuts are close to it) */
      for (const p of pts) { const v = n > 1 ? noise(p[0], p[1]) : 0; const s = n === 2 ? (v > thr ? gp[1] : gp[0]) : n > 2 ? gp[v < cut[0] ? 0 : v < cut[1] ? 1 : 2] : gp[0]; put(p, s); }
      Object.assign(g.params, { jitter: 0.35, drift_field: 'value noise', drift_cell_m: params.drift_cell ?? grain.cell, expected_note: 'lattice estimate: area ÷ one hexagonal cell; the placed count is lower because stems keep their distance from the bed edge and from each other after the jitter', pattern_rule: `a jittered lattice (0.35 × spacing)${n > 1 ? `; the species follow a drift field with cells of ${params.drift_cell ?? grain.cell} m (heuristic)` : ''}`, random: true });
    }
    g.params.placed = g.plant_ids.length; if (g.plant_ids.length) groups.push(g); else unresolved.push(`${bed.name}: the ground layer does not fit — no position is free at ${G.round(spacing)} m spacing in ${free.free_m2} m²`);
  } else unresolved.push(asm.notes.find(n => /no Ground Cover species can be used/.test(n)) || `${bed.name}: no Ground Cover species can be used — the bed interior stays unplanted`);
  const ac = asm.picks.accent[0];
  if (ac && plants.some(p => p.role === 'ground')) {
    const open = zones.find(z => z.kind === 'open'); const ref = open ? G.centroid(open.polygon) : [G.bbox(bed.polygon).minx + G.bbox(bed.polygon).w / 2, G.bbox(bed.polygon).miny];
    const ground = plants.filter(p => p.role === 'ground').sort((a, b) => G.dist(a.position_m, ref) - G.dist(b.position_m, ref));
    const g = { id: `group-${bed.id}-${groups.length + 1}`, bed_id: bed.id, zone_id: `zone-fill-${bed.id}`, role: 'accent', operator: 'repeat_accent', params: { every: 4, toward: open ? 'the open zone' : 'the front edge', species: [ac.id] }, plant_ids: [] };
    /* V4.3 · an accent takes over a ground position, but its own crown radius may be larger than the ground plant's. The position is kept only if the accent passes the very check validate() runs (placeable, with the accent's radius); otherwise it stays a ground plant. */
    let skipped = 0;
    ground.filter((_, i) => i % 4 === 1).slice(0, Math.max(2, Math.floor(ground.length / 5))).forEach(p => { if (!placeable(p.position_m, ac.proxy.radius_m, bed, obstacles, project.site).ok) { skipped++; return; } p.species_id = ac.id; p.role = 'accent'; p.proxy_radius_m = ac.proxy.radius_m; p.proxy_source = { claim: ac.proxy.spread.claim, range_m: [ac.proxy.spread.min, ac.proxy.spread.max], status: ac.proxy.radius_status, note: ac.proxy.spread.note }; p.height_m = ac.proxy.height_m; p.height_source = { claim: ac.proxy.height.claim, range_m: [ac.proxy.height.min, ac.proxy.height.max], status: ac.proxy.height_status }; p.group_id = g.id; g.plant_ids.push(p.id); });
    g.params.skipped = skipped; if (skipped) g.params.skipped_note = `${skipped} accent position${skipped === 1 ? '' : 's'} not used: at the accent's crown radius (${ac.proxy.radius_m} m) the plant would stand too close to the bed edge or an obstacle; the ground plant stays there`;
    if (g.plant_ids.length) groups.push(g);
  }
  if (!plants.length && bed.area_m2 > 0) unresolved.push(!asm.wanted.length ? `${bed.name}: left empty — no spatial function set` : !asm.wanted.some(functionArranged) ? `${bed.name}: left empty — none of its functions can be arranged yet` : `${bed.name}: no plant fitted (${bed.area_m2} m², narrowest ${bed.min_width_m ?? '?'} m)`);
  return { plants, groups, zones, asm, unresolved, obstacles };
}
/** plantable ground of a bed on the sample grid: the bed (holes out) minus no-plant zones and the keep-out around existing trunks; and
 *  what is left of it once the crowns of `taken` (the screen rows) are subtracted. Areas are counted once per sample point. */
export function freeArea(project, bed, obstacles = obstaclesFor(project), taken = []) {
  const st = RV('area_sample'), B = G.bbox(bed.polygon), shape = bedShape(bed); let n = 0, plantable = 0, free = 0; const pts = [];
  for (let y = B.miny + st / 2; y < B.maxy; y += st) for (let x = B.minx + st / 2; x < B.maxx; x += st) {
    const q = [x, y]; if (!G.pointInShape(q, shape)) continue; n++;
    if (obstacles.some(o => (o.kind === 'tree' && G.dist(q, o.centre) < o.radius * RV('tree_keepout')) || (o.polygon && G.pointInPolygon(q, o.polygon)))) continue; plantable++;
    const t = taken.some(pl => G.dist(q, pl.position_m) <= pl.proxy_radius_m); if (!t) free++; pts.push({ q, taken: t });
  }
  const a = st * st; return { bed_m2: G.round(n * a), plantable_m2: G.round(plantable * a), free_m2: G.round(free * a), points: pts, basis: `bed area on a ${st} m grid, minus no-plant zones and ${RV('tree_keepout')} × canopy radius around existing trunks${taken.length ? ', minus the mature crowns of the screen rows' : ''}` };
}
function hashId(s) { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 1000; }
const asList = x => Array.isArray(x) ? x : [x];
export function generate(project, K, bedIds, seed = 42, params = {}) {
  const ids = asList(bedIds); const beds = ids.map(id => bedOf(project, id)).filter(Boolean); if (!beds.length) throw new Error('no bed');
  let n = params.id_start ?? project.plant_seq; const nid = () => `plant-${String(++n).padStart(3, '0')}`;
  const plants = [], groups = [], zones = [], assumptions = [], unresolved = []; const assemblages = {}; const obstacles = obstaclesFor(project);
  for (const bed of beds) { const r = generateBed(project, K, bed, seed, params, nid, plants); plants.push(...r.plants); groups.push(...r.groups); zones.push(...r.zones); unresolved.push(...r.unresolved); assemblages[bed.id] = { picks: Object.fromEntries(Object.entries(r.asm.picks).map(([k, v]) => [k, v.map(x => ({ id: x.id, why: x.why, gate: x.gate.overall, proxy_radius_m: x.proxy.radius_m, fit: (k === 'screen' ? x.cand : k === 'ground' ? x.gcand : null)?.fit || null }))])), excluded: r.asm.rows.filter(x => x.excluded).map(x => ({ id: x.id, reason: x.excluded })), not_used: r.asm.rows.filter(x => !x.excluded && !x.role).map(x => ({ id: x.id, reason: 'eligible but not needed by any zone' })), wanted: r.asm.wanted, notes: r.asm.notes, candidates: r.asm.candidates, requirement: r.asm.requirement }; assumptions.push(...r.asm.notes); { const c = r.asm.composition; const gg = r.groups.find(x => x.role === 'ground'); if (c.custom) assumptions.push(`${bed.name}: arrangement chosen in Compose — ${[gg ? `${gg.params.pattern_label.toLowerCase()} (${gg.params.pattern_rule})` : null, c.rows !== 'auto' ? COMPOSITION.rows[c.rows].label.toLowerCase() : null, c.density !== 1 ? `spacing ÷ ${c.density}` : null, c.variation ? `variation ${c.variation} (another roll of the same rules, not a different strategy)` : null, c.ground_species || c.screen_species ? 'plant mix chosen among the species that qualify' : null].filter(Boolean).join('; ')}. A composition choice, not a verified planting strategy.`); } for (const u of bed.under_canopy || []) assumptions.push(`${bed.name}: ${u.m2} m² under ${u.label} — planting there is conditional (the light under the canopy is not recorded; it is not assumed to be full shade)`); }
  for (const o of obstacles) if (o.kind === 'tree' && /assumed/.test(o.radius_status)) assumptions.push(`${o.label}: canopy radius ${o.radius} m is ${o.radius_status}`);
  assumptions.push(`plant sizes are proxies: half the claimed mature spread (one claim chosen per species, alternatives counted) — not measured plants; planting spacing is ${params.spacing_screen ?? 0.75} × (screen rows) and ${params.spacing_ground ?? 0.65} × (ground layer) the claimed mature spread, so canopies meet and overlap at maturity by design — both factors are heuristics (the database holds no spacing claim; see ARRANGEMENT_RULES)`);
  if (project.site.scale.status !== 'user-calibrated' && project.site.scale.status !== 'user-stated') assumptions.push('scale is not calibrated: positions are conceptual, quantities are not for procurement');
  for (const f of project.brief.functions) if (!f.alternative && f.where === 'edge-unset' && !unresolved.some(u => /edge has not been chosen/.test(u))) unresolved.push(`${FN_LABEL[f.function] || f.function}: wanted, but the edge has not been chosen — nothing is planted for it; choose the edge on the Compose page`);
  unresolved.push(...project.brief.unknowns.filter(u => !/^which edge to screen/.test(u)).map(u => `unknown: ${u}`));
  project.plant_seq = Math.max(project.plant_seq, n);
  const merged = { picks: { screen: [], ground: [], accent: [], canopy: [] }, excluded: [], not_used: [] }; for (const a of Object.values(assemblages)) { for (const k of Object.keys(merged.picks)) for (const x of a.picks[k]) if (!merged.picks[k].some(y => y.id === x.id)) merged.picks[k].push(x); for (const e of a.excluded) if (!merged.excluded.some(y => y.id === e.id)) merged.excluded.push(e); }
  merged.not_used = K.species.filter(s => !Object.values(merged.picks).flat().some(x => x.id === s.id) && !merged.excluded.some(e => e.id === s.id)).map(s => ({ id: s.id, reason: 'eligible but not needed by any zone' }));
  const version = { label: params.label || `generated (seed ${seed})`, seed, bed_id: beds[0].id, bed_ids: beds.map(b => b.id), compositions: Object.fromEntries(beds.filter(b => b.composition).map(b => [b.id, JSON.parse(JSON.stringify(b.composition))])), bed_fps: Object.fromEntries(beds.map(b => [b.id, bedFingerprint(b)])), generator: { operators: [...new Set(groups.map(g => g.operator))], density: params.density ?? 1, params: { ...params, id_start: params.id_start ?? (n - plants.length) } }, knowledge_snapshot: K.snapshot, geometry_precision: project.site.scale.status === 'unknown' ? 'conceptual' : `approximate (${project.site.scale.status})`, plant_objects: plants, groups, zones, assemblage: merged, assemblages, assumptions, unresolved, edit_event: null };
  version.schedule = schedule(version); version.validation = validate(version, project); version.evaluation = evaluate(version, project, K);
  return version;
}

// ---------------------------------------------------------------- validation (geometry) and evaluation (measurable only)
export function validate(version, project) {
  const obstacles = obstaclesFor(project); const issues = [];
  for (const p of version.plant_objects) { const bed = bedOf(project, p.bed_id); if (!bed) { issues.push({ plant_id: p.id, severity: 'error', text: `its bed ${p.bed_id} no longer exists` }); continue; } const r = placeable(p.position_m, p.proxy_radius_m, bed, obstacles, project.site); if (!r.ok) issues.push({ plant_id: p.id, severity: 'error', text: r.why }); }
  const P = version.plant_objects;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) { const d = G.dist(P[i].position_m, P[j].position_m), s = P[i].proxy_radius_m + P[j].proxy_radius_m; if (d < s * 0.5) issues.push({ plant_id: P[i].id, other: P[j].id, severity: 'warning', text: `crowded: ${G.round(d)} m apart for proxy radii ${P[i].proxy_radius_m} + ${P[j].proxy_radius_m} m` }); }
  return { ok: !issues.some(i => i.severity === 'error'), issues };
}
const unionOf = iv => { const s = iv.filter(x => x[1] > x[0]).sort((a, b) => a[0] - b[0]); const out = []; for (const x of s) { const l = out[out.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else out.push([x[0], x[1]]); } return out; };
const lengthOf = u => u.reduce((s, x) => s + x[1] - x[0], 0);
const gapsOf = (u, L) => { const out = []; let at = 0; for (const x of u) { if (x[0] - at >= RV('gap_report_min')) out.push([at, x[0]]); at = Math.max(at, x[1]); } if (L - at >= RV('gap_report_min')) out.push([at, L]); return out; };
/** Screen on one edge zone: the mature crowns of the screen plants are projected onto the screened edge; the union of the intervals
 *  is the covered length (an overlap is counted once), the rest are gaps. The same union is taken for the plants whose claimed height
 *  certainly / possibly reaches the target, and for the evergreen ones. A geometric estimate from claimed sizes — not measured opacity. */
export function evaluateScreen(z, plants, K, project) {
  const req = z.requirement || screenRequirement([]); const T = req.target_height_m; const mine = plants.filter(p => p.zone_id === z.id && /^screen/.test(p.role));
  const cat = { all: [], certain: [], possible: [], evergreen: [] }; let L = 0; const gaps = [];
  const info = new Map(); for (const p of mine) if (!info.has(p.species_id)) info.set(p.species_id, { ev: K.functionEvidence(p.species_id, 'z:screen'), yr: K.yearRound(p.species_id) });
  z.edges.forEach((e, ei) => {
    const len = G.dist(e.a, e.b); const u = [(e.b[0] - e.a[0]) / (len || 1), (e.b[1] - e.a[1]) / (len || 1)]; const iv = { all: [], certain: [], possible: [], evergreen: [] };
    for (const p of mine) {
      const t = (p.position_m[0] - e.a[0]) * u[0] + (p.position_m[1] - e.a[1]) * u[1]; const perp = Math.abs((p.position_m[0] - e.a[0]) * -u[1] + (p.position_m[1] - e.a[1]) * u[0]);
      if (z.edges.length > 1 && perp > (z.row_plans?.[ei]?.depth_m ?? 1e9) + p.proxy_radius_m) continue;   // a plant of another edge of the same zone
      const x = [Math.max(0, t - p.proxy_radius_m), Math.min(len, t + p.proxy_radius_m)]; if (x[1] <= x[0]) continue; const hr = p.height_source?.range_m || [];
      iv.all.push(x); if (hr[0] != null && hr[0] >= T) iv.certain.push(x); const top = p.height_source?.max_claimed_m ?? hr[1] ?? p.height_m; if (top != null && top >= T) iv.possible.push(x); /* 'possible' = some applicable claimed range reaches the target (the same ranges the selection read) */ if (info.get(p.species_id).yr.result === 'meets') iv.evergreen.push(x);
    }
    for (const k of Object.keys(cat)) cat[k].push({ ei, len, u: unionOf(iv[k]) });
    for (const gp of gapsOf(unionOf(iv.all), len)) gaps.push({ edge: ei, from_m: G.round(gp[0]), to_m: G.round(gp[1]), length_m: G.round(gp[1] - gp[0]) }); L += len;
  });
  const cover = k => G.round(cat[k].reduce((s, c) => s + lengthOf(c.u), 0)); const closed = k => cat[k].every(c => gapsOf(c.u, c.len).length === 0);
  const reasons = []; const covered = cover('all'); const geometric = !mine.length ? 'not met' : closed('all') ? 'met' : 'not met';
  if (!mine.length) reasons.push({ kind: 'unmet', text: 'no screen plant is placed on this edge' }); else if (geometric !== 'met') reasons.push({ kind: 'unmet', text: `${G.round(L - covered)} m of ${G.round(L)} m is not covered by a mature crown (${gaps.length} gap${gaps.length === 1 ? '' : 's'}: ${gaps.map(g => `${g.from_m}–${g.to_m} m`).join(', ')})` });
  // height and leaf retention are judged on the part of the edge the crowns cover; a gap is the continuity check's finding, not theirs
  const same = k => covered - cover(k) < RV('gap_report_min'); const height = !mine.length ? 'not met' : same('certain') ? 'met' : same('possible') ? 'uncertain' : 'not met';
  if (mine.length && height === 'uncertain') reasons.push({ kind: 'uncertain', text: `the target height ${T} m is reached only if the plants grow to the upper end of their claimed height ranges (certain on ${cover('certain')} m, possible on ${cover('possible')} m of the ${covered} m the crowns cover)` });
  if (mine.length && height === 'not met') reasons.push({ kind: 'unmet', text: `the target height ${T} m is not reached even at the upper end of the claimed ranges on part of the row (possible on ${cover('possible')} m of the ${covered} m the crowns cover)` });
  if (mine.some(p => (p.height_source?.range_m || [])[1] == null && p.height_m == null)) reasons.push({ kind: 'missing-data', text: 'a screen plant has no recorded height range — it cannot count toward the target height' });
  const yr = !req.year_round ? 'not required' : !mine.length ? 'not met' : same('evergreen') ? 'met' : 'not met';
  if (req.year_round && mine.length && yr !== 'met') reasons.push({ kind: 'unmet', text: `year-round screening is required but only ${cover('evergreen')} m of the ${covered} m the crowns cover is by species recorded as evergreen only` });
  const species = [...info.entries()].map(([id, x]) => ({ species_id: id, link: x.ev.link, link_status: x.ev.status, conflict: x.ev.conflict, link_verified: x.ev.verified, leaf: x.yr.result === 'meets' ? 'evergreen' : x.yr.result === 'fails' ? 'deciduous' : 'not certain' }));
  for (const sp of species) { if (sp.conflict) reasons.push({ kind: 'conflict', text: `${K.name(sp.species_id)}: a trait claim contradicts its Screen use — the function link is not settled` }); else if (sp.link_status === 'candidate') reasons.push({ kind: 'uncertain', text: `${K.name(sp.species_id)}: Screen is only inferred from traits; no source states the use` }); }
  const unverified = species.filter(sp => !sp.link_verified).length; const evidence = species.some(sp => sp.conflict || sp.link_status === 'candidate') ? 'uncertain' : 'supported';
  const parts = [geometric, height, yr === 'not required' ? 'met' : yr]; const status = parts.includes('not met') ? 'not met' : (parts.includes('uncertain') || evidence === 'uncertain') ? 'uncertain' : 'met on claimed sizes';
  return { zone: z.id, bed_id: z.bed_id, label: z.label, edge_length_m: G.round(L), covered_m: covered, screen_row_cover_m: covered, continuity: L ? Math.min(1, G.round(covered / L)) : 0, gaps, gap_total_m: G.round(L - covered), target_height_m: T, target_basis: req.target_basis, year_round_required: req.year_round, year_round_basis: req.year_round_basis,
    cover_at_target_certain_m: cover('certain'), cover_at_target_possible_m: cover('possible'), cover_evergreen_m: cover('evergreen'), checks: { continuity: geometric, target_height: height, year_round: yr, evidence }, status, species, reasons, verified_performance: false,
    note: `geometric estimate: mature crowns (half the claimed spread) projected on the edge, overlaps counted once; heights from claimed ranges. Not a measured or verified screening performance${unverified ? ` — ${unverified} of ${species.length} species rest on unverified claims` : ''}.` };
}
/** Ground Cover in one bed: the share of the plantable ground that lies under a mature crown of the ground layer, counted once per
 *  sample point. A geometric estimate at claimed mature spread — not establishment, growth or weed suppression. */
export function evaluateGround(bed, version, project) {
  const P = version.plant_objects.filter(p => p.bed_id === bed.id); const ground = P.filter(p => p.role === 'ground' || p.role === 'accent'); const free = freeArea(project, bed, obstaclesFor(project), P.filter(p => /^screen/.test(p.role)));
  const a = RV('area_sample') ** 2; let g = 0, any = 0; for (const pt of free.points) { const cg = ground.some(p => G.dist(pt.q, p.position_m) <= p.proxy_radius_m); if (cg) g++; if (cg || pt.taken) any++; }
  const grp = (version.groups || []).find(x => x.bed_id === bed.id && x.role === 'ground'); const reasons = [];
  if (!ground.length) reasons.push({ kind: 'unmet', text: 'no ground-layer plant is placed in this bed' });
  if (ground.some(p => /assumed/.test(p.proxy_source?.status || ''))) reasons.push({ kind: 'missing-data', text: 'a ground species has no recorded spread — its crown radius is an assumed 0.3 m' });
  const share = free.plantable_m2 ? G.round(g * a / free.plantable_m2) : 0;
  return { bed_id: bed.id, name: bed.name, bed_m2: free.bed_m2, plantable_m2: free.plantable_m2, area_for_ground_m2: free.free_m2, ground_cover_m2: G.round(g * a), ground_cover_share: share, any_crown_share: free.plantable_m2 ? G.round(any * a / free.plantable_m2) : 0, plants: ground.length, expected_count: grp?.params?.expected_count ?? null, spacing_m: grp?.params?.spacing_m ?? null, pattern: grp?.params?.pattern || null, patches: grp?.params?.patches ?? null, reasons, verified_performance: false,
    note: 'geometric estimate: share of the plantable bed area under the mature crowns of the ground layer (claimed spreads, each point counted once). Not the cover a planting actually reaches, and not weed suppression.' };
}
export function evaluate(version, project, K) {
  const beds = (version.bed_ids || [version.bed_id]).map(id => bedOf(project, id)).filter(Boolean); const P = version.plant_objects;
  const byRole = {}; for (const p of P) byRole[p.role] = (byRole[p.role] || 0) + 1;
  const edge = version.zones.filter(z => z.kind === 'edge').map(z => evaluateScreen(z, P, K, project));
  const ground = beds.filter(b => version.zones.some(z => z.kind === 'fill' && z.bed_id === b.id)).map(b => evaluateGround(b, version, project));
  const open = project.site.features.filter(f => f.kind === 'no-plant-zone' && f.polygon).map(f => ({ id: f.id, area_m2: G.round(G.area(f.polygon)), plants_inside: P.filter(p => G.pointInPolygon(p.position_m, f.polygon)).length }));
  const gates = {}; const evidence = { pass: 0, conditional: 0, unknown: 0 };
  for (const p of P) { const k = `${p.species_id}|${p.bed_id}`; if (!gates[k]) gates[k] = K.gate(p.species_id, bedConditions(project, bedOf(project, p.bed_id)), { maintenance_low: !!project.brief.values.maintenance_low }).overall; if (evidence[gates[k]] != null) evidence[gates[k]]++; }
  const perBed = beds.map(b => ({ bed_id: b.id, name: b.name, area_m2: b.area_m2, plants: P.filter(p => p.bed_id === b.id).length, species: new Set(P.filter(p => p.bed_id === b.id).map(p => p.species_id)).size, functions: (b.functions || []).map(f => f.function) }));
  // one list of everything that is missing, in conflict or not met — with its reason
  const findings = []; for (const e of edge) for (const r of e.reasons) findings.push({ ...r, where: e.label }); for (const g of ground) for (const r of g.reasons) findings.push({ ...r, where: `Ground Cover (${g.name})` });
  for (const [bid, a] of Object.entries(version.assemblages || {})) for (const fn of ['screen', 'ground']) if ((a.wanted || []).includes(fn === 'screen' ? 'z:screen' : 'z:ground_cover') && !(a.picks?.[fn] || []).length) findings.push({ kind: 'unmet', where: `${fn === 'screen' ? 'Screen' : 'Ground Cover'} (${bedOf(project, bid)?.name || bid})`, text: `no species could be used: ${(a.candidates?.[fn] || []).filter(c => c.checks.evidence.result !== 'fails').map(c => `${K.name(c.id)} — ${c.reasons.filter(x => c.checks[x.split(':')[0]].result === 'fails').join('; ')}`).join(' · ') || 'no species is linked to the function'}` });
  return { bed_area_m2: G.round(beds.reduce((s, b) => s + (b.area_m2 || 0), 0)), beds: perBed, plant_count: P.length, species_count: new Set(P.map(p => p.species_id)).size, by_role: byRole, edge_zones: edge, ground_cover: ground, findings, open_zones: open, evidence_gates: evidence, cost: null, cost_note: 'no prices in the database — not computed', ecology_score: null, ecology_note: 'no pollinator-interaction data — no score; ecological-value claims are listed per species instead', unknown_conditions: Object.entries(project.site.conditions).filter(([, c]) => c.status === 'unknown').map(([k]) => k), rules: ARRANGEMENT_RULES };
}

// ---------------------------------------------------------------- local edits: preview = a new version, uncommitted, with its diff
export function previewEdit(project, K, version, cmd) {
  const obstacles = obstaclesFor(project); const plants = clonePlants(version);
  const scopePoly = cmd.scope.polygon || project.site.boundary || (bedOf(project, version.bed_id)?.polygon); const inScope = p => (!scopePoly || G.pointInPolygon(p.position_m, scopePoly)) && !p.locked;
  const targets = plants.filter(inScope); const notes = [], refused = [];
  const preserveScreen = cmd.preserve.some(p => p.type === 'spatial_function' && p.value === 'z:screen');
  const rand = G.rng((version.seed || 1) * 31 + project.versions.length);
  let next = plants; const removedIds = new Set(); const addedIds = [];
  for (const op of cmd.operations) {
    if (op.type === 'reduce_density') {
      let pool = targets.filter(p => !removedIds.has(p.id)); if (preserveScreen) { const kept = pool.filter(p => p.role === 'screen'); pool = pool.filter(p => p.role !== 'screen'); if (kept.length) notes.push(`${kept.length} screen-row plant${kept.length === 1 ? '' : 's'} kept untouched to preserve the screen (an intent; screening performance is not quantified)`); }
      const n = Math.ceil(pool.length * op.amount.value); const crowd = p => pool.filter(q => q !== p && G.dist(p.position_m, q.position_m) < (p.proxy_radius_m + q.proxy_radius_m) * 1.2).length;
      const order = pool.map(p => ({ p, c: crowd(p), r: rand() })).sort((a, b) => b.c - a.c || a.r - b.r).slice(0, n);
      for (const { p } of order) removedIds.add(p.id); notes.push(`reduce density by ${Math.round(op.amount.value * 100)} % (${op.amount.basis}): ${n} of ${pool.length} eligible plants removed, the most crowded first; nothing outside the scope moves`);
    } else if (op.type === 'increase_density') {
      const ground = version.assemblage?.picks?.ground || []; const sp = ground[0] ? K.sp(ground[0].id) : null; if (!sp) { refused.push('no ground-cover species in this design to add'); continue; }
      const r = ground[0].proxy_radius_m; const B = G.bbox(scopePoly || project.site.boundary); const spacing = 2 * r * 0.9 * (1 - op.amount.value); const want = Math.max(1, Math.ceil(targets.length * op.amount.value)); let added = 0;
      for (const p0 of G.hexGrid(B, spacing, 0.3, rand)) { const p = G.roundPt(p0); if (added >= want) break; if (scopePoly && !G.pointInPolygon(p, scopePoly)) continue; const bed = bedAt(project, p); if (!bed || !placeable(p, r, bed, obstacles, project.site).ok) continue; if (next.some(q => !removedIds.has(q.id) && G.dist(p, q.position_m) < (r + q.proxy_radius_m) * 0.85)) continue; const tpl = plants.find(q => q.species_id === sp.id); const o = { id: nextPlantId(project), species_id: sp.id, bed_id: bed.id, position_m: G.roundPt(p), proxy_radius_m: r, proxy_source: { ...(tpl?.proxy_source || { status: 'proxy' }) }, height_m: tpl?.height_m ?? null, height_source: tpl?.height_source || { status: 'unknown' }, role: 'ground', group_id: 'edit', zone_id: `zone-fill-${bed.id}`, locked: false, origin: 'edit:increase_density' }; next.push(o); addedIds.push(o.id); added++; }
      notes.push(`increase density by ${Math.round(op.amount.value * 100)} %: ${added} ${sp.scientific_name} added inside the scope where spacing allows`);
    } else if (op.type === 'remove_species') {
      if (!op.species_id) { refused.push(`"${op.phrase}" does not match a species in this design`); continue; } const hit = targets.filter(p => p.species_id === op.species_id && !removedIds.has(p.id)); hit.forEach(p => removedIds.add(p.id)); notes.push(`remove ${K.name(op.species_id)}: ${hit.length} plant${hit.length === 1 ? '' : 's'} inside the scope`);
    } else if (op.type === 'swap_species') {
      if (!op.from_species_id || !op.to_species_id) { refused.push(`"${op.phrase}": one of the species names was not recognised`); continue; } const to = K.sp(op.to_species_id); const conds = bedConditions(project, bedOf(project, targets[0]?.bed_id || version.bed_id)); const proxy = K.proxy(to.id, conds.light?.value); const gate = K.gate(to.id, conds); if (gate.overall === 'fail') { refused.push(`${to.scientific_name} fails a site gate (${['light', 'water', 'soil'].filter(k => gate[k].result === 'fail').map(k => gate[k].detail).join('; ')}) — not swapped in`); continue; }
      let n = 0; for (const p of targets) if (p.species_id === op.from_species_id && !removedIds.has(p.id)) { p.species_id = to.id; p.proxy_radius_m = proxy.radius_m; p.proxy_source = { claim: proxy.spread.claim, range_m: [proxy.spread.min, proxy.spread.max], status: proxy.radius_status, note: proxy.spread.note }; p.height_m = proxy.height_m; p.height_source = { claim: proxy.height.claim, range_m: [proxy.height.min, proxy.height.max], status: proxy.height_status }; p.origin = 'edit:swap'; n++; }
      notes.push(`swap ${K.name(op.from_species_id)} → ${to.scientific_name}: ${n} plants; gate ${gate.overall}; proxy radius ${proxy.radius_m} m`);
    } else if (op.type === 'move_away') {
      const feat = project.site.features.find(f => f.id === op.feature_id); if (!feat) { refused.push(`"${op.phrase}" does not match a site feature (tree, path, open zone)`); continue; }
      const ref = feat.position_m || G.centroid(feat.polygon); const fr = feat.radius_m ?? (feat.polygon ? 0 : 1.5);
      const pick = targets.filter(p => !removedIds.has(p.id)).filter(p => op.filter === 'taller' ? p.height_m != null && p.height_m >= 1 : op.filter === 'lower' ? p.height_m != null && p.height_m < 1 : op.filter === 'all' ? true : p.species_id === op.filter);
      const skipped = targets.filter(p => op.filter === 'taller' && p.height_m == null); if (skipped.length) notes.push(`${skipped.length} plant${skipped.length === 1 ? '' : 's'} with unknown height not moved (height is not invented)`);
      let moved = 0, stuck = 0;
      for (const p of pick) { const bed = bedOf(project, p.bed_id); const d0 = feat.polygon ? G.distToBoundary(p.position_m, feat.polygon) : G.dist(p.position_m, ref); const want = fr + p.proxy_radius_m + 0.5; if (d0 >= want) continue; const dx = p.position_m[0] - ref[0], dy = p.position_m[1] - ref[1], l = Math.hypot(dx, dy) || 1; let placed = false; for (let step = 0.25; step <= 3; step += 0.25) { const q = G.roundPt([p.position_m[0] + dx / l * step, p.position_m[1] + dy / l * step]); const dq = feat.polygon ? G.distToBoundary(q, feat.polygon) : G.dist(q, ref); if (dq >= want && placeable(q, p.proxy_radius_m, bed, obstacles, project.site).ok && next.every(o => o.id === p.id || removedIds.has(o.id) || G.dist(q, o.position_m) >= (p.proxy_radius_m + o.proxy_radius_m) * 0.8)) { p.position_m = G.roundPt(q); p.origin = 'edit:move_away'; placed = true; break; } } if (placed) moved++; else stuck++; }
      notes.push(`move ${op.filter} plants away from ${feat.label || feat.kind}: ${moved} moved${stuck ? `, ${stuck} could not be moved within the bed` : ''}`);
    } else if (op.type === 'fill_with_tall') refused.push('filling an open zone with tall plants would break the keep-open constraint — refused; remove the no-plant zone first if that is intended');
  }
  next = next.filter(p => !removedIds.has(p.id));
  const v = { label: `edit: ${cmd.utterance.slice(0, 60)}`, seed: version.seed, bed_id: version.bed_id, bed_ids: version.bed_ids, bed_fps: version.bed_fps, generator: version.generator, knowledge_snapshot: version.knowledge_snapshot, geometry_precision: version.geometry_precision, plant_objects: next, groups: version.groups.map(g => ({ ...g, plant_ids: g.plant_ids.filter(id => !removedIds.has(id)) })), zones: version.zones, assemblage: version.assemblage, assemblages: version.assemblages, assumptions: version.assumptions, unresolved: version.unresolved, edit_event: { kind: 'spatial_edit', command: cmd, target_ids: targets.map(p => p.id), removed_ids: [...removedIds], added_ids: addedIds, notes, refused } };
  v.schedule = schedule(v); v.validation = validate(v, project); v.evaluation = evaluate(v, project, K);
  const d = versionDiff(version, v);
  const outside = version.plant_objects.filter(p => !inScope(p)); const outsideChanged = outside.filter(p => { const q = v.plant_objects.find(x => x.id === p.id); return !q || q.position_m[0] !== p.position_m[0] || q.position_m[1] !== p.position_m[1] || q.species_id !== p.species_id; });
  return { version: v, diff: d, targets: targets.map(p => p.id), notes, refused, untouched_outside_scope: outsideChanged.length === 0, outside_changed: outsideChanged.map(p => p.id), privacy_guarantee: false, screen_continuity: { before: version.evaluation?.edge_zones || [], after: v.evaluation.edge_zones } };
}

// ---------------------------------------------------------------- direct manipulation (same model, same checks)
export function directEdit(project, K, version, action) {
  const obstacles = obstaclesFor(project); const plants = clonePlants(version); const notes = [];
  if (action.kind === 'move') { const p = plants.find(p => p.id === action.id); if (!p) return null; if (p.locked) return { refused: 'locked object' }; const target = bedAt(project, action.to) || bedOf(project, p.bed_id); const chk = placeable(action.to, p.proxy_radius_m, target, obstacles, project.site); p.position_m = G.roundPt(action.to); if (target && target.id !== p.bed_id && chk.ok) { notes.push(`${p.id} moved from ${p.bed_id} to ${target.id}`); p.bed_id = target.id; } p.origin = 'user-moved'; notes.push(chk.ok ? `${p.id} moved to ${p.position_m.join(', ')} m` : `${p.id} moved to ${p.position_m.join(', ')} m — warning: ${chk.why}`); }
  if (action.kind === 'delete') { const i = plants.findIndex(p => p.id === action.id); if (i < 0) return null; if (plants[i].locked) return { refused: 'locked object' }; notes.push(`${plants[i].id} (${K.name(plants[i].species_id)}) deleted`); plants.splice(i, 1); }
  if (action.kind === 'add') { const bed = bedAt(project, action.at); if (!bed) return { refused: 'outside every planting bed — add plants inside a bed' }; const sp = K.sp(action.species_id); const proxy = K.proxy(sp.id, bedConditions(project, bed).light?.value); const chk = placeable(action.at, proxy.radius_m, bed, obstacles, project.site); const o = { id: nextPlantId(project), species_id: sp.id, bed_id: bed.id, position_m: G.roundPt(action.at), proxy_radius_m: proxy.radius_m, proxy_source: { claim: proxy.spread.claim, range_m: [proxy.spread.min, proxy.spread.max], status: proxy.radius_status, note: proxy.spread.note }, height_m: proxy.height_m, height_source: { claim: proxy.height.claim, range_m: [proxy.height.min, proxy.height.max], status: proxy.height_status }, role: action.role || 'user-added', group_id: 'user', zone_id: null, locked: false, origin: 'user-added' }; plants.push(o); notes.push(chk.ok ? `${o.id} ${sp.scientific_name} added in ${bed.name}` : `${o.id} ${sp.scientific_name} added — warning: ${chk.why}`); }
  const v = { ...version, id: undefined, created: undefined, parent_version_id: undefined, label: `direct edit: ${action.kind}`, plant_objects: plants, groups: version.groups.map(g => ({ ...g, plant_ids: g.plant_ids.filter(id => plants.some(p => p.id === id)) })), edit_event: { kind: `direct:${action.kind}`, action, notes } };
  v.schedule = schedule(v); v.validation = validate(v, project); v.evaluation = evaluate(v, project, K);
  return { version: v, diff: versionDiff(version, v), notes };
}
export function regenerateSame(project, K, version) { return generate(project, K, version.bed_ids || version.bed_id, version.seed, { ...version.generator.params, id_start: version.generator.params?.id_start ?? 0, label: version.label }); }

// ---------------------------------------------------------------- geometry updates: what changed since the version, and a partial regeneration
export function geometryImpact(project, version) {
  if (!version) return null; const fps = version.bed_fps || { [version.bed_id]: null }; const now = Object.fromEntries(project.site.beds.filter(b => b.status !== 'rejected').map(b => [b.id, bedFingerprint(b)]));
  const changed = Object.keys(fps).filter(id => now[id] && now[id] !== fps[id]), removed = Object.keys(fps).filter(id => !now[id]), added = Object.keys(now).filter(id => !fps[id]);
  const obstacles = obstaclesFor(project); const invalid = version.plant_objects.filter(p => { const b = bedOf(project, p.bed_id); return !b || b.status === 'rejected' || !placeable(p.position_m, p.proxy_radius_m, b, obstacles, project.site).ok; });
  return { changed, removed, added, stale: changed.length + removed.length + added.length > 0, invalid_plants: invalid.map(p => p.id), untouched: Object.keys(fps).filter(id => now[id] && now[id] === fps[id]), user_edited_in_changed: version.plant_objects.filter(p => (changed.includes(p.bed_id) || removed.includes(p.bed_id)) && /^user|^edit/.test(p.origin || '')).map(p => p.id) };
}
/** regenerate only the given beds; every other bed's plants (user edits included) stay exactly as they are; user-placed plants in a
 *  changed bed are kept when they are still valid there. */
export function regenerateBeds(project, K, version, bedIds, params = {}) {
  const ids = asList(bedIds); const keepBeds = new Set((version.bed_ids || [version.bed_id]).filter(id => !ids.includes(id) && bedOf(project, id) && bedOf(project, id).status !== 'rejected'));
  const obstacles = obstaclesFor(project); const kept = clonePlants(version).filter(p => keepBeds.has(p.bed_id)); const keptUser = [];
  for (const p of version.plant_objects) if (ids.includes(p.bed_id) && /^user|^edit/.test(p.origin || '')) { const b = bedOf(project, p.bed_id); if (b && placeable(p.position_m, p.proxy_radius_m, b, obstacles, project.site).ok) keptUser.push({ ...p, position_m: [...p.position_m] }); }
  const liveIds = ids.filter(id => bedOf(project, id) && bedOf(project, id).status !== 'rejected'); const allIds = [...keepBeds, ...liveIds]; const seed = params.seed ?? version.seed;
  const fresh = liveIds.length ? generate(project, K, liveIds, seed, { ...version.generator.params, ...params, id_start: project.plant_seq, label: undefined }) : null;
  const plants = [...kept, ...keptUser]; const fresh2 = fresh ? fresh.plant_objects.filter(p => !keptUser.some(u => G.dist(u.position_m, p.position_m) < (u.proxy_radius_m + p.proxy_radius_m) * 0.6)) : [];
  plants.push(...fresh2);
  const v = { label: `geometry update: ${liveIds.map(id => bedOf(project, id)?.name || id).join(', ') || 'beds removed'}`, seed, bed_id: allIds[0] || version.bed_id, bed_ids: allIds, bed_fps: Object.fromEntries(allIds.map(id => [id, bedFingerprint(bedOf(project, id))])), generator: { ...version.generator, operators: [...new Set([...version.generator.operators, ...(fresh?.generator.operators || [])])] }, knowledge_snapshot: K.snapshot, geometry_precision: project.site.scale.status === 'unknown' ? 'conceptual' : `approximate (${project.site.scale.status})`, plant_objects: plants, groups: [...version.groups.filter(g => keepBeds.has(g.bed_id)).map(g => ({ ...g, plant_ids: g.plant_ids.filter(id => plants.some(p => p.id === id)) })), ...(fresh?.groups || []).map(g => ({ ...g, plant_ids: g.plant_ids.filter(id => plants.some(p => p.id === id)) }))], zones: [...version.zones.filter(z => keepBeds.has(z.bed_id)), ...(fresh?.zones || [])], assemblage: fresh ? fresh.assemblage : version.assemblage, assemblages: { ...Object.fromEntries(Object.entries(version.assemblages || {}).filter(([k]) => keepBeds.has(k))), ...(fresh?.assemblages || {}) }, assumptions: fresh ? fresh.assumptions : version.assumptions, unresolved: fresh ? fresh.unresolved : version.unresolved, edit_event: { kind: 'geometry_update', regenerated_beds: liveIds, kept_beds: [...keepBeds], removed_beds: ids.filter(id => !liveIds.includes(id)), kept_user_plants: keptUser.map(p => p.id), notes: [`${kept.length} plants in ${keepBeds.size} unchanged bed${keepBeds.size === 1 ? '' : 's'} kept exactly`, keptUser.length ? `${keptUser.length} user-placed plants kept in the changed bed${liveIds.length === 1 ? '' : 's'}` : null, fresh ? `${fresh2.length} plants regenerated for ${liveIds.map(id => bedOf(project, id)?.name).join(', ')}` : null].filter(Boolean) } };
  v.schedule = schedule(v); v.validation = validate(v, project); v.evaluation = evaluate(v, project, K);
  return { version: v, diff: versionDiff(version, v), targets: version.plant_objects.filter(p => !keepBeds.has(p.bed_id)).map(p => p.id), notes: v.edit_event.notes, refused: [], untouched_outside_scope: true, outside_changed: [], privacy_guarantee: false, screen_continuity: { before: version.evaluation?.edge_zones || [], after: v.evaluation.edge_zones } };
}
