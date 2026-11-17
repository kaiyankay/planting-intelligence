// Explorer model — loads brain/data/explorer.json (tools/build_explorer.py) and answers the questions the four views ask.
// Nothing about the plants, the facets or the functions is written here: ids, labels, statuses and evidence all come from the file.
// Graph neighbourhoods are keyed on record kind (species · function · concept · pair), never on an id.

export async function load(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return new Model(await r.json());
}

export class Model {
  constructor(d) {
    this.d = d;
    this.species = d.species; this.SP = new Map(d.species.map(s => [s.id, s]));
    this.functions = d.functions; this.FN = new Map(d.functions.map(f => [f.id, f]));
    this.facets = d.facets; this.FA = new Map(d.facets.map(f => [f.id, f]));
    this.groups = d.groups; this.GR = new Map(d.groups.map(g => [g.id, g]));
    this.concepts = d.concepts; this.CO = new Map(d.concepts.map(c => [c.id, c]));
    this.links = d.function_links; this.LK = new Map(d.function_links.map(l => [l.id, l])); this.linkAt = new Map(d.function_links.map(l => [`${l.species}|${l.function}`, l]));
    this.attrs = d.attributes; this.AT = new Map(d.attributes.map(a => [a.id, a])); this.attrAt = new Map(d.attributes.map(a => [`${a.species}|${a.facet}`, a]));
    this.clinks = d.concept_links; this.CL = new Map(d.concept_links.map(e => [e.id, e]));
    this.relations = d.relations; this.RE = new Map(d.relations.map(r => [r.id, r]));
    this.pairs = d.pairs; this.PA = new Map(); for (const p of d.pairs) { this.PA.set(`${p.a}|${p.b}`, p); this.PA.set(`${p.b}|${p.a}`, p); }
    this.claims = d.claims; this.checks = d.evidence_checks; this.sources = d.sources; this.rules = d.rules; this.vocab = d.vocab; this.stats = d.stats;
    this.clinksOf = new Map(); for (const e of d.concept_links) { push(this.clinksOf, e.species, e); push(this.clinksOf, e.concept, e); }
    this.searchIndex = [
      ...d.species.map(s => ({ id: s.id, kind: 'species', label: s.scientific_name, sub: (s.common_names || []).join(' · '), text: [s.scientific_name, ...(s.common_names || []), s.family, s.genus].join(' ').toLowerCase() })),
      ...d.functions.map(f => ({ id: f.id, kind: 'function', label: f.label, sub: 'spatial function', text: [f.label, ...(f.aliases || [])].join(' ').toLowerCase() })),
      ...d.concepts.filter(c => !c.no_plant_reaches).map(c => ({ id: c.id, kind: 'concept', label: c.label, sub: `${c.facet_label || c.facet} · ${c.n_species} species`, text: [c.label, c.facet_label || ''].join(' ').toLowerCase() })),
    ];
  }
  sp(id) { return this.SP.get(id); } fn(id) { return this.FN.get(id); } co(id) { return this.CO.get(id); }
  link(spId, fnId) { return this.linkAt.get(`${spId}|${fnId}`); }
  attr(spId, facet) { return this.attrAt.get(`${spId}|${facet}`); }
  pair(a, b) { return this.PA.get(`${a}|${b}`); }
  claim(id) { return this.claims[id]; }
  source(id) { return this.sources[id] || { id, label: id }; }
  linksOf(spId) { return this.links.filter(l => l.species === spId); }
  linksTo(fnId) { return this.links.filter(l => l.function === fnId); }
  relationsOf(spId, live = true) { return this.relations.filter(r => (r.a === spId || r.b === spId) && (!live || r.live)); }
  relationsBetween(a, b, live = true) { return this.relations.filter(r => ((r.a === a && r.b === b) || (r.a === b && r.b === a)) && (!live || r.live)); }
  name(id) { return this.SP.get(id)?.scientific_name || this.FN.get(id)?.label || this.CO.get(id)?.label || id; }
  kindOf(id) { return this.SP.has(id) ? 'species' : this.FN.has(id) ? 'function' : this.CO.has(id) ? 'concept' : null; }

  search(q) {
    q = q.trim().toLowerCase(); if (q.length < 2) return [];
    const words = q.split(/\s+/);
    const order = { species: 0, function: 1, concept: 2 };
    return this.searchIndex.filter(x => words.every(w => x.text.includes(w))).sort((a, b) => (a.label.toLowerCase().startsWith(q) ? 0 : 1) - (b.label.toLowerCase().startsWith(q) ? 0 : 1) || order[a.kind] - order[b.kind] || a.label.localeCompare(b.label)).slice(0, 12);
  }

  // ------------------------------------------------------------------ what the graph draws for a focus: real records only, unknown as ghosts
  // Every edge is a record of the projection: a function link (drawn only when derived or candidate), a concept link (plant → concept
  // claim line), a requirement (function → concept, literature) or a live relation record.  A ghost is a species whose link to the
  // focused function is unknown — shown without any edge.
  // The graph starts small and is expanded on purpose: `x` is the set of layers the reader added (layersFor lists what can be added).
  //   no focus   the X · Y · Z overview: species, functions, required traits and the records between them
  //   function   the function and its linked species     + traits     the traits it requires, with the linked species' claim lines to them
  //                                                      + gaps       the species without a link (ghosts, no line)
  //   species    the species and its linked functions    + <group id> its trait concepts of one knowledge group   (+ traits: every group)
  //                                                      + relations  its live plant-to-plant records
  //                                                      + gaps       the functions without a link (ghosts, no line)
  //   concept · pair   as recorded, nothing to add
  graphFor(focus, a, b, x = new Set(), opts = {}) {
    const nodes = new Map(), edges = [];
    const N = (id, kind, extra = {}) => { if (!nodes.has(id)) nodes.set(id, { id, kind, label: this.name(id), ...extra }); return nodes.get(id); };
    const E = (e) => edges.push(e);
    const linkEdge = l => ({ id: l.id, kind: 'link', rel: 'suited_for', source: l.species, target: l.function, status: l.status, conflict: l.conflict, verification: l.verification, ref: l });
    const clEdge = e => ({ id: e.id, kind: 'concept_link', rel: e.rel, source: e.species, target: e.concept, status: e.status, verification: e.verification, ref: e });
    const reqEdge = (f, r, alt) => ({ id: `${r.id}>${alt}`, kind: 'requirement', rel: 'requires_trait', source: f.id, target: alt, status: 'documented', verification: 'literature', strength: r.strength, ref: r, fn: f.id });
    const relEdge = r => ({ id: r.id, kind: 'relation', rel: r.type, source: r.a, target: r.b, status: r.kg_status, verification: r.status, placeholder: r.placeholder, ref: r });
    if (!focus) {   // the overview (V4): the three axes of the knowledge base and every record that joins them
      //   X  the species (ordered by growth form)        Z  the spatial functions        Y  the trait concepts a function requires
      //   X — Z  every drawn function link               Z — Y  every requirement (literature)
      //   X — Y  the plants' claim lines to those traits: real records, kept `latent` — drawn only for the node under the pointer
      for (const s of this.species.slice().sort((a, b) => String(a.growth_form_label || '').localeCompare(String(b.growth_form_label || '')) || a.scientific_name.localeCompare(b.scientific_name))) N(s.id, 'species', { sub: s.growth_form_label || '' });
      for (const f of this.functions) N(f.id, 'function');
      for (const l of this.links) if (l.drawn) E(linkEdge(l));
      const alts = [];
      for (const f of this.functions) for (const r of f.requirements) for (const alt of r.alternatives) { const c = this.co(alt); if (c && !c.no_plant_reaches) { if (!alts.includes(alt)) alts.push(alt); E(reqEdge(f, r, alt)); } }
      alts.sort((a, b) => String(this.co(a).group || '').localeCompare(String(this.co(b).group || '')) || String(this.co(a).facet || '').localeCompare(String(this.co(b).facet || '')) || this.co(a).label.localeCompare(this.co(b).label));
      for (const alt of alts) { N(alt, 'concept', { group: this.co(alt).group, req: true }); for (const e of this.clinksOf.get(alt) || []) E({ ...clEdge(e), latent: true }); }
      return { nodes: [...nodes.values()], edges, center: null, xyz: true };
    }
    if (focus.kind !== 'pair') return this.explore(focus, x, opts);
    if (focus.kind === 'pair' && a && b) {
      const p = this.pair(a, b); N(a, 'species', { focus: true }); N(b, 'species', { focus: true });
      for (const cid of p?.shared_concepts || []) { N(cid, 'concept'); for (const e of this.clinksOf.get(cid) || []) if (e.species === a || e.species === b) E(clEdge(e)); }
      for (const id of [a, b]) for (const l of this.linksOf(id)) if (l.drawn) { N(l.function, 'function'); E(linkEdge(l)); }
      for (const r of this.relationsBetween(a, b)) E(relEdge(r));
      return { nodes: [...nodes.values()], edges, center: null, pair: [a, b] };
    }
    return { nodes: [], edges: [], center: null };
  }
  // ------------------------------------------------------------------ V4.1: a focus is explored in place, in the same X · Y · Z columns
  // The record graph has five edge classes, each a kind of record of the projection (classesIn() counts them):
  //   use       species — function    a function link that rests on a recorded use (status derived or documented)
  //   inferred  species — function    a function link inferred from traits (status candidate, KG-R4)
  //   req       function — concept    a requirement of the function (literature)
  //   claim     species — concept     a claim line; opened as `met` (only to traits a function requires), one knowledge group, or `claims` (all)
  //   rel       species — species     a live plant-to-plant record of relations.json
  // explore() walks from the focus over the classes the reader switched on, 1 or 2 hops. A walk never returns to the focus's own kind
  // through a shared hub: two plants linked to one function, or reaching one trait, are not thereby related (only `rel` joins plants).
  // Nothing is drawn that is not a record; a missing function link is a `gap` mark on the node, never a line.
  static SAFE = 24;   // the most attribute nodes the Y column keeps legible; an expansion that would pass it is not applied, and says so
  reqAlts() { if (!this._req) { this._req = new Set(); for (const f of this.functions) for (const r of f.requirements) for (const alt of r.alternatives) { const c = this.co(alt); if (c && !c.no_plant_reaches) this._req.add(alt); } } return this._req; }
  reqEdges() { if (!this._re) { this._re = []; this.RQ = new Map(); for (const f of this.functions) for (const r of f.requirements) for (const alt of r.alternatives) if (this.reqAlts().has(alt)) { const e = { id: `${r.id}>${alt}`, kind: 'requirement', rel: 'requires_trait', cls: 'req', source: f.id, target: alt, status: 'documented', verification: 'literature', strength: r.strength, ref: r, fn: f.id }; this._re.push(e); this.RQ.set(e.id, e); } } return this._re; }
  req(id) { this.reqEdges(); return this.RQ.get(id); }
  liveRelations() { return this.relations.filter(r => r.live && this.SP.has(r.a) && this.SP.has(r.b)); }
  /** every edge class with the number of records the snapshot holds for it (0 = the class is not in this snapshot) */
  classesIn() {
    return [{ key: 'use', label: 'Recorded use', n: this.links.filter(l => l.drawn && l.status !== 'candidate').length }, { key: 'inferred', label: 'Inferred by trait', n: this.links.filter(l => l.drawn && l.status === 'candidate').length },
      { key: 'req', label: 'Requirement', n: this.reqEdges().length }, { key: 'claims', label: 'Source claim', n: this.clinks.length }, { key: 'rel', label: 'Plant-to-plant record', n: this.liveRelations().length }];
  }
  defaultX(kind) { return kind === 'concept' ? ['use', 'inferred', 'req', 'claims'] : kind === 'function' ? ['use', 'inferred', 'req'] : ['use', 'inferred']; }
  /** the edges of the classes in `keys`, as [edge, a, b] */
  edgesOf(keys) {
    const out = []; const E = (e, cls) => out.push({ ...e, cls });
    const linkEdge = l => ({ id: l.id, kind: 'link', rel: 'suited_for', source: l.species, target: l.function, status: l.status, conflict: l.conflict, verification: l.verification, ref: l });
    const clEdge = e => ({ id: e.id, kind: 'concept_link', rel: e.rel, source: e.species, target: e.concept, status: e.status, verification: e.verification, ref: e });
    for (const l of this.links) if (l.drawn) { const c = l.status === 'candidate' ? 'inferred' : 'use'; if (keys.has(c)) E(linkEdge(l), c); }
    if (keys.has('req')) for (const e of this.reqEdges()) out.push(e);
    const req = this.reqAlts();
    for (const e of this.clinks) { const k = keys.has('claims') ? 'claims' : keys.has(e.group) ? e.group : keys.has('met') && req.has(e.concept) ? 'met' : null; if (k) E(clEdge(e), k); }
    if (keys.has('rel')) for (const r of this.liveRelations()) E({ id: r.id, kind: 'relation', rel: r.type, source: r.a, target: r.b, status: r.kg_status, verification: r.status, placeholder: r.placeholder, ref: r }, 'rel');
    return out;
  }
  walk(focus, keys, hops) {
    // around a plant, the claim lines are its own: a plant reached through a plant record does not bring its traits along
    const edges = this.edgesOf(keys).filter(e => !(focus.kind === 'species' && e.kind === 'concept_link' && e.source !== focus.id)); const hop = new Map([[focus.id, 0]]); let front = [focus.id];
    for (let h = 1; h <= hops; h++) { const next = []; for (const u of front) for (const e of edges) { const v = e.source === u ? e.target : e.target === u ? e.source : null; if (!v || hop.has(v)) continue; if (this.kindOf(v) === focus.kind && e.cls !== 'rel') continue; if (e.cls === 'req' && u === e.target && u !== focus.id) continue;   /* a requirement is read from the function to its trait: a trait a plant has does not reach the functions that ask for it */ hop.set(v, h); next.push(v); } front = next; }
    // drawn: the records the walk went along, the claim lines and requirements among what it reached — but not a function link or a
    // plant record between two nodes of the same depth (a partner's own functions are its affair, one step further out)
    const flat = e => hop.get(e.source) === hop.get(e.target) && (e.cls === 'use' || e.cls === 'inferred' || (e.cls === 'rel' && focus.kind === 'species'));
    return { hop, edges: edges.filter(e => hop.has(e.source) && hop.has(e.target) && !flat(e)) };
  }
  /** the graph of one focus. `x` the classes switched on, opts.hops 1 | 2, opts.only drops what the walk did not reach.
   *  → nodes (lit: reached · ctx: the rest of the overview, for orientation · gap: no link to the focus, marked on request),
   *    edges (records between reached nodes), blocked (expansions not applied because they pass SAFE, with how to narrow them) */
  explore(focus, x = new Set(), { hops = 1, only = false } = {}) {
    const keys = new Set(), blocked = []; const order = ['use', 'inferred', 'req', 'rel', 'met', ...this.groups.map(g => g.id), 'claims'];
    const nCo = w => [...w.hop.keys()].filter(id => this.CO.has(id) && id !== focus.id).length;
    for (const k of order) { if (!x.has(k)) continue; const w = this.walk(focus, new Set([...keys, k]), hops); const n = nCo(w); if (n > Model.SAFE) blocked.push({ key: k, label: k === 'claims' ? 'All claim lines' : this.GR.get(k)?.label || k, n, narrow: k === 'claims' ? this.groups.map(g => ({ key: g.id, label: g.label, n: nCo(this.walk(focus, new Set([...keys, g.id]), hops)) })).filter(g => g.n && g.n <= Model.SAFE) : [] }); else keys.add(k); }
    const w = this.walk(focus, keys, hops); const nodes = new Map(); const req = this.reqAlts();
    const N = (id, kind, extra = {}) => { const hop = w.hop.get(id); nodes.set(id, { id, kind, label: this.name(id), lit: hop !== undefined, hop, focus: id === focus.id, ...extra }); };
    const gapOf = id => { if (!x.has('gaps')) return null; const l = focus.kind === 'function' && this.SP.has(id) ? this.link(id, focus.id) : focus.kind === 'species' && this.FN.has(id) ? this.link(focus.id, id) : null; return l && !l.drawn ? { gap: true, verdict: l.verdict, link: l.id } : null; };
    for (const s of this.species.slice().sort((a, b) => String(a.growth_form_label || '').localeCompare(String(b.growth_form_label || '')) || a.scientific_name.localeCompare(b.scientific_name))) { const g = gapOf(s.id); if (w.hop.has(s.id) || g || !only) N(s.id, 'species', { sub: s.growth_form_label || '', ...(g || {}) }); }
    for (const f of this.functions) { const g = gapOf(f.id); if (w.hop.has(f.id) || g || !only) N(f.id, 'function', g || {}); }
    const lit = [...w.hop.keys()].filter(id => this.CO.has(id)); const ctx = only || lit.length + req.size > Model.SAFE ? [] : [...req].filter(id => !w.hop.has(id));
    const cs = [...lit, ...ctx].sort((a, b) => String(this.co(a).group || '').localeCompare(String(this.co(b).group || '')) || String(this.co(a).facet || '').localeCompare(String(this.co(b).facet || '')) || this.co(a).label.localeCompare(this.co(b).label));
    for (const id of cs) N(id, 'concept', { group: this.co(id).group, req: req.has(id) });
    const context = only ? [] : this.edgesOf(new Set(['use', 'inferred', 'req'])).filter(e => !w.edges.some(o => o.id === e.id) && nodes.has(e.source) && nodes.has(e.target)).map(e => ({ ...e, ctx: true }));
    return { nodes: [...nodes.values()], edges: [...w.edges, ...context], center: focus.id, xyz: true, focus, keys, hops, blocked };
  }
  /** what can be switched on around a focus: each class with the number of records it would bring at this depth (0 = nothing recorded) */
  layersFor(focus, hops = 1) {
    if (!focus || focus.kind === 'pair') return [];
    const n = (k, deep) => this.walk(focus, new Set([k, 'use', 'inferred', 'req']), deep ? 2 : hops).edges.filter(e => e.cls === k).length;
    const L = (key, label, extra = {}) => ({ key, label, n: n(key, extra.deep), ...extra, deep: !!extra.deep && hops < 2 });
    const gaps = focus.kind === 'function' ? this.linksTo(focus.id).filter(l => !l.drawn).length : focus.kind === 'species' ? this.linksOf(focus.id).filter(l => !l.drawn).length : 0;
    if (focus.kind === 'function') return [L('use', 'Recorded use'), L('inferred', 'Inferred by trait'), L('req', 'Required traits'), L('met', 'Claims on required'), L('rel', 'Plant records', { deep: true }), { key: 'gaps', label: 'Species without a link', n: gaps, mark: true }];
    if (focus.kind === 'species') return [L('use', 'Recorded use'), L('inferred', 'Inferred by trait'), L('req', 'Required traits', { deep: true }), L('met', 'Claims on required'), ...this.groups.map(g => L(g.id, g.label, { traits: true, short: g.label.split(/[\s&]+/)[0] })), L('claims', 'All claim lines', { traits: true }), L('rel', 'Plant records'), { key: 'gaps', label: 'Functions without a link', n: gaps, mark: true }];
    return [L('claims', 'Claim lines'), L('req', 'Required by')];
  }
}
function push(m, k, v) { if (!m.has(k)) m.set(k, []); m.get(k).push(v); }
