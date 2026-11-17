// Knowledge adapter over brain/data/explorer.json (tools/build_explorer.py, M49). Nothing about the plants is written here:
// species, attribute values, claims, function links, status · verification · AI check all come from the file. The adapter answers
// the engine's questions (size proxy with its claim, gate check against site conditions, function links, evidence for a plant)
// and labels every answer with where it came from and what is unknown.
export async function loadKnowledge(url) { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return new Knowledge(await r.json()); }

// ---- Light (V4.2, M70). The light gate answers two different questions and keeps them apart:
//   the SITE side     what is known about the bed's light: unknown · assumed/inferred · stated, and whether the stated word is precise.
//                     "shade" is a vague word: it may mean filtered or deep shade, so it is read as both and never silently as either.
//   the EVIDENCE side what the plant's exposure claims support for that reading:
//                       supports      at least one claim records the label for the species itself, without a condition, and the AI source
//                                     check does not find it partially supported or conflicting; a label that a single claim records
//                                     does not count when that claim is one side of a recorded source disagreement
//                       qualified     the label is recorded, but every claim behind it carries a qualifier (cultivar or variety scope,
//                                     a stated condition, AI check partial/conflicting, a lone disputed source)
//                       none          other light labels are recorded, not this one
//                       not recorded  no exposure claim at all
// Site × evidence → result (the decision table; eval/v4-2-light-gate-2026-11-16.md):
//   unknown site                × anything      → unknown            stated, precise × supports  → pass
//   stated, precise             × qualified     → conditional        stated, precise × none      → fail (as before V4.2)
//   stated "shade" (vague)      × supports for BOTH readings → pass;  any reading supported or qualified, or only the lighter
//                                 Part sun/part shade recorded → conditional;  nothing shade-ward recorded → fail (as before)
//   assumed / inferred site     × supports or qualified → conditional; × none → fail (as before)
// Nothing here excludes a species that the gate passed before V4.2: every former pass is now a pass or a conditional. Human
// verification is NOT a qualifier (47 of the 48 exposure claims are unverified — it would turn the gate into a constant); it is
// reported beside the result as `evidence.standing`, so "does it fit" and "how far is the evidence checked" never share one badge.
const LIGHT = {
  'full-sun': { precise: true, readings: [{ name: 'full sun', labels: ['Full sun'] }] },
  'part-shade': { precise: true, readings: [{ name: 'part shade', labels: ['Part sun/part shade', 'Filtered shade'] }] },
  'partial-shade': { precise: true, readings: [{ name: 'part shade', labels: ['Part sun/part shade', 'Filtered shade'] }] },
  'filtered-shade': { precise: true, readings: [{ name: 'filtered shade', labels: ['Filtered shade'] }], lighter: ['Part sun/part shade'] },
  'deep-shade': { precise: true, readings: [{ name: 'deep shade', labels: ['Deep shade'] }], lighter: ['Filtered shade', 'Part sun/part shade'] },
  'shade': { precise: false, readings: [{ name: 'filtered shade', labels: ['Filtered shade'] }, { name: 'deep shade', labels: ['Deep shade'] }], lighter: ['Part sun/part shade'] },
};
/** the site light words the gate can read, and whether each is precise (the Site page may offer the precise ones) */
export const LIGHT_WORDS = Object.fromEntries(Object.entries(LIGHT).map(([k, v]) => [k, { precise: v.precise, readings: v.readings.map(r => r.name) }]));
const SCOPED = /^\s*(var\.|subsp\.|ssp\.|f\.|forma\b|cultivar\b)/i;   // a claim's recorded context that opens with an infraspecific taxon
const WATER = { dry: ['dry', 'wide range'], average: ['average', 'wide range'], moist: ['moist', 'wide range'], wet: ['wet', 'wide range'] };
// Soil is two site conditions (soil_type, soil_drainage) checked against ONE plant facet ('soil'), whose labels belong to three
// dimensions. A site value is only judged inside its own dimension, and only when the database can express it at all (M55):
//   plant records the wanted label                                          -> pass (conditional when the site value is assumed)
//   plant records another label of the same dimension AND some species in the database records the wanted one  -> fail
//   anything else (plant silent on that dimension, or no species records the wanted label: clay, loam, poorly drained) -> unknown
const SOIL_DIM = { texture: /clay|sand|loam|rocky|gravel/i, ph: /acid|alkalin/i, drainage: /drain|waterlog|boggy/i };
const SOIL_WANT = { clay: { dim: 'texture', want: ['Clay'] }, sandy: { dim: 'texture', want: ['Sandy', 'Rocky or gravelly or dry'] }, gravelly: { dim: 'texture', want: ['Rocky or gravelly or dry'] }, loam: { dim: 'texture', want: ['Loam'] }, acidic: { dim: 'ph', want: ['Acidic'] }, alkaline: { dim: 'ph', want: ['Alkaline'] }, 'well-drained': { dim: 'drainage', want: ['Well-drained'] }, 'poorly-drained': { dim: 'drainage', want: ['Poorly drained', 'Poorly-drained'] }, boggy: { dim: 'drainage', want: ['Poorly drained', 'Poorly-drained'] }, waterlogged: { dim: 'drainage', want: ['Poorly drained', 'Poorly-drained'] } };
const SHADIER = { 'full-sun': 'part-shade', 'part-shade': 'shade', 'partial-shade': 'shade', shade: 'shade', 'filtered-shade': 'deep-shade', 'deep-shade': 'deep-shade' };
/** site conditions the gates read; everything else on the Site page is recorded only (shown as such in the interface) */
export const GATED_CONDITIONS = ['light', 'water', 'soil_type', 'soil_drainage'];

export class Knowledge {
  constructor(d) {
    this.d = d; this.species = d.species; this.SP = new Map(d.species.map(s => [s.id, s])); this.bySlug = new Map(d.species.map(s => [s.slug, s]));
    this.FN = new Map(d.functions.map(f => [f.id, f])); this.attr = new Map(d.attributes.map(a => [`${a.species}|${a.facet}`, a]));
    this.link = new Map(d.function_links.map(l => [`${l.species}|${l.function}`, l])); this.claims = d.claims; this.checks = d.evidence_checks; this.sources = d.sources; this.rules = d.rules;
    this.vocab = {}; for (const a of d.attributes) { const v = this.vocab[a.facet] || (this.vocab[a.facet] = new Set()); for (const x of a.values) v.add(x.label.toLowerCase()); }
    this.snapshot = { generated: d.generated, generated_by: d.generated_by, method: d.method, inputs: d.stats.inputs };
  }
  sp(id) { return this.SP.get(id) || this.bySlug.get(id); }
  name(id) { return this.sp(id)?.scientific_name || id; }
  common(id) { return (this.sp(id)?.common_names || [])[0] || ''; }
  cell(id, facet) { return this.attr.get(`${this.sp(id)?.id}|${facet}`); }
  labels(id, facet) { const c = this.cell(id, facet); return c ? c.values.map(v => v.label) : null; }
  functionLink(id, fn) { return this.link.get(`${this.sp(id)?.id}|${fn}`); }
  claim(cid) { return this.claims[cid]; }

  // ---- size proxies: one claimed range chosen deterministically, every alternative counted; never a measured fact
  sizeProxy(id, kind /* 'spread_class' | 'height_class' */, light = null) {
    const c = this.cell(id, kind); if (!c) return { value_m: null, status: 'not recorded', claim: null, alternatives: 0, note: `${kind === 'spread_class' ? 'spread' : 'height'} not recorded in the database` };
    const all = this.sizeOptions(id, kind);
    let opts = all.filter(o => o.min != null && o.max != null);
    if (!opts.length) opts = all;
    if (!opts.length) return { value_m: null, status: 'no numeric range', claim: c.claims[0] || null, alternatives: 0, note: 'claims exist but carry no usable range' };
    const byCond = opts.filter(o => !o.conditions.length); const conditioned = opts.filter(o => o.conditions.length);
    let pick = null, note = '';
    if (light && conditioned.length) { const want = /shade/.test(light) ? /shade/i : /sun/i; const m = conditioned.find(o => o.conditions.some(x => want.test(x))); if (m) { pick = m; note = `range stated for ${m.conditions.join(', ')} (site light: ${light})`; } }
    if (!pick) { const base = (byCond.length ? byCond : opts).filter(o => !o.cultivars.length); const pool = base.length ? base : (byCond.length ? byCond : opts); pool.sort((a, b) => mid(a) - mid(b)); pick = pool[Math.floor((pool.length - 1) / 2)]; note = pool.length > 1 ? `median of ${pool.length} claimed ranges` : 'one claimed range'; if (conditioned.length && !light) note += '; other ranges depend on conditions'; }
    const v = pick.min != null && pick.max != null ? (pick.min + pick.max) / 2 : (pick.max ?? pick.min);
    return { value_m: Math.round(v * 100) / 100, min: pick.min, max: pick.max, status: 'proxy from claim', claim: pick.claim, source: pick.source, verification: pick.verification, conditions: pick.conditions, alternatives: opts.length - 1, disagreement: c.disagreement.length > 0, note };
  }
  /** every claimed numeric range of a size facet (one entry per claim × range), with its claim id, source, conditions, cultivars and
   *  the verification of the value it comes from. sizeProxy picks one of these; the selection checks read all of them. */
  sizeOptions(id, kind) {
    const c = this.cell(id, kind); if (!c) return []; const seen = new Map();
    for (const v of c.values) for (const n of v.numbers || []) { if (n.min == null && n.max == null) continue; const key = v.claims[0] + '|' + (n.min ?? '') + '|' + (n.max ?? ''); if (!seen.has(key)) seen.set(key, { claim: v.claims[0], source: v.sources[0], min: n.min, max: n.max, conditions: v.conditions || [], cultivars: v.cultivars || [], verification: v.verification }); }
    return [...seen.values()];
  }
  /** does the species reach a target height at maturity? Judged on the CLAIMED ranges (species-level ranges when there are any,
   *  cultivar ranges only otherwise), never on a measured plant:
   *    meets      the chosen (proxy) range starts at or above the target and no claimed range stays below it
   *    uncertain  some claimed range reaches the target, but the chosen range starts below it or another claim stays below it
   *    fails      no claimed range reaches the target
   *    unknown    no height range recorded */
  /** the claimed height ranges that apply to a bed: species-level ranges (cultivar ranges only when there are no others); when the
   *  bed's light is known and some ranges are stated for that light, only those — the same choice sizeProxy makes for the plan */
  applicableHeights(id, light = null) {
    const all = this.sizeOptions(id, 'height_class').filter(o => o.max != null); const base = all.filter(o => !o.cultivars.length).length ? all.filter(o => !o.cultivars.length) : all;
    if (light) { const want = /shade/.test(light) ? /shade/i : /sun/i; const m = base.filter(o => o.conditions.some(x => want.test(x))); if (m.length) return m; }
    return base;
  }
  heightAgainst(id, target_m, light = null) {
    const opts = this.applicableHeights(id, light); const lightNote = opts.length && light && opts.every(o => o.conditions.length) ? ` stated for ${[...new Set(opts.flatMap(o => o.conditions))].join(', ')} (site light ${light})` : '';
    if (!opts.length) return { result: 'unknown', detail: 'no mature height range recorded for this plant', claims: [], verified: false, tallest_m: null };
    const pick = this.sizeProxy(id, 'height_class', light); const reach = opts.filter(o => o.max >= target_m), below = opts.filter(o => o.max < target_m); const tallest = Math.max(...opts.map(o => o.max));
    const rng = o => `${o.min ?? '?'}–${o.max} m`; const claims = [...new Set([pick.claim, ...reach.map(o => o.claim)].filter(Boolean))]; const verified = pick.verification === 'verified';
    if (!reach.length) return { result: 'fails', detail: `no claimed height range${lightNote} reaches ${target_m} m (tallest claimed ${tallest} m; ${opts.length} range${opts.length === 1 ? '' : 's'})`, claims: opts.map(o => o.claim), verified, tallest_m: tallest };
    if (pick.min != null && pick.min >= target_m && !below.length) return { result: 'meets', detail: `claimed mature height ${rng(pick)} (${pick.claim}) starts at or above ${target_m} m; no claimed range stays below it`, claims, verified, tallest_m: tallest };
    return { result: 'uncertain', detail: `${reach.length} of ${opts.length} claimed height ranges${lightNote} reach ${target_m} m; the range used for the plan is ${rng(pick)} (${pick.claim})${below.length ? `; ${below.length} claimed range${below.length === 1 ? ' stays' : 's stay'} below it` : ''}`, claims, verified, tallest_m: tallest };
  }
  /** leaf retention for a year-round requirement: meets (Evergreen only) · uncertain (both recorded, or nothing recorded) · fails (Deciduous only) */
  yearRound(id) {
    const c = this.cell(id, 'evergreen'); if (!c) return { result: 'uncertain', detail: 'leaf retention not recorded', claims: [], verified: false };
    const ev = c.values.filter(v => /evergreen/i.test(v.label)), de = c.values.filter(v => /deciduous/i.test(v.label)); const verified = c.values.every(v => v.verification === 'verified');
    if (ev.length && !de.length) return { result: 'meets', detail: `recorded Evergreen (${ev[0].verification})`, claims: c.claims, verified };
    if (de.length && !ev.length) return { result: 'fails', detail: `recorded Deciduous (${de[0].verification}) — bare in winter`, claims: c.claims, verified };
    return { result: 'uncertain', detail: ev.length ? 'recorded both Evergreen and Deciduous — sources disagree' : 'leaf retention not recorded', claims: c.claims, verified };
  }
  /** how far the database supports a plant for a function — kept apart from design performance:
   *    supported  the link is drawn, derived or documented, without a conflict
   *    uncertain  the link is only a candidate (inferred from traits, no source states the use) or a trait claim contradicts the use
   *    none       no link
   *  `verified` says whether the claims behind the link were verified; an unverified or conflicting link is never reported as verified performance. */
  functionEvidence(id, fn) {
    const l = this.functionLink(id, fn); if (!l || !l.drawn) return { result: 'none', detail: `no ${fn.replace('z:', '').replace('_', ' ')} link in the knowledge graph`, verified: false, conflict: false, status: l?.status || 'unknown', link: l?.id || null };
    const verified = l.verification === 'verified' && !l.conflict; const base = `${l.status}${l.via_use_labels?.length ? ` from recorded use ${l.via_use_labels.join(', ')}` : ' — inferred from traits, no source states the use'} (${l.rule || 'KG'}; claims ${l.verification})`;
    if (l.conflict) return { result: 'uncertain', detail: `${base}; a trait claim contradicts the use`, verified: false, conflict: true, status: l.status, link: l.id };
    if (l.status === 'candidate' || l.status === 'unknown') return { result: 'uncertain', detail: base, verified: false, conflict: false, status: l.status, link: l.id };
    return { result: 'supported', detail: base, verified, conflict: false, status: l.status, link: l.id };
  }
  proxy(id, light = null) {
    const sp = this.sizeProxy(id, 'spread_class', light), ht = this.sizeProxy(id, 'height_class', light);
    return { radius_m: sp.value_m != null ? Math.max(.15, Math.round(sp.value_m / 2 * 100) / 100) : 0.3, radius_status: sp.value_m != null ? 'proxy: half the claimed mature spread' : 'assumed 0.3 m — spread not recorded', spread: sp, height_m: ht.value_m, height_status: ht.value_m != null ? 'proxy from a claimed height range' : 'unknown', height: ht, height_max_claimed_m: (o => o.length ? Math.max(...o.map(x => x.max)) : null)(this.applicableHeights(id, light)) };
  }

  // ---- light evidence (V4.2): what the exposure claims of a species support for one site light word. Reads the snapshot only.
  /** one claim behind a light label → the qualifiers that keep it from carrying an unconditional pass (empty = a clean claim) */
  lightClaimQualifiers(cid, value, cell) {
    const c = this.claims[cid] || {}; const q = []; const src = this.sources[c.source_id]?.label || c.source_id || 'a source';
    if (c.cultivar) q.push(`${src} states it for the cultivar '${c.cultivar}'`);
    else if (SCOPED.test(c.context || '')) q.push(`${src} states it for ${String(c.context).split(/[;(]/)[0].trim()}, not the species as a whole`);
    const conds = [...new Set([...(value?.conditions || []).map(x => x.label || x), ...(c.conditions || []).map(x => x.label || x)])]; if (value?.conditioned) q.push(`${src} records it only as “${value.label}”`); else if (conds.length) q.push(`${src} states it under a condition (${conds.join(', ')})`);
    const chk = this.checks[cid]?.result; if (chk === 'partially_supported') q.push(`the AI source check finds ${src}'s claim only partially supported`); else if (chk === 'conflicting_evidence') q.push(`the AI source check finds conflicting evidence for ${src}'s claim`);
    return q;
  }
  lightEvidence(id, word) {
    const sid = this.sp(id).id; const cell = this.cell(sid, 'exposure'); const spec = LIGHT[word] || { precise: true, readings: [{ name: word, labels: [word] }] }; const eq = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
    if (!cell) return { state: 'not recorded', readings: [], lighter: { labels: [], claims: [] }, qualifiers: [], standing: null, precise: spec.precise };
    const disputed = new Set((cell.disagreement || []).flatMap(d => d.claims || []));
    const readings = spec.readings.map(r => {
      const exact = cell.values.filter(v => r.labels.some(w => eq(v.label, w)));
      // a value recorded only under a condition that names the label ("Full sun only if soil kept moist", condition: Full sun)
      const cond = cell.values.filter(v => !exact.includes(v) && (v.conditions || []).some(x => r.labels.some(w => eq(x.label || x, w)))).map(v => ({ ...v, conditioned: true }));
      const per = []; for (const v of [...exact, ...cond]) for (const cid of v.claims) { const q = this.lightClaimQualifiers(cid, v, cell); const had = per.find(x => x.claim === cid); if (!had) per.push({ claim: cid, label: v.label, qualifiers: q }); else if (!q.length) had.qualifiers = []; }
      let clean = per.filter(x => !x.qualifiers.length); const quals = [...new Set(per.flatMap(x => x.qualifiers))];
      if (per.length === 1 && clean.length === 1 && disputed.has(clean[0].claim)) { const c = this.claims[clean[0].claim] || {}; quals.push(`only ${this.sources[c.source_id]?.label || c.source_id} records it, and the database records that source disagreeing with another on this plant's light`); clean = []; }
      return { reading: r.name, state: !per.length ? 'none' : clean.length ? 'supports' : 'qualified', labels: [...new Set([...exact, ...cond].map(v => v.label))], claims: [...new Set(per.map(x => x.claim))], clean: clean.map(x => x.claim), qualifiers: clean.length ? [] : quals };
    });
    const lv = cell.values.filter(v => (spec.lighter || []).some(w => eq(v.label, w))); const lighter = { labels: lv.map(v => v.label), claims: [...new Set(lv.flatMap(v => v.claims))] };
    const any = readings.filter(r => r.state !== 'none'); const state = !any.length ? 'none' : readings.every(r => r.state === 'supports') ? 'supports' : 'qualified';
    const ai = { supported: 0, partial: 0, conflicting: 0, not_assessed: 0 }; for (const cid of cell.claims) { const r = this.checks[cid]?.result; ai[r === 'supported_by_source' ? 'supported' : r === 'partially_supported' ? 'partial' : r === 'conflicting_evidence' ? 'conflicting' : 'not_assessed']++; }
    const standing = { claims: cell.claims.length, sources: (cell.sources || []).length, human_verified: cell.claims.filter(c => this.claims[c]?.status === 'verified').length, ai_check: ai, disagreements: (cell.disagreement || []).length };
    return { state, readings, lighter, qualifiers: [...new Set(readings.flatMap(r => r.qualifiers))], standing, precise: spec.precise };
  }
  /** the light gate of one species: { result, detail, claims, site, evidence } — see the decision table at the top of this file */
  lightGate(id, c) {
    const sid = this.sp(id).id; const cell = this.cell(sid, 'exposure');
    if (!cell) return { result: 'not recorded', detail: 'light not recorded for this plant', claims: [], site: null, evidence: { state: 'not recorded' } };
    const all = cell.values.map(v => v.label).join(', ');
    if (!c || !c.value || c.status === 'unknown') return { result: 'unknown', detail: `site light unknown — plant records ${all}`, claims: cell.claims, site: { state: 'unknown' }, evidence: null };
    const ev = this.lightEvidence(sid, c.value); const assumed = c.status === 'assumed' || c.status === 'inferred'; const site = { state: assumed ? 'assumed' : 'stated', precise: ev.precise, word: c.value };
    const head = `site ${c.value} (${c.status})`; const got = ev.readings.filter(r => r.state !== 'none'); const labels = [...new Set(got.flatMap(r => r.labels))]; const claims = [...new Set(got.flatMap(r => r.claims))];
    const evidence = { state: ev.state, readings: ev.readings, qualifiers: ev.qualifiers, standing: ev.standing }; const quals = ev.qualifiers.length ? `; ${ev.qualifiers.join('; ')}` : '';
    if (ev.precise) {
      if (ev.state === 'none') return { result: 'fail', detail: `${head} — plant records only ${all}`, claims: cell.claims, site, evidence };
      if (ev.state === 'supports') return { result: assumed ? 'conditional' : 'pass', detail: `${head} — plant records ${labels.join(', ')}${assumed ? '; the site light is not stated, only ' + c.status : ''}`, claims, site, evidence };
      return { result: 'conditional', detail: `${head} — plant records ${labels.join(', ')}, but not without a qualifier${quals}`, claims, site, evidence };
    }
    // a vague word: every reading is looked at; a pass needs clean support under each of them
    const names = ev.readings.map(r => r.reading).join(' or '); const missing = ev.readings.filter(r => r.state === 'none').map(r => r.reading);
    if (ev.state === 'supports') return { result: assumed ? 'conditional' : 'pass', detail: `${head} — “${c.value}” may mean ${names}; plant records ${labels.join(' and ')}, so it fits either reading`, claims, site, evidence };
    if (got.length) return { result: 'conditional', detail: `${head} — “${c.value}” may mean ${names}; plant records ${labels.join(', ')}${missing.length ? `, not ${missing.join(' or ')}` : ''}${quals} — say which shade it is`, claims, site, evidence };
    if (ev.lighter.labels.length) return { result: 'conditional', detail: `${head} — “${c.value}” may mean ${names}; plant records ${ev.lighter.labels.join(', ')} only, which is lighter than either — say which shade it is`, claims: ev.lighter.claims, site, evidence: { ...evidence, state: 'qualified', qualifiers: [`only ${ev.lighter.labels.join(', ')} is recorded, not ${names}`] } };
    return { result: 'fail', detail: `${head} — plant records only ${all}`, claims: cell.claims, site, evidence };
  }

  // ---- gate check of one species against site conditions: pass / conditional / fail / unknown, each with the claims behind it
  gate(id, conditions, prefs = {}) {
    const out = {}; const sid = this.sp(id).id;
    const check = (facet, condKey, map, label) => {
      const c = conditions[condKey]; const cell = this.cell(sid, facet);
      if (!cell) { out[label] = { result: 'not recorded', detail: `${label} not recorded for this plant`, claims: [] }; return; }
      if (!c || !c.value || c.status === 'unknown') { out[label] = { result: 'unknown', detail: `site ${label} unknown — plant records ${cell.values.map(v => v.label).join(', ')}`, claims: cell.claims }; return; }
      const want = map[c.value] || [c.value]; const have = cell.values.map(v => v.label);
      const hit = cell.values.filter(v => want.some(w => v.label.toLowerCase().includes(w.toLowerCase())));
      out[label] = hit.length ? { result: c.status === 'assumed' || c.status === 'inferred' ? 'conditional' : 'pass', detail: `site ${c.value} (${c.status}) — plant records ${hit.map(v => v.label).join(', ')}`, claims: hit.flatMap(v => v.claims) } : { result: 'fail', detail: `site ${c.value} (${c.status}) — plant records only ${have.join(', ')}`, claims: cell.claims };
    };
    out.light = this.lightGate(sid, conditions.light); check('water', 'water', WATER, 'water');
    // light under an existing tree canopy (set by the engine for a bed that lies mostly under one): the real light is somewhere
    // between the site's stated light and one step shadier — not measured, so never 'pass', and never assumed to be full shade
    const lc = conditions.light;
    if (lc?.canopy && lc.value && lc.status !== 'unknown' && out.light.result !== 'not recorded') {
      const cell = this.cell(sid, 'exposure'); const shadier = SHADIER[lc.value] || lc.value; const evO = this.lightEvidence(sid, lc.value), evS = this.lightEvidence(sid, shadier);
      const has = ev => ev.readings.filter(r => r.state !== 'none'); const labelsOf = ev => [...has(ev).flatMap(r => r.labels), ...ev.lighter.labels]; const claimsOf = ev => [...has(ev).flatMap(r => r.claims), ...ev.lighter.claims];
      const open = labelsOf(evO), shade = labelsOf(evS); const quals = [...new Set([...evO.qualifiers, ...evS.qualifiers])]; const q = quals.length ? `; ${quals.join('; ')}` : '';
      const where = `${Math.round(lc.canopy.share * 100)} % of the bed is under ${lc.canopy.label} (${lc.canopy.radius_status}): light is between ${lc.value} and ${shadier}, not measured`;
      const site = { state: lc.status === 'assumed' || lc.status === 'inferred' ? 'assumed' : 'stated', precise: false, word: lc.value, canopy: true }; const evidence = { state: shade.length || open.length ? (evS.state === 'supports' && evO.state === 'supports' ? 'supports' : 'qualified') : 'none', readings: [...evO.readings, ...evS.readings], qualifiers: quals, standing: evO.standing };
      out.light = shade.length ? { result: 'conditional', detail: `${where} — plant records ${[...new Set([...open, ...shade])].join(', ')}${q}`, claims: [...new Set([...claimsOf(evO), ...claimsOf(evS)])], canopy: true, site, evidence }
        : open.length ? { result: 'unknown', detail: `${where} — plant records ${[...new Set(open)].join(', ')} but no tolerance of the shadier case${q}`, claims: [...new Set(claimsOf(evO))], canopy: true, site, evidence }
        : { result: 'fail', detail: `${where} — plant records only ${cell.values.map(v => v.label).join(', ')}`, claims: cell.claims, canopy: true, site, evidence };
    }
    // soil: type and drainage, each judged in its own dimension of the plant's 'soil' facet
    { const cell = this.cell(sid, 'soil'); const parts = [];
      for (const key of ['soil_type', 'soil_drainage']) {
        const c = conditions[key]; if (!c || !c.value || c.status === 'unknown') continue; const name = key === 'soil_type' ? 'soil type' : 'drainage';
        const spec = SOIL_WANT[c.value]; if (!spec) { parts.push({ key, result: 'unknown', detail: `${name} ${c.value} (${c.status}) — no rule for this value`, claims: [] }); continue; }
        if (!cell) { parts.push({ key, result: 'not recorded', detail: `soil not recorded for this plant`, claims: [] }); continue; }
        const inDim = cell.values.filter(v => SOIL_DIM[spec.dim].test(v.label)); const hit = inDim.filter(v => spec.want.some(w => v.label.toLowerCase() === w.toLowerCase()));
        const expressible = spec.want.some(w => this.vocab.soil?.has(w.toLowerCase()));
        if (hit.length) parts.push({ key, result: c.status === 'assumed' || c.status === 'inferred' ? 'conditional' : 'pass', detail: `${name} ${c.value} (${c.status}) — plant records ${hit.map(v => v.label).join(', ')}`, claims: hit.flatMap(v => v.claims) });
        else if (inDim.length && expressible) parts.push({ key, result: 'fail', detail: `${name} ${c.value} (${c.status}) — plant records only ${inDim.map(v => v.label).join(', ')}`, claims: inDim.flatMap(v => v.claims) });
        else parts.push({ key, result: 'unknown', detail: !expressible ? `${name} ${c.value} (${c.status}) — no plant in the database records ${spec.dim === 'ph' ? 'this pH' : spec.dim === 'texture' ? 'this soil texture' : 'this drainage'}: not assessed, not a fail` : `${name} ${c.value} (${c.status}) — this plant records no ${spec.dim === 'ph' ? 'pH' : spec.dim} preference`, claims: [] });
      }
      if (!parts.length) out.soil = cell ? { result: 'unknown', detail: `site soil unknown — plant records ${cell.values.map(v => v.label).join(', ')}`, claims: cell.claims } : { result: 'not recorded', detail: 'soil not recorded for this plant', claims: [] };
      else { const rs = parts.map(x => x.result); out.soil = { result: rs.includes('fail') ? 'fail' : rs.includes('not recorded') ? 'not recorded' : rs.includes('unknown') ? 'unknown' : rs.includes('conditional') ? 'conditional' : 'pass', detail: parts.map(x => x.detail).join('; '), claims: [...new Set(parts.flatMap(x => x.claims))], parts }; }
    }
    const m = this.cell(sid, 'maintenance'); out.maintenance = !m ? { result: 'not recorded', detail: 'maintenance level not recorded', claims: [] } : prefs.maintenance_low ? (m.values.some(v => /low/i.test(v.label)) ? { result: 'pass', detail: `recorded ${m.values.map(v => v.label).join(', ')}`, claims: m.claims } : { result: 'conditional', detail: `recorded ${m.values.map(v => v.label).join(', ')} — not low`, claims: m.claims }) : { result: 'pass', detail: `recorded ${m.values.map(v => v.label).join(', ')}`, claims: m.claims };
    const e = this.cell(sid, 'ecology'); out.ecology = e ? { result: 'documented', detail: e.values.map(v => v.label).join(', '), claims: e.claims } : { result: 'not recorded', detail: 'no ecological-value claim recorded — not evidence of absence', claims: [] };
    const o = this.cell(sid, 'origin'); out.origin = o ? { result: 'documented', detail: o.values.map(v => v.label).join(', '), claims: o.claims } : { result: 'not recorded', detail: 'origin not recorded', claims: [] };
    const i = this.cell(sid, 'invasive'); out.invasive = i ? { result: i.values.some(v => /not listed/i.test(v.label)) ? 'pass' : 'flag', detail: i.values.map(v => v.label).join(', '), claims: i.claims } : { result: 'not recorded', detail: 'invasive status not recorded', claims: [] };
    const hard = ['light', 'water', 'soil'].map(k => out[k].result);
    // V4.2: a light result that is conditional only because the plant's EVIDENCE is qualified (the site light itself is stated) must
    // never rank a species above one whose light evidence is clean. `conditional` outranks `unknown` in the engine, so with water or
    // soil still unknown such a species would otherwise be preferred to a clean one; there it stays at `unknown`, as it was before.
    const evidenceOnly = out.light.result === 'conditional' && out.light.site?.state === 'stated' && !out.light.canopy; out.light.evidence_only = evidenceOnly;
    /* V4.3 · one plain kind and one short reason per light result, so a page can say WHY beside the status without printing the whole detail.
       mismatch = the plant records no such light (the only kind that excludes) · site-unknown / no-record = nothing to compare ·
       evidence-qualified = a match, but every claim behind it carries a qualifier · site-vague / site-assumed / canopy = the site side is open. */
    { const L = out.light, ev = L.evidence, st = ev?.standing; const q = (ev?.qualifiers || [])[0];
      L.kind = L.result === 'fail' ? 'mismatch' : L.result === 'unknown' ? (L.canopy ? 'canopy' : 'site-unknown') : L.result === 'not recorded' ? 'no-record' : L.result === 'pass' ? 'match' : L.canopy ? 'canopy' : L.site?.state === 'assumed' ? 'site-assumed' : L.site && L.site.precise === false ? 'site-vague' : 'evidence-qualified';
      L.short = { mismatch: 'no matching light recorded', 'site-unknown': 'site light not stated', 'no-record': 'no light record for this plant', match: 'light matches', canopy: 'under a tree: light is a range', 'site-assumed': 'site light is assumed, not stated', 'site-vague': '“shade” is not precise: filtered or deep?', 'evidence-qualified': `light matches with a qualifier${q ? `: ${q}` : ''}` }[L.kind];
      L.standing_text = st ? `${st.claims} claim${st.claims === 1 ? '' : 's'} from ${st.sources} source${st.sources === 1 ? '' : 's'}; ${st.human_verified} checked by a person${st.ai_check ? `; AI source check: ${Object.entries(st.ai_check).filter(([, n]) => n).map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}`).join(', ') || 'none run'}` : ''}${st.disagreements ? `; ${st.disagreements} recorded disagreement${st.disagreements === 1 ? '' : 's'}` : ''}. An AI source check is a reading aid, not a verification.` : null; }
    const othersOpen = ['water', 'soil'].some(k => out[k].result !== 'pass' && out[k].result !== 'conditional'), othersCond = ['water', 'soil'].some(k => out[k].result === 'conditional');
    out.overall = hard.includes('fail') ? 'fail' : hard.includes('conditional') ? (evidenceOnly && !othersCond && othersOpen ? 'unknown' : 'conditional') : hard.every(r => r === 'pass') ? 'pass' : 'unknown';
    return out;
  }
  /** is a site condition (and this value of it) read by the gates? — shown beside the control on the Site page so nothing pretends */
  conditionUse(key, value) {
    if (!GATED_CONDITIONS.includes(key)) return { used: false, text: 'recorded only — not used in plant selection yet' };
    if ((key === 'soil_type' || key === 'soil_drainage') && value) { const spec = SOIL_WANT[value]; if (!spec || !spec.want.some(w => this.vocab.soil?.has(w.toLowerCase()))) return { used: false, text: `recorded — no plant in the database records "${value}", so the soil gate reads unknown for it (never a fail)` }; }
    return { used: true, text: 'used in the plant gate' };
  }
  // ---- what the database says about a plant for a function (status · conflict · verification kept apart)
  functionSupport(id, fn) { const l = this.functionLink(id, fn); if (!l) return { status: 'unknown', verdict: 'no cell' }; return { status: l.status, drawn: l.drawn, conflict: l.conflict, verification: l.verification, verdict: l.verdict || Object.values(l.verdicts || {}).join(' / '), use_labels: l.via_use_labels || [], use_sources: l.use_sources || [], use_claims: l.use_claims || [], rule: l.rule, id: l.id }; }
  evergreen(id) { const c = this.cell(id, 'evergreen'); return c ? c.values.map(v => v.label) : null; }
  interest(id) { const c = this.cell(id, 'interest'); return c ? c.values.map(v => v.label) : null; }
  growthForm(id) { return this.sp(id)?.growth_form_label; }
  // ---- evidence card for a plant object
  evidence(id, conditions, prefs = {}) { const s = this.sp(id); return { species: s, gate: this.gate(id, conditions, prefs), proxy: this.proxy(id, conditions?.light?.value), functions: this.d.functions.map(f => ({ function: f.id, label: f.label, ...this.functionSupport(id, f.id) })), evergreen: this.evergreen(id), interest: this.interest(id), claims: { live: s.claims.live, verified: s.claims.verified }, explorer: `../brain/explorer/#fk=species&fi=${encodeURIComponent(s.id)}` }; }
  claimLine(cid) { const c = this.claims[cid]; if (!c) return { id: cid, text: '(claim not in the projection)', status: 'unknown' }; const chk = this.checks[cid]; return { id: cid, text: c.text, source: this.sources[c.source_id]?.label || c.source_id, source_url: this.sources[c.source_id]?.url, status: c.status, check: chk?.result || 'not_assessed', context: c.context, conditions: (c.conditions || []).map(x => x.label), cultivar: c.cultivar }; }
}
const mid = o => o.min != null && o.max != null ? (o.min + o.max) / 2 : (o.max ?? o.min ?? 0);
