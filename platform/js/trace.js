// Decision Trace (Platform V3, 2026-11-14). One read-only explanation layer for a planting decision, used by the Knowledge overview
// (the full trace) and by the Garden Studio (the compact "Why this plant here?" in Compose and Grow). Given a project, a bed, a
// spatial function and a species or plant object it says: what the bed was asked to do and what is known of the site (A), what the
// knowledge base holds about the species for that function (B), whether the engine selected it and why (C), what was generated and by
// which rules (D), and what the engine measured (E). It adds no planting logic and no plant fact:
//
//   knowledge   the published snapshot (brain/data/explorer.json) through the Studio's own adapter (design/js/knowledge.js)
//   the bed     a project the Garden Studio saved — the recorded demonstration (designs/demo-a.json), this browser's saved design, or
//               the project the Studio has open — read only
//   the engine  design/js/engine.js itself: `assemble` (every species checked for the bed), `generate` only as a dry run for a design
//               that has no version yet, `evaluateScreen` / `evaluateGround` (the result re-measured)
//
// Two spatial functions have an arrangement rule in the engine today (E.FUNCTION_SUPPORT): Screen and Ground Cover. The others are
// recorded only; the trace says so and never shows an arrangement for them.
import * as PI from './platform.js';

const esc = PI.esc;
export const FN = PI.TRACE_FUNCTION;
/** the engine's name for the plants of an arranged function: its key in `picks`, `candidates`, `eligible` and the `role` of a plant object */
export const ROLE = { 'z:screen': 'screen', 'z:ground_cover': 'ground' };
export const fnOfObject = o => /^screen/.test(o.role) ? 'z:screen' : 'z:ground_cover';
const inRole = (o, role) => role === 'screen' ? /^screen/.test(o.role) : o.role === 'ground';

// ---------------------------------------------------------------- vocabulary shared by every surface
export const KIND = {
  source: { label: 'Source statement', who: 'source', says: 'What a named source says, in its own words. Shown as a short excerpt with its place on the page; a survey response stays in the survey’s protected database.' },
  claim: { label: 'Structured claim', who: 'record', says: 'The statement as the database stores it: one plant, one field, one value, with source, place, conditions and confidence. Written in the project’s own words.' },
  verification: { label: 'Human verification', who: 'person', says: 'Whether a reviewer opened the source and confirmed the claim. Only a person can mark a claim verified. Unverified means unchecked, not wrong.' },
  ai: { label: 'AI source assessment', who: 'ai', says: 'An AI assistant read the source against the claim and recorded whether the source supports it. An aid for reviewers. It never changes a claim and is never called verification.' },
  rule: { label: 'Rule-derived relationship', who: 'rule', says: 'A link the knowledge graph draws by a written rule over the claims, such as a recorded use that maps to a spatial function. It carries the standing of the claims under it.' },
  site: { label: 'Your site information', who: 'you', says: 'What the designer states or draws: the outline, the beds, light, water, soil, what a bed is for. Anything not stated stays unknown; it is not assumed.' },
  engine: { label: 'Engine output', who: 'rule', says: 'What the planting engine computes for a bed: which species pass its checks, where the plants stand. A deterministic algorithm with stated spacing rules and a seed.' },
  evaluation: { label: 'Evaluation', who: 'estimate', says: 'The engine’s measurement of its own result on the model, from claimed sizes: met, uncertain, not met, or an estimate. Never a measured or verified performance.' },
};
const WHO = { source: 'named source', respondent: 'anonymous respondent', record: 'from records', person: 'person', ai: 'AI-assessed', rule: 'rule-based', you: 'you', estimate: 'estimate' };
export const who = k => `<span class="pi-who ${k}">${WHO[k]}</span>`;
/** one row of the ledger: the kind of statement · the statement · where it comes from. `by` names who or what made the statement;
 *  pass null where nobody did — a row that records an absence carries no maker. */
export const row = (kind, body, prov = '', by = KIND[kind].who) => `<div class="pi-led" data-kind="${kind}"><dt>${KIND[kind].label}</dt><dd>${body}</dd><dd class="pi-led-p">${by ? who(by) : ''}${prov}</dd></div>`;
/** a record id set in mono, allowed to break after a colon and nowhere else */
export const idHtml = id => `<span class="id">${esc(id).replace(/:/g, ':<wbr>')}</span>`;
/** the engine's own sentences, tidied for reading: a claim id in brackets is dropped (the id is shown beside the row), "position(s)" is counted */
export const tidy = t => String(t ?? '').replace(/\s*\((?:[a-z0-9-]+:[a-z_]+:[a-z0-9]+|no spread claim)\)/g, '').replace(/(\d+) position\(s\)/g, (m, n) => `${n} position${n === '1' ? '' : 's'}`);
export const res = r => `<span class="pi-res ${esc(String(r).replace(/\s+/g, '_'))}">${esc(r)}</span>`;

/** what became of one species in one bed for one function. The results are never folded into "not suitable": the first three passed
 *  the bed's checks, `excluded` failed one with a claim or a measurement against it, `unknown` could not be judged for lack of a record. */
export const OUTCOME = {
  planted: { word: 'planted', says: 'It passed this bed’s checks, is in the mix, and the arrangement placed it.' },
  not_placed: { word: 'selected, not placed', says: 'It passed the checks and is in the mix, but the arrangement found no position for it.' },
  eligible: { word: 'eligible, not selected', says: 'It passed the checks. The mix for this bed is made of other species.' },
  excluded: { word: 'excluded by a check', says: 'A check the engine implements for this bed failed, with a recorded claim or a measurement against it.' },
  unknown: { word: 'evidence unknown', says: 'The knowledge base cannot say: a claim the function needs is missing. Not known is not the same as unsuitable.' },
  other_role: { word: 'planted for another function', says: 'It already stands in this bed for another function, so it is not considered again here.' },
  recorded_only: { word: 'recorded only', says: 'The knowledge base records this function, but the engine has no arrangement rule for it. Nothing is planted for it.' },
  not_asked: { word: 'not asked of this bed', says: 'This bed was not given this function, so nothing was checked.' },
};
export const out = k => `<span class="pi-out ${k}">${esc(OUTCOME[k]?.word || k)}</span>`;
/** V4: the eight outcomes answer two different questions and are shown as two groups, never as one scale of suitability.
 *  `selection` — what the engine did with a species it could check in this bed; `support` — why there was nothing to check or plant. */
export const OUTCOME_GROUP = { selection: { label: 'Selection result', of: ['planted', 'not_placed', 'eligible', 'other_role', 'excluded'] }, support: { label: 'Function support', of: ['unknown', 'recorded_only', 'not_asked'] } };
export const groupOf = k => OUTCOME_GROUP.selection.of.includes(k) ? 'selection' : 'support';
/** a species that passed is not thereby suitable: while a check of this bed is still `uncertain` (site conditions not stated, a claim
 *  unverified or disputed) the outcome is worded as provisional. The outcome itself (the enum) does not change. */
export const pending = d => ['planted', 'not_placed', 'eligible'].includes(d.outcome) && (d.open?.length > 0 || d.fit === 'uncertain');
export const outWord = d => d.outcome === 'eligible' && pending(d) ? 'eligible (checks pending), not selected' : pending(d) ? `${OUTCOME[d.outcome].word} · checks pending` : OUTCOME[d.outcome]?.word || d.outcome;
export const outD = d => `<span class="pi-out ${d.outcome}${pending(d) ? ' pending' : ''}" data-outcome-group="${groupOf(d.outcome)}">${esc(outWord(d))}</span>`;

// ---------------------------------------------------------------- which arrangement is being read (V4)
/** One short fingerprint of everything the planting engine reads from a project for an arrangement, plus the run settings (seed,
 *  density, second row). Two cases with the same fingerprint are the same engine run. The Studio writes it on a version when it
 *  generates (`version.input_fp`) and puts it in the link of a preview (`pv=`), so the inspector and the full trace can be shown to
 *  read the same thing — or the page can say that the design has changed since. Built field by field so that a project read back
 *  from storage gives the same string as the live one. */
export function inputFp(project, gen = {}) {
  const n = x => x ?? null; const site = project.site || {};
  const beds = liveBeds(project).map(b => [b.id, b.polygon, b.holes || [], (b.functions || []).map(f => [f.function, n(f.where), n(f.target_height_m), n(f.year_round), !!f.alternative]), b.composition || null, b.conditions_overrides || null]);
  const fns = (project.brief?.functions || []).map(f => [f.function, n(f.where), n(f.target_height_m), n(f.year_round), !!f.alternative]);
  const conds = Object.entries(site.conditions || {}).sort(([a], [b]) => a < b ? -1 : 1).map(([k, c]) => [k, n(c?.value), n(c?.status)]);
  const raw = JSON.stringify([n(site.boundary), (site.features || []).map(f => [f.kind, n(f.position_m), n(f.polygon), n(f.radius_m)]), conds, n(site.orientation), beds, fns, project.brief?.values || {}, (project.brief?.hard_constraints || []).map(c => [c.kind, n(c.text)]), n(gen.seed) ?? DRY_SEED, n(gen.density) ?? 1, gen.stagger !== false]);
  let h1 = 0x811c9dc5, h2 = 0x1b873593; for (let i = 0; i < raw.length; i++) { const ch = raw.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 0x01000193); h2 = Math.imul(h2 + ch, 0x5bd1e995) ^ (h2 >>> 13); }
  return `p-${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}
/** the run settings a version was generated with, as `inputFp` wants them */
export const genOf = v => ({ seed: v?.seed, density: v?.generator?.params?.density, stagger: v?.generator?.params?.stagger });
/** what a case reads, for a line of text: a generated version (its number in the project and its id) or a preview (its fingerprint) */
export function refOf(project, version, { dry = false, gen = {}, asked = null } = {}) {
  const fp = inputFp(project, dry ? gen : genOf(version)); const list = project.versions || []; const cur = list.find(v => v.id === project.current_version_id) || null;
  if (dry || !version?.id) return { kind: 'preview', fp, asked_fp: asked?.pv || null, changed: !!asked?.pv && asked.pv !== fp, generated: cur ? { id: cur.id, n: list.indexOf(cur) + 1, same_inputs: !!cur.input_fp && cur.input_fp === inputFp(project, genOf(cur)) && cur.input_fp === fp } : null };
  // V4.1: a version changed after it was generated (typed edit, manual edit, partial regeneration) is not the engine's run over the inputs:
  // it has no input fingerprint, whatever an older file carries (a manual edit used to inherit its parent's), and it says how it was made.
  const how = version.derived?.how || (version.edit_event ? ({ spatial_edit: 'typed edit', geometry_update: 'partial regeneration' })[version.edit_event.kind] || (/^direct:/.test(version.edit_event.kind) ? 'manual edit' : 'edit') : null);
  const from = how ? list.findIndex(v => v.id === (version.derived?.from_version_id || version.parent_version_id)) + 1 : 0;
  return { kind: 'version', id: version.id, n: list.findIndex(v => v.id === version.id) + 1, of: list.length, current: version.id === project.current_version_id, fp: how ? null : version.input_fp || null, inputs_changed: !how && !!version.input_fp && version.input_fp !== fp, derived: how ? { how, from_n: from || null, base_input_fp: version.derived?.base_input_fp || null, objects_fp: version.objects_fp || null } : null, asked_id: asked?.v || null, missing: !!asked?.v && asked.v !== version.id };
}
/** the same, as one sentence for the reader */
export function refLine(ref) {
  if (!ref) return '';
  if (ref.kind === 'preview') return `${ref.changed ? 'This preview has changed since the link was made: the design was edited, so the page shows the preview as it is now. ' : ''}Preview ${ref.fp}, not generated${ref.generated ? (ref.generated.same_inputs ? `; version ${ref.generated.n} was generated from the same inputs` : `; it differs from generated version ${ref.generated.n} until you regenerate`) : ' yet'}.`;
  return `${ref.missing ? 'The version named in the link is no longer in this design; the current version is shown. ' : ''}${ref.derived ? 'Version' : 'Generated version'} ${ref.n}${ref.of > 1 ? ` of ${ref.of}` : ''} (${ref.id})${ref.current ? '' : ', not the current one'}${ref.derived ? `, a ${ref.derived.how}${ref.derived.from_n ? ` of version ${ref.derived.from_n}` : ''}: its plants are no longer what the engine generates from the inputs, so the checks are recomputed on the plants as they stand` : ''}${ref.inputs_changed ? '. The design was edited after this version was generated: the checks are recomputed on the design as it is now' : ''}.`;
}

// ---------------------------------------------------------------- the engine, borrowed from the Studio
let engineP = null;
export function loadEngine() {
  const mod = f => import(new URL(`js/${f}`, PI.routes.design).href);
  return engineP || (engineP = Promise.all([mod('knowledge.js'), mod('engine.js'), mod('geom.js')]).then(([KM, E, G]) => ({ Knowledge: KM.Knowledge, E, G })));
}
export const arranged = (E, fn) => !!ROLE[fn] && E.functionArranged(fn);

// ---------------------------------------------------------------- the case: one bed of one project
const clone = x => JSON.parse(JSON.stringify(x));
const liveBeds = p => (p?.site?.beds || []).filter(b => b.status !== 'rejected' && Array.isArray(b.polygon));
/** the beds of a project that are asked for a function, as the engine itself reads it (a bed without its own list takes the site-wide one) */
export function tracedBeds(project, K, E, fn = FN) {
  const o = []; for (const b of liveBeds(project)) { try { if (E.assemble(project, K, b).wanted.includes(fn)) o.push(b); } catch { /* a bed the engine cannot read is not a case */ } } return o;
}
export const DRY_SEED = 42;
/** A saved project → the case. The project is cloned and never written. `origin`: 'reference' | 'mine'. A design that was never
 *  generated has no version: the engine's dry run stands in for it (`dry`), with the seed, density and row setting the Studio saved
 *  with the view (the same run Compose previews); nothing is stored. */
export function buildCase(saved, K, E, { bedId = null, fn = FN, origin = 'reference', read = null } = {}) {
  const project = clone(saved); const beds = tracedBeds(project, K, E, fn); const all = liveBeds(project); if (!all.length) return null;
  // V4: `read` names what the link was made from — { v: <version id> } a generated version, { pv: <fingerprint> } the Compose preview.
  // A preview is always computed here from the saved design (never read from a stored version), so it is what Compose shows now.
  const cur = (project.versions || []).find(v => v.id === project.current_version_id) || null; const gen = project.ui?.view?.gen || {};
  let version = read?.pv ? null : (read?.v && (project.versions || []).find(v => v.id === read.v)) || cur; let dry = false;
  if (!version) { try { version = E.generate(project, K, all.map(b => b.id), gen.seed ?? DRY_SEED, { density: gen.density ?? 1, stagger: gen.stagger ?? true, id_start: 0 }); dry = cur ? 'preview' : true; } catch { version = null; } }
  // the bed that was asked for; else, among the beds asked for the function, the one where the function has the most plants (the first on a tie)
  const role = ROLE[fn]; const nIn = b => version && role ? version.plant_objects.filter(o => o.bed_id === b.id && inRole(o, role)).length : 0;
  const bed = beds.find(b => b.id === bedId) || (arranged(E, fn) ? beds.slice().sort((a, b) => nIn(b) - nIn(a))[0] : all.find(b => b.id === bedId) || beds[0] || all[0]); if (!bed) return null;
  return caseOf(project, K, E, { bed, beds, version, dry, origin, gen, asked: read });
}
/** The same case over objects the caller already holds (the Studio: its open project, its current or previewed version). Nothing is
 *  cloned or generated; `assemble` and the two evaluations are run again, and they do not write. */
export function caseOf(project, K, E, { bed, beds = null, version = null, dry = false, origin = 'mine', gen = {}, asked = null }) {
  const asm = E.assemble(project, K, bed); const plants = version ? version.plant_objects.filter(p => p.bed_id === bed.id) : [];
  const said = (project.conversation || []).find(m => m.role === 'user' && m.text)?.text || null;
  const c = { origin, project, K, E, bed, beds: beds || [bed], asm, version, dry, plants, said, snapshot: { now: K.snapshot?.generated || null, design: version?.knowledge_snapshot?.generated || project.knowledge_snapshot?.generated || null } };
  // Screen: the edge zone of this bed, its row plan, the row, the recorded and the re-measured evaluation
  const zone = version ? (version.zones || []).find(z => z.kind === 'edge' && z.bed_id === bed.id && z.function === 'z:screen') || null : null;
  const srow = plants.filter(p => zone && p.zone_id === zone.id && inRole(p, 'screen')); const srec = version?.evaluation?.edge_zones?.find(e => e.zone === zone?.id) || null; let slive = null;
  if (zone) { try { slive = E.evaluateScreen(zone, version.plant_objects, K, project); } catch { slive = null; } }
  c.screen = { zone, plan: zone?.row_plans?.[0] || null, objects: srow, recorded: srec, live: slive, evaluation: slive || srec, same: !!(srec && slive && srec.status === slive.status && srec.covered_m === slive.covered_m && JSON.stringify(srec.checks) === JSON.stringify(slive.checks)) };
  // Ground Cover: the ground group of this bed (pattern, spacing, expected count), the accent group that takes some of its positions, the estimate
  const grp = version ? (version.groups || []).find(g => g.bed_id === bed.id && g.role === 'ground') || null : null; const acc = version ? (version.groups || []).find(g => g.bed_id === bed.id && g.role === 'accent') || null : null;
  const grec = version?.evaluation?.ground_cover?.find(g => g.bed_id === bed.id) || null; let glive = null;
  if (version && asm.wanted.includes('z:ground_cover')) { try { glive = E.evaluateGround(bed, version, project); } catch { glive = null; } }
  c.ground = { group: grp, accent: acc, objects: plants.filter(p => p.role === 'ground' || p.role === 'accent'), recorded: grec, live: glive, evaluation: glive || grec, same: !!(grec && glive && grec.ground_cover_share === glive.ground_cover_share && grec.plants === glive.plants && grec.ground_cover_m2 === glive.ground_cover_m2), composition: E.compositionOf(bed) };
  c.unresolved = version ? (version.unresolved || []).filter(u => u.includes(bed.name)) : [];
  try { c.ref = version ? refOf(project, version, { dry: !!dry, gen, asked }) : null; } catch { c.ref = null; }
  return c;
}
export const sectionOf = (c, fn) => fn === 'z:screen' ? c.screen : fn === 'z:ground_cover' ? c.ground : null;
/** the species the trace follows when none is named: the lead of the function's planting in this bed, else its first pick */
export function leadSpecies(c, fn) { const role = ROLE[fn]; if (!role) return null; return (fn === 'z:screen' && c.screen.plan?.lead?.species_id) || sectionOf(c, fn)?.objects.find(o => inRole(o, role))?.species_id || c.asm.picks[role]?.[0]?.id || null; }

// ---------------------------------------------------------------- C: the selection decision for one species
/** Reads the engine's own records: `asm.candidates[role]` (the checks), `asm.picks[role]` (the mix), the plant objects of the bed. */
export function decide(c, fn, speciesId) {
  const { asm, E, K } = c; const role = ROLE[fn]; const sp = K.sp(speciesId); const id = sp?.id || speciesId; const link = K.functionLink(id, fn) || null; const label = K.FN.get(fn)?.label || fn;
  const base = { fn, label, role, species: id, link, arranged: arranged(E, fn), wanted: asm.wanted.includes(fn), cand: null, picked: false, objects: [], failing: [], open: [], mix: [], max: null, chosen: false, other: null, otherN: 0, fit: null, rank: -1 };
  if (!base.arranged) return { ...base, outcome: 'recorded_only', reason: `${label} is ${E.FUNCTION_SUPPORT[fn]?.why || 'recorded only: the engine has no arrangement rule for it'}` };
  if (!base.wanted) return { ...base, outcome: 'not_asked', reason: `${c.bed.name} is not asked to be a ${label}` };
  const cand = asm.candidates[role].find(x => x.id === id) || null; const picked = asm.picks[role].some(r => r.id === id); const objects = c.plants.filter(o => o.species_id === id && inRole(o, role));
  const mix = asm.picks[role].map(r => r.id); const max = E.COMPOSITION.max_species[role]; const chosen = Array.isArray(asm.composition?.[`${role}_species`]);
  const other = ['screen', 'ground', 'accent'].find(r => r !== role && asm.picks[r].some(x => x.id === id)) || null; const otherN = other ? c.plants.filter(o => o.species_id === id && (other === 'screen' ? /^screen/.test(o.role) : o.role === other)).length : 0;
  const failing = cand ? Object.entries(cand.checks).filter(([, v]) => v.result === 'fails') : []; const open = cand ? Object.entries(cand.checks).filter(([, v]) => v.result === 'uncertain') : [];
  const d = { ...base, cand, picked, objects, failing, open, mix, max, chosen, other, otherN, fit: cand?.fit || null, rank: (asm.eligible?.[role] || []).indexOf(id) };
  const names = ids => ids.map(x => K.name(x)).join(' and ');
  if (picked && objects.length) return { ...d, outcome: 'planted', reason: `${objects.length} placed${chosen ? '; the mix was chosen in Compose among the species that qualify' : mix.length > 1 ? `; the engine’s mix is ${names(mix)}` : ''}` };
  if (picked) { const grp = role === 'ground' ? c.ground.group : null; const got = [...new Set(c.plants.filter(o => inRole(o, role)).map(o => o.species_id))];
    return { ...d, outcome: 'not_placed', reason: !c.version ? 'in the mix; no arrangement has been computed' : c.unresolved.find(u => role === 'screen' ? /screen/i.test(u) : /ground/i.test(u)) || (grp && got.length ? `in the mix, but ${grp.params.pattern_label.toLowerCase()} gave every position in this bed to ${names(got)}; another pattern, grain or variation may place it` : 'in the mix, but no position of this arrangement went to it') }; }
  if (!cand) return other ? { ...d, outcome: 'other_role', reason: `it stands in this bed as ${other === 'screen' ? 'the Screen row' : other === 'accent' ? 'an accent' : 'ground layer'} (${otherN} placed), and a species is used for one function per bed` } : { ...d, outcome: 'unknown', reason: 'the engine recorded no check for it in this bed' };
  if (cand.fit !== 'fails') return { ...d, outcome: 'eligible', reason: `${chosen ? 'the mix chosen in Compose is' : `the engine takes ${role === 'screen' ? 'the best-ranked species, and a second only when it is as good:' : `the ${Math.min(2, max)} best-ranked of those that qualify:`}`} ${names(mix) || 'none'}${other === 'accent' ? `; it is placed as an accent instead (${otherN})` : ''}` };
  const ev = cand.checks.evidence;
  if (ev?.result === 'fails') {   // no link in the knowledge graph: a claim is missing (unknown), or a recorded trait contradicts a requirement (excluded)
    const all = (link?.requirements || []).filter(r => r.result !== 'met'); const unmet = all.some(r => r.strength === 'required') ? all.filter(r => r.strength === 'required') : all; const why = unmet.map(r => `${r.strength} ${r.alternative_labels.join(' or ')}${r.contrary?.length ? `: recorded ${[...new Set(r.contrary.map(x => x.target_label))].join(', ')}` : ': nothing recorded'}`).join('; ');
    return link?.verdict === 'evidence missing' ? { ...d, outcome: 'unknown', reason: `no source records it as ${label}, and a trait ${label} needs is not recorded${why ? ` (${why})` : ''}` } : { ...d, outcome: 'excluded', reason: `no source records it as ${label}, and a recorded trait is outside what ${label} needs${why ? ` (${why})` : ''}` };
  }
  return { ...d, outcome: 'excluded', reason: failing.map(([k, v]) => tidy(v.detail)).join('; ') };
}
/** every species of the snapshot for this bed and function, in the order a reader needs: placed, in the mix, eligible, then the rest */
export function decisions(c, fn) { const order = ['planted', 'not_placed', 'eligible', 'other_role', 'unknown', 'excluded', 'recorded_only', 'not_asked']; return c.K.species.map(s => decide(c, fn, s.id)).sort((a, b) => order.indexOf(a.outcome) - order.indexOf(b.outcome) || (a.rank < 0 ? 99 : a.rank) - (b.rank < 0 ? 99 : b.rank) || c.K.name(a.species).localeCompare(c.K.name(b.species))); }

// ---------------------------------------------------------------- drawings (the site drawing's conventions, DESIGN.md)
const r2 = n => Math.round(n * 100) / 100;
const box = poly => { const xs = poly.map(q => q[0]), ys = poly.map(q => q[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; };
/** the site in plan. Screen: the row with its mature crowns, the screened edge and its uncovered stretches. Ground Cover: the ground
 *  layer of the bed, the followed species filled. `plant` rings one plant object; `zoom` frames the bed. Drawn from the plant objects. */
export function planSvg(c, { fn = FN, species = null, plant = null, zoom = false } = {}) {
  const p = c.project; const B = p.site.boundary; if (!B) return ''; const role = ROLE[fn] || null; const sec = sectionOf(c, fn);
  const S0 = box(B); const F = zoom ? (b => ({ x0: Math.max(S0.x0, b.x0 - .45), x1: Math.min(S0.x1, b.x1 + .45), y0: Math.max(S0.y0, b.y0 - .45), y1: Math.min(S0.y1, b.y1 + .45) }))(box(c.bed.polygon)) : S0; const m = zoom ? 0.2 : 0.55;
  const X = x => r2(x - F.x0 + m), Y = y => r2(F.y1 - y + m); const pts = poly => poly.map(q => `${X(q[0])},${Y(q[1])}`).join(' '); const W = r2(F.x1 - F.x0 + 2 * m), H = r2(F.y1 - F.y0 + 2 * m);
  let h = `<polygon class="pl-site" points="${pts(B)}"/>`;
  for (const f of p.site.features || []) if (f.kind === 'no-plant-zone' && f.polygon) h += `<polygon class="pl-open" points="${pts(f.polygon)}"/>`;
  for (const b of liveBeds(p)) h += `<polygon class="pl-bed${b.id === c.bed.id ? ' on' : ''}" points="${pts(b.polygon)}"/>`;
  for (const f of p.site.features || []) if (f.kind === 'existing-tree' && f.position_m) h += `<circle class="pl-tree" cx="${X(f.position_m[0])}" cy="${Y(f.position_m[1])}" r="${f.radius_m ?? 1.5}"/><circle class="pl-trunk" cx="${X(f.position_m[0])}" cy="${Y(f.position_m[1])}" r=".09"/>`;
  const mine = o => (role && inRole(o, role)) || (role === 'ground' && o.role === 'accent');
  for (const o of c.plants) if (!mine(o)) h += `<circle class="pl-ground" cx="${X(o.position_m[0])}" cy="${Y(o.position_m[1])}" r="${o.proxy_radius_m}"/>`;
  for (const o of c.plants) if (mine(o)) h += `<circle class="pl-crown${species && o.species_id !== species ? ' other' : ''}${o.role === 'accent' ? ' accent' : ''}" cx="${X(o.position_m[0])}" cy="${Y(o.position_m[1])}" r="${o.proxy_radius_m}"/><circle class="pl-stem" cx="${X(o.position_m[0])}" cy="${Y(o.position_m[1])}" r="${zoom ? .035 : .05}"/>`;
  if (fn === 'z:screen' && c.screen.zone) for (const [i, e] of c.screen.zone.edges.entries()) {
    const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) || 1; const at = t => [e.a[0] + (e.b[0] - e.a[0]) * t / len, e.a[1] + (e.b[1] - e.a[1]) * t / len];
    h += `<line class="pl-edge" x1="${X(e.a[0])}" y1="${Y(e.a[1])}" x2="${X(e.b[0])}" y2="${Y(e.b[1])}"/>`;
    for (const g of (c.screen.evaluation?.gaps || []).filter(g => g.edge === i)) { const a = at(g.from_m), b = at(g.to_m); h += `<line class="pl-gap-u" x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}"/><line class="pl-gap" x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}"/>`; }
  }
  const po = plant ? c.plants.find(o => o.id === plant) : null; if (po) h += `<circle class="pl-pick" cx="${X(po.position_m[0])}" cy="${Y(po.position_m[1])}" r="${r2(po.proxy_radius_m + (zoom ? .07 : .1))}"/>`;
  if (!zoom) h += `<g class="pl-dim"><line x1="${X(S0.x0)}" y1="${r2(H - .2)}" x2="${X(S0.x1)}" y2="${r2(H - .2)}"/><text x="${r2(W / 2)}" y="${r2(H - .02)}" text-anchor="middle">${r2(S0.x1 - S0.x0)} m</text><text x="${r2(W - .12)}" y=".3" text-anchor="end">N ↑</text></g>`;
  const n = sec?.objects.length || 0; const what = fn === 'z:screen' ? `${n} screen plants along the screened edge${c.screen.evaluation?.gaps?.length ? `, ${c.screen.evaluation.gaps.length} uncovered stretch${c.screen.evaluation.gaps.length === 1 ? '' : 'es'} marked` : ''}` : fn === 'z:ground_cover' ? `${n} ground-layer plants` : 'no arrangement for this function';
  return `<svg class="kn-plan${zoom ? ' zoom' : ''}"${zoom ? ` style="width:min(100%, ${Math.round(Math.min(560, 420 * W / H))}px)"` : ''} viewBox="0 0 ${W} ${H}" role="img" aria-label="Plan of ${zoom ? esc(c.bed.name) : `the ${r2(S0.x1 - S0.x0)} by ${r2(S0.y1 - S0.y0)} metre site`}: ${esc(c.bed.name)} with ${what}">${h}</svg>`;
}
/** the screened edge unrolled: every expected position, the mature crowns that cover it, and the uncovered stretches */
export function edgeStrip(c) {
  const z = c.screen.zone, pl = c.screen.plan, ev = c.screen.evaluation; if (!z || !pl || !ev) return ''; const e = z.edges[pl.edge ?? 0]; const L = pl.edge_length_m; const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) || 1;
  const u = [(e.b[0] - e.a[0]) / len, (e.b[1] - e.a[1]) / len]; const tOf = o => (o.position_m[0] - e.a[0]) * u[0] + (o.position_m[1] - e.a[1]) * u[1];
  const placed = c.screen.objects.map(o => ({ t: tOf(o), r: o.proxy_radius_m })); const near = t => placed.some(q => Math.abs(q.t - t) < 0.06);
  const k = 100; const W = L * k, pad = 14;
  let h = `<line class="es-edge" x1="0" y1="52" x2="${W}" y2="52"/>`;
  for (const g of ev.gaps || []) h += `<line class="es-gap-u" x1="${g.from_m * k}" y1="52" x2="${g.to_m * k}" y2="52"/><line class="es-gap" x1="${g.from_m * k}" y1="52" x2="${g.to_m * k}" y2="52"/><text class="es-gt" x="${(g.from_m + g.to_m) / 2 * k}" y="74" text-anchor="middle">${g.length_m} m not covered</text>`;
  for (const t of pl.row1_t || []) if (!near(t)) h += `<circle class="es-miss" cx="${t * k}" cy="30" r="5"/>`;
  for (const q of placed) h += `<circle class="es-crown" cx="${q.t * k}" cy="30" r="${q.r * k}"/><circle class="es-stem" cx="${q.t * k}" cy="30" r="3"/>`;
  h += `<text class="es-t" x="0" y="74">0</text><text class="es-t" x="${W}" y="74" text-anchor="end">${L} m</text>`;
  return `<svg class="kn-strip" viewBox="${-pad} ${-pad - 6} ${W + 2 * pad} ${98 + pad}" role="img" aria-label="The screened edge, ${L} metres: ${placed.length} plants placed of ${pl.expected?.[0] ?? '?'} positions; ${ev.covered_m} metres covered by mature crowns">${h}</svg>`;
}

// ---------------------------------------------------------------- small readers over the snapshot
export const human = s => String(s ?? '').replace(/_/g, ' ');
export const AI_WORD = { supported_by_source: 'supported by source', partially_supported: 'partially supported', conflicting_evidence: 'conflicting evidence', not_assessed: 'not assessed' };
export const SOURCE_TYPE = { database: 'published plant database', municipal: 'municipal open data', practitioner: 'practitioner survey response', model: 'model placeholder, never evidence' };
export const isSurvey = (d, sid) => d.sources[sid]?.type === 'practitioner';
export const sourceName = (d, sid) => { const s = d.sources[sid]; if (!s) return sid; return s.type === 'practitioner' ? `Practitioner survey, ${sid.replace('survey-r', 'respondent ')}` : s.label.split(' — ')[0]; };
export const sourceLink = (d, sid) => { const s = d.sources[sid]; return s?.url && s.type !== 'practitioner' ? `<a href="${esc(s.url)}" rel="noopener">${esc(sourceName(d, sid))}</a>` : esc(sourceName(d, sid)); };
/** concept labels of a claim's value, read from the snapshot's concept index (an id without a concept keeps its own wording) */
export function valueLabels(d, c) { const CO = new Map(d.concepts.map(x => [x.id, x.label])); const v = Array.isArray(c.value) ? c.value : [c.value]; return v.map(x => typeof x === 'string' ? CO.get(x) || human(x.split(':').pop()) : JSON.stringify(x)); }
export const plural = (n, w, ws = w + 's') => `${n} ${n === 1 ? w : ws}`;
export const cap = t => t ? t.charAt(0).toUpperCase() + t.slice(1) : t;

// ---------------------------------------------------------------- the compact explanation ("Why this plant here?")
/** Five lines, A to E, for one species (and one plant object) in one bed: asked · knowledge · selection · arrangement · result.
 *  The Studio shows it inside its inspector; `href` opens the full trace. Every word comes from the case; nothing is stored. */
export function why(c, fn, speciesId, { plant = null } = {}) {
  const { K, asm, bed } = c; const d = decide(c, fn, speciesId); const sp = K.sp(d.species); const dd = K.d; const lines = [];
  const bfn = (bed.functions || []).find(f => f.function === fn) || c.project.brief.functions.find(f => f.function === fn && !f.alternative) || null;
  const unknown = ['light', 'water', 'soil_type'].filter(k => { const x = asm.conditions[k]; return !x || !x.value || x.status === 'unknown'; }).map(k => k.replace('_type', ''));
  lines.push(['Asked', d.wanted ? `${esc(bed.name)} is asked to be ${fn === 'z:screen' ? 'a Screen' : esc(d.label)}${bfn?.where && /-edge$/.test(bfn.where) && fn === 'z:screen' ? ` along its ${esc(bfn.where.replace('-edge', ''))} edge` : ''}${bfn?.basis ? `: ${esc(bfn.basis)}` : ''}. ${unknown.length ? `${cap(unknown.join(', '))} ${unknown.length === 1 ? 'is' : 'are'} not stated, so no site check can pass outright.` : 'Light, water and soil are stated.'}` : `${esc(cap(d.reason))}.`]);
  const l = d.link; const uc = (l?.use_claims || []).map(id => dd.claims[id]).filter(Boolean); const nv = uc.filter(x => x.status === 'verified').length; const ai = uc.map(x => dd.evidence_checks[x.id]?.result).filter(Boolean);
  lines.push(['Knowledge', !l ? 'No record links this species to the function.' : l.status === 'derived' ? `Linked to ${esc(d.label)} because a source records the use ${esc((l.via_use_labels || []).join(', '))} (${esc([...new Set(l.use_sources || [])].map(x => sourceName(dd, x)).join(', '))}). ${nv ? `${nv} of ${plural(uc.length, 'claim')} verified by a person` : `${uc.length === 1 ? 'The claim is' : 'The claims are'} not verified by a person`}${ai.length ? `; AI source assessment: ${esc([...new Set(ai)].map(x => AI_WORD[x] || human(x)).join(', '))}` : ''}${l.conflict ? '. A recorded trait contradicts the use; both are kept' : ''}.` : l.status === 'candidate' ? `No source states this use. The link is inferred because every trait ${esc(d.label)} needs is met by recorded claims; it is never promoted.` : `No link is drawn: ${esc(l.verdict || 'unknown')}.`]);
  const chk = d.cand ? Object.entries(d.cand.checks).map(([k, v]) => `${esc(k.replace('_', ' '))} ${res(v.result)}`).join(' · ') : '';
  const acc = plant && c.plants.find(o => o.id === plant)?.role === 'accent' ? asm.picks.accent.find(r => r.id === d.species) || null : null;   // an accent object: placed by the engine's repeat_accent operator, not selected as ground layer
  if (acc) { const g = c.ground.accent; lines.push(['Selection', `${out('planted')}. As an accent, not as ground layer: ${esc(String(acc.why?.[0] || 'a repeated accent').replace(/^accent: /, ''))}.${g ? ` Every ${esc(g.params.every)}th ground position toward ${esc(g.params.toward)} takes the accent species.` : ''}`]); }
  else lines.push(['Selection', `${outD(d)}. ${esc(cap(d.reason))}.${chk ? ` <span class="pi-why-c">${chk}</span>` : ''}`]);
  const inIt = acc || d.outcome === 'planted' || d.outcome === 'not_placed';
  if (d.arranged && d.wanted && c.version && !inIt) {   // not part of the arrangement: say what stands there instead, and stop — the bed's result is not this species' result
    const got = [...new Set((sectionOf(c, fn)?.objects || []).filter(o => o.role !== 'accent').map(o => o.species_id))]; const g = fn === 'z:ground_cover' ? c.ground.group : null;
    lines.push(['Instead', got.length ? `${esc(bed.name)} is planted with ${esc(got.map(x => K.name(x)).join(' and '))}${g ? ` in ${esc(g.params.pattern_label.toLowerCase())}` : fn === 'z:screen' ? ' as its row' : ''}.` : `Nothing is planted for ${esc(d.label)} in ${esc(bed.name)}.`]);
  } else if (d.arranged && d.wanted && c.version) {
    const po = plant ? c.plants.find(o => o.id === plant) : null;
    if (fn === 'z:screen') { const pl = c.screen.plan; const ev = c.screen.evaluation;
      lines.push(['Arrangement', pl ? `${po ? `This plant stands at ${po.position_m.join(', ')} m. ` : ''}${pl.rows === 1 ? 'One row' : `${pl.rows} rows`} along ${pl.edge_length_m} m: ${pl.expected[0] + pl.expected[1]} positions at ${pl.step_m} m, ${pl.placed[0] + pl.placed[1]} placed${pl.shortfall ? `; ${esc(tidy(pl.shortfall))}` : ''}. Spacing is ${esc(pl.spacing_rule.split(';')[0])}, a ${esc(pl.spacing_source)} of the engine.` : 'No row was placed for this bed.']);
      lines.push(['Result', ev ? `${esc(d.label)}: ${res(ev.status)}. ${esc(ev.reasons.map(r => cap(r.text)).join('. ') || 'Every check the engine can make is met on claimed sizes')}. An estimate from claimed sizes, not a verified performance.` : 'Nothing to evaluate.']);
    } else { const g = c.ground.group; const ev = c.ground.evaluation; const by = {}; for (const o of c.ground.objects) by[o.species_id] = (by[o.species_id] || 0) + 1;
      lines.push(['Arrangement', g ? `${po ? `This plant stands at ${po.position_m.join(', ')} m${po.role === 'accent' ? ', as an accent that took a ground position' : ''}. ` : ''}${esc(g.params.pattern_label)}: ${esc(g.params.pattern_rule)}. ${g.params.placed} placed of about ${g.params.expected_count} positions (${Object.entries(by).map(([id, n]) => `${n} ${esc(K.name(id))}`).join(', ')}). Spacing ${g.params.spacing_m} m, a ${esc(g.params.spacing_source)} of the engine.` : esc(cap(c.unresolved.find(u => /ground/i.test(u)) || 'No ground layer was placed in this bed.'))]);
      lines.push(['Result', ev ? `${res('estimate')} ${Math.round(ev.ground_cover_share * 100)} % of the ${ev.plantable_m2} m² of plantable ground lies under a mature crown of the ground layer. The engine sets no pass mark, and this is not the cover a planting reaches.` : 'Nothing to evaluate.']);
    }
  } else if (d.arranged && d.wanted) lines.push(['Arrangement', 'No arrangement has been computed for this bed yet.']);
  return { d: acc ? { ...d, outcome: 'planted', accent: true } : d, sp, lines, dry: c.dry, ref: c.ref || null, short: shortOf(c, fn, d, acc, plant, lines) };
}
/** V4: the same explanation in three answers — Why selected · Why here · Does it work? — for the inspector. Every clause is taken
 *  from the five lines above (the engine's records); nothing is added. The five lines stay one click away, the full trace two. */
function shortOf(c, fn, d, acc, plant, lines) {
  const { K, bed } = c; const dd = K.d; const l = d.link; const get = k => lines.find(x => x[0] === k)?.[1] || ''; const label = d.label; const s = [];
  const uc = (l?.use_claims || []).map(id => dd.claims[id]).filter(Boolean); const nv = uc.filter(x => x.status === 'verified').length; const ai = [...new Set(uc.map(x => dd.evidence_checks[x.id]?.result).filter(Boolean))];
  const basis = !l ? 'no record links it to this function' : l.status === 'derived' ? `a source records the use ${(l.via_use_labels || []).join(', ')}` : l.status === 'candidate' ? `no source states the use; its recorded traits meet what ${label} needs` : `no link is drawn (${l.verdict || 'unknown'})`;
  const standing = uc.length ? `${nv ? `${nv} of ${plural(uc.length, 'claim')} verified by a person` : 'not verified by a person'}${ai.length ? `; AI source assessment: ${ai.map(x => AI_WORD[x] || human(x)).join(', ')}` : ''}` : '';
  const open = (d.open || []).map(([k]) => k.replace('_', ' '));
  if (acc) s.push(['Why selected', `${out('planted')} as an accent: ${esc(String(acc.why?.[0] || 'a repeated accent').replace(/^accent: /, ''))}.`]);
  else if (d.outcome === 'planted' || d.outcome === 'not_placed' || d.outcome === 'eligible') s.push(['Why selected', `${outD(d)}. ${esc(cap(basis))}${standing ? ` (${esc(standing)})` : ''}. It passed this bed’s checks${open.length ? `; still uncertain: ${esc(open.join(', '))}` : ''}.`]);
  else s.push(['Why not selected', `${outD(d)}. ${esc(cap(d.reason))}.`]);
  const po = plant ? c.plants.find(o => o.id === plant) : null; const bfn = (bed.functions || []).find(f => f.function === fn) || c.project.brief.functions.find(f => f.function === fn && !f.alternative) || null;
  const asked = d.wanted ? `${esc(bed.name)} is asked to be ${fn === 'z:screen' ? 'a Screen' : esc(label)}${bfn?.where && /-edge$/.test(bfn.where) && fn === 'z:screen' ? ` along its ${esc(bfn.where.replace('-edge', ''))} edge` : ''}` : esc(cap(d.reason));
  const inIt = acc || d.outcome === 'planted' || d.outcome === 'not_placed';
  if (!d.arranged || !d.wanted) s.push(['Why here', `${asked}.`]);
  else if (!c.version) s.push(['Why here', `${asked}. No arrangement has been computed yet.`]);
  else if (!inIt) s.push(['Instead', get('Instead')]);
  else if (fn === 'z:screen') { const pl = c.screen.plan; s.push(['Why here', `${asked}. ${pl ? `${po ? `This plant is position ${po.position_m.join(', ')} m of ` : ''}${po ? (pl.rows === 1 ? 'one row' : `${pl.rows} rows`) : pl.rows === 1 ? 'One row' : `${pl.rows} rows`} along ${pl.edge_length_m} m, ${pl.placed[0] + pl.placed[1]} of ${pl.expected[0] + pl.expected[1]} positions placed at ${pl.step_m} m (a spacing heuristic of the engine).` : 'No row was placed.'}`]); }
  else { const g = c.ground.group; s.push(['Why here', `${asked}. ${g ? `${po ? `This plant stands at ${po.position_m.join(', ')} m${po.role === 'accent' ? ', an accent on a ground position' : ''}, in ` : ''}${esc(po ? g.params.pattern_label.toLowerCase() : g.params.pattern_label)}: ${g.params.placed} placed at ${g.params.spacing_m} m (a spacing heuristic of the engine).` : 'No ground layer was placed.'}`]); }
  if (d.arranged && d.wanted && c.version && inIt) s.push(['Does it work?', get('Result')]);
  else if (d.arranged && d.wanted && c.version) { const ev = sectionOf(c, fn)?.evaluation; s.push(['Does the bed work?', fn === 'z:screen' ? (ev ? `${esc(label)}: ${res(ev.status)}, without this species. An estimate from claimed sizes.` : 'Nothing to evaluate.') : (ev ? `${res('estimate')} ${Math.round(ev.ground_cover_share * 100)} % of the plantable ground under mature crowns, without this species. No pass mark is set.` : 'Nothing to evaluate.')]); }
  return s;
}
/** `full: false` (the default in the Studio's inspector, V4) shows the three answers and keeps the five steps in a disclosure the
 *  caller can open (`open`); `full: true` shows the five steps only. `data-why-ref` says what was read: version:<id> or preview:<fingerprint>. */
export function whyHtml(c, fn, speciesId, { plant = null, href = null, title = true, full = false, open = false } = {}) {
  const w = why(c, fn, speciesId, { plant }); const sp = w.sp; const ref = w.ref; const key = s => s.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-$/, '');
  const five = `<dl class="pi-why-5">${w.lines.map(([k, v]) => `<div data-why-line="${k.toLowerCase()}"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  const three = `<dl class="pi-why-3">${w.short.map(([k, v]) => `<div data-why-short="${key(k)}"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  const read = ref ? `<p class="pi-why-n ${ref.kind}" data-why-read="${ref.kind}">${ref.kind === 'preview' ? `<b>Preview</b> <span class="id">${esc(ref.fp)}</span> · ${ref.generated ? (ref.generated.same_inputs ? `same inputs as generated version ${ref.generated.n}` : `not generated yet; differs from version ${ref.generated.n}`) : 'not generated yet'}` : `<b>${ref.derived ? 'Version' : 'Generated version'} ${ref.n}</b> <span class="id">${esc(ref.id)}</span>${ref.derived ? ` · <span data-why-derived="${esc(ref.derived.how)}">${esc(ref.derived.how)}${ref.derived.from_n ? ` of version ${ref.derived.from_n}` : ''}</span>` : ''}${ref.inputs_changed ? ' · the design was edited since' : ''}`}</p>` : '';
  return `<div class="pi-why" data-why="${esc(w.d.outcome)}" data-why-fn="${esc(fn)}" data-why-species="${esc(sp?.slug || '')}"${plant ? ` data-why-plant="${esc(plant)}"` : ''}${ref ? ` data-why-ref="${ref.kind === 'preview' ? `preview:${esc(ref.fp)}` : `version:${esc(ref.id)}`}"` : ''}>${title ? `<h4>Why ${plant || w.d.outcome === 'planted' ? '' : 'not '}${plant ? 'this plant' : `<i>${esc(sp?.scientific_name || '')}</i>`} here?</h4>` : ''}${full ? five : `${three}<details class="pi-why-more" data-why-more${open ? ' open' : ''}><summary>The five steps: asked, knowledge, selection, arrangement, result</summary>${five}</details>`}${read}${href ? `<a class="pi-why-go" href="${esc(href)}" data-pi-go="trace">Open the full trace: sources, claims, rules, evaluation</a>` : ''}</div>`;
}
