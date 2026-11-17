// The one design model: Project → Site (boundary · features · beds · conditions · sources) → Brief → DesignVersion[] (plant objects).
// Every environmental fact carries value · status (known / stated / assumed / inferred / unknown) · source. Versions are immutable
// snapshots; Undo moves the current pointer. Nothing here knows about pixels: coordinates are local metres, north = +y rotated by
// site.orientation.north_angle_degrees.
import { area, bbox } from './geom.js';

export const STATUS = ['user-stated', 'user-drawn', 'user-calibrated', 'assumed', 'inferred', 'unknown'];
const now = () => new Date().toISOString();
let seq = 0; export const uid = p => `${p}-${(Date.now() % 1e6).toString(36)}${(seq++).toString(36)}`;

export function newProject(name = 'Untitled backyard') {
  return {
    id: uid('proj'), name, created: now(), schema: 'planting-intelligence/design-project/0.1', knowledge_snapshot: null,
    conversation: [], inputs: [],
    location: null,   // where the site is: { status: 'confirmed' | 'unverified', label, short, lat, lon, … } — a map position or a typed reference, never site geometry or conditions
    site: {
      id: 'site-1', coordinate_system: 'local-meters', orientation: { north_angle_degrees: 0, basis: 'assumption (north = up until stated)' },
      scale: { status: 'unknown', known_length_m: null, source: null }, boundary: null, boundary_status: 'unknown',
      features: [], beds: [], proposals: null, history: [],
      concept: null,   // the conceptual site model (js/concept.js): a unitless sketch, kept apart from the metre geometry above
      scratch: false,   // the user chose to draw everything themself: nothing read from words is placed for them
      conditions: { light: cond(), soil_type: cond(), soil_drainage: cond(), water: cond(), wind: cond(), irrigation: cond() },
      values: [], notes: [],
    },
    brief: emptyBrief(), versions: [], current_version_id: null, redo: [], plant_seq: 0,
  };
}
export const cond = (value = null, status = 'unknown', source = null, note = null) => ({ value, status, source, note });
export function emptyBrief() { return { provenance: null, values: {}, hard_constraints: [], functions: [], composition: [], unknowns: [], evidence: [], updated: null }; }

// ---------------------------------------------------------------- site editing (every mutation records its source)
export function setBoundary(project, polygon, source = 'user-drawn') { project.site.boundary = polygon.map(p => [r2(p[0]), r2(p[1])]); project.site.boundary_status = source; }
export function setScale(project, status, known_length_m, source) { project.site.scale = { status, known_length_m, source }; }
export function addFeature(project, f) { const id = f.id || uid(f.kind === 'existing-tree' ? 'tree' : f.kind === 'no-plant-zone' ? 'open' : 'feat'); project.site.features.push({ locked: true, ...f, id }); return id; }
export function addBed(project, polygon, status = 'user-drawn', name = null, source = 'canvas', extra = {}) { project.site.bed_seq = (project.site.bed_seq || project.site.beds.length) + 1; const id = `bed-${project.site.bed_seq}`; const holes = (extra.holes || []).map(h => h.map(p => [r2(p[0]), r2(p[1])])); const poly = polygon.map(p => [r2(p[0]), r2(p[1])]); project.site.beds.push({ id, name: name || `Bed ${project.site.beds.length + 1}`, polygon: poly, holes, status, source, goals: [], conditions_overrides: {}, area_m2: r2(area(poly) - holes.reduce((s, h) => s + area(h), 0)), functions: extra.functions || [], strategy: extra.strategy || null, strategy_params: extra.strategy_params || null, reasoning: extra.reasoning || [], notes: extra.notes || [], under_canopy: extra.under_canopy || [], min_width_m: extra.min_width_m ?? null, proposal_id: extra.proposal_id || null, proposal_key: extra.proposal_key || null, confirmation: status === 'ai-suggested' ? 'proposed' : 'confirmed' }); return id; }
export function acceptBed(project, bedId) { const b = project.site.beds.find(b => b.id === bedId); if (b) { b.status = 'user-accepted'; b.confirmation = 'confirmed'; } }
export function setBedGeometry(project, bedId, polygon, holes = [], status = 'user-edited', source = 'edited on the canvas') { const b = project.site.beds.find(b => b.id === bedId); if (!b) return null; b.polygon = polygon.map(p => [r2(p[0]), r2(p[1])]); b.holes = (holes || []).map(h => h.map(p => [r2(p[0]), r2(p[1])])); b.area_m2 = r2(area(b.polygon) - b.holes.reduce((s, h) => s + area(h), 0)); b.status = status; b.source = source; b.confirmation = 'confirmed'; return b; }
export function removeBed(project, bedId) { const i = project.site.beds.findIndex(b => b.id === bedId); if (i < 0) return false; project.site.beds.splice(i, 1); return true; }
export const activeBeds = project => project.site.beds.filter(b => b.status !== 'rejected');
export const confirmedBeds = project => project.site.beds.filter(b => ['user-accepted', 'user-drawn', 'user-edited', 'user-calibrated'].includes(b.status));
export const bedShape = b => ({ polygon: b.polygon, holes: b.holes || [] });
export const bedFingerprint = b => JSON.stringify([b.polygon, b.holes || [], (b.functions || []).map(f => f.target_height_m != null || f.year_round != null ? [f.function, f.where, f.target_height_m ?? null, f.year_round ?? null] : [f.function, f.where]), ...(b.composition ? [b.composition] : [])]);   /* a bed without a chosen composition keeps the fingerprint it always had */
/** the arrangement chosen for one bed in Compose (js/engine.js COMPOSITION). Only what differs from the engine's default is kept, so a bed
 *  nobody touched is planted exactly as before. `patch` is merged into what is there; a value of null or a default removes its key. */
const COMP_DEFAULT = { pattern: 'drifts', grain: 'medium', rows: 'auto', density: 1, variation: 0 };
export function setComposition(project, bedId, patch) { const b = project.site.beds.find(x => x.id === bedId); if (!b) return null; const c = { ...(b.composition || {}), ...patch }; for (const k of Object.keys(c)) if (c[k] == null || c[k] === COMP_DEFAULT[k] || (Array.isArray(c[k]) && !c[k].length)) delete c[k]; const keys = Object.keys(c).sort(); if (keys.length) b.composition = Object.fromEntries(keys.map(k => [k, c[k]])); else delete b.composition; return b.composition || null; }
// site history: snapshots of beds + features for Undo / Reset on the Shape stage (capped)
/** `opts.outline` (V4.2): the snapshot also keeps the site outline — boundary, its status and source, and the sketch — so an edit of the outline is undone as one step with the beds and zones it clipped. */
export function snapshotSite(project, label, opts = {}) { const h = project.site.history || (project.site.history = []); const c = x => JSON.parse(JSON.stringify(x ?? null)); h.push({ label, time: now(), beds: c(project.site.beds), features: c(project.site.features), ...(opts.outline ? { outline: { boundary: c(project.site.boundary), boundary_status: project.site.boundary_status ?? null, boundary_source: project.site.boundary_source ?? null, concept: c(project.site.concept) } } : {}) }); if (h.length > 30) h.shift(); }
export function undoSite(project) { const h = project.site.history || []; const s = h.pop(); if (!s) return null; project.site.beds = s.beds; project.site.features = s.features; if (s.outline) { project.site.boundary = s.outline.boundary; project.site.boundary_status = s.outline.boundary_status; project.site.boundary_source = s.outline.boundary_source; if (s.outline.concept) project.site.concept = s.outline.concept; } return s; }
export function setCondition(project, key, value, status, source, note, bedId = null) { const c = cond(value, status, source, note); if (bedId) { const b = project.site.beds.find(b => b.id === bedId); if (b) b.conditions_overrides[key] = c; } else project.site.conditions[key] = c; }
export function effectiveConditions(project, bedId) { const b = project.site.beds.find(b => b.id === bedId); return { ...project.site.conditions, ...(b?.conditions_overrides || {}) }; }
export function addInput(project, input) { const id = uid(input.type); project.inputs.push({ id, added: now(), ...input }); return id; }
/** the site's location. `confirmed`: a geocoder result the user picked. `unverified`: the words the user typed, kept as a reference. */
export function setLocation(project, loc) { project.location = loc ? { ...loc, set_at: now() } : null; project.inputs = project.inputs.filter(i => i.type !== 'address'); if (loc) addInput(project, { type: 'address', role: 'context-reference', text: loc.label, lookup_performed: loc.status === 'confirmed', note: loc.status === 'confirmed' ? `map position confirmed by the user from a ${loc.provider || 'geocoder'} result; no boundary, size or site condition comes from it` : 'typed reference, not looked up; nothing is inferred from it' }); return project.location; }
export function say(project, role, text, extra = {}) { project.conversation.push({ id: uid('msg'), time: now(), role, text, ...extra }); }
const r2 = v => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- versions
export function currentVersion(project) { return project.versions.find(v => v.id === project.current_version_id) || null; }
/* V4.1 · what a version is. A GENERATED version is the engine's run over the design's inputs and is named by the fingerprint of those
   inputs (`input_fp`, set by the Studio). A DERIVED version is a generated version changed afterwards — by a typed edit, by hand, or by
   regenerating some beds only — so its plants are no longer what the engine would generate from the inputs: it carries no `input_fp`,
   and says how it was made, from which version, and which generated inputs it descends from. Versions saved before this existed are
   read by their `edit_event` (see `versionHow`); nothing in an older file is rewritten. */
const HOW = { spatial_edit: 'typed edit', geometry_update: 'partial regeneration' };
export const versionHow = v => v?.derived?.how || (v?.edit_event ? HOW[v.edit_event.kind] || (/^direct:/.test(v.edit_event.kind) ? 'manual edit' : 'edit') : null);
export function objectsFp(version) { let h = 2166136261; const s = (version.plant_objects || []).map(o => `${o.bed_id}|${o.species_id}|${o.role}|${r2(o.position_m[0])}|${r2(o.position_m[1])}`).sort().join(';'); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return `o-${h.toString(36)}`; }
export function commitVersion(project, version) {
  const parent = currentVersion(project);
  version.id = version.id || uid('v'); version.created = now(); version.parent_version_id = version.parent_version_id ?? project.current_version_id;
  version.plant_objects = version.plant_objects.map(p => ({ ...p, position_m: [r2(p.position_m[0]), r2(p.position_m[1])] }));
  version.objects_fp = objectsFp(version);
  if (version.edit_event) {
    const base = !parent ? null : parent.derived ? parent.derived : parent.edit_event ? { base_version_id: null, base_input_fp: null } : { base_version_id: parent.id, base_input_fp: parent.input_fp || null };
    version.derived = { how: versionHow({ edit_event: version.edit_event }), from_version_id: parent?.id || null, from_objects_fp: parent ? parent.objects_fp || objectsFp(parent) : null, base_version_id: base?.base_version_id ?? null, base_input_fp: base?.base_input_fp ?? null };
    delete version.input_fp; delete version.preview_match;
  }
  version.schedule = schedule(version);
  project.versions.push(version); project.current_version_id = version.id; project.redo = []; return version;
}
export function undo(project) { const v = currentVersion(project); if (!v || !v.parent_version_id) return false; project.redo.push(v.id); project.current_version_id = v.parent_version_id; return true; }
export function redo(project) { const id = project.redo.pop(); if (!id) return false; project.current_version_id = id; return true; }
export function schedule(version) { const by = new Map(); for (const p of version.plant_objects) { const s = by.get(p.species_id) || { species_id: p.species_id, count: 0, roles: new Set(), beds: new Set() }; s.count++; s.roles.add(p.role); s.beds.add(p.bed_id); by.set(p.species_id, s); } return [...by.values()].map(s => ({ species_id: s.species_id, count: s.count, roles: [...s.roles], beds: [...s.beds] })).sort((a, b) => b.count - a.count || a.species_id.localeCompare(b.species_id)); }
export function nextPlantId(project) { project.plant_seq += 1; return `plant-${String(project.plant_seq).padStart(3, '0')}`; }
export function clonePlants(version) { return version.plant_objects.map(p => ({ ...p, position_m: [...p.position_m] })); }

// ---------------------------------------------------------------- diff between two versions (by stable ids)
export function diff(a, b) {
  const A = new Map((a?.plant_objects || []).map(p => [p.id, p])), B = new Map((b?.plant_objects || []).map(p => [p.id, p]));
  const added = [...B.keys()].filter(id => !A.has(id)), removed = [...A.keys()].filter(id => !B.has(id));
  const changed = [...B.keys()].filter(id => A.has(id) && (A.get(id).position_m[0] !== B.get(id).position_m[0] || A.get(id).position_m[1] !== B.get(id).position_m[1] || A.get(id).species_id !== B.get(id).species_id));
  const unchanged = [...B.keys()].filter(id => A.has(id) && !changed.includes(id));
  const sa = Object.fromEntries((a ? schedule(a) : []).map(s => [s.species_id, s.count])), sb = Object.fromEntries((b ? schedule(b) : []).map(s => [s.species_id, s.count]));
  const schedule_delta = {}; for (const k of new Set([...Object.keys(sa), ...Object.keys(sb)])) if ((sa[k] || 0) !== (sb[k] || 0)) schedule_delta[k] = (sb[k] || 0) - (sa[k] || 0);
  return { added, removed, changed, unchanged, schedule_delta, count_before: A.size, count_after: B.size };
}

// ---------------------------------------------------------------- readiness: what the model knows, what blocks measured placement
export function readiness(project) {
  const s = project.site; const out = { site_boundary: !!s.boundary, scale: s.scale.status !== 'unknown', beds: s.beds.length, accepted_beds: s.beds.filter(b => ['user-accepted', 'user-drawn', 'user-edited'].includes(b.status)).length, unknown_conditions: Object.entries(s.conditions).filter(([, c]) => c.status === 'unknown').map(([k]) => k), measured_placement: false, blockers: [] };
  if (!out.site_boundary) out.blockers.push('no site geometry yet — draw a boundary or state the dimensions');
  if (!out.scale) out.blockers.push('scale unknown — measured spacing and quantities are blocked until a length is stated or calibrated');
  if (!out.beds) out.blockers.push('no planting bed yet — draw one or accept a suggestion');
  out.measured_placement = out.site_boundary && out.scale && out.beds > 0;
  return out;
}
export function siteBBox(project) { return project.site.boundary ? bbox(project.site.boundary) : null; }

// ---------------------------------------------------------------- persistence
// one saved project per published copy of the app: the production site (/design/) and a preview (/studio-preview/) share an origin
// on GitHub Pages, and a project written by one must not be opened by the other
const KEY = (() => { const dir = (typeof location !== 'undefined' ? location.pathname : '').split('/').filter(Boolean).filter(x => !/\.html?$/.test(x)).pop() || 'design'; return dir === 'design' ? 'pi.design.project.v1' : `pi.${dir}.project.v1`; })();
export function saveLocal(project) { try { localStorage.setItem(KEY, JSON.stringify(project)); return true; } catch { return false; } }
export function loadLocal() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
export function clearLocal() { try { localStorage.removeItem(KEY); } catch { } }
export async function saveServer(project) { try { const r = await fetch(`/api/designs/${encodeURIComponent(project.id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(project) }); return r.ok ? await r.json() : null; } catch { return null; } }
export async function serverStatus() { try { const r = await fetch('/api/status', { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; } }
export async function loadServer(id) { try { const r = await fetch(`/api/designs/${encodeURIComponent(id)}`, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; } }
