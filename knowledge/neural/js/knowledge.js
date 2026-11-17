// Knowledge layer for the v2 brain: how the claim store is *read*, not how it is stored.
// Everything here is derived from plants/*.json, sources.json, schema.json and relations.json at load time.
// Nothing is written back. The groupings and words below are representation choices, logged in methods.md (M22–M24).
import { fieldTiers } from './data.js';

// ---------------------------------------------------------------- knowledge domains (M22): schema fields grouped by the question they answer
export const DOMAINS = [
  { id: 'size',   label: 'Size & growth',          fields: ['mature_height', 'mature_spread', 'local_mature_size', 'growth_rate', 'time_to_intended_size', 'form', 'habit', 'texture'] },
  { id: 'site',   label: 'Site & climate',         fields: ['exposure', 'soil_type', 'water_drainage', 'hardiness_zone', 'photoperiod'] },
  { id: 'season', label: 'Seasons & appearance',   fields: ['seasonal_interest', 'appearance_by_age_season'] },
  { id: 'use',    label: 'Use & company',          fields: ['landscape_use', 'behaviour_with_others', 'invasive_status', 'in_vancouver_street_tree_list', 'local_availability'] },
  { id: 'care',   label: 'Care & risk',            fields: ['maintenance_level', 'pest_susceptibility', 'resistances', 'toxicity', 'long_term_performance'] },
  { id: 'eco',    label: 'Ecology & local record', fields: ['ecological_value', 'vancouver_context'] },
];
const FIELD_DOMAIN = {};
for (const d of DOMAINS) for (const f of d.fields) FIELD_DOMAIN[f] = d.id;
export const domainOf = f => FIELD_DOMAIN[f] || 'other';

export const GEO_LABEL = { vancouver: 'Vancouver', bc: 'BC', pnw: 'PNW', north_america: 'North America', global: 'global' };
export const GEO_RANK = { vancouver: 0, bc: 1, pnw: 2, north_america: 3, global: 4 };
export const isLive = c => c.status !== 'retired' && c.source_type !== 'model';
export const isSourced = c => isLive(c) && c.source_type !== 'candidate';

// ---------------------------------------------------------------- context parsing (M23): cultivar / growing condition / region, from the free-text context string
const REGION_PATTERNS = [
  [/UK growing conditions|\bUK\b/i, 'UK'],
  [/Willamette Valley/i, 'Willamette Valley, OR'],
  [/maritime Pacific Northwest/i, 'maritime PNW'],
  [/St\.? Louis/i, 'St. Louis, MO'],
  [/US-wide|United States/i, 'US-wide'],
  [/North Van|Metro Vancouver|Greater Vancouver|Vancouver|Burnaby|Richmond|Surrey|Lower Mainland/i, 'Vancouver'],
  [/\bBC\b|British Columbia/i, 'BC'],
  [/\bPNW\b|Pacific Northwest/i, 'PNW'],
];
const COND_RE = /\b(full sun|part(?:ial)? shade|part sun|filtered shade|deep shade|shade|sunny|sun|poor soil|good soil|rich soil|dry|moist|wet|once established|established|container|rooftop|coastal|inland|open sites?|understor(?:e)?y|exposed|sheltered|irrigated|unirrigated)\b/i;
const NOT_COND_RE = /difference|noted|derived|inferred|absence|profile|plant finder|landscape plants|great plant picks|atlas page|characteristics|snapshot|survey|respondent|inventory/i;

export function parseContext(c, source) {
  const ctx = c.context || '';
  const segs = ctx.split(';').map(s => s.trim()).filter(Boolean);
  let cultivar = null;
  const cm = ctx.match(/cultivar:\s*'?([^;']+?)'?\s*(?:;|$)/i);
  if (cm) cultivar = cm[1].trim();
  let condition = null;
  for (const s of segs) {
    if (/^cultivar/i.test(s) || NOT_COND_RE.test(s)) continue;
    if (s.length <= 40 && COND_RE.test(s)) { condition = s.replace(/^\s*(in|on|under)\s+/i, '').toLowerCase(); break; }   // a long sentence is a note, not a condition
  }
  if (!condition && c.source_type === 'candidate') {
    const sc = (c.practitioner_meta || {}).site_conditions; if (sc) condition = sc.toLowerCase();
  }
  let region = null;
  for (const [re, lab] of REGION_PATTERNS) if (re.test(ctx)) { region = lab; break; }
  if (!region && c.source_type === 'candidate') { const loc = (c.practitioner_meta || {}).location; if (loc) region = loc; }
  if (!region && source && source.geo_specificity) region = GEO_LABEL[source.geo_specificity] || source.geo_specificity;
  const subset = (c.value && typeof c.value === 'object' && !Array.isArray(c.value) && c.value.subset) || null;
  const species = !cultivar;
  const laneKey = cultivar ? `cv:${cultivar}` : condition ? `cond:${condition}` : 'none';
  const laneLabel = cultivar ? `‘${cultivar}’` : condition ? condition : 'condition not stated';
  return { cultivar, condition, region, subset, species, laneKey, laneLabel, raw: ctx };
}

// ---------------------------------------------------------------- numeric reading of a value
export function numeric(c) {
  const v = c.value;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const unit = v.unit || null;
  if (v.median !== undefined && typeof v.median === 'number') return { lo: v.p10 ?? v.median, hi: v.p90 ?? v.median, unit, kind: 'dist', median: v.median, n: v.n ?? null, max: v.max ?? null };
  if (v.min !== undefined && v.max !== undefined) return { lo: v.min, hi: v.max, unit, kind: 'range' };
  if (v.max !== undefined) return { lo: 0, hi: v.max, unit, kind: 'max' };
  if (v.min !== undefined) return { lo: v.min, hi: v.min, unit, kind: 'min' };
  if (v.height_m !== undefined) return { lo: v.height_m, hi: v.height_m, unit: 'm', kind: 'point' };
  if (v.spread_m !== undefined) return { lo: v.spread_m, hi: v.spread_m, unit: 'm', kind: 'point' };
  if (v.typical_max_m !== undefined) return { lo: 0, hi: v.typical_max_m, unit: 'm', kind: 'typical', occasional: v.occasional_max_m ?? null };
  return null;
}
export const interval = c => { const n = numeric(c); return n ? [n.lo, n.hi, n.unit || 'm'] : null; };
export const fmt = x => (x === null || x === undefined) ? '?' : Number.isInteger(x) ? String(x) : (Math.round(x * 100) / 100).toString();

// relation between two claims' values — words chosen so that variation is not called contradiction (M24)
export function relate(a, b, pa, pb) {
  const ia = interval(a), ib = interval(b);
  if (ia && ib && ia[2] === ib[2]) {
    const sameLane = pa.laneKey === pb.laneKey;
    const disjoint = ia[1] < ib[0] || ia[0] > ib[1];
    const within = ia[0] >= ib[0] && ia[1] <= ib[1];
    if (!disjoint) return { kind: sameLane ? 'agrees' : 'overlaps across conditions', cls: 'ok', detail: within ? `inside ${fmt(ib[0])}–${fmt(ib[1])}` : `overlaps ${fmt(ib[0])}–${fmt(ib[1])}` };
    const dir = ia[1] < ib[0] ? 'below' : 'above';
    if (sameLane) return { kind: `differs (${dir})`, cls: 'differ', detail: `${dir} ${fmt(ib[0])}–${fmt(ib[1])}, same stated condition` };
    return { kind: `${dir}, under a different condition`, cls: 'cond', detail: `${pb.laneLabel} vs ${pa.laneLabel}` };
  }
  if (Array.isArray(a.value) && Array.isArray(b.value)) {
    const inter = a.value.filter(x => b.value.includes(x));
    if (inter.length === a.value.length && inter.length === b.value.length) return { kind: 'same values', cls: 'ok', detail: inter.join(', ') };
    if (inter.length) return { kind: 'shares values', cls: 'ok', detail: inter.join(', ') };
    return { kind: 'no shared value', cls: 'differ', detail: `${a.value.join(', ')} vs ${b.value.join(', ')}` };
  }
  return { kind: 'not comparable', cls: 'na', detail: 'different value kinds' };
}

// ---------------------------------------------------------------- vocab order for categorical lenses
export const ORDINAL_FIELDS = new Set(['exposure', 'water_drainage', 'maintenance_level', 'invasive_status', 'growth_rate']);
const VOCAB_KEY = { exposure: 'kpu_exposure', soil_type: 'kpu_soil', landscape_use: 'kpu_landscape_use', texture: 'kpu_texture', form: 'kpu_form', habit: 'kpu_habit', resistances: 'resistances', pest_susceptibility: 'kpu_pest' };
export function vocabOrder(schema, field, present) {
  const key = VOCAB_KEY[field]; const voc = key && schema.vocab && Array.isArray(schema.vocab[key]) ? schema.vocab[key] : null;
  const seen = new Set(); const out = [];
  if (voc) for (const v of voc) if (present.has(v)) { out.push(v); seen.add(v); }
  for (const v of present) if (!seen.has(v)) out.push(v);
  return out;
}

// ---------------------------------------------------------------- build the knowledge model
export function buildKnowledge(db, candidates = []) {
  const { schema, sources, plants, relations } = db;
  const tiers = fieldTiers(schema);
  const SRC_PRIORITY = {}; schema.claim.fields.source_type.priority_order.forEach((s, i) => { SRC_PRIORITY[s] = i; });
  const rankKey = c => { const s = sources[c.source_id] || {}; return [SRC_PRIORITY[c.source_type] ?? 9, GEO_RANK[s.geo_specificity] ?? 9, -(c.confidence || 0)]; };
  const cmpR5 = (a, b) => { const ka = rankKey(a), kb = rankKey(b); for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i]; return 0; };

  const K = { plants: {}, domains: DOMAINS, sources: {}, relations: [], claims: new Map(), fieldIndex: new Map(), tiers, cmpR5, rankKey };

  const srcRec = sid => {
    if (!K.sources[sid]) { const s = sources[sid] || {}; K.sources[sid] = { id: sid, rec: s, type: sid === 'candidate' ? 'candidate' : (s.type || 'database'), claims: [], plants: new Set(), fields: new Set(), geo: s.geo_specificity || null, label: sid === 'candidate' ? 'you (candidate)' : shortSource(sid, s) }; }
    return K.sources[sid];
  };

  for (const [pid, p] of Object.entries(plants)) {
    const all = [...p.claims, ...candidates.filter(c => c.plant === pid)];
    const byField = {};
    for (const c of all) { (byField[c.field] = byField[c.field] || []).push(c); K.claims.set(c.id, c); }
    const P = { id: pid, entity: p.entity, fill_plan: p.fill_plan || {}, domains: [], fields: {}, claims: all, nSourced: 0, nVerified: 0, nCandidates: 0 };
    const domainFields = {}; for (const d of DOMAINS) domainFields[d.id] = [];
    // every schema field appears in its domain; fields outside the schema (custom) go to 'other'
    const schemaFields = Object.keys(tiers);
    const extra = Object.keys(byField).filter(f => !tiers[f]);
    for (const f of [...schemaFields, ...extra]) {
      const did = domainOf(f);
      if (!domainFields[did]) domainFields[did] = [];
      const cs = byField[f] || [];
      const F = fieldRecord(pid, f, cs, { sources, schema, cmpR5, tiers, fill_plan: P.fill_plan });
      P.fields[f] = F; K.fieldIndex.set(`${pid}:${f}`, F);
      domainFields[did].push(F);
      P.nSourced += F.sourced.length; P.nVerified += F.verified.length; P.nCandidates += F.candidates.length;
      for (const c of cs) { const S = srcRec(c.source_id); S.claims.push(c); S.plants.add(pid); S.fields.add(f); }
    }
    for (const d of [...DOMAINS, ...(domainFields.other && domainFields.other.length ? [{ id: 'other', label: 'Other', fields: [] }] : [])]) {
      const fs = domainFields[d.id] || [];
      const withClaims = fs.filter(F => F.sourced.length || F.candidates.length);
      const sourcedFs = fs.filter(F => F.sourced.length);
      const nSourced = fs.reduce((a, F) => a + F.sourced.length, 0);
      const nVerified = fs.reduce((a, F) => a + F.verified.length, 0);
      const types = {}; for (const F of fs) for (const c of F.sourced) types[c.source_type] = (types[c.source_type] || 0) + 1;
      const topType = Object.entries(types).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      const D = {
        id: d.id, pid, label: d.label, fields: fs, key: `${pid}:${d.id}`,
        coverage: fs.length ? sourcedFs.length / fs.length : 0, nFields: fs.length, nCovered: sourcedFs.length,
        nSourced, nVerified, verifiedShare: nSourced ? nVerified / nSourced : 0, topType,
        tension: fs.filter(F => F.differ).length,
        conditional: fs.filter(F => F.conditional).length,
        gaps: fs.filter(F => F.status === 'gap' && (F.tier === 'gate' || F.tier === 'extended' || F.planned.length)).length,
        hasCandidate: fs.some(F => F.candidates.length > 0),
        hasLocal: fs.some(F => F.hasLocal),
        withClaims,
      };
      P.domains.push(D);
    }
    K.plants[pid] = P;
  }

  for (const r of relations.relations) {
    if (!K.plants[r.plant_a] || !K.plants[r.plant_b]) continue;
    K.relations.push(r);
  }
  return K;
}

export function shortSource(sid, s) {
  if (!s) return sid;
  if (s.parent) return `${s.parent} respondent ${sid.replace(/^.*-r/, '')}`;
  const name = (s.name || sid).split(' — ')[0].split(' (')[0].split(':')[0];
  const SHORT = { rhs: 'RHS', mobot: 'Missouri BG', gpp: 'Great Plant Picks', osu: 'Oregon State', eflora: 'E-Flora BC', usda_plants: 'USDA PLANTS', cov_trees: 'City of Vancouver trees', inat: 'iNaturalist', iscbc: 'ISC BC', kpu: 'KPU', aspca: 'ASPCA', growgreen: 'Grow Green', pojar: 'Pojar & MacKinnon', nats: 'NATS Nursery', model: 'model placeholder' };
  return SHORT[sid] || name;
}

function fieldRecord(pid, f, cs, { sources, schema, cmpR5, tiers, fill_plan }) {
  const live = cs.filter(isLive);
  const sourced = cs.filter(isSourced).sort(cmpR5);
  const candidates = cs.filter(c => c.source_type === 'candidate');
  const retired = cs.filter(c => !isLive(c));
  const verified = sourced.filter(c => c.status === 'verified');
  const parsed = new Map(); for (const c of cs) parsed.set(c.id, parseContext(c, sources[c.source_id]));
  const srcSet = new Set(sourced.map(c => c.source_id));
  const tier = tiers[f] || 'custom';
  const planned = []; for (const t of ['gate', 'compare', 'extended']) { const fp = fill_plan[t] || {}; if (fp[f]) planned.push(...fp[f]); }
  const hasLocal = sourced.some(c => { const g = (sources[c.source_id] || {}).geo_specificity; return g === 'vancouver' || g === 'bc'; });

  // lens type by value shape (M24)
  const numericCs = [...sourced, ...candidates].filter(c => numeric(c));
  const listCs = [...sourced, ...candidates].filter(c => Array.isArray(c.value));
  let lens = 'notes', unit = null;
  if (numericCs.length) {
    const units = {}; for (const c of numericCs) { const u = numeric(c).unit || 'm'; units[u] = (units[u] || 0) + 1; }
    unit = Object.entries(units).sort((a, b) => b[1] - a[1])[0][0]; lens = 'ruler';
  } else if (listCs.length) lens = 'spectrum';

  // lanes (context classes) over sourced + candidate claims
  const lanes = new Map();
  for (const c of [...sourced, ...candidates]) {
    const p = parsed.get(c.id); const key = p.laneKey;
    if (!lanes.has(key)) lanes.set(key, { key, label: p.laneLabel, kind: p.cultivar ? 'cultivar' : p.condition ? 'condition' : 'none', claims: [] });
    lanes.get(key).claims.push(c);
  }
  const laneList = [...lanes.values()].sort((a, b) => ({ none: 0, condition: 1, cultivar: 2 }[a.kind] - { none: 0, condition: 1, cultivar: 2 }[b.kind]) || a.label.localeCompare(b.label));

  // status word (M24): two independent flags — `differ` (non-overlapping values under the same stated condition) and
  // `conditional` (non-overlapping values under different stated conditions). The word shows the first; both are drawn.
  let status, outliers = []; const differPairs = [], condPairs = []; let differ = false, conditional = false;
  if (!sourced.length) status = 'gap';
  else if (sourced.length === 1) status = 'single source';
  else if (lens === 'ruler') {
    let any = false;
    const num = sourced.filter(c => numeric(c) && (numeric(c).unit || 'm') === unit);
    for (let i = 0; i < num.length; i++) for (let j = i + 1; j < num.length; j++) {
      const a = num[i], b = num[j]; const r = relate(a, b, parsed.get(a.id), parsed.get(b.id)); any = true;
      if (r.cls === 'differ') { differ = true; differPairs.push([a, b]); } else if (r.cls === 'cond') { conditional = true; condPairs.push([a, b]); }
    }
    status = differ ? 'values differ' : conditional ? 'varies with conditions' : any ? 'sources agree' : 'several readings';
  } else if (lens === 'spectrum') {
    const lists = sourced.filter(c => Array.isArray(c.value));
    // PROPOSALS (a) rule 4: on ordinal vocabularies a pair of sources sharing no value is a disagreement;
    // on open lists (landscape_use, soil_type, …) only a source that shares nothing with *anyone* counts
    if (ORDINAL_FIELDS.has(f)) {
      for (let i = 0; i < lists.length; i++) for (let j = i + 1; j < lists.length; j++) { const a = lists[i], b = lists[j]; if (!a.value.some(v => b.value.includes(v))) { differ = true; differPairs.push([a, b]); if (!outliers.includes(a)) outliers.push(a); if (!outliers.includes(b)) outliers.push(b); } }
      if (differ) { const cnt = new Map(); for (const [a, b] of differPairs) { cnt.set(a, (cnt.get(a) || 0) + 1); cnt.set(b, (cnt.get(b) || 0) + 1); } outliers = [...cnt.entries()].sort((x, y) => y[1] - x[1]).filter(([, n], i, arr) => n === arr[0][1]).map(([c]) => c); }
    } else {
      for (const c of lists) { const others = lists.filter(o => o !== c); if (others.length && !others.some(o => o.value.some(v => c.value.includes(v)))) outliers.push(c); }
      differ = outliers.length > 0;
    }
    status = differ ? 'values differ' : lists.length >= 2 ? 'sources agree' : 'several readings';
  } else status = 'several readings';

  const top = sourced[0] || null;
  const types = {}; for (const c of sourced) types[c.source_type] = (types[c.source_type] || 0) + 1;
  return {
    pid, field: f, key: `${pid}:${f}`, label: f.replace(/_/g, ' '), tier, def: fieldDefOf(schema, f),
    claims: cs, live, sourced, candidates, retired, verified, parsed, lanes: laneList, lens, unit,
    status, outliers, differ, conditional, differPairs, condPairs, nSources: srcSet.size, verifiedShare: sourced.length ? verified.length / sourced.length : 0,
    topType: top ? top.source_type : (candidates.length ? 'candidate' : null), types, planned, hasLocal,
    domain: domainOf(f),
  };
}
function fieldDefOf(schema, f) { for (const t of Object.values(schema.field_tiers)) if (t.fields && t.fields[f]) return t.fields[f]; return null; }

// ---------------------------------------------------------------- "continue exploring": data-derived next steps
export function suggestions(K, view) {
  const out = [];
  const P = view.pid ? K.plants[view.pid] : null;
  const F = (view.pid && view.field) ? P.fields[view.field] : null;
  const push = (s) => { if (out.length < 6 && !out.some(o => o.key === s.key)) out.push(s); };
  const othersWithField = f => Object.values(K.plants).filter(p => p.id !== view.pid && p.fields[f] && p.fields[f].sourced.length);

  if (view.level === 'field' || view.level === 'claim') {
    if (F.lanes.some(l => l.kind === 'condition')) {
      for (const g of ['exposure', 'soil_type', 'water_drainage']) {
        const G = P.fields[g]; if (G && G.sourced.length && g !== F.field) { push({ key: `f:${g}`, text: `Values here split by growing condition — see how the ${G.nSources} sources rate ${G.label}`, why: G.status, go: { level: 'field', pid: P.id, field: g } }); break; }
      }
    }
    if (F.lanes.some(l => l.kind === 'cultivar') && P.fields.local_mature_size && P.fields.local_mature_size.sourced.length && F.field !== 'local_mature_size') push({ key: 'f:local', text: `Cultivars differ in the literature — compare with measured sizes per cultivar in Vancouver`, why: `${P.fields.local_mature_size.sourced.length} verified records`, go: { level: 'field', pid: P.id, field: 'local_mature_size' } });
    if (F.field === 'local_mature_size' && P.fields.mature_height && P.fields.mature_height.sourced.length) push({ key: 'f:mh', text: `Back to what the literature says the mature height is`, why: P.fields.mature_height.status, go: { level: 'field', pid: P.id, field: 'mature_height' } });
    for (const o of othersWithField(F.field).slice(0, 2)) push({ key: `p:${o.id}`, text: `Same question for ${o.entity.scientific_name}`, why: `${o.fields[F.field].nSources} sources · ${o.fields[F.field].status}`, go: { level: 'field', pid: o.id, field: F.field } });
    const srcs = [...new Set(F.sourced.map(c => c.source_id))].slice(0, 2);
    for (const sid of srcs) { const S = K.sources[sid]; if (S) push({ key: `s:${sid}`, text: `Follow ${S.label} through the whole store`, why: `${S.claims.filter(isSourced).length} claims on ${S.plants.size} plant${S.plants.size === 1 ? '' : 's'}`, go: { level: 'source', sid } }); }
    if (!F.hasLocal && !F.candidates.length) push({ key: 'grow', text: `No Vancouver-scale evidence on this field yet — add an observation`, why: 'becomes a candidate, never written to the db', go: { level: 'grow', pid: P.id, field: F.field } });
  }
  if (view.level === 'domain') {
    const D = P.domains.find(d => d.id === view.did);
    for (const f of D.fields.filter(x => x.status === 'values differ' || x.status === 'varies with conditions')) push({ key: `f:${f.field}`, text: `Open ${f.label}`, why: f.status, go: { level: 'field', pid: P.id, field: f.field } });
    for (const f of D.fields.filter(x => x.status === 'gap' && x.planned.length).slice(0, 2)) push({ key: `g:${f.field}`, text: `Gap: ${f.label} has no sourced claim`, why: `planned sources: ${f.planned.join(', ')}`, go: { level: 'field', pid: P.id, field: f.field } });
    for (const f of D.fields.filter(x => x.verified.length).slice(0, 1)) push({ key: `v:${f.field}`, text: `Verified evidence here: ${f.label}`, why: `${f.verified.length} verified`, go: { level: 'field', pid: P.id, field: f.field } });
  }
  if (view.level === 'plant') {
    const tense = P.domains.filter(d => d.tension || d.conditional).sort((a, b) => (b.tension + b.conditional) - (a.tension + a.conditional));
    for (const d of tense.slice(0, 2)) push({ key: `d:${d.id}`, text: `${d.label}: ${d.tension ? `${d.tension} field${d.tension === 1 ? '' : 's'} where values differ` : ''}${d.tension && d.conditional ? ', ' : ''}${d.conditional ? `${d.conditional} that var${d.conditional === 1 ? 'ies' : 'y'} with conditions` : ''}`, why: `${d.nCovered}/${d.nFields} fields sourced`, go: { level: 'domain', pid: P.id, did: d.id } });
    const thin = P.domains.filter(d => d.coverage < 0.5).sort((a, b) => a.coverage - b.coverage)[0];
    if (thin) push({ key: `d:${thin.id}`, text: `${thin.label} is thin: ${thin.nCovered} of ${thin.nFields} fields have a source`, why: 'where the store is weakest', go: { level: 'domain', pid: P.id, did: thin.id } });
    const rels = K.relations.filter(r => r.plant_a === P.id || r.plant_b === P.id);
    if (rels.length) push({ key: 'rels', text: `${rels.length} recorded relation${rels.length === 1 ? '' : 's'} to the other plants`, why: `${rels.filter(r => r.status === 'verified').length} verified`, go: { level: 'relations', pid: P.id } });
  }
  if (view.level === 'source') {
    const S = K.sources[view.sid];
    for (const pid of [...S.plants].slice(0, 3)) { const n = S.claims.filter(c => c.plant === pid && isSourced(c)).length; push({ key: `p:${pid}`, text: `What ${S.label} says about ${K.plants[pid].entity.scientific_name}`, why: `${n} claims`, go: { level: 'plant', pid } }); }
  }
  if (view.level === 'cosmos') {
    for (const P2 of Object.values(K.plants)) {
      const d = P2.domains.filter(x => x.tension || x.conditional).sort((a, b) => (b.tension + b.conditional) - (a.tension + a.conditional))[0];
      if (d) push({ key: `pd:${P2.id}`, text: `${P2.entity.scientific_name}: ${d.label}`, why: d.tension ? 'sources give different values' : 'values change with site conditions', go: { level: 'domain', pid: P2.id, did: d.id } });
    }
  }
  return out;
}

// ---------------------------------------------------------------- AI use index: which claims the retrieval preview cites in the eval test queries
export function buildUseIndex(retr, queries) {
  const cited = new Map(); const withheld = new Map(); const results = [];
  for (const q of queries.queries || []) {
    const r = retr.run(q.query); results.push({ q, r });
    r.ranked.forEach((c, i) => { if (!cited.has(c.id)) cited.set(c.id, []); cited.get(c.id).push({ qid: q.id, rank: i + 1, query: q.query, status: q.status }); });
    for (const c of r.withheld) { if (!withheld.has(c.id)) withheld.set(c.id, []); withheld.get(c.id).push({ qid: q.id, query: q.query }); }
  }
  return { cited, withheld, results, n: (queries.queries || []).length };
}
