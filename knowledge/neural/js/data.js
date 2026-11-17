// Read-only loader for the Planting Intelligence db. Nothing here writes.
// Served from the planting-db root (python3 -m http.server), so `..` is the db.

const ROOT = '../../data/db';

async function getJson(path) {
  const r = await fetch(`${ROOT}/${path}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

export async function loadDb() {
  const [schema, sourcesFile, synonyms, intent, relations, queries, ontology] = await Promise.all([
    getJson('schema.json'),
    getJson('sources.json'),
    getJson('synonyms.json'),
    getJson('intent_map.json'),
    getJson('relations.json'),
    getJson('eval/queries.json'),
    getJson('ontology.json').catch(() => null),
  ]);
  // which plants exist is read from synonyms.json (in_db: true), not hard-coded
  const ids = synonyms.entries.filter(e => e.in_db).map(e => e.id);
  const plantFiles = await Promise.all(ids.map(id => getJson(`plants/${id}.json`)));
  const plants = {};
  for (const p of plantFiles) plants[p.entity.id] = p;
  const sources = {};
  for (const s of sourcesFile.sources) sources[s.id] = s;
  return { schema, sources, sourcesFile, synonyms, intent, relations, queries, plants, plantIds: ids, ontology };
}

// Markdown documents that hold rules of the project outside the JSON (methods, principles, handoff, readme).
// Read as text; brain/js/projection.js parses them into a read-only projection.
export async function loadDocs() {
  const get = async p => { const r = await fetch(`${ROOT}/${p}`, { cache: 'no-store' }); return r.ok ? r.text() : ''; };
  const [methods, principles, handoff, readme, proposals] = await Promise.all([get('methods.md'), get('principles.md'), get('HANDOFF.md'), get('README.md'), get('PROPOSALS.md')]);
  return { methods, principles, handoff, readme, proposals };
}

// field → tier name, from schema.field_tiers
export function fieldTiers(schema) {
  const out = {};
  for (const [tier, t] of Object.entries(schema.field_tiers)) {
    for (const f of Object.keys(t.fields || {})) out[f] = tier;
  }
  return out;
}

export function fieldDef(schema, field) {
  for (const t of Object.values(schema.field_tiers)) {
    if (t.fields && t.fields[field]) return t.fields[field];
  }
  return null;
}
