// Port of the diagnosis rules in tools/build_graph.py so the browser can recompute after a candidate edge is added.
// Same rules, same sentences. Input: ontology node map (id -> node), edges (graph.json edges + candidate edges), plant labels.
export const SHORT = { rhs: 'RHS', mobot: 'Missouri BG', gpp: 'Great Plant Picks', osu: 'Oregon State', eflora: 'E-Flora BC', usda_plants: 'USDA PLANTS', cov_trees: 'City of Vancouver trees', inat: 'iNaturalist', iscbc: 'ISC BC', kpu: 'KPU', aspca: 'ASPCA', growgreen: 'Grow Green', pojar: 'Pojar & MacKinnon', nats: 'NATS Nursery', model: 'model placeholder', candidate: 'you (candidate)', entity: 'entity record' };
export const srcLabel = (sid, sources = {}) => SHORT[sid] || (sid && sid.startsWith('survey-') ? `survey respondent ${sid.split('-r').pop()}` : ((sources[sid] || {}).name || sid || '').split(' — ')[0].split(' (')[0]);
const ORDINAL = new Set(['exposure', 'water', 'maintenance', 'invasive', 'growth_rate', 'height_class', 'spread_class', 'hardiness', 'hardiness_usda', 'hardiness_rhs', 'toxicity', 'evergreen']);

export function interval(v) {
  if (!v || typeof v !== 'object') return null;
  if (typeof v.median === 'number' && v.unit === 'm') return [v.p10 ?? v.median, v.p90 ?? v.median];
  if ('min' in v && 'max' in v) return [v.min, v.max];
  if ('max' in v) return [0, v.max];
  if ('min' in v) return [v.min, v.min];
  if ('height_m' in v) return [v.height_m, v.height_m];
  if ('spread_m' in v) return [v.spread_m, v.spread_m];
  if ('typical_max_m' in v) return [0, v.typical_max_m];
  if (typeof v.median === 'number' && v.unit === 'm') return [v.p10 ?? v.median, v.p90 ?? v.median];
  return null;
}
export function fmtNum(v) {
  if (!v || typeof v !== 'object') return String(v);
  const u = v.unit || '';
  if ('median' in v) return `median ${v.median} ${u}${v.n ? ` · n=${v.n}` : ''}`.trim();
  if ('min' in v && 'max' in v) return `${v.min}–${v.max} ${u}`.trim();
  if ('max' in v) return `≤ ${v.max} ${u}`.trim();
  if ('height_m' in v) return `${v.height_m} m`;
  if ('spread_m' in v) return `${v.spread_m} m`;
  if ('typical_max_m' in v) return `to ${v.typical_max_m} m`;
  if ('median' in v) return `median ${v.median} ${u}`.trim();
  if ('count' in v) return `count ${v.count}`;
  if ('n' in v) return `n = ${v.n}`;
  const ks = Object.keys(v).filter(k => k !== 'unit'); return ks.length <= 2 ? ks.map(k => `${k}: ${typeof v[k] === 'object' ? '…' : v[k]}`).join(' · ') : `${ks.length} values (${ks.slice(0, 3).join(', ')}…)`;
}
export function describe(c, N) {
  const e = c.e; let v = e.value_label != null ? e.value_label : (e.numbers ? fmtNum(e.numbers) : c.concepts.map(x => N.get(x)?.label || x).join(', '));
  if (Array.isArray(v)) v = v.join(', ');
  const conds = e.conditions.map(x => (N.get(x.concept_id)?.label || x.concept_id).toLowerCase()).join(', ') || 'no condition stated';
  return [v, conds];
}

export function diagnose(N, edges, plantLabel, gateFacets, sources = {}) {
  const E = edges.filter(e => (e.type === 'claim' || e.type === 'entity' || e.type === 'candidate') && e.target && e.live !== false);
  const C = new Map();
  for (const e of E) { if (!e.claim_id) continue; if (!C.has(e.claim_id)) C.set(e.claim_id, { claim_id: e.claim_id, plant: e.plant, facets: new Set(), concepts: [], e }); const c = C.get(e.claim_id); c.facets.add(e.facet); c.concepts.push(e.target); }
  const condKey = c => [...c.e.conditions.map(x => x.concept_id)].sort().concat(c.e.cultivar ? [`cv:${c.e.cultivar}`] : []).join('|');
  const facetConcepts = (c, f) => new Set(c.concepts.filter(x => N.get(x)?.facet === f));
  const disjoint = (a, b, f) => {
    const ca = facetConcepts(a, f), cb = facetConcepts(b, f); if (!ca.size || !cb.size) return false;
    const share = [...ca].some(x => cb.has(x));
    if (f === 'height_class' || f === 'spread_class') { const ia = interval(a.e.numbers), ib = interval(b.e.numbers); const nd = !!(ia && ib && (ia[1] < ib[0] || ia[0] > ib[1])); return nd && !share; }
    if (ORDINAL.has(f)) return !share;
    return false;
  };
  // hubs
  const byConcept = new Map();
  for (const e of E) { if (!byConcept.has(e.target)) byConcept.set(e.target, new Map()); const m = byConcept.get(e.target); if (!m.has(e.plant)) m.set(e.plant, []); m.get(e.plant).push(e); }
  const hubs = [];
  for (const [cid, plants] of byConcept) if (plants.size >= 2) { const n = N.get(cid); const names = [...plants.keys()].map(plantLabel); const ne = [...plants.values()].reduce((a, v) => a + v.length, 0); hubs.push({ concept: cid, label: n.label, dimension: n.dimension, facet: n.facet, plants: [...plants.keys()].sort(), n_edges: ne, sources: [...new Set([...plants.values()].flat().map(e => e.source_id))].sort(), text: `${n.label} links ${plants.size} plants (${names.join(', ')}) through ${ne} claims${n.dimension === 'condition' ? ' — a shared condition suggests they could share a planting layer.' : '.'}` }); }
  hubs.sort((a, b) => b.plants.length - a.plants.length || b.n_edges - a.n_edges || a.concept.localeCompare(b.concept));
  // variation & disagreement
  const groups = new Map();
  for (const c of C.values()) for (const f of c.facets) { const k = `${c.plant}|${f}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
  const variation = [], disagreement = [];
  for (const [key, csRaw] of groups) {
    const [plant, facet] = key.split('|'); const cs = csRaw.slice().sort((a, b) => a.claim_id.localeCompare(b.claim_id));
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i], b = cs[j];
      if (a.e.source_id === b.e.source_id && condKey(a) === condKey(b)) continue;
      if ((a.e.cultivar || null) !== (b.e.cultivar || null)) continue;
      if (!disjoint(a, b, facet)) continue;
      const ka = condKey(a), kb = condKey(b); const [va, ca] = describe(a, N), [vb, cb] = describe(b, N); const pl = plantLabel(plant), fl = facet.replace(/_/g, ' ');
      if (ka !== kb && a.e.conditions.length && b.e.conditions.length) variation.push({ plant, facet, claims: [a.claim_id, b.claim_id], conditions: [ka.split('|'), kb.split('|')], candidate: a.e.type === 'candidate' || b.e.type === 'candidate', text: `${pl} ${fl} depends on conditions: ${srcLabel(a.e.source_id, sources)} gives ${va} under ${ca}, ${srcLabel(b.e.source_id, sources)} gives ${vb} under ${cb}.` });
      else if (ka === kb) disagreement.push({ plant, facet, claims: [a.claim_id, b.claim_id], sources: [a.e.source_id, b.e.source_id], conditions: ka ? ka.split('|') : [], candidate: a.e.type === 'candidate' || b.e.type === 'candidate', text: `Sources disagree on ${pl} ${fl}${a.e.cultivar ? ` (${a.e.cultivar})` : ''}: ${srcLabel(a.e.source_id, sources)} says ${va}, ${srcLabel(b.e.source_id, sources)} says ${vb}, both ${ka ? ca : 'with no condition stated'}.` });
    }
  }
  const vmap = new Map();
  for (const v of variation) { const k = `${v.plant}|${v.facet}`; if (!vmap.has(k)) vmap.set(k, { plant: v.plant, facet: v.facet, claims: [], texts: [], candidate: false }); const m = vmap.get(k); for (const c of v.claims) if (!m.claims.includes(c)) m.claims.push(c); m.texts.push(v.text); m.candidate = m.candidate || v.candidate; }
  const variations = [...vmap.values()].map(v => ({ plant: v.plant, facet: v.facet, claims: v.claims, text: v.texts[0], pairs: v.texts.length, candidate: v.candidate }));
  // gaps
  const plants = [...new Set(E.map(e => e.plant))];
  const gaps = [];
  for (const P of plants) {
    const facetsHere = new Set(E.filter(e => e.plant === P).map(e => e.facet));
    for (const gf of gateFacets) { if (gf.startsWith('hardiness') && [...facetsHere].some(f => f.startsWith('hardiness'))) continue; if (!facetsHere.has(gf)) gaps.push({ kind: 'gate_facet_missing', plant: P, facet: gf, text: `${plantLabel(P)} has no sourced claim on the gate facet ‘${gf.replace(/_/g, ' ')}’ — the AI cannot gate on it.` }); }
  }
  const singleSource = [];
  for (const [cid, pm] of byConcept) for (const [P, es] of pm) { const srcs = new Set(es.map(e => e.source_id)); if (srcs.size === 1 && !srcs.has('entity')) singleSource.push({ plant: P, concept: cid, source: [...srcs][0], claims: [...new Set(es.map(e => e.claim_id).filter(Boolean))] }); }
  gaps.push({ kind: 'single_source_links', count: singleSource.length, items: singleSource, text: `${singleSource.length} plant–concept links rest on a single source.` });
  const relPairs = new Set(edges.filter(e => e.type === 'relation' && e.live).map(e => [e.source, e.target].sort().join('|')));
  const ps = plants.slice().sort();
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { const a = ps[i], b = ps[j]; const sa = new Set(E.filter(e => e.plant === a).map(e => e.target)); const shared = [...new Set(E.filter(e => e.plant === b).map(e => e.target))].filter(x => sa.has(x)).sort(); if (shared.length >= 5 && !relPairs.has([a, b].sort().join('|'))) gaps.push({ kind: 'shared_concepts_no_relation', plants: [a, b], shared, text: `${plantLabel(a)} and ${plantLabel(b)} share ${shared.length} concepts but no sourced relation links them — shared conditions do not by themselves prove they combine.` }); }
  const singleVoice = [];
  for (const [cid, pm] of byConcept) { const all = [...pm.values()].flat(); const types = new Set(all.map(e => e.source_type)); types.delete('entity'); if (types.size === 1 && !all.some(e => e.source_type === 'entity')) singleVoice.push({ concept: cid, label: N.get(cid)?.label || cid, source_type: [...types][0], plants: [...pm.keys()].sort(), text: `Everything linking plants to ‘${N.get(cid)?.label || cid}’ comes from ${[...types][0]} sources only.` }); }
  const plantDiag = {};
  for (const P of plants) {
    const my = E.filter(e => e.plant === P); const concepts = new Set(my.map(e => e.target)); const facets = new Set(my.map(e => e.facet));
    const dis = disagreement.filter(d => d.plant === P), varr = variations.filter(v => v.plant === P), gp = gaps.filter(g => g.plant === P);
    plantDiag[P] = { concepts: concepts.size, facets: facets.size, claims: new Set(my.map(e => e.claim_id).filter(Boolean)).size, verified_edges: my.filter(e => e.status === 'verified').length, candidate_edges: my.filter(e => e.type === 'candidate').length, disagreements: dis.length, variations: varr.length, gate_gaps: gp.map(g => g.facet),
      text: `${plantLabel(P)} is linked to ${concepts.size} concepts across ${facets.size} facets from ${new Set(my.map(e => e.claim_id).filter(Boolean)).size} claims; ` + (dis.length ? `sources disagree on ${[...new Set(dis.map(d => d.facet.replace(/_/g, ' ')))].sort().join(', ')}; ` : 'no disagreement found; ') + (varr.length ? `${[...new Set(varr.map(v => v.facet.replace(/_/g, ' ')))].sort().join(', ')} depend${varr.length === 1 ? 's' : ''} on conditions; ` : '') + (gp.length ? `missing gate facets: ${gp.map(g => g.facet.replace(/_/g, ' ')).join(', ')}.` : 'every gate facet has at least one claim.') };
  }
  return { plants: plantDiag, hubs, variation: variations, disagreement, gaps, single_voice: singleVoice, counts: { hubs: hubs.length, variation: variations.length, disagreement: disagreement.length, gaps_gate: gaps.filter(g => g.kind === 'gate_facet_missing').length, gaps_single_source: singleSource.length, gaps_no_relation: gaps.filter(g => g.kind === 'shared_concepts_no_relation').length, single_voice: singleVoice.length } };
}
