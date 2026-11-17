// Graph projection layer for brain v3.
// Turns the real repository files — schema.json, plants/*.json, sources.json, relations.json, synonyms.json,
// methods.md, principles.md, HANDOFF.md, README.md — into one read-only graph of typed nodes and typed links.
// Every link carries its basis: 'recorded' (written in a file), 'derived' (produced by a projection rule named in
// PROJECTION_RULES) or 'candidate' (this browser session only). Nothing here writes to the db.
import { fieldTiers } from './data.js';
import { parseContext, relate, numeric, isLive, isSourced, GEO_LABEL, shortSource } from './knowledge.js';

export const LINK_TYPES = {
  structural: { label: 'structural', colour: '#c9d1e3', about: 'how the schema, plants, claims and relations are put together' },
  provenance: { label: 'provenance', colour: '#5ad1ff', about: 'where a claim came from and which step produced it' },
  rule: { label: 'rule', colour: '#b48cff', about: 'survey → decision → rule → the structure or data it governs' },
  knowledge: { label: 'knowledge', colour: '#e8c37a', about: 'how real readings relate: agree, vary with conditions, differ' },
  evolution: { label: 'evolution', colour: '#ff5fb4', about: 'what a candidate observation would add, compare with or fill' },
};

// Documented generation rules. Each derived link names the rule that produced it (link.rule → id here).
export const PROJECTION_RULES = [
  { id: 'P-recorded-by', text: 'claim → construction step / tool: read from claim.recorded_by (cov_trees_to_claims.py → T1; inat_to_claims.py → iNat layer M13; "T5 assisted extraction" → T5; survey-export → T4; "derived" → R9; bare "claude" with source_type model → placeholder, R3).' },
  { id: 'P-rule-predicate', text: 'rule → data: one predicate per rule over the live store — R1 cells with claims from ≥ 2 sources; R2 practitioner claims at completeness L0; R3 claims with source_type model; R4 every claim carries text; R5/R6 the retrieval code and the source-priority order; R7 the three field tiers; R8 entities with raw roles/names and synonyms.json; R9 claims with derived_from; R10 retired claims with retired_by and merge_claims.py.' },
  { id: 'P-mention', text: 'method / decision / principle → rule, method, decision, field, source, tool, survey question: a literal mention of the id in that entry’s text (R#, M#, D#, §N, field name, source id, *.py, c1…f2).' },
  { id: 'P-design-basis', text: 'schema.design_basis keys → the structure they describe: field_tiers → the three tiers; practitioner_metadata → the practitioner metadata block; source_priority → the source-type priority order; conflict_rule → R1; controlled_vocabularies → the KPU vocabularies.' },
  { id: 'P-compare', text: 'claim ↔ claim in the same plant × field: numeric intervals or vocabulary lists compared after parsing context into cultivar / condition / region (methods M23–M24): agrees · overlaps across conditions · differs (same stated condition) · no shared value.' },
  { id: 'P-candidate', text: 'candidate → cell and candidate ↔ claims: the same comparison, marked candidate; a candidate never changes a field’s status and is never cited.' },
];

const RE = { rule: /\bR(\d+)\b/g, method: /\bM(\d+a?)\b/g, decision: /\bD(\d)\b/g, principle: /§\s?(\d+)|principles?\s+§(\d+)/g, survey: /\b([a-f]\d)\b/g, stage: /\bT(\d)\b/g, tool: /\b([a-z_]+\.py)\b/g };
const SURVEY_LABELS = { b3: 'b3 · sources respondents already use', c1: 'c1 · must-pass vs compared fields', c2: 'c2 · what people could not find or did not trust', c3: 'c3 · what people do when sources disagree', c4: 'c4 · knowledge gaps named', d1: 'd1 · plant list and why', d2: 'd2 · first-hand notes and their basis', e1: 'e1 · how people would ask', e2: 'e2 · example questions', f1: 'f1 · what a note needs before it is trusted', f2: 'f2 · what makes an AI suggestion credible' };

export function buildProjection(db, docs, candidates = []) {
  const { schema, sources, plants, relations, synonyms, intent, queries } = db;
  const tiers = fieldTiers(schema);
  const nodes = new Map(); const links = []; let lk = 0;
  const add = n => { if (!nodes.has(n.id)) nodes.set(n.id, n); return nodes.get(n.id); };
  const link = (type, source, target, basis, evidence, extra = {}) => {
    if (!nodes.has(source) || !nodes.has(target) || source === target) return null;
    const l = { id: `l${lk++}`, type, source, target, basis, evidence, ...extra }; links.push(l); return l;
  };

  // ---------------------------------------------------------------- schema: tiers, fields, vocabularies, structures
  add({ id: 'file:schema.json', kind: 'file', label: 'schema.json', file: 'schema.json', text: `${schema.name} · schema ${schema['$schema_version']} · updated ${schema.updated} · scope ${schema.scope}` });
  const TIER_ORDER = ['gate', 'compare', 'extended', 'custom'];
  const fieldList = [];
  for (const t of TIER_ORDER) {
    const T = schema.field_tiers[t]; if (!T) continue;
    add({ id: `tier:${t}`, kind: 'tier', label: `${t} fields`, tier: t, file: 'schema.json', ref: `field_tiers.${t}`, text: T.description || '', nFields: Object.keys(T.fields || {}).length });
    for (const [f, def] of Object.entries(T.fields || {})) {
      fieldList.push({ tier: t, field: f, def });
      add({ id: `field:${f}`, kind: 'field', label: f.replace(/_/g, ' '), field: f, tier: t, def, file: 'schema.json', ref: `field_tiers.${t}.fields.${f}`, text: def.note || '' });
      link('structural', `tier:${t}`, `field:${f}`, 'recorded', `schema.json field_tiers.${t}.fields`);
      if (def.vocab && schema.vocab && schema.vocab[def.vocab]) {
        add({ id: `vocab:${def.vocab}`, kind: 'vocab', label: def.vocab.replace(/^kpu_/, 'KPU ').replace(/_/g, ' '), key: def.vocab, values: schema.vocab[def.vocab], file: 'schema.json', ref: `vocab.${def.vocab}`, open: !!schema.vocab[`${def.vocab}_open`] });
        link('structural', `field:${f}`, `vocab:${def.vocab}`, 'recorded', `schema.json field.vocab = ${def.vocab}`);
      }
      for (const code of (def.survey || '').matchAll(RE.survey)) surveyNode(code[1]), link('rule', `survey:${code[1]}`, `field:${f}`, 'recorded', `schema.json field.survey: “${def.survey}”`, { label: 'motivated by survey' });
      for (const sid of def.fill_from || []) { if (sources[sid]) { sourceNode(sid); link('provenance', `source:${sid}`, `field:${f}`, 'recorded', `schema.json field.fill_from`, { label: 'planned to fill' }); } }
    }
  }
  function surveyNode(code) { return add({ id: `survey:${code}`, kind: 'survey', label: SURVEY_LABELS[code] || `${code} · survey question`, code, file: 'schema.json / HANDOFF.md / methods.md', text: 'ARCH 540 user survey, n = 6 (2026-10-30). Referenced by the files that cite this question.' }); }
  add({ id: 'struct:practitioner_meta', kind: 'struct', label: 'practitioner metadata · completeness L0–L3', file: 'schema.json', ref: 'practitioner_meta', text: schema.practitioner_meta?.description || '', data: schema.practitioner_meta });
  for (const [k, v] of Object.entries(schema.practitioner_meta?.fields || {})) for (const code of (v.survey || '').matchAll(RE.survey)) { surveyNode(code[1]); link('rule', `survey:${code[1]}`, 'struct:practitioner_meta', 'recorded', `schema.json practitioner_meta.fields.${k}.survey: “${v.survey}”`, { label: 'motivated by survey' }); }
  add({ id: 'struct:source_priority', kind: 'struct', label: 'source-type priority order', file: 'schema.json', ref: 'claim.fields.source_type.priority_order', text: (schema.claim.fields.source_type.priority_order || []).join(' > '), data: schema.claim.fields.source_type });
  add({ id: 'struct:claim', kind: 'struct', label: 'claim record (18 fields)', file: 'schema.json', ref: 'claim', text: Object.keys(schema.claim.fields).join(', '), data: schema.claim });
  add({ id: 'struct:value_kind', kind: 'struct', label: 'value_kind · quantitative / categorical / qualitative', file: 'schema.json', ref: 'claim.fields.value_kind', text: schema.claim.fields.value_kind.note || '', data: schema.claim.fields.value_kind });
  add({ id: 'struct:status', kind: 'struct', label: 'claim status · verified / unverified / disputed / retired', file: 'schema.json', ref: 'claim.fields.status', text: 'default unverified', data: schema.claim.fields.status });
  add({ id: 'file:synonyms.json', kind: 'file', label: 'synonyms.json', file: 'synonyms.json', text: `${synonyms.entries.length} names (scientific, common, Chinese), ${synonyms.entries.filter(e => e.in_db).length} in the db` });
  add({ id: 'file:intent_map.json', kind: 'file', label: 'intent_map.json', file: 'intent_map.json', text: `${intent.terms.length} plain-language terms → fields (${intent.terms.filter(t => t.mode === 'gate').length} gates)` });
  add({ id: 'file:queries', kind: 'file', label: 'eval/queries.json', file: 'eval/queries.json', text: `${(queries.queries || []).length} test queries, ${(queries.queries || []).filter(q => q.status === 'proxy').length} proxy until T4` });
  // design basis (recorded in schema.json; the target mapping is a projection rule)
  const DB_TARGETS = { field_tiers: ['tier:gate', 'tier:compare', 'tier:extended', 'tier:custom'], practitioner_metadata: ['struct:practitioner_meta'], source_priority: ['struct:source_priority'], conflict_rule: ['rule:R1'], controlled_vocabularies: [...nodes.keys()].filter(k => k.startsWith('vocab:')) };
  // rules
  for (const r of schema.rules || []) add({ id: `rule:${r.id}`, kind: 'rule', label: r.id, rid: r.id, text: r.rule || r.text || '', file: 'schema.json', ref: `rules.${r.id}` });
  for (const [k, basis] of Object.entries(schema.design_basis || {})) {
    const codes = [...basis.matchAll(RE.survey)].map(m => m[1]);
    for (const code of codes) surveyNode(code);
    for (const tgt of DB_TARGETS[k] || []) for (const code of codes) link('rule', `survey:${code}`, tgt, 'derived', `schema.json design_basis.${k}: “${basis}”`, { rule: 'P-design-basis', label: 'design basis' });
    if (!codes.length && k === 'controlled_vocabularies') { add({ id: 'source:kpu', kind: 'source', sid: 'kpu', rec: sources.kpu || {}, label: 'KPU', type: 'database', geo: 'bc', file: 'sources.json' }); for (const tgt of DB_TARGETS[k]) link('rule', 'source:kpu', tgt, 'derived', `schema.json design_basis.controlled_vocabularies: “${basis}”`, { rule: 'P-design-basis', label: 'vocabulary borrowed from' }); }
  }

  // ---------------------------------------------------------------- plants, cells, claims
  function sourceNode(sid) {
    const s = sources[sid] || {};
    return add({ id: `source:${sid}`, kind: 'source', sid, rec: s, label: sid === 'candidate' ? 'you (candidate)' : shortSource(sid, s), type: sid === 'candidate' ? 'candidate' : (s.type || 'database'), geo: s.geo_specificity || null, tier: s.licence_tier || null, parent: s.parent || null, file: 'sources.json', ref: `sources[${sid}]` });
  }
  for (const s of db.sourcesFile.sources) sourceNode(s.id);
  const plantIds = Object.keys(plants);
  const cells = new Map(); const pendingClaimLinks = [];
  for (const pid of plantIds) {
    const p = plants[pid];
    add({ id: `plant:${pid}`, kind: 'plant', pid, entity: p.entity, fill_plan: p.fill_plan || {}, label: p.entity.scientific_name, file: `plants/${pid}.json`, ref: 'entity' });
    const all = [...p.claims, ...candidates.filter(c => c.plant === pid)];
    for (const { field: f } of fieldList) {
      const cs = all.filter(c => c.field === f);
      const cell = add({ id: `cell:${pid}:${f}`, kind: 'cell', pid, field: f, tier: tiers[f], label: `${p.entity.scientific_name} · ${f.replace(/_/g, ' ')}`, claims: cs, sourced: cs.filter(isSourced), verified: cs.filter(c => isSourced(c) && c.status === 'verified'), retired: cs.filter(c => !isLive(c)), cands: cs.filter(c => c.source_type === 'candidate'), parsed: new Map(), file: `plants/${pid}.json`, ref: `claims[field=${f}]` });
      cells.set(cell.id, cell);
      link('structural', `plant:${pid}`, cell.id, 'recorded', `plants/${pid}.json claims[].plant`);
      link('structural', `field:${f}`, cell.id, 'recorded', `plants/${pid}.json claims[].field`);
      const planned = []; for (const t of ['gate', 'compare', 'extended']) { const fp = (p.fill_plan || {})[t] || {}; if (fp[f]) planned.push(...fp[f]); }
      cell.planned = planned;
      for (const sid of planned) if (sources[sid]) link('provenance', `source:${sid}`, cell.id, 'recorded', `plants/${pid}.json fill_plan`, { label: 'planned to fill' });
      for (const c of cs) {
        cell.parsed.set(c.id, parseContext(c, sources[c.source_id]));
        const st = c.source_type === 'candidate' ? 'candidate' : !isLive(c) ? 'retired' : c.status;
        add({ id: `claim:${c.id}`, kind: 'claim', claim: c, pid, field: f, cell: cell.id, status: st, label: `${c.id}`, file: `plants/${pid}.json`, ref: `claims[id=${c.id}]` });
        link('structural', cell.id, `claim:${c.id}`, c.source_type === 'candidate' ? 'candidate' : 'recorded', c.source_type === 'candidate' ? 'this session' : `plants/${pid}.json`);
        sourceNode(c.source_id);
        link('provenance', `source:${c.source_id}`, `claim:${c.id}`, c.source_type === 'candidate' ? 'candidate' : 'recorded', `claim.source_id = ${c.source_id}`, { label: 'source of' });
        if (c.derived_from) for (const d of (Array.isArray(c.derived_from) ? c.derived_from : [c.derived_from])) pendingClaimLinks.push(['provenance', `claim:${d}`, `claim:${c.id}`, 'claim.derived_from', 'read off from']);
        if (c.retired_by) pendingClaimLinks.push(['provenance', `claim:${c.retired_by}`, `claim:${c.id}`, 'claim.retired_by', 'retired']);
      }
    }
  }
  // claim → claim links are added once every claim node exists (targets may come later in the file)
  for (const [type, a, b, ev, label] of pendingClaimLinks) link(type, a, b, 'recorded', ev, { label });

  // knowledge links within a cell (P-compare) and candidate links (P-candidate)
  for (const cell of cells.values()) {
    const live = cell.sourced; const cands = cell.cands;
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j]; const r = relate(a, b, cell.parsed.get(a.id), cell.parsed.get(b.id)); if (r.cls === 'na') continue;
      link('knowledge', `claim:${a.id}`, `claim:${b.id}`, 'derived', `compared values: ${r.detail}`, { rule: 'P-compare', label: r.kind, cls: r.cls });
    }
    for (const c of cands) { link('evolution', `claim:${c.id}`, cell.id, 'candidate', 'typed this session', { rule: 'P-candidate', label: live.length ? 'joins' : 'would fill a gap' }); for (const x of live) { const r = relate(c, x, cell.parsed.get(c.id), cell.parsed.get(x.id)); if (r.cls !== 'na') link('evolution', `claim:${c.id}`, `claim:${x.id}`, 'candidate', `compared values: ${r.detail}`, { rule: 'P-candidate', label: r.kind, cls: r.cls }); } }
  }

  // ---------------------------------------------------------------- relations
  add({ id: 'file:relations.json', kind: 'file', label: 'relations.json', file: 'relations.json', text: relations.note || '' });
  for (const r of relations.relations) {
    if (!plants[r.plant_a] || !plants[r.plant_b]) continue;
    add({ id: `relation:${r.id}`, kind: 'relation', rel: r, label: (r.relation_type || 'relation').replace(/_/g, ' '), status: r.status, type: r.source_type, file: 'relations.json', ref: r.id });
    link('structural', `relation:${r.id}`, `plant:${r.plant_a}`, 'recorded', 'relations.json plant_a');
    link('structural', `relation:${r.id}`, `plant:${r.plant_b}`, 'recorded', 'relations.json plant_b');
    sourceNode(r.source_id); link('provenance', `source:${r.source_id}`, `relation:${r.id}`, 'recorded', 'relation.source_id', { label: 'source of' });
    for (const cid of r.supporting_claims || []) link('provenance', `claim:${cid}`, `relation:${r.id}`, 'recorded', 'relation.supporting_claims', { label: 'supports' });
    for (const cid of r.derived_from || []) link('provenance', `claim:${cid}`, `relation:${r.id}`, 'recorded', 'relation.derived_from', { label: 'derived from' });
  }

  // ---------------------------------------------------------------- pipeline: stages T1–T7 (HANDOFF headings), tools (README tree)
  for (const m of (docs.handoff || '').matchAll(/^### (T(\d)) — (.+)$/gm)) {
    const head = m[3]; const lower = head.toLowerCase();
    const status = /\bdone\b/.test(lower) && !/awaiting|views 1 and 4/.test(lower) ? 'done' : /done|built|prototype/.test(lower) ? 'partial' : 'pending';
    add({ id: `stage:${m[1]}`, kind: 'stage', tid: m[1], label: `${m[1]} · ${head.split(' — ')[0]}`, heading: head, status, file: 'HANDOFF.md', ref: `### ${m[1]}` });
  }
  if (nodes.has('stage:T4')) nodes.get('stage:T4').status = 'blocked';
  for (const m of (docs.readme || '').matchAll(/([a-z_]+\.py)\s{2,}(.+)$/gm)) {
    const tool = m[1]; const desc = m[2].trim();
    add({ id: `tool:${tool}`, kind: 'tool', label: `tools/${tool}`, tool, text: desc, file: `tools/${tool}`, ref: 'README.md tree' });
    for (const t of desc.matchAll(RE.stage)) link('provenance', `tool:${tool}`, `stage:T${t[1]}`, 'recorded', `README.md: “${desc}”`, { label: 'implements' });
  }
  // claim → step / tool from recorded_by (P-recorded-by)
  const RB = [
    [/cov_trees_to_claims/, ['stage:T1', 'tool:cov_trees_to_claims.py'], 'City of Vancouver inventory → claims'],
    [/inat_to_claims/, ['tool:inat_to_claims.py'], 'iNaturalist aggregates → claims (M13)'],
    [/T5/, ['stage:T5'], 'assisted extraction from a tier-B source, structured values only'],
    [/survey-export/, ['stage:T4'], 'survey export → practitioner claim'],
  ];
  const routeCount = {};
  for (const n of nodes.values()) if (n.kind === 'claim' && n.status !== 'candidate') {
    const rb = n.claim.recorded_by || '';
    let route = 'other';
    for (const [re, targets, label] of RB) if (re.test(rb)) { route = targets[0]; for (const t of targets) link('provenance', t, n.id, 'derived', `claim.recorded_by = “${rb}”`, { rule: 'P-recorded-by', label }); break; }
    if (route === 'other' && n.claim.source_type === 'model') { route = 'placeholder'; link('rule', 'rule:R3', n.id, 'derived', `claim.recorded_by = “${rb}”, source_type model`, { rule: 'P-recorded-by', label: 'model placeholder' }); }
    if (route === 'other' && /derived/.test(rb)) route = 'derived';
    n.route = route; routeCount[route] = (routeCount[route] || 0) + 1;
  }

  // ---------------------------------------------------------------- rules → data (P-rule-predicate)
  const claimNodes = [...nodes.values()].filter(n => n.kind === 'claim' && n.status !== 'candidate');
  const pred = {
    R1: () => [...cells.values()].filter(c => new Set(c.sourced.map(x => x.source_id)).size >= 2).map(c => [c.id, `${c.sourced.length} claims from ${new Set(c.sourced.map(x => x.source_id)).size} sources, kept side by side`]),
    R2: () => claimNodes.filter(n => n.claim.source_type === 'practitioner' && (n.claim.practitioner_meta || {}).completeness === 'L0').map(n => [n.id, 'completeness L0 · citable: false']),
    R3: () => claimNodes.filter(n => n.claim.source_type === 'model').map(n => [n.id, `source_type model · confidence ${n.claim.confidence} · ${n.status}`]),
    R4: () => [['struct:claim', `${claimNodes.filter(n => n.claim.text).length} of ${claimNodes.length} claims carry a text rendering`]],
    R5: () => [['struct:source_priority', 'first key of the ranking'], ['tool:retrieve.py', 'implements the ranking'], ['struct:practitioner_meta', 'completeness is the third key']],
    R6: () => [['tool:retrieve.py', 'attribution strings'], ['struct:practitioner_meta', 'observer background is what gets attributed']],
    R7: () => [['tier:gate', 'hard filter before retrieval'], ['tier:compare', 'ranked semantically'], ['tier:extended', 'ranked semantically'], ['file:intent_map.json', 'plain-language terms → gates']],
    R8: () => [...plantIds.map(pid => [`plant:${pid}`, `respondent_roles ${JSON.stringify(plants[pid].entity.respondent_roles || [])} · raw_names ${JSON.stringify(plants[pid].entity.raw_names || [])}`]), ['file:synonyms.json', 'normalisation lives here']],
    R9: () => [...claimNodes.filter(n => n.claim.derived_from).map(n => [n.id, `derived_from ${n.claim.derived_from}`]), ['struct:value_kind', 'declares how a value is matched']],
    R10: () => [...claimNodes.filter(n => n.status === 'retired' && n.claim.retired_by).map(n => [n.id, `retired_by ${n.claim.retired_by}`]), ['tool:merge_claims.py', 'performs the retirement'], ['struct:status', 'status retired, never deleted']],
  };
  for (const [rid, fn] of Object.entries(pred)) if (nodes.has(`rule:${rid}`)) for (const [tgt, ev] of fn()) link('rule', `rule:${rid}`, tgt, 'derived', ev, { rule: 'P-rule-predicate', label: 'governs' });

  // ---------------------------------------------------------------- methods.md, principles.md, HANDOFF decisions (P-mention)
  const fieldNames = new Set(fieldList.map(f => f.field)); const sourceIds = new Set(Object.keys(sources));
  const mention = (fromId, text, file) => {
    const seen = new Set(); const hit = (id, label) => { if (nodes.has(id) && id !== fromId && !seen.has(id)) { seen.add(id); link('rule', fromId, id, 'recorded', `${file}: mentions ${label}`, { rule: 'P-mention', label: 'cites' }); } };
    for (const m of text.matchAll(RE.rule)) hit(`rule:R${m[1]}`, `R${m[1]}`);
    for (const m of text.matchAll(RE.method)) hit(`method:M${m[1]}`, `M${m[1]}`);
    for (const m of text.matchAll(RE.decision)) hit(`decision:D${m[1]}`, `D${m[1]}`);
    for (const m of text.matchAll(/§\s?(\d+)/g)) hit(`principle:${m[1]}`, `§${m[1]}`);
    for (const m of text.matchAll(RE.stage)) hit(`stage:T${m[1]}`, `T${m[1]}`);
    for (const m of text.matchAll(RE.tool)) hit(`tool:${m[1]}`, m[1]);
    for (const m of text.matchAll(/survey\s+([a-f]\d)|\b([a-f]\d)\s+(?:says|must|compared|verbatim|\()/g)) { const code = m[1] || m[2]; surveyNode(code); hit(`survey:${code}`, `survey ${code}`); }
    for (const f of fieldNames) if (new RegExp(`\\b${f}\\b`).test(text)) hit(`field:${f}`, f);
    for (const sid of sourceIds) if (!sid.startsWith('survey') && new RegExp(`\\b${sid}\\b`, 'i').test(text)) hit(`source:${sid}`, sid);
    if (/\bASPCA\b/.test(text)) hit('source:aspca', 'ASPCA'); if (/\bKPU\b/.test(text)) hit('source:kpu', 'KPU'); if (/\bCoV\b|City of Vancouver/.test(text)) hit('source:cov_trees', 'CoV');
  };
  for (const m of (docs.methods || '').matchAll(/^\*\*(M\d+a?)(?: · | — )([^*]+)\*\*(.*)$/gm)) {
    const id = m[1]; const title = m[2].trim(); const body = m[3].replace(/^\s*·\s*/, '').trim();
    const confirmed = /confirmed/i.test(title); const nid = confirmed ? `method:${id}-confirmed` : `method:${id}`;
    add({ id: nid, kind: 'method', mid: id, label: `${id}${confirmed ? ' ✓' : ''} · ${title}`, title, text: body, toConfirm: /to confirm/i.test(body), confirmed, file: 'methods.md', ref: id });
  }
  for (const n of [...nodes.values()].filter(x => x.kind === 'method')) mention(n.id, `${n.title} ${n.text}`, 'methods.md');
  for (const m of (docs.principles || '').matchAll(/^## (\d+)\. (.+)\n([\s\S]*?)(?=^## |\Z)/gm)) add({ id: `principle:${m[1]}`, kind: 'principle', num: +m[1], label: `§${m[1]} ${m[2].trim()}`, text: m[3].trim().slice(0, 900), file: 'principles.md', ref: `§${m[1]}` });
  for (const n of [...nodes.values()].filter(x => x.kind === 'principle')) mention(n.id, n.text, 'principles.md');
  // decisions table: rows "| Decision | Why |" in HANDOFF
  const decBlock = ((docs.handoff || '').split(/^\|\s*Decision\s*\|\s*Why\s*\|\s*$/m)[1] || '').split(/\n\s*\n/)[0];
  const rows = [...decBlock.matchAll(/^\|\s*(?!---)([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/gm)];
  rows.forEach((r, i) => {
    const dm = r[2].match(/\bD(\d)\b/); const id = dm ? `decision:D${dm[1]}` : `decision:row${i + 1}`;
    add({ id, kind: 'decision', did: dm ? `D${dm[1]}` : null, label: r[1].replace(/\*\*/g, '').trim(), why: r[2].trim(), file: 'HANDOFF.md', ref: 'decisions table' });
  });
  for (const n of [...nodes.values()].filter(x => x.kind === 'decision')) mention(n.id, `${n.label} ${n.why}`, 'HANDOFF.md');

  // ---------------------------------------------------------------- stats (all live)
  const allClaims = claimNodes.map(n => n.claim);
  const cellArr = [...cells.values()];
  const stats = {
    plants: plantIds.length, fields: fieldList.length, tiers: TIER_ORDER.filter(t => schema.field_tiers[t]).length,
    claims: allClaims.length, live: allClaims.filter(isLive).length, verified: allClaims.filter(c => c.status === 'verified').length, unverified: allClaims.filter(c => c.status === 'unverified').length, retired: allClaims.filter(c => c.status === 'retired').length, candidates: candidates.length,
    sources: [...nodes.values()].filter(n => n.kind === 'source' && n.sid !== 'candidate' && !n.parent && n.sid !== 'survey').length, sourcesWithClaims: new Set(allClaims.filter(isSourced).map(c => c.source_id)).size, respondents: [...nodes.values()].filter(n => n.kind === 'source' && n.parent).length,
    relations: relations.relations.length, relationsVerified: relations.relations.filter(r => r.status === 'verified').length,
    rules: (schema.rules || []).length, methods: [...nodes.values()].filter(n => n.kind === 'method' && !n.confirmed).length, methodsToConfirm: [...nodes.values()].filter(n => n.kind === 'method' && n.toConfirm).length, decisions: [...nodes.values()].filter(n => n.kind === 'decision').length, principles: [...nodes.values()].filter(n => n.kind === 'principle').length,
    cells: cellArr.length, cellsCovered: cellArr.filter(c => c.sourced.length).length, cellsVerifiedAny: cellArr.filter(c => c.verified.length).length, cellsGap: cellArr.filter(c => !c.sourced.length).length, cellsPlanned: cellArr.filter(c => !c.sourced.length && c.planned.length).length,
    stages: [...nodes.values()].filter(n => n.kind === 'stage').map(n => [n.tid, n.status]),
    routes: routeCount,
    links: links.length, linksByType: Object.fromEntries(Object.keys(LINK_TYPES).map(t => [t, links.filter(l => l.type === t).length])), linksByBasis: { recorded: links.filter(l => l.basis === 'recorded').length, derived: links.filter(l => l.basis === 'derived').length, candidate: links.filter(l => l.basis === 'candidate').length },
  };
  const byTier = {}; for (const t of TIER_ORDER) { const cs = cellArr.filter(c => c.tier === t); if (cs.length) byTier[t] = { cells: cs.length, covered: cs.filter(c => c.sourced.length).length, verified: cs.filter(c => c.verified.length).length }; }
  stats.byTier = byTier;

  // adjacency
  const adj = new Map(); for (const l of links) { (adj.get(l.source) || adj.set(l.source, []).get(l.source)).push(l); (adj.get(l.target) || adj.set(l.target, []).get(l.target)).push(l); }
  return { nodes, links, adj, cells, fieldList, plantIds, tiers, stats, TIER_ORDER };
}

export const geoLabel = g => GEO_LABEL[g] || g || '';
export { numeric };
