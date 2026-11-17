// OFFLINE INTERPRETER (rule parser). The language layer of the workspace when no language model is configured. Every rule is
// listed here so a reader can see exactly what it understands; everything it produces carries provenance 'offline-parser' and the
// matched text as evidence. It never asserts a plant fact: it turns language into site facts, intentions and typed edit commands
// that the engine checks. A live model, when configured (tools/design_server.py), must return the same structures.
import { sideRegion, DIRECTIONS } from './geom.js';

const DIR = '(north|south|east|west|right|left|back|rear|front|top|bottom|middle|centre|center)';
const SIDE_WORD = { back: 'north', rear: 'north', front: 'south', top: 'north', bottom: 'south' };
export const RULES = {
  site_facts: [
    { id: 'dimensions', pattern: /(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?\b/i, make: m => ({ kind: 'dimensions', w: +m[1], h: +m[2] }), says: m => `site stated as ${m[1]} × ${m[2]} m` },
    { id: 'existing-tree', pattern: /\b(?:an? |the )?(?:old |big |large |mature |existing )?tree\b(?:[^.]*?\b(?:on|at|in|along|near)\s+the\s+)?(north[- ]?west|north[- ]?east|south[- ]?west|south[- ]?east|north|south|east|west|right|left|back|front|middle|centre|center)?/i, make: m => { const w = m[1] ? m[1].toLowerCase().replace(/[- ]/g, '') : null; const corner = w && /^(north|south)(east|west)$/.test(w) ? w : null; return { kind: 'existing-tree', side: corner ? corner.replace(/east|west/, '') : w ? (SIDE_WORD[w] || w) : null, side_word: w, ...(corner ? { corner } : {}) }; }, says: m => `an existing tree${m[1] ? (/(east|west)$/i.test(m[1]) && /^(north|south)/i.test(m[1]) ? ` in the ${m[1]} corner` : ` on the ${m[1]} side`) : ''} — its species and canopy size are unknown until stated` },
    { id: 'open-centre', pattern: /\b(kids?|children|play(?:ing)?|lawn|patio|seating|keep (?:the )?(?:middle|centre|center) open|open (?:middle|centre|center|space))\b/i, make: m => ({ kind: 'no-plant-zone', where: 'centre', reason: m[1], where_status: /middle|centre|center/i.test(m[0]) || /\b(middle|centre|center)\b/i.test(m.input) ? 'user-stated' : 'suggested' }), says: m => `an open space in the middle (${m[1]}) — kept open at your request, so no bed goes there` },
    { id: 'light', pattern: /\b(full sun|sunny|shady|shade|north[- ]facing|south[- ]facing|part(?:ial)?[- ]shade)\b/i, make: m => ({ kind: 'condition', key: 'light', value: /full sun|sunny|south/i.test(m[1]) ? 'full-sun' : /part/i.test(m[1]) ? 'part-shade' : /north/i.test(m[1]) ? 'part-shade' : 'shade', status: 'user-stated' }), says: m => `light stated: ${m[1]}` },
    { id: 'soil', pattern: /\b(clay|sandy|gravelly|well[- ]drained|poorly[- ]drained|boggy|waterlogged|acidic|alkaline)\b/i, make: m => ({ kind: 'condition', key: /drained|boggy|waterlogged/i.test(m[1]) ? 'soil_drainage' : 'soil_type', value: m[1].toLowerCase().replace(' ', '-'), status: 'user-stated' }), says: m => `soil stated: ${m[1]}` },
    { id: 'water', pattern: /\b(dry site|dry soil|moist|wet site|damp|zero watering|no watering|without watering|never water)\b/i, make: m => ({ kind: 'condition', key: 'water', value: /dry|zero|no |without|never/i.test(m[1]) ? 'dry' : /wet|damp/i.test(m[1]) ? 'wet' : 'moist', status: 'user-stated' }), says: m => `water stated: ${m[1]}` },
    { id: 'size-word', pattern: /\b(small|tiny|large|big)\s+(backyard|back yard|garden|yard|site|lot)\b/i, make: m => ({ kind: 'size_word', value: m[1].toLowerCase() }), says: m => `a ${m[1]} ${m[2]} — no dimensions yet` },
    { id: 'address', pattern: /\b\d{2,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Way|Blvd|Cres|Crescent)\b/, make: m => ({ kind: 'address', text: m[0] }), says: m => `address noted as a reference only (no geocoding service is connected)` },
  ],
  values: [
    { id: 'privacy', pattern: /\b(privacy|private|screen(?:ing)?|hide|block (?:the )?view|neighbou?rs?|secluded|enclos\w+)\b/i, value: 'privacy' },
    { id: 'low_maintenance', pattern: /\b(low[- ]maintenance|easy[- ]care|little (?:up)?keep|minimal (?:maintenance|care)|not much work)\b/i, value: 'maintenance_low' },
    { id: 'ecology', pattern: /\b(ecolog\w+|habitat|wildlife|pollinators?|bees?|birds?|biodivers\w+|native plants?)\b/i, value: 'ecology' },
    { id: 'openness', pattern: /\b(open(?:ness)?|not (?:feel )?(?:closed|enclosed|dark)|airy|light and open|keep (?:it )?light|views?)\b/i, value: 'openness' },
    { id: 'seasonal', pattern: /\b(seasonal|colou?r|autumn|fall colou?r|winter interest|evergreen|year[- ]round)\b/i, value: 'seasonal_interest' },
    { id: 'quiet', pattern: /\b(quiet|calm|sheltered|cosy|cozy|retreat)\b/i, value: 'shelter' },
    { id: 'cost', pattern: /\b(budget|cheap|afford\w*|\$\s?\d+|under \d+|cost)\b/i, value: 'cost_awareness' },
  ],
  edits: [
    { id: 'reduce_density', pattern: /\b(too dense|too crowded|too busy|too much|too many|thin (?:it |this |them )?out|fewer|less dense|lighter|sparser|open (?:it|this) up|reduce)\b/i, op: 'reduce_density' },
    { id: 'increase_density', pattern: /\b(denser|more dense|fill (?:it |this )?in|more plants|thicker|fuller|add more|too sparse|too empty|too thin)\b/i, op: 'increase_density' },
    { id: 'remove_species', pattern: /\b(remove|take out|get rid of|no more|delete|without)\s+(?:the |all |any )?([a-z][a-z\- ]{2,40}?)(?=\b(?:here|there|from|in|on|at|,|\.|$))/i, op: 'remove_species' },
    { id: 'swap_species', pattern: /\b(replace|swap)\s+(?:the |all )?([a-z][a-z\- ]{2,40}?)\s+(?:with|for|by)\s+(?:the |some )?([a-z][a-z\- ]{2,40}?)(?=\b(?:here|there|,|\.|$))/i, op: 'swap_species' },
    { id: 'move_away', pattern: /\bmove\s+(?:the\s+)?(taller|tall|big|large|low|small|evergreen|deciduous|[a-z\- ]{3,30}?)\s*(?:plants?|shrubs?|ones?)?\s+(?:away from|off|back from)\s+(?:the\s+)?([a-z\- ]{3,30}?)(?=\b(?:on|at|in|,|\.|$))/i, op: 'move_away' },
    { id: 'fill_tall', pattern: /\bfill\b[^.]*\b(tall trees|trees|big shrubs)\b/i, op: 'fill_with_tall' },
  ],
  preserve: [
    { id: 'preserve_privacy', pattern: /\b(keep|preserve|retain|maintain|but (?:still )?(?:want|need)|don'?t lose|without losing)\b[^.]*?\b(privacy|screen(?:ing)?|private|hidden|enclosure)\b/i, what: 'z:screen' },
    { id: 'preserve_open', pattern: /\b(keep|preserve|retain|don'?t change|maintain)\b[^.]*?\b(open (?:space|middle|centre|center|area)|clear(?:ance)?|play zone|lawn)\b/i, what: 'open-zone' },
    { id: 'preserve_tree', pattern: /\b(keep|preserve|protect|save)\b[^.]*?\btree\b/i, what: 'existing-tree' },
    { id: 'preserve_light', pattern: /\b(keep|preserve|retain)\b[^.]*?\b(light|sun|afternoon sun|brightness)\b/i, what: 'light' },
  ],
  amounts: [
    { pattern: /\b(much|a lot|far|way|very|half)\b/i, value: 0.4 }, { pattern: /\b(a bit|slightly|a little|somewhat|touch)\b/i, value: 0.15 },
    { pattern: /(\d{1,2})\s?%/, value: m => Math.min(.9, +m[1] / 100) },
  ],
  // Level 2 · planting-bed edits (Shape stage): each resolves to a typed request the spatial engine previews before anything changes
  bed_edits: [
    { id: 'bed_add', pattern: /\b(add|put|create|make)\s+(?:a\s+|another\s+|one more\s+)?(?:new\s+|small\s+|narrow\s+|wide\s+)?(?:planting\s+)?(bed|border|strip|band)\s+(?:along|on|at|by|against|next to)\s+(?:the\s+)?(north|south|east|west|left|right|back|rear|front|top|bottom)(?:\s+(?:edge|side|fence|wall|boundary))?/i, op: 'add' },
    { id: 'bed_resize', pattern: /\b(?:make|let|have)?\s*(?:the\s+)?(north|south|east|west|left|right|back|rear|front|top|bottom|centre|center|middle|tree)?\s*(?:planting\s+|tree\s+)?(bed|island|border|strip|band)(?:\s+(?:\d+|[a-z]+))?\s+(?:a\s+(?:bit|little)\s+|much\s+|far\s+)?(wider|narrower|bigger|larger|smaller|deeper|shallower|thinner|longer|shorter)(?:\s+by\s+(\d+(?:\.\d+)?)\s*(m|metres?|meters?|cm))?/i, op: 'resize' },
    { id: 'bed_resize_verb', pattern: /\b(widen|narrow|enlarge|expand|extend|shrink|reduce|grow)\s+(?:the\s+|(?=(?:north|south|east|west|left|right|back|rear|front|top|bottom|centre|center|middle|tree)\b))(north|south|east|west|left|right|back|rear|front|top|bottom|centre|center|middle|tree)?\s*(?:planting\s+|tree\s+)?(bed|island|border|strip|band)(?:\s+by\s+(\d+(?:\.\d+)?)\s*(m|metres?|meters?|cm))?/i, op: 'resize_verb' },
    { id: 'bed_delete', pattern: /\b(remove|delete|drop|get rid of|take away)\s+(?:the\s+)?(north|south|east|west|left|right|back|rear|front|top|bottom|centre|center|middle|tree)?\s*(?:planting\s+|tree\s+)?(bed|island|border|strip|band)\b/i, op: 'delete' },
    { id: 'bed_move', pattern: /\b(move|shift|push|pull)\s+(?:the\s+)?(north|south|east|west|left|right|back|rear|front|top|bottom|centre|center|middle|tree)?\s*(?:planting\s+|tree\s+)?(bed|island|border|strip|band)\s+(?:(?:to|towards?)\s+(?:the\s+)?)?(north|south|east|west|left|right|up|down|inwards?|outwards?|away from the tree|towards? the (?:fence|edge|boundary))(?:\s+by\s+(\d+(?:\.\d+)?)\s*(m|metres?|meters?|cm))?/i, op: 'move' },
    { id: 'open_resize', pattern: /\b(?:make|keep|leave)\s+(?:the\s+)?(open\s+(?:area|centre|center|middle|space|ground|lawn)|lawn|play\s+(?:area|zone|space)|patio|centre|center|middle)\s+(?:a\s+(?:bit|little)\s+|much\s+)?(bigger|larger|wider|smaller|narrower)(?:\s+by\s+(\d+(?:\.\d+)?)\s*(m|metres?|meters?|cm))?/i, op: 'open_resize' },
    { id: 'bed_split', pattern: /\b(split|divide|cut)\s+(?:the\s+)?(north|south|east|west|left|right|back|rear|front|top|bottom|centre|center|middle|tree)?\s*(?:planting\s+|tree\s+)?(bed|island|border|strip|band)\b/i, op: 'split' },
  ],
};

/** `where` of an edge function whose edge the user has not chosen yet: recorded, shown as awaiting a choice, never proposed or planted */
export const EDGE_UNSET = 'edge-unset';
/** what the words say about the screen itself: a target height ("2 m high", "at least 1.5 m") and a year-round wish. Nothing is
 *  returned for what was not said — the engine then uses its labelled default height and does not require winter cover. */
export function screenRequirementFromText(text) {
  const out = {}; const h = text.match(/(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)\s*(?:high|tall|in height)\b/i) || text.match(/\b(?:at least|height of|up to|above)\s*(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)\b/i);
  if (h) { out.target_height_m = +h[1]; out.target_basis = `stated: "${h[0].trim()}"`; }
  const y = text.match(/\b(year[- ]round|all year|all[- ]season|every season|in winter|through (?:the )?winter|winter too|evergreen)\b/i); if (y) { out.year_round = true; out.year_round_evidence = y[0]; }
  else { const n = text.match(/\b(summer only|only in summer|not in winter|seasonal screen)\b/i); if (n) out.year_round = false; }
  return out;
}
export function findDirection(text) { const m = text.match(new RegExp(`\\b${DIR}\\b(?:\\s*(?:side|edge|half|part|end|corner|boundary|fence))?`, 'i')); if (!m) return null; const w = m[1].toLowerCase(); return { word: m[0], side: SIDE_WORD[w] || w, is_edge: /edge|boundary|fence/i.test(m[0]) }; }
const deictic = t => /\b(here|this|these|those|selected|the (?:circled|selected) (?:area|region|part))\b/i.test(t);

// ---------------------------------------------------------------- brief + site facts from a description
export function interpretDescription(text) {
  const facts = [], values = {}, evidence = [], functions = [], hard = [], unknowns = [];
  for (const r of RULES.site_facts) { const m = text.match(r.pattern); if (m) { facts.push({ ...r.make(m), rule: r.id, evidence: m[0] }); evidence.push({ rule: r.id, text: m[0], says: r.says(m) }); } }
  for (const r of RULES.values) { const m = text.match(r.pattern); if (m) { values[r.value] = Math.max(values[r.value] || 0, /\b(must|essential|most important|really|very|above all)\b/i.test(text) ? 3 : 2); evidence.push({ rule: r.id, text: m[0], says: `value: ${r.value.replace('_', ' ')}` }); } }
  // spatial functions grounded in the database's Z vocabulary; a location is attached when the sentence names one
  // the screened edge: the direction word in the clause that asks for privacy, else one elsewhere that does not belong to a site fact
  // (a tree "on the east side" does not put the screen on the east). Only a compass side sets an edge; "left / right / middle" name
  // no compass side on their own, so the edge stays unset ('edge-unset': awaiting the user's choice — nothing is proposed or planted for it) and is listed as
  // unknown — never read as north, never spread over every edge (M55).
  if (values.privacy) {
    const pm = text.match(RULES.values.find(r => r.id === 'privacy').pattern); let rest = text; for (const f of facts) if (f.kind === 'existing-tree' || f.kind === 'no-plant-zone') rest = rest.replace(f.evidence, ' ');   // a tree's or an open area's own direction is not the screened edge, even inside the same sentence
    const base = rest.includes(pm[0]) ? rest : text; const clause = (base.split(/(?<!\d)\.(?!\d)|\.(?=\s|$)|[;!?\n]/).find(c => c.includes(pm[0])) || base).split(/\b(?:but|while|whereas)\b/i).find(c => c.includes(pm[0])) || base;
    const d = findDirection(clause) || findDirection(rest); const compass = d && DIRECTIONS[d.side] != null; const where = compass ? `${d.side}-edge` : EDGE_UNSET;
    if (!d) unknowns.push('which edge to screen — no side was named; choose the edge (north / south / east / west): nothing is screened until then');
    else if (!compass) unknowns.push(`which edge to screen — "${d.word.trim()}" names no compass side; choose the edge (north / south / east / west)`);
    else if (d && /back|rear|front|top|bottom/i.test(d.word)) unknowns.push(`"${d.word.trim()}" was read as ${d.side} (plan up) — correct the edge if the site faces another way`);
    const req = screenRequirementFromText(clause);
    functions.push({ function: 'z:screen', where, basis: 'privacy → Screen (blocks a view); Scrim would only filter it', evidence: 'privacy', ...req });
    if (req.target_height_m != null) evidence.push({ rule: 'screen-height', text: req.target_basis, says: `screen target height ${req.target_height_m} m` }); if (req.year_round) evidence.push({ rule: 'screen-year-round', text: req.year_round_evidence, says: 'year-round screening required' }); if (values.openness) functions.push({ function: 'z:scrim', where, basis: 'openness + privacy → Scrim as the alternative to check', evidence: 'openness', alternative: true });
  }
  if (values.ecology || values.maintenance_low) functions.push({ function: 'z:ground_cover', where: 'bed-interior', basis: values.maintenance_low ? 'low maintenance → carpeting ground layer reduces open soil (design heuristic, not a database claim)' : 'habitat value → layered ground cover (design heuristic)', evidence: values.maintenance_low ? 'low maintenance' : 'ecology' });
  for (const f of facts) { if (f.kind === 'no-plant-zone') hard.push({ id: 'keep-open', kind: 'no-plant-zone', text: `keep the ${f.where} open (${f.reason})`, evidence: f.evidence }); if (f.kind === 'existing-tree') hard.push({ id: 'keep-tree', kind: 'preserve-feature', text: 'preserve the existing tree', evidence: f.evidence }); }
  hard.push({ id: 'bed-only', kind: 'bed-boundary', text: 'never place plants outside accepted beds', evidence: 'rule' });
  if (!facts.some(f => f.kind === 'dimensions')) unknowns.push('site dimensions / scale');
  if (!facts.some(f => f.kind === 'condition' && f.key === 'light')) unknowns.push('light');
  if (!facts.some(f => f.kind === 'condition' && f.key.startsWith('soil'))) unknowns.push('soil type and drainage');
  if (values.cost_awareness) unknowns.push('budget — the database records no prices; cost cannot be computed');
  if (values.ecology) unknowns.push('ecological performance — the database records some ecological-value claims (pollinator, bird food …) but no pollinator-interaction data; no score is possible');
  const composition = []; if (values.privacy) composition.push('taller layer along the screened edge'); if (values.openness) composition.push('open middle, graded density toward the edge'); if (values.ecology) composition.push('layered: structure + ground cover'); if (values.seasonal_interest) composition.push('mix evergreen and seasonal interest');
  return { provenance: 'offline-parser', facts, values, functions, hard_constraints: hard, composition, unknowns, evidence, text };
}

// ---------------------------------------------------------------- a spatial edit request from an utterance (+ selection)
export function interpretEdit(text, ctx) {
  const ops = []; const evidence = []; const preserve = []; const notes = [];
  for (const r of RULES.edits) { const m = text.match(r.pattern); if (!m) continue; evidence.push({ rule: r.id, text: m[0] });
    if (r.op === 'reduce_density' || r.op === 'increase_density') { let amount = 0.25; for (const a of RULES.amounts) { const am = text.match(a.pattern); if (am) { amount = typeof a.value === 'function' ? a.value(am) : a.value; break; } } ops.push({ type: r.op, amount: { kind: 'relative', value: amount, basis: amount === 0.25 ? 'default interpretation candidate — adjust before applying' : `from "${text.match(RULES.amounts.find(a => text.match(a.pattern)).pattern)[0]}"` } }); }
    else if (r.op === 'remove_species') { const sp = ctx.resolveSpecies(m[2]); ops.push({ type: 'remove_species', species_id: sp?.id || null, phrase: m[2].trim(), resolved: !!sp }); }
    else if (r.op === 'swap_species') { const a = ctx.resolveSpecies(m[2]), b = ctx.resolveSpecies(m[3]); ops.push({ type: 'swap_species', from_species_id: a?.id || null, to_species_id: b?.id || null, phrase: `${m[2].trim()} → ${m[3].trim()}`, resolved: !!(a && b) }); }
    else if (r.op === 'move_away') { const feat = ctx.resolveFeature(m[2]); ops.push({ type: 'move_away', filter: /tall|big|large/i.test(m[1]) ? 'taller' : /low|small/i.test(m[1]) ? 'lower' : ctx.resolveSpecies(m[1])?.id || 'all', feature_id: feat?.id || null, phrase: m[2].trim(), resolved: !!feat }); }
    else if (r.op === 'fill_with_tall') ops.push({ type: 'fill_with_tall', phrase: m[1] });
  }
  for (const r of RULES.preserve) { const m = text.match(r.pattern); if (m) { preserve.push({ type: r.what === 'z:screen' ? 'spatial_function' : r.what === 'open-zone' ? 'no_plant_zone' : r.what === 'existing-tree' ? 'locked_objects' : 'site_condition', value: r.what, evidence: m[0] }); evidence.push({ rule: r.id, text: m[0] }); } }
  preserve.push({ type: 'locked_objects', value: 'existing-tree', evidence: 'always' });
  // scope: a drawn selection grounds "here / this"; a direction word grounds "right side"; else the whole current bed (stated)
  const dir = findDirection(text); let scope;
  if (ctx.selection && (deictic(text) || !dir)) scope = { kind: 'selection', selection_id: ctx.selection.id, polygon: ctx.selection.polygon, basis: deictic(text) ? `"${(text.match(/\b(here|this|these|those|selected)\b/i) || [''])[0]}" → the drawn selection` : 'a drawn selection is active' };
  else if (dir) { const poly = ctx.bedPolygon ? sideRegion(ctx.bedPolygon, dir.side, dir.is_edge ? 0.25 : 1 / 3) : null; scope = { kind: 'direction', side: dir.side, polygon: poly, basis: `"${dir.word}" read relative to the plan as drawn (north up); the region is the ${dir.is_edge ? 'outer quarter' : 'outer third'} of the bed on that side` }; if (dir.side === 'north' && /back|rear|top/i.test(dir.word)) notes.push('"back" was read as north (plan up); correct the orientation if the site faces another way'); }
  else scope = { kind: 'bed', bed_id: ctx.bedId, polygon: ctx.bedPolygon, basis: 'no selection and no direction word — the whole current bed is assumed; draw a selection to narrow it' };
  const conflicts = []; if (ops.some(o => o.type === 'fill_with_tall') && (preserve.some(p => p.type === 'no_plant_zone') || ctx.hasOpenZone)) conflicts.push('filling the open zone with tall plants contradicts the open-space constraint; no change is made without an explicit override');
  if (ops.some(o => o.type === 'reduce_density') && ops.some(o => o.type === 'increase_density')) conflicts.push('both reduce and increase density were read — ambiguous');
  return { kind: 'spatial_edit_request', utterance: text, provenance: 'offline-parser', scope, operations: ops, preserve, evidence, notes, conflicts, confidence: ops.length ? 'interpretation_candidate' : 'no_operation_recognised', requires_preview: true };
}

const SIDE_OF = w => { if (!w) return null; const x = w.toLowerCase(); if (x === 'tree') return null; if (x === 'centre' || x === 'center' || x === 'middle') return 'centre'; return SIDE_WORD[x] || (x === 'left' ? 'west' : x === 'right' ? 'east' : x); };
const metres = (n, unit) => n == null ? null : unit && /cm/i.test(unit) ? +n / 100 : +n;
/** a planting-bed edit request from an utterance (Shape stage). Returns null when no bed-edit rule matches. */
export function interpretBedEdit(text, ctx = {}) {
  const evidence = []; let req = null;
  for (const r of RULES.bed_edits) {
    const m = text.match(r.pattern); if (!m) continue; evidence.push({ rule: r.id, text: m[0] });
    const amtWord = text.match(/\b(a bit|a little|slightly|much|a lot|far)\b/i); const relative = amtWord ? (/much|a lot|far/i.test(amtWord[0]) ? 1.0 : 0.3) : null;
    if (r.op === 'resize') { const side = SIDE_OF(m[1]); const dir = m[3].toLowerCase(); const amount = metres(m[4], m[5]) ?? relative ?? 0.5; req = { op: 'resize', target: { side: side === 'centre' ? null : side, tree: /tree/i.test(m[1] || '') || /island/i.test(m[2]), name: side === 'centre' ? 'centre' : null }, direction: dir, amount_m: amount, amount_basis: m[4] ? `from "${m[4]} ${m[5]}"` : amtWord ? `from "${amtWord[0]}"` : 'default 0.5 m — adjust before applying' }; break; }
    if (r.op === 'resize_verb') { const side = SIDE_OF(m[2]); const grow = /widen|enlarge|expand|extend|grow/i.test(m[1]); const amount = metres(m[4], m[5]) ?? relative ?? 0.5; req = { op: 'resize', target: { side: side === 'centre' ? null : side, tree: /tree/i.test(m[2] || '') || /island/i.test(m[3]), name: side === 'centre' ? 'centre' : null }, direction: grow ? 'wider' : 'narrower', amount_m: amount, amount_basis: m[4] ? `from "${m[4]} ${m[5]}"` : 'default 0.5 m — adjust before applying' }; break; }
    if (r.op === 'delete') { const side = SIDE_OF(m[2]); req = { op: 'delete', target: { side: side === 'centre' ? null : side, tree: /tree/i.test(m[2] || '') || /island/i.test(m[3]), name: side === 'centre' ? 'centre' : null } }; break; }
    if (r.op === 'add') { req = { op: 'add', side: SIDE_OF(m[3]), width_m: /narrow/i.test(m[0]) ? 0.6 : /wide/i.test(m[0]) ? 1.2 : 0.8, function: /screen|privacy|hedge/i.test(text) ? 'z:screen' : 'z:ground_cover' }; break; }
    if (r.op === 'move') { const side = SIDE_OF(m[2]); const d = m[4].toLowerCase(); const direction = /away from the tree/.test(d) ? 'away-from-tree' : /towards? the/.test(d) ? 'outward' : d === 'up' ? 'north' : d === 'down' ? 'south' : /inward/.test(d) ? 'inward' : /outward/.test(d) ? 'outward' : SIDE_OF(d); req = { op: 'move', target: { side: side === 'centre' ? null : side, tree: /tree/i.test(m[2] || '') || /island/i.test(m[3]), name: side === 'centre' ? 'centre' : null }, direction, amount_m: metres(m[5], m[6]) ?? relative ?? 0.5 }; break; }
    if (r.op === 'open_resize') { req = { op: 'open_resize', direction: /bigger|larger|wider/i.test(m[2]) ? 'bigger' : 'smaller', amount_m: metres(m[3], m[4]) ?? relative ?? 0.4 }; break; }
    if (r.op === 'split') { const side = SIDE_OF(m[2]); req = { op: 'split', target: { side: side === 'centre' ? null : side, tree: /tree/i.test(m[2] || '') || /island/i.test(m[3]), name: side === 'centre' ? 'centre' : null } }; break; }
  }
  if (!req) return null;
  const notes = []; if (req.target && !req.target.side && !req.target.tree && !req.target.name) { if (ctx.bedId) { req.target.bed_id = ctx.bedId; notes.push('no bed named — the selected bed is assumed'); } else notes.push('no bed named — the only bed, or the closest match, will be used'); }
  if (req.target?.side && /back|rear|top|front|bottom/i.test(evidence[0].text)) notes.push('"back / front" read as north / south (plan up); correct the orientation if the site faces another way');
  return { kind: 'bed_edit_request', utterance: text, provenance: 'offline-parser', request: req, evidence, notes, confidence: 'interpretation_candidate', requires_preview: true };
}

export function classify(text, ctx) {
  const t = text.trim();
  if (!t) return 'empty';
  if (RULES.bed_edits.some(r => r.pattern.test(t)) && !(ctx.hasDesign && ctx.stage === 'garden' && !/\b(bed|island|border|strip|band|open (?:area|centre|center|middle|space)|lawn)\b/i.test(t))) return 'bed_edit';
  if (ctx.hasDesign && (RULES.edits.some(r => r.pattern.test(t)) || (ctx.selection && deictic(t)))) return 'edit';
  if (/\b(guarante\w+|highest|maximi[sz]e|best possible|optimal)\b/i.test(t) && /\b(pollinator|biodivers|ecolog)/i.test(t)) return 'overclaim';
  return 'description';
}
export const DIRECTION_DEGREES = DIRECTIONS;
