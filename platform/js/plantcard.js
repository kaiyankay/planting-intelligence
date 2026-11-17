// Plant Card and Plant Profile — the one presentation of a species, used by the Plant Library and, in its compact form, by the
// Knowledge Explorer and the Garden Studio (Compose, Grow). Every word about a plant is read from the published knowledge
// snapshot `d` (brain/data/explorer.json, tools/build_explorer.py): identity, attribute cells, function links, claims, evidence
// checks, sources. This file adds wording around those records and nothing else. Two presentation assets stand beside them and
// hold no plant fact: an editorial illustration (platform/data/artwork.json — AI-generated, said so wherever it is shown, never
// read as evidence) and one credited reference photograph (platform/data/images.json). Names are always set in HTML from the snapshot.
//
// Three vocabularies are kept apart everywhere, with the words the snapshot uses:
//   status         documented · derived · candidate · unknown        how a line of knowledge came to exist
//   verification   verified · unverified                               whether a person checked the claim against its source
//   AI check       supported by source · partially supported · conflicting evidence · not assessed
//                                                                      an assistant's reading of the source — an assessment, not verification
import { esc, links, slugOf, speciesId, imageUrl, artUrl, TRACE_FUNCTIONS } from './platform.js';

const IDX = new WeakMap();
function idx(d) {
  let x = IDX.get(d); if (x) return x;
  x = { SP: new Map(d.species.map(s => [s.id, s])), FA: new Map(d.facets.map(f => [f.id, f])), FN: new Map(d.functions.map(f => [f.id, f])), AT: new Map(d.attributes.map(a => [`${a.species}|${a.facet}`, a])), LK: new Map(d.function_links.map(l => [`${l.species}|${l.function}`, l])), claimsOf: new Map() };
  for (const c of Object.values(d.claims)) { const k = speciesId(c.plant); (x.claimsOf.get(k) || x.claimsOf.set(k, []).get(k)).push(c); }
  IDX.set(d, x); return x;
}
export const species = (d, id) => idx(d).SP.get(speciesId(id)) || null;
const human = s => String(s ?? '').replace(/_/g, ' ');
const plural = (n, w, ws = w + 's') => `${n} ${n === 1 ? w : ws}`;
export const tag = (cls, text = human(cls)) => `<span class="pi-tag ${esc(String(cls).replace(/\s+/g, '_'))}">${esc(text)}</span>`;
const AI_WORD = { supported_by_source: 'supported by source', partially_supported: 'partially supported', conflicting_evidence: 'conflicting evidence', not_assessed: 'not assessed' };
export const STUDIO_FUNCTIONS = TRACE_FUNCTIONS;   // the functions design/js/engine.js arranges today (one list, platform.js)

/** the most specific recorded origin: the entity record when there is one */
export function originLabel(d, s) { const c = idx(d).AT.get(`${s.id}|origin`); if (!c) return human(s.origin_status); const v = c.values.find(v => v.entity) || c.values[0]; return v ? v.label : human(s.origin_status); }
const cellValues = (d, s, facet) => { const c = idx(d).AT.get(`${s.id}|${facet}`); return c ? c.values.map(v => v.label) : null; };
const valueHtml = v => `<span class="pi-val">${esc(v.label)}${v.conditions?.length ? ` <small>in ${esc(v.conditions.join(', ').toLowerCase())}</small>` : ''}${v.cultivars?.length ? ` <small>cv. ${esc(v.cultivars.join(', '))}</small>` : ''}</span>`;
const sourceShort = (d, sid) => { const s = d.sources[sid]; if (!s) return sid; return s.type === 'practitioner' ? `Practitioner survey, ${sid.replace('survey-r', 'respondent ')}` : s.label.split(' — ')[0]; };

// ---------------------------------------------------------------- image
/** the figure of a species. Card and compact card: the illustration (falling back to the photograph, then to the Studio's plan
 *  symbol). Profile (`size: 'full'`): the illustration as the plate, and under it the credited photograph as a factual reference. */
const ART_SHORT = 'AI-generated editorial illustration, not evidence.';
const ART_NOTE = 'AI-generated editorial illustration. Not a botanical reference: no fact on this page is read from it.';
const photoCredit = im => `Photo: ${esc(im.author)}, ${esc(im.licence)}, via Wikimedia Commons`;
export function figureHtml(d, id, imgs, { size = 'card', symbol = null, credit = false } = {}) {
  const s = species(d, id); const art = imgs?.art?.[s.slug]; const im = imgs?.images?.[s.slug];
  const ref = im && credit === true ? `<div class="pi-ref"><a href="${esc(imageUrl(im.file))}" title="open the photograph"><img src="${esc(imageUrl(im.card))}" alt="Photograph: ${esc(s.scientific_name)}${im.caption_at_source ? ` — ${esc(im.caption_at_source)}` : ''}" loading="lazy"></a><p><b>Reference photograph</b><a href="${esc(im.source_url)}" rel="noopener">${photoCredit(im)}</a><span>Identified as <i>${esc(s.scientific_name)}</i> on its Commons page; not verified by this project.</span></p></div>` : '';
  if (art) { const fig = `<figure class="pi-fig pi-art"><span class="pi-plate"><img src="${esc(artUrl(art.file))}" alt="Illustration of ${esc(s.scientific_name)}" decoding="async" width="${art.width}" height="${art.height}"></span>${credit ? `<figcaption><span>${credit === 'note' ? ART_SHORT : ART_NOTE}</span></figcaption>` : ''}</figure>`; return credit === true ? `<div class="pi-hero-f">${fig}${ref}</div>` : fig; }
  if (im) return `<figure class="pi-fig"><img src="${esc(imageUrl(size === 'card' ? im.card : im.file))}" alt="${esc(s.scientific_name)}${im.caption_at_source ? ` — ${esc(im.caption_at_source)}` : ''}" loading="lazy" width="${im.width}" height="${im.height}">${credit ? `<figcaption><a href="${esc(im.source_url)}" rel="noopener">${photoCredit(im)}</a><span>Identified as <i>${esc(s.scientific_name)}</i> on its Commons page; not verified by this project.</span></figcaption>` : ''}</figure>`;
  return `<figure class="pi-fig pi-fig-symbol">${symbol ? `<svg viewBox="-1.25 -1.25 2.5 2.5" role="img" aria-label="plan symbol of ${esc(s.scientific_name)}"><g>${symbol}</g></svg>` : ''}<figcaption><span>No illustration or licensed photograph yet. This is the plan symbol the Garden Studio draws from the recorded growth form, spread and colour claims.</span></figcaption></figure>`;
}

// ---------------------------------------------------------------- Plant Card (atlas)
/** V4.1: a quiet plate. The illustration, the common name, the scientific name in italic — nothing else by default. The recorded
 *  growth form and origin stay in the record: they show over the foot of the plate on hover or keyboard focus, they are filters of
 *  the atlas, and the profile states them. `form: true` (the ?card=3 comparison) adds one short growth-form word as a third line;
 *  it is the last word of the recorded growth-form label and nothing more. The whole card is one link. */
export const shortForm = label => { const w = String(label || '').trim().split(/\s+/).pop() || ''; return w.charAt(0).toUpperCase() + w.slice(1); };
export function cardHtml(d, id, imgs, { symbol = null, note = '', form = false } = {}) {
  const s = species(d, id); const X = idx(d); const fns = d.functions.map(f => X.LK.get(`${s.id}|${f.id}`)).filter(l => l && l.drawn); const origin = originLabel(d, s);
  return `<article class="pi-card${form ? ' three' : ''}" data-species="${esc(s.slug)}" data-form="${esc(s.growth_form_label)}" data-origin="${esc(s.origin_status || '')}" data-functions="${esc(fns.map(l => l.function).join(' '))}">
    <a class="pi-card-link" href="${esc(links.profile(s.id))}" aria-label="${esc(s.common_names[0] || '')}, ${esc(s.scientific_name)}. ${esc(s.growth_form_label)}, ${esc(origin)}. Open the profile">
      <span class="pi-card-f">${figureHtml(d, id, imgs, { size: 'card', symbol })}<span class="pi-card-reveal" aria-hidden="true">${esc(s.growth_form_label)} · ${esc(origin)}</span></span>
      <h3>${esc(s.common_names[0] || s.scientific_name)}</h3>
      <p class="pi-card-sci"><i>${esc(s.scientific_name)}</i></p>
      ${form ? `<p class="pi-card-form">${esc(shortForm(s.growth_form_label))}</p>` : ''}
      ${note ? `<p class="pi-card-note">${note}</p>` : ''}
    </a></article>`;
}

// ---------------------------------------------------------------- compact card (Explorer inspector, Compose, Grow)
/** names + thumbnail + the two ways onward. `extra` is appended to the actions (a module's own button). */
export function miniHtml(d, id, imgs, { extra = '', here = null } = {}) {
  const s = species(d, id); if (!s) return ''; const im = imgs?.images?.[s.slug];
  const art = imgs?.art?.[s.slug];
  return `<div class="pi-mini" data-pi-mini="${esc(s.slug)}">${art ? `<img class="art" src="${esc(artUrl(art.file))}" alt="" loading="lazy" title="AI-generated illustration, not a botanical reference">` : im ? `<img src="${esc(imageUrl(im.card))}" alt="" loading="lazy" title="${photoCredit(im)}">` : ''}<div class="pi-mini-b"><div class="pi-mini-n"><i>${esc(s.scientific_name)}</i><span>${esc(s.common_names[0] || '')} · ${esc(s.growth_form_label)}</span></div><div class="pi-mini-a">${here === 'profile' ? '' : `<a href="${esc(links.profile(s.id))}" data-pi-go="profile">Plant profile</a>`}${here === 'explorer' ? '' : `<a href="${esc(links.explorer(s.id))}" data-pi-go="explorer">Evidence</a>`}${extra}</div></div></div>`;
}

// ---------------------------------------------------------------- Plant Profile (V4)
// A calm first viewport (plate · names · six quick attributes · actions), then four tabs. Every field is one summarised row; the
// claims behind it — the project's wording of what the source says, its source and context, human verification, the AI source
// assessment — open under the row on demand. Nothing is averaged: where sources give different figures each keeps its own line.
export const TABS = [['design', 'Design relevance'], ['growth', 'Growth & conditions'], ['evidence', 'Evidence & sources'], ['unknown', 'Unknown & conflicting']];
const num = n => String(Math.round(n * 100) / 100);
/** a stated size as the claim states it; null when the value is not a plain metric range (the claim's own sentence is used then) */
function sizeOf(v) {
  if (!v || typeof v !== 'object' || v.unit !== 'm') return null; const n = v.height_m ?? v.spread_m;
  let t = null;
  if (v.min != null && v.max != null) t = `${num(v.min)}–${num(v.max)} m`; else if (v.max != null) t = `up to ${num(v.max)} m`; else if (n != null) t = `${num(n)} m`; else if (v.typical_max_m != null) t = `typically to ${num(v.typical_max_m)} m`;
  if (t && v.occasional_max_m != null) t += `, occasionally ${num(v.occasional_max_m)} m`;
  return t;
}
const claimCtx = (d, c) => [sourceShort(d, c.source_id), ...(c.conditions || []).map(x => x.label.toLowerCase()), c.cultivar ? `cv. ${c.cultivar}` : null, c.place_label && c.place_label !== 'unspecified' ? c.place_label : null].filter(Boolean);
function claimHtml(d, c) {
  const ai = c.evidence_check || 'not_assessed';
  return `<li class="pi-claim" data-claim="${esc(c.id)}"><p>${esc(c.text)}</p>
    <p class="pi-claim-m"><span class="pi-claim-s">${esc(claimCtx(d, c).join(' · '))}</span>${tag(c.status)}<span class="pi-ai">AI source assessment ${tag(ai, AI_WORD[ai] || human(ai))}</span><span class="pi-id">${esc(c.id)}</span></p></li>`;
}
function factRow(d, s, f) {
  const c = idx(d).AT.get(`${s.id}|${f.id}`);
  if (!c) return `<div class="pi-fact missing"><span class="pi-fact-k">${esc(f.label)}</span><span class="pi-fact-v"><span class="pi-none">not recorded</span></span><span class="pi-fact-m">an explicit unknown</span></div>`;
  const size = f.id === 'height_class' || f.id === 'spread_class'; const cl = c.claims.map(id => d.claims[id]).filter(Boolean);
  let body;
  if (size) {   // bins over claims that state ranges under different conditions: one line per source claim, never one merged figure
    body = `<ul class="pi-ranges">${cl.map(x => `<li><b>${esc(sizeOf(x.value) || x.text)}</b> <small>${esc(claimCtx(d, x).join(' · '))}</small></li>`).join('')}</ul>${cl.length > 1 ? `<span class="pi-fact-note">${plural(cl.length, 'claim')}, each kept as its source states it; not averaged.</span>` : ''}`;
  } else body = c.values.map(valueHtml).join('<span class="pi-sep"> · </span>');
  const flags = `${c.disagreement.length ? tag('conflict', 'sources disagree') : ''}${c.variation.length ? tag('to_confirm', 'depends on conditions') : ''}`;
  return `<details class="pi-fact" data-facet="${esc(f.id)}"><summary><span class="pi-fact-k" title="${esc(f.definition || '')}">${esc(f.label)}</span><span class="pi-fact-v">${body}</span><span class="pi-fact-m">${flags}<span class="pi-fact-n">${plural(c.n_claims, 'claim')} · ${plural(c.n_sources, 'source')}</span></span></summary>
    <div class="pi-fact-d"><p class="pi-fact-st">${tag(c.status)}${tag(c.verification)}${c.rule ? `<span>derived by rule <span class="pi-id">${esc(c.rule)}</span> from the claims below</span>` : c.status === 'documented' ? '<span>stated by a source</span>' : ''}<a href="${esc(links.explorer(s.id, { kind: 'attr', id: c.id }))}" title="open the claims behind this field in the Knowledge Explorer">Open in Knowledge</a></p>
    ${c.disagreement.map(x => `<p class="pi-fact-w">${tag('conflict', 'sources disagree')} ${esc(x.text)}</p>`).join('')}${c.variation.map(x => `<p class="pi-fact-w">${tag('to_confirm', 'depends on conditions')} ${esc(x.text)}</p>`).join('')}
    <ul class="pi-claims">${cl.map(x => claimHtml(d, x)).join('')}</ul></div></details>`;
}
function functionRow(d, s, f) {
  const l = idx(d).LK.get(`${s.id}|${f.id}`); if (!l) return '';
  let why;
  if (l.drawn && l.via_use_labels?.length) why = `Recorded use: ${esc(l.via_use_labels.join(', '))} <span class="pi-src">${esc([...new Set(l.use_sources || [])].map(x => sourceShort(d, x)).join(', '))}</span>`;
  else if (l.drawn) why = `Inferred from recorded traits (rule ${esc(l.rule || 'KG-R4')}). No source states this use.`;
  else { const unmet = (l.requirements || []).filter(r => r.result !== 'met'); why = `${esc(l.verdict || 'not established')}${unmet.length ? ': ' + unmet.map(r => `needs ${esc(r.alternative_labels.join(' or '))}${r.contrary?.length ? `, recorded ${esc([...new Set(r.contrary.map(c => c.target_label))].join(', '))}` : ', nothing recorded'}`).join('; ') : ''}`; }
  const arranged = STUDIO_FUNCTIONS.includes(f.id);
  const studio = arranged ? (l.drawn ? 'The Garden Studio can arrange it for this function. Whether it is planted is decided bed by bed.' : 'The Garden Studio arranges this function, but not with this plant.') : 'Recorded only: the Garden Studio has no arrangement rule for this function yet.';
  const state = l.drawn ? `<span class="pi-fn-w linked">linked</span>${tag('to_confirm', 'provisional')}` : `<span class="pi-fn-w none">no link</span>`;
  const reqs = (l.requirements || []).map(r => `<li><b>${esc(r.concept_label)}</b> needs ${esc(r.alternative_labels.join(' or '))}: <span class="pi-rw ${esc(String(r.result).replace(/\s+/g, '_'))}">${esc(human(r.result))}</span>${r.evidence?.length ? ` <small>recorded ${esc([...new Set(r.evidence.map(e => e.target_label))].join(', '))}</small>` : ''}${r.contrary?.length ? ` <small>contrary: ${esc([...new Set(r.contrary.map(e => e.target_label))].join(', '))}</small>` : ''}</li>`).join('');
  return `<details class="pi-fn ${l.drawn ? 'drawn' : 'gap'}" data-function="${esc(f.id)}"><summary><span class="pi-fn-h"><h4 title="${esc(f.definition)}">${esc(f.label)}</h4>${state}${l.conflict ? tag('conflict', 'a trait claim contradicts it') : ''}</span><span class="pi-fn-y">${why}</span><span class="pi-fact-n">${l.drawn ? 'the check' : 'why not'}</span></summary>
    <div class="pi-fact-d"><p class="pi-fact-st">${tag(l.status)}${l.drawn ? tag(l.verification === 'none' ? 'none' : l.verification, l.verification === 'none' ? 'no claim to verify' : l.verification) : ''}<a href="${esc(links.explorer(s.id, { kind: 'link', id: l.id }))}" title="open the requirement check in the Knowledge Explorer">Open in Knowledge</a>${TRACE_FUNCTIONS.includes(f.id) ? `<a href="${esc(links.trace(s.id, { fn: f.id }))}" data-pi-go="trace">${l.drawn ? 'Follow this link into a design' : 'See why it is not planted for it'}</a>` : ''}</p>
    ${reqs ? `<ul class="pi-reqs">${reqs}</ul>` : ''}${l.verification_note ? `<p class="pi-fn-s">${esc(cap(l.verification_note))}.</p>` : ''}<p class="pi-fn-s">${studio}${l.drawn ? ' A link is evidence to weigh, not a suitability score: it stays provisional until a bed\'s site and function checks pass.' : ' A missing link is a gap in the records, not a statement that the plant is unsuitable.'}</p></div></details>`;
}
const cap = t => String(t || '').replace(/^./, c => c.toUpperCase()).replace(/\.$/, '');

/** the full profile. ctx: { design, isConsidered, symbol, studio, tab } — what the Library knows about the user's design and the Studio's drawing */
export function detailHtml(d, id, imgs, ctx = {}) {
  const s = species(d, id); if (!s) return ''; const X = idx(d); const tab = TABS.some(t => t[0] === ctx.tab) ? ctx.tab : 'design';
  const cells = d.facets.map(f => X.AT.get(`${s.id}|${f.id}`));
  const missing = d.facets.filter((f, i) => !cells[i]); const disagree = cells.filter(c => c && c.disagreement.length); const vary = cells.filter(c => c && c.variation.length);
  const lks = d.functions.map(f => X.LK.get(`${s.id}|${f.id}`)).filter(Boolean); const unknown = lks.filter(l => !l.drawn), conflict = lks.filter(l => l.conflict);
  const cl = X.claimsOf.get(s.id) || []; const byCheck = {}; for (const c of cl) byCheck[c.evidence_check || 'not_assessed'] = (byCheck[c.evidence_check || 'not_assessed'] || 0) + 1;
  const bySource = new Map(); for (const c of cl) bySource.set(c.source_id, (bySource.get(c.source_id) || 0) + 1);
  const rels = (d.relations || []).filter(r => r.live && (r.a === s.id || r.b === s.id));
  const few = (facet, n = 3) => { const v = cellValues(d, s, facet); if (!v) return '<span class="pi-none">not recorded</span>'; return v.slice(0, n).map(esc).join(' · ') + (v.length > n ? ` <small>+${v.length - n}</small>` : ''); };
  // V4.1 quick facts: growth form · size · site needs · function. A field whose sources disagree (or, for a size, whose claims state
  // different ranges) says so and links to its row under Growth & conditions, where every source keeps its own line. Nothing is averaged.
  const rowHref = facet => `#species=${esc(s.slug)}&tab=growth&open=${esc(facet)}`;
  const differ = (facet, n) => `<a class="pi-differ" href="${rowHref(facet)}" data-differ="${esc(facet)}" title="open the ${n} claims, one line per source">sources differ</a>`;
  const site = facet => { const c = X.AT.get(`${s.id}|${facet}`); return few(facet) + (c && c.disagreement.length ? ` ${differ(facet, c.n_claims)}` : ''); };
  const sizeFact = (facet, word) => { const c = X.AT.get(`${s.id}|${facet}`); if (!c) return `<span class="pi-none">${word} not recorded</span>`;
    const cls = c.claims.map(i => d.claims[i]).filter(Boolean); const stated = [...new Set(cls.map(x => sizeOf(x.value)).filter(Boolean))];
    if (cls.length === 1 || stated.length <= 1) return `${word} ${esc(stated[0] || cls[0]?.text || '')}`;
    // V4.2: sources that state different sizes are shown as two attributed statements (the smallest and the largest stated), never merged
    // into one span that would read as a mature size; the link opens every claim, one line per source.
    const top = v => v && typeof v === 'object' && v.unit === 'm' ? Math.max(...[v.max, v.height_m, v.spread_m, v.typical_max_m].filter(n => typeof n === 'number'), -1) : -1;
    const by = cls.map(x => ({ t: sizeOf(x.value), n: top(x.value), src: sourceShort(d, x.source_id) })).filter(x => x.t && x.n >= 0).sort((a, b) => a.n - b.n); const lo = by[0], hi = by[by.length - 1]; const short = t => t.length > 26 ? `${t.slice(0, 25).trimEnd()}…` : t;
    const line = (k, x) => `<span class="pi-size-s"><small>${k}</small> ${esc(x.t)} <small title="${esc(x.src)}">${esc(short(x.src))}</small></span>`;
    return `${word} ${differ(facet, cls.length)}${lo && hi && lo !== hi ? `${line('smallest stated', lo)}${line('largest stated', hi)}` : `<span class="pi-size-s">${cls.length} claims</span>`}`; };
  const leaf = cellValues(d, s, 'evergreen'); const drawnFns = lks.filter(l => l.drawn).map(l => X.FN.get(l.function)?.label).filter(Boolean);
  const glance = [['Growth form', esc(s.growth_form_label) + (s.growth_form_status === 'supported' ? '' : ` ${tag('to_confirm', `growth form ${s.growth_form_status}`)}`) + (leaf ? ` · ${leaf.slice(0, 2).map(esc).join(' / ')}` : '') + (X.AT.get(`${s.id}|evergreen`)?.disagreement.length ? ` ${differ('evergreen', X.AT.get(`${s.id}|evergreen`).n_claims)}` : '')],
    ['Size', `<span class="pi-size">${sizeFact('height_class', 'Height')}</span><span class="pi-size">${sizeFact('spread_class', 'Spread')}</span>`], ['Spatial function', drawnFns.length ? `${drawnFns.map(esc).join(' · ')} <a class="pi-differ" href="#species=${esc(s.slug)}" data-differ="functions" title="a recorded or inferred link, provisional until a bed is checked">linked, provisional</a>` : '<span class="pi-none">no recorded link</span>'],
    ['Light', site('exposure')], ['Water', site('water')], ['Soil', site('soil')]];
  const group = gid => { const g = d.groups.find(x => x.id === gid); return `<section class="pi-sec" id="sec-${esc(gid.replace('y:', ''))}"><h2>${esc(GROUP_TITLE[gid] || g.label)}</h2><p class="pi-sec-l">${esc(g.definition)}</p><div class="pi-facts">${d.facets.filter(f => f.group === gid).map(f => factRow(d, s, f)).join('')}</div></section>`; };
  const des = ctx.design; const on = ctx.isConsidered;
  const consider = `<div class="pi-consider" data-consider-box>${des
    ? `<button class="pi-btn ${on ? 'on' : 'primary'}" data-consider="${esc(s.slug)}" aria-pressed="${on ? 'true' : 'false'}">${on ? 'Being considered for your design' : 'Consider for my design'}</button><p>${on ? `<b>${esc(des.name)}</b> will show it in Compose with the check for each bed. <a href="${esc(des.bed ? links.compose(des.bed.id, s.id) : links.design())}">${esc(des.bed ? `Check it in Compose · ${des.bed.name}` : ctx.returnLabel || 'Open the design')}</a>` : `Adds it to the candidates Compose checks for <b>${esc(des.name)}</b>. It is planted only where it passes the bed's site and function checks.`}</p>`
    : `<a class="pi-btn primary" href="${esc(links.design())}">Start a design</a><p>No design is in progress in this browser. ${on ? `This species is on your list and will be checked once a design has beds. <button class="pi-linkbtn" data-consider="${esc(s.slug)}">Take it off the list</button>` : `<button class="pi-linkbtn" data-consider="${esc(s.slug)}">Keep it on my list</button> and it will be checked, bed by bed, once a design has beds.`}</p>`}</div>`;
  const im = imgs?.images?.[s.slug];
  const refPhoto = im ? `<div class="pi-ref"><a href="${esc(imageUrl(im.file))}" title="open the photograph"><img src="${esc(imageUrl(im.card))}" alt="Photograph: ${esc(s.scientific_name)}${im.caption_at_source ? ` — ${esc(im.caption_at_source)}` : ''}" loading="lazy"></a><p><b>Reference photograph</b><a href="${esc(im.source_url)}" rel="noopener">${photoCredit(im)}</a><span>Identified as <i>${esc(s.scientific_name)}</i> on its Commons page; not verified by this project.</span></p></div>` : '';
  const panel = (k, html) => `<div class="pi-panel" id="tab-${k}" role="tabpanel" aria-labelledby="tabbtn-${k}"${k === tab ? '' : ' hidden'}>${html}</div>`;
  const others = s.common_names.slice(1);
  // V4.1: the credited photograph is one click from the first viewport. It opens in a dialog with photographer, licence and source;
  // it is a reference for the eye, never evidence for a claim.
  const refBtn = im ? `<button type="button" class="pi-refbtn" data-refphoto aria-haspopup="dialog"><img src="${esc(imageUrl(im.card))}" alt="" loading="lazy"><span><b>View reference photo</b><small>${photoCredit(im)}</small></span></button>` : `<p class="pi-refnone">No licensed reference photograph is recorded for this species yet.</p>`;
  const refDialog = im ? `<dialog class="pi-refdlg" data-refdialog aria-label="Reference photograph of ${esc(s.scientific_name)}"><form method="dialog"><button class="pi-refx" aria-label="Close the photograph">Close</button></form>
    <figure><img src="${esc(imageUrl(im.file))}" alt="Photograph: ${esc(s.scientific_name)}${im.caption_at_source ? ` — ${esc(im.caption_at_source)}` : ''}" loading="lazy" width="${im.width}" height="${im.height}">
    <figcaption><h2>${esc(s.common_names[0] || s.scientific_name)} <i>${esc(s.scientific_name)}</i></h2>
      <dl><div><dt>Photographer</dt><dd>${esc(im.author)}</dd></div><div><dt>Licence</dt><dd>${im.licence_url ? `<a href="${esc(im.licence_url)}" rel="noopener">${esc(im.licence)}</a>` : esc(im.licence)}</dd></div><div><dt>Source</dt><dd><a href="${esc(im.source_url)}" rel="noopener">Wikimedia Commons</a></dd></div>${im.caption_at_source ? `<div><dt>Caption at source</dt><dd>${esc(im.caption_at_source)}</dd></div>` : ''}</dl>
      <p>Identified as <i>${esc(s.scientific_name)}</i> on its Commons page; not verified by this project. A reference for the eye: no claim on this page is read from it.</p></figcaption></figure></dialog>` : '';

  return `<article class="pi-profile" data-species="${esc(s.slug)}">
  <header class="pi-hero">
    <div class="pi-hero-f">${figureHtml(d, id, imgs, { size: 'full', symbol: ctx.symbol, credit: 'note' })}${refBtn}</div>
    <div class="pi-hero-t">
      <h1>${esc(s.common_names[0] || s.scientific_name)}</h1>
      <p class="pi-names"><i class="pi-sci">${esc(s.scientific_name)}</i><span>${esc(s.family)}</span></p>
      ${others.length ? `<p class="pi-aka">Also recorded as ${esc(others.slice(0, 4).join(', '))}${others.length > 4 ? ` <span title="${esc(others.slice(4).join(', '))}">and ${others.length - 4} more</span>` : ''}</p>` : ''}
      <p class="pi-origin"><span>Origin</span> <a href="${rowHref('origin')}" data-differ="origin" title="open the claims behind the recorded origin">${esc(originLabel(d, s))}</a></p>
      <dl class="pi-glance">${glance.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      ${consider}
      <div class="pi-actions"><a class="pi-btn" href="${esc(links.explorer(s.id))}">Explore in Knowledge</a><a class="pi-btn" href="${esc(links.trace(s.id))}" data-pi-go="trace">Trace it into a design</a><a class="pi-btn quiet" href="${esc(links.neural(s.id))}">3D network</a></div>
      <p class="pi-counts">${plural(s.claims.live, 'live claim')} from ${plural(bySource.size, 'source')} · ${s.claims.verified} verified by a person · ${plural(disagree.length, 'field')} where sources disagree · ${plural(missing.length, 'field')} not recorded</p>
    </div>
  </header>
  ${refDialog}
  <nav class="pi-tabs" role="tablist" aria-label="Sections of this profile">${TABS.map(([k, l]) => `<a role="tab" id="tabbtn-${k}" href="#species=${esc(s.slug)}${k === 'design' ? '' : `&tab=${k}`}" data-tab="${k}" aria-selected="${k === tab}" aria-controls="tab-${k}">${l}${k === 'unknown' ? `<small>${missing.length + disagree.length + unknown.length}</small>` : ''}</a>`).join('')}</nav>

  ${panel('design', `
  <section class="pi-sec" id="sec-functions"><h2>Spatial functions</h2><p class="pi-sec-l">What this plant can do in a planting, according to the records: a use a source states, or a use inferred from recorded traits. A link is provisional evidence for a designer to weigh, not a suitability score.</p><div class="pi-fns">${d.functions.map(f => functionRow(d, s, f)).join('')}</div></section>
  <section class="pi-sec" id="sec-studio"><h2>In the Garden Studio</h2><p class="pi-sec-l">How the design engine reads this record when it draws and places the plant.</p><div class="pi-studio-w">${ctx.studio || ''}</div></section>
  ${rels.length ? `<section class="pi-sec" id="sec-relations"><h2>Recorded with other plants</h2><p class="pi-sec-l">Only pairings someone recorded. Sharing a trait never makes two plants companions.</p><ul class="pi-rels">${rels.map(r => { const o = r.a === s.id ? r.b : r.a; const os = X.SP.get(o); return os ? `<li>${esc(human(r.type))} <a href="${esc(links.profile(o))}"><i>${esc(os.scientific_name)}</i></a> ${tag(r.kg_status)}${r.placeholder ? tag('candidate', 'model placeholder') : ''} <span class="pi-src">${esc(sourceShort(d, r.source_id))}</span></li>` : ''; }).join('')}</ul></section>` : ''}`)}

  ${panel('growth', `<p class="pi-panel-l">One row per field: what is recorded, in short. Open a row for the claims behind it, each with its source, its human verification and its AI source assessment.</p>
  ${group('y:growth_form')}
  ${group('y:environment')}
  ${group('y:seasonal_ecological')}
  ${group('y:maintenance_risk')}`)}

  ${panel('evidence', `
  <section class="pi-sec" id="sec-evidence"><h2>Evidence status</h2>
    <p class="pi-sec-l">Three separate things are recorded for every claim, and none stands in for another.</p>
    <dl class="pi-ev">
      <div><dt>Claims</dt><dd><b>${s.claims.live}</b> live${s.claims.retired ? `, ${s.claims.retired} retired and kept as history` : ''}</dd></div>
      <div><dt>Verified by a person</dt><dd><b>${s.claims.verified}</b> ${tag('verified')} <b>${s.claims.unverified}</b> ${tag('unverified')}<span class="pi-ev-n">A reviewer opened the source and confirmed the claim. Unverified does not mean wrong; it means nobody has checked yet.</span></dd></div>
      <div><dt>AI source assessment</dt><dd>${Object.keys(AI_WORD).filter(k => byCheck[k]).map(k => `<b>${byCheck[k]}</b> ${tag(k, AI_WORD[k])}`).join(' ')}<span class="pi-ev-n">An AI assistant read the source of each of the ${cl.length} claims the fields on this page cite${cl.length !== s.claims.live ? ` (of ${s.claims.live} live claims; the others feed no field shown here)` : ''}. An assessment to help reviewers, never a verification.</span></dd></div>
      <div><dt>How lines came to exist</dt><dd>${tag('documented')} a source states it · ${tag('derived')} a recorded rule over claims · ${tag('candidate')} inferred, never promoted · ${tag('unknown')} listed as a gap</dd></div>
    </dl></section>
  <section class="pi-sec" id="sec-sources"><h2>Sources</h2><p class="pi-sec-l">Where the ${s.claims.live} claims come from. Facts are stored in the project's own words, with credit to the source.</p>
    <ul class="pi-sources">${[...bySource.entries()].sort((a, b) => b[1] - a[1]).map(([sid, n]) => { const so = d.sources[sid] || { label: sid }; const pract = so.type === 'practitioner'; return `<li><span class="pi-so-n">${n}</span><span class="pi-so-l">${so.url && !pract ? `<a href="${esc(so.url)}" rel="noopener">${esc(so.label)}</a>` : esc(pract ? sourceShort(d, sid) : so.label)}<small>${esc(human(so.type || ''))}${so.publisher && !pract ? ` · ${esc(so.publisher)}` : ''}${pract ? ' · anonymous response to the project survey' : ''}${so.licence_tier ? ` · licence tier ${esc(so.licence_tier)}` : ''}</small></span></li>`; }).join('')}</ul></section>
  <section class="pi-sec" id="sec-claims"><h2>All claims</h2><p class="pi-sec-l">Every claim recorded for this species that a field of this profile cites, in the project's own words.</p>
    <details class="pi-all"><summary>Show all ${plural(cl.length, 'claim')}</summary><ul class="pi-claims">${cl.map(x => claimHtml(d, x)).join('')}</ul></details></section>
  <section class="pi-sec" id="sec-images"><h2>Images</h2><p class="pi-sec-l">Neither image is evidence. No fact on this page is read from a picture.</p>
    <div><p class="pi-img-n"><b>Illustration</b> ${ART_NOTE}</p>${refPhoto}</div></section>`)}

  ${panel('unknown', `
  <section class="pi-sec" id="sec-gaps"><h2>Unknown, conflicting and missing</h2>
    <p class="pi-sec-l">What the database cannot tell you about this plant yet. A gap is not a negative finding.</p>
    <div class="pi-gaps">
      <div><h4>Not recorded <small>${missing.length}</small></h4>${missing.length ? `<p>${missing.map(f => esc(f.label)).join(' · ')}</p>` : '<p class="pi-none">every field has at least one claim</p>'}</div>
      <div><h4>Sources disagree <small>${disagree.reduce((n, c) => n + c.disagreement.length, 0)}</small></h4>${disagree.length ? `<ul>${disagree.flatMap(c => c.disagreement.map(x => `<li>${esc(x.text)} <a href="${esc(links.explorer(s.id, { kind: 'attr', id: c.id }))}">claims</a></li>`)).join('')}</ul>` : '<p class="pi-none">no disagreement recorded</p>'}</div>
      ${vary.length ? `<div><h4>Depends on conditions <small>${vary.reduce((n, c) => n + c.variation.length, 0)}</small></h4><ul>${vary.flatMap(c => c.variation.map(x => `<li>${esc(x.text)}</li>`)).join('')}</ul></div>` : ''}
      <div><h4>Spatial functions without a link <small>${unknown.length}</small></h4>${unknown.length ? `<p>${unknown.map(l => `${esc(X.FN.get(l.function).label)} <span class="pi-src">${esc(l.verdict || 'unknown')}</span>`).join(' · ')}</p>` : '<p class="pi-none">all five have a link</p>'}${conflict.length ? `<p>${conflict.map(l => `${esc(X.FN.get(l.function).label)}: a source records the use and a recorded trait contradicts it. Both are kept.`).join(' ')}</p>` : ''}</div>
    </div></section>`)}
  </article>`;
}
const GROUP_TITLE = { 'y:growth_form': 'Growth form and size', 'y:environment': 'Growing conditions', 'y:seasonal_ecological': 'Seasons and ecology', 'y:maintenance_risk': 'Maintenance and risk' };

// the reference photograph dialog: one delegated listener wherever a profile is shown. <dialog> gives Esc and focus return for free.
if (typeof document !== 'undefined') document.addEventListener('click', ev => {
  const b = ev.target.closest?.('[data-refphoto]'); const dlg = b ? b.closest('.pi-profile')?.querySelector('[data-refdialog]') : null;
  if (dlg) { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); return; }
  if (ev.target.matches?.('dialog[data-refdialog]')) ev.target.close();   // a click on the backdrop
});
