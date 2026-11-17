// Graph model: plants → fields → claims → sources, plus plant–plant relations.
// Every node and link maps to a record in the db (or to a candidate the user typed this session).
import { fieldTiers } from './data.js';

export const TYPE_COLOUR = {
  practitioner: '#ffa94d',
  database: '#5ad1ff',
  literature: '#b48cff',
  municipal: '#6ff2b0',
  model: '#6d7384',
  candidate: '#ff5fb4',
  plant: '#fff1c2',
  gap: '#3a4160',
};

export const GEO_RANK = { vancouver: 0, bc: 1, pnw: 2, north_america: 3, global: 4 };

export function summariseValue(c) {
  const v = c.value;
  if (v === null || v === undefined) return '—';
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return v.join(', ');
  const u = v.unit ? ` ${v.unit}` : '';
  if (v.min !== undefined && v.max !== undefined) return `${v.min}–${v.max}${u}`;
  if (v.max !== undefined && v.min === undefined) return `≤ ${v.max}${u}`;
  if (v.min !== undefined) return `≥ ${v.min}${u}`;
  if (v.height_m !== undefined) return `${v.height_m} m`;
  if (v.spread_m !== undefined) return `${v.spread_m} m`;
  if (v.typical_max_m !== undefined) return `to ${v.typical_max_m} m (occ. ${v.occasional_max_m ?? '?'})`;
  if (v.median !== undefined) return `median ${v.median}${u} (n=${v.n})`;
  if (v.n !== undefined && v.count === undefined) return `n=${v.n}`;
  if (v.count !== undefined) return `count ${v.count}`;
  if (v.rating !== undefined) return `${v.rating}${u}`;
  if (v.usda_rating !== undefined) return `USDA: ${v.usda_rating}`;
  const keys = Object.keys(v);
  if (keys.length <= 3) return keys.map(k => `${k}: ${Array.isArray(v[k]) ? v[k].join(', ') : (typeof v[k] === 'object' && v[k] !== null ? JSON.stringify(v[k]) : v[k])}`).join(' · ');
  return keys.slice(0, 3).map(k => `${k}: ${typeof v[k] === 'object' ? '…' : v[k]}`).join(' · ') + ' …';
}

export function shortContext(ctx) {
  if (!ctx) return '';
  const m = ctx.match(/cultivar:\s*'?([^;']+)'?/);
  if (m) return `'${m[1].trim()}'`;
  const segs = ctx.split(';').map(x => x.trim()).filter(Boolean);
  // prefer the segment that carries a growing condition — that is what separates one source's two values (M15)
  const cond = segs.find(x => /sun|shade|soil|established|dbh|subset|derived|inferred|absence/i.test(x) && !/plant profile|landscape plants|plant finder|great plant picks|atlas page|characteristics/i.test(x));
  const pick = cond || segs[0];
  return pick.length > 46 ? pick.slice(0, 44) + '…' : pick;
}

export function buildModel(db, candidates = []) {
  const { schema, sources, relations, plants } = db;
  const tiers = fieldTiers(schema);
  const nodes = new Map(); const links = [];
  const add = n => { nodes.set(n.id, n); return n; };
  const isLive = c => c.status !== 'retired' && c.source_type !== 'model';
  const SRC_PRIORITY = {}; schema.claim.fields.source_type.priority_order.forEach((s, i) => { SRC_PRIORITY[s] = i; });
  const rankKey = c => { const s = sources[c.source_id] || {}; return [SRC_PRIORITY[c.source_type] ?? 9, GEO_RANK[s.geo_specificity] ?? 9, -(c.confidence || 0)]; };
  const cmp = (a, b) => { const ka = rankKey(a), kb = rankKey(b); for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i]; return 0; };

  // sources actually used by claims (+ candidate pseudo-source when candidates exist)
  const sourceNodes = {};
  const sourceNode = (sid, type) => {
    const id = `source:${sid}`;
    if (!nodes.has(id)) {
      const s = sources[sid] || {};
      sourceNodes[sid] = add({ id, kind: 'source', sid, source: s, type: type || s.type || 'database', label: sid === 'candidate' ? 'you (candidate)' : (s.parent ? `${sid} (${s.parent})` : sid), claims: [], tier: s.licence_tier || null });
    }
    return nodes.get(id);
  };

  for (const [pid, p] of Object.entries(plants)) {
    const all = [...p.claims, ...candidates.filter(c => c.plant === pid)];
    const plant = add({ id: `plant:${pid}`, kind: 'plant', pid, entity: p.entity, label: p.entity.scientific_name, claims: all, fields: [], fill_plan: p.fill_plan });
    const byField = {};
    for (const c of all) (byField[c.field] = byField[c.field] || []).push(c);
    // fields in schema order; gate + extended fields drawn even when empty (gap rings); compare only when ≥1 claim
    for (const [tier, t] of Object.entries(schema.field_tiers)) {
      for (const f of Object.keys(t.fields || {})) {
        const cs = byField[f] || [];
        if (!cs.length && tier === 'compare') continue;
        if (!cs.length && tier === 'custom') continue;
        const liveCs = cs.filter(isLive);
        const sourced = liveCs.filter(c => c.source_type !== 'candidate');
        const verified = sourced.filter(c => c.status === 'verified').length;
        const srcSet = new Set(sourced.map(c => c.source_id));
        const top = [...sourced].sort(cmp)[0];
        const fn = add({
          id: `field:${pid}:${f}`, kind: 'field', pid, field: f, tier, plant: plant,
          claims: cs, live: liveCs, sourced, gap: sourced.length === 0,
          verifiedShare: sourced.length ? verified / sourced.length : 0,
          nSources: srcSet.size, topType: top ? top.source_type : (liveCs.length ? 'candidate' : 'gap'),
          label: f.replace(/_/g, ' '),
          disagreement: sourced.filter(c => c.value_kind !== 'qualitative').length >= 2 && srcSet.size >= 2,
        });
        plant.fields.push(fn);
        links.push({ id: `pf:${fn.id}`, kind: 'pf', source: plant.id, target: fn.id, sid: plant.id, tid: fn.id });
        for (const c of cs) {
          const cn = add({ id: `claim:${c.id}`, kind: 'claim', pid, field: f, claim: c, fieldNode: fn, live: isLive(c), label: summariseValue(c), ctx: shortContext(c.context) });
          const sn = sourceNode(c.source_id, c.source_type); sn.claims.push(c);
          links.push({ id: `fc:${cn.id}`, kind: 'fc', source: fn.id, target: cn.id, sid: fn.id, tid: cn.id, claim: c });
          links.push({ id: `cs:${cn.id}`, kind: 'cs', source: cn.id, target: sn.id, sid: cn.id, tid: sn.id, claim: c });
        }
      }
    }
  }

  // relations: plant–plant links; several per pair → curvature spreads them
  const pairCount = {};
  for (const r of relations.relations) {
    const a = `plant:${r.plant_a}`, b = `plant:${r.plant_b}`;
    if (!nodes.has(a) || !nodes.has(b)) continue;
    const key = [a, b].sort().join('|'); pairCount[key] = (pairCount[key] || 0);
    const idx = pairCount[key]++;
    links.push({ id: `rel:${r.id}`, kind: 'rel', source: a, target: b, sid: a, tid: b, relation: r, curve: 0.25 + idx * 0.22, type: r.source_type, retired: r.status === 'retired' });
  }

  return { nodes, links, tiers, sourceNodes };
}
