// Loader and indexes for the concept-centred graph (brain/data/graph.json, diagnosis.json, ontology.json),
// plus the construction of candidate edges from a typed observation. Read-only against the db.
const HERE = '../..';
const ROOT = '../../data/db';
async function getJson(p) { const r = await fetch(p, { cache: 'no-store' }); if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`); return r.json(); }

export async function loadGraph() {
  const [graph, diagnosis, ontology] = await Promise.all([getJson(`${HERE}/data/graph.json`), getJson(`${HERE}/data/diagnosis.json`), getJson(`${ROOT}/ontology.json`)]);
  return index(graph, diagnosis, ontology);
}

export function index(graph, diagnosis, ontology) {
  const N = new Map(graph.nodes.map(n => [n.id, n]));
  const O = new Map(ontology.nodes.map(n => [n.id, n]));
  const byPlant = new Map(), byConcept = new Map(), bySource = new Map(), byClaim = new Map();
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const e of graph.edges) {
    if (e.type === 'claim' || e.type === 'entity') { push(byPlant, e.plant, e); if (e.target) push(byConcept, e.target, e); push(bySource, `source:${e.source_id}`, e); if (e.claim_id) push(byClaim, e.claim_id, e); }
  }
  const plants = graph.nodes.filter(n => n.type === 'plant');
  const concepts = graph.nodes.filter(n => n.type === 'concept');
  const facets = new Map(); for (const c of concepts) { if (!facets.has(c.facet)) facets.set(c.facet, []); facets.get(c.facet).push(c); }
  for (const arr of facets.values()) arr.sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.label.localeCompare(b.label));
  const LABEL2IDS = new Map();
  for (const n of ontology.nodes) for (const l of [n.label, ...(n.aliases || [])]) { const k = l.toLowerCase(); if (!LABEL2IDS.has(k)) LABEL2IDS.set(k, []); LABEL2IDS.get(k).push(n.id); }
  return { graph, diagnosis, ontology, N, O, byPlant, byConcept, bySource, byClaim, plants, concepts, facets, dimensions: ontology.dimensions, facetFields: ontology.facet_fields, gateFacets: graph.gate_facets, LABEL2IDS,
    plantLabel: id => N.get(id)?.label || id, label: id => N.get(id)?.label || O.get(id)?.label || id, linkedPlants: cid => new Set((byConcept.get(cid) || []).filter(e => e.live !== false).map(e => e.plant)) };
}

export function classesFor(G, facet, lo, hi) {
  return (G.facets.get(facet) || []).filter(n => { const o = G.O.get(n.id); const a = o.min_m ?? 0, b = o.max_m ?? Infinity; return hi >= a && lo < b; }).map(n => n.id);
}

// concepts a question or an observation mentions, by alias (the same words the intent map holds)
export function conceptsInText(G, text) {
  const t = ` ${text.toLowerCase()} `; const hits = new Map();
  for (const [alias, ids] of G.LABEL2IDS) { if (alias.length < 3) continue; if (t.includes(` ${alias} `) || t.includes(`${alias} `) && t.includes(` ${alias}`)) for (const id of ids) hits.set(id, alias); }
  // prefer specific over group when both matched ('full sun' and 'sun')
  for (const [id] of [...hits]) { const o = G.O.get(id); if (o && o.parent && hits.has(o.parent)) hits.delete(o.parent); }
  return hits;
}

// a candidate claim (from the Grow form) -> candidate edges in the same shape as graph.json claim edges
export function candidateEdges(G, cand) {
  const out = []; let k = 0;
  const base = { type: 'candidate', claim_id: cand.id, plant: `plant:${cand.plant}`, source: `plant:${cand.plant}`, field: cand.field, relation: 'has', source_id: 'candidate', source_type: 'candidate', status: 'candidate', confidence: null, value_label: cand.value_label ?? null, numbers: cand.value_kind === 'quantitative' ? cand.value : null, text: cand.text, context: cand.context, conditions: cand.conditions || [], place: cand.place || null, time: cand.time || [], cultivar: cand.cultivar || null, practitioner_meta: cand.practitioner_meta, live: true, recorded_by: 'user (browser session)' };
  for (const cid of cand.concepts || []) { if (!G.O.has(cid)) continue; out.push({ ...base, id: `cand:${cand.id}:${k++}`, target: cid, facet: G.O.get(cid).facet, spanned: cand.value_kind === 'quantitative' && ['height_class', 'spread_class'].includes(G.O.get(cid).facet) }); }
  if (!out.length) out.push({ ...base, id: `cand:${cand.id}:x`, target: null, facet: null, spanned: false });
  return out;
}
