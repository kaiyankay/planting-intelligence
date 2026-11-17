// Port of tools/retrieve.py (T6) to JS. Same three routes, same R5 ranking, same R6 attribution.
// Differences from the Python are listed in brain/README.md ("Retrieval preview").
//   route 1  keyword / synonym  → plant ids
//   route 2  intent_map terms   → gate checks (pass / fail / unknown, M16a)
//   route 3  BM25 over claim text (+ field, context, plant names) — stand-in for an embedding model (M16)
// Ranking: source_type priority → geo specificity → practitioner completeness → confidence. Similarity only for recall.

const GEO = { vancouver: 0, bc: 1, pnw: 2, north_america: 3, global: 4 };
const VANCOUVER_USDA = 8;
const STOP = new Set('a an the of for in on to and or with is are be my our your this that it its as at by from i we you plant plants'.split(' '));

export function toks(s) {
  return ((s || '').toLowerCase().match(/[a-z0-9一-鿿]+/g) || []).filter(t => !STOP.has(t) && t.length > 1);
}

export function makeRetriever(db, getCandidates = () => []) {
  const { schema, sources, synonyms, intent, plants } = db;
  const ONT = new Map(((db.ontology || {}).nodes || []).map(n => [n.id, n]));
  const LABEL2IDS = new Map(); const FACETS_OF = {};
  for (const n of ONT.values()) { for (const l of [n.label, ...(n.aliases || [])]) { const k = l.toLowerCase(); if (!LABEL2IDS.has(k)) LABEL2IDS.set(k, []); LABEL2IDS.get(k).push(n.id); } }
  for (const [facet, fields] of Object.entries((db.ontology || {}).facet_fields || {})) for (const f of fields) (FACETS_OF[f.split('.')[0]] = FACETS_OF[f.split('.')[0]] || []).push(facet);
  // intent_map values are KPU labels; claims (0.4.0) hold ontology ids — compare on ids, preferring the field's facets
  const toConcept = (x, field) => { if (typeof x !== 'string') return x; if (ONT.has(x)) return x; const ids = LABEL2IDS.get(x.toLowerCase()) || []; const pref = ids.filter(i => (FACETS_OF[field] || []).includes(ONT.get(i).facet)); return (pref[0] || ids[0] || x); };
  const LABEL2ID = { get: k => (LABEL2IDS.get(k) || [])[0] };
  const SRC_PRIORITY = {};
  schema.claim.fields.source_type.priority_order.forEach((s, i) => { SRC_PRIORITY[s] = i; });
  const SYN_NAMES = {};
  for (const e of synonyms.entries) SYN_NAMES[e.id] = [e.scientific, ...(e.names || [])];

  const fieldType = field => {
    for (const t of Object.values(schema.field_tiers)) if (t.fields && t.fields[field]) return String(t.fields[field].type || '');
    return '';
  };

  const live = c => c.status !== 'retired' && c.source_type !== 'model';

  // ---- corpus (db claims + session candidates)
  function corpus() {
    const claims = [];
    for (const p of Object.values(plants)) claims.push(...p.claims);
    claims.push(...getCandidates());
    const docs = claims.map(c => toks([c.text || '', (c.field || '').replace(/_/g, ' '), c.context || '', (SYN_NAMES[c.plant] || []).join(' ')].join(' ')));
    const df = new Map();
    for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) || 0) + 1);
    const N = docs.length;
    const avg = docs.reduce((a, d) => a + d.length, 0) / Math.max(N, 1);
    return { claims, docs, df, N, avg };
  }

  function bm25(C, q, k1 = 1.5, b = 0.75) {
    const qt = toks(q); const out = [];
    C.docs.forEach((d, i) => {
      if (!d.length) return;
      const tf = new Map(); for (const t of d) tf.set(t, (tf.get(t) || 0) + 1);
      let s = 0;
      for (const t of qt) {
        if (!tf.has(t)) continue;
        const n = C.df.get(t) || 0;
        const idf = Math.log(1 + (C.N - n + 0.5) / (n + 0.5));
        const f = tf.get(t);
        s += idf * f * (k1 + 1) / (f + k1 * (1 - b + b * d.length / C.avg));
      }
      if (s > 0) out.push([s, i]);
    });
    return out.sort((a, b2) => b2[0] - a[0]);
  }

  // ---- route 1
  function nameHits(q) {
    const ql = q.toLowerCase(); const hits = {};
    for (const e of synonyms.entries) {
      for (const n of [e.scientific, ...(e.names || []), ...(e.synonyms_scientific || [])]) {
        if (n && ql.includes(n.toLowerCase())) (hits[e.id] = hits[e.id] || new Set()).add(n);
      }
    }
    return hits;
  }

  // ---- route 2
  function intents(q) {
    const ql = q.toLowerCase(); const found = [];
    for (const t of intent.terms) {
      const words = [t.term, ...(t.aliases || [])];
      const m = words.filter(w => ql.includes(w.toLowerCase()));
      if (m.length) found.push({ term: t, matched: m });
    }
    return found;
  }

  function gateCheck(pid, term) {
    const field = term.field, want = term.value; const p = plants[pid]; const e = p.entity;
    if (field === 'origin_status') return e.origin_status === want ? 'pass' : 'fail';
    if (field === 'kpu_plant_type') return (want || []).includes(e.kpu_plant_type) ? 'pass' : 'fail';
    if (String(field).startsWith('custom:') || field === '_source_geo') return 'n/a';
    const [base, sub] = String(field).split('.');
    const cs = p.claims.filter(c => c.field === base && live(c));
    if (!cs.length) return 'unknown';
    for (const c of cs) {
      let v = c.value;
      if (sub) v = (v && typeof v === 'object') ? v[sub] : undefined;
      if (base === 'hardiness_zone') {
        if (v && typeof v === 'object' && v.unit === 'USDA' && ((v.min ?? v.usda_min ?? 0) <= VANCOUVER_USDA) && (VANCOUVER_USDA <= (v.max ?? 99))) return 'pass';
        if (v && typeof v === 'object' && v.unit === 'RHS' && ['H4', 'H5', 'H6', 'H7'].includes(v.rating)) return 'pass';
        if (want && typeof want === 'object' && !Array.isArray(want) && (want.includes || []).includes(v)) return 'pass';
        continue;
      }
      const wants = (Array.isArray(want) ? want : [want]).map(w => toConcept(w, base));
      const vals = [...(Array.isArray(v) ? v : [v]).map(x => toConcept(x, base)), ...(c.concepts || [])];
      if (wants.some(w => vals.includes(w))) return 'pass';
    }
    if (fieldType(base).endsWith('[]') || sub) return 'unknown';   // M16a
    return 'fail';
  }

  // ---- ranking R5
  const completenessRank = c => c.source_type !== 'practitioner' ? 1.5 : ({ L3: 0, L2: 1, L1: 2, L0: 3 }[(c.practitioner_meta || {}).completeness] ?? 3);
  function rankKey(c) {
    const s = sources[c.source_id] || {};
    return [SRC_PRIORITY[c.source_type] ?? 9, GEO[s.geo_specificity] ?? 9, completenessRank(c), -(c.confidence || 0)];
  }
  const cmp = (a, b) => { const ka = rankKey(a), kb = rankKey(b); for (let i = 0; i < 4; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i]; return 0; };

  function why(c) {
    const s = sources[c.source_id] || {};
    const parts = [`${c.source_type} (priority ${(SRC_PRIORITY[c.source_type] ?? 8) + 1})`, `geo ${s.geo_specificity || (c.source_type === 'candidate' ? 'this session' : '?')}`];
    if (c.source_type === 'practitioner') parts.push(`completeness ${(c.practitioner_meta || {}).completeness}`);
    parts.push(`confidence ${c.confidence ?? '—'}`);
    return parts.join(' → ');
  }

  // ---- R6
  function attribute(c) {
    const s = sources[c.source_id] || {};
    if (c.source_type === 'candidate') return `Candidate (unverified user input, this session): “${c.text}”`;
    if (c.source_type === 'practitioner') {
      const meta = c.practitioner_meta || {};
      const who = s.observer_background || 'a survey respondent';
      const basis = { project: 'in their own project', observed: 'from site observation', read: 'from reading', mixed: 'from mixed experience' }[meta.basis] || '';
      const caveat = meta.caveat ? ` (${meta.caveat})` : '';
      return `A ${who} noted ${basis}${caveat}: “${c.text}”`;
    }
    const name = (s.name || c.source_id).split(' — ')[0].split(' (')[0];
    const st = c.status === 'verified' ? '' : ' [unverified]';
    return `${name}${st}: ${c.text}`;
  }

  function run(q, k = 40) {
    const C = corpus();
    const names = nameHits(q); const its = intents(q);
    const gates = its.filter(x => x.term.mode === 'gate');
    const expanded = q + ' ' + its.map(x => [x.term.term, ...(x.term.aliases || []), String(x.term.field).replace(/_/g, ' ')].join(' ')).join(' ');
    const gateTable = {};
    for (const pid of Object.keys(plants)) { gateTable[pid] = {}; for (const g of gates) gateTable[pid][g.term.term] = gateCheck(pid, g.term); }
    const excluded = new Set(Object.keys(gateTable).filter(pid => Object.values(gateTable[pid]).includes('fail')));
    const candidates = new Set((Object.keys(names).length ? Object.keys(names) : Object.keys(plants)).filter(pid => !excluded.has(pid)));
    const recall = bm25(C, expanded).slice(0, k);
    let hits = [];
    for (const [score, i] of recall) {
      const c = C.claims[i];
      if (candidates.has(c.plant) && (live(c) || c.source_type === 'candidate')) hits.push({ score, c });
    }
    if (Object.keys(names).length && !hits.length) {
      for (const pid of candidates) for (const c of plants[pid].claims) {
        if (live(c) && its.some(x => c.field === String(x.term.field).split('.')[0])) hits.push({ score: 0, c });
      }
    }
    const uniq = new Map(); for (const h of hits) if (!uniq.has(h.c.id)) uniq.set(h.c.id, h);
    const all = [...uniq.values()].map(h => h.c);
    const candidateHits = all.filter(c => c.source_type === 'candidate');
    const ranked = all.filter(c => c.source_type !== 'candidate').sort(cmp);
    const withheld = ranked.filter(c => c.source_type === 'practitioner' && (c.practitioner_meta || {}).citable === false);
    const cited = ranked.filter(c => !withheld.includes(c));
    return {
      query: q, names: Object.fromEntries(Object.entries(names).map(([k2, v]) => [k2, [...v]])),
      intents: its.map(x => ({ term: x.term.term, field: x.term.field, mode: x.term.mode, matched: x.matched })),
      gates: gateTable, excluded: [...excluded].sort(), candidates: [...candidates].sort(),
      recall_n: all.length, ranked: cited, withheld, candidateHits, expanded_query: expanded,
      similarity: Object.fromEntries([...uniq.values()].map(h => [h.c.id, h.score])),
    };
  }

  return { run, attribute, why, rankKey, live, nameHits, intents, SRC_PRIORITY, GEO, toConcept, LABEL2ID, LABEL2IDS };
}
