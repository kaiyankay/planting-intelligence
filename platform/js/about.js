// Planting Intelligence · About (V4, 2026-11-15). One module for the About pages; the page is named by <body data-about>:
//
//   project      why the project exists, what the ten-species prototype can and cannot do, the figures of the release
//   how          what the planting engine computes: one switchable figure computed on the recorded reference garden
//                (designs/demo-a.json) — input & site, evidence & eligibility, composition & arrangement, evaluation — with the
//                written rules, sources, heuristics and limits in expanders below it (V4.1)
//   method       the seven steps by which the knowledge base is built, with one real claim carried through
//   contribute   the practitioner survey, how a contribution becomes a reviewed claim, what works today and what is research
//   data         Sources & data (V4.2): what the snapshot holds — sources, claims, verification, the AI source check, gaps and
//                disagreements, credits. The figures that used to lead Project and Research & Method live here.
//   typography   the type specimen
//
// V4.2: Project opens on a thesis, one Knowledge → Design diagram and two entries; Research & Method opens on a cover drawn in code
// from the snapshot (the seven steps and the one followed record); How it works reads ONE case in all four views — `As saved` or a
// `Recomputed preview` (?mode=recomputed&pattern=<key>). Public pages carry no project housekeeping (pending decisions, method-log
// numbers, commits, test counts): that stays in the internal reports.
//
// No plant fact, count or engine number is written here. Counts are counted in the browser from the published snapshot
// (brain/data/explorer.json); the engine's numbers are its own exported constants (design/js/engine.js: ARRANGEMENT_RULES, HEURISTICS,
// COMPOSITION, FUNCTION_SUPPORT); the worked examples are the engine run on the reference garden through platform/js/trace.js.
// Nothing is read from the survey's database: no response, respondent mapping or summary of answers appears on these pages.
import * as PI from './platform.js';
import { tag } from './plantcard.js';
import * as T from './trace.js';
import * as F from './figures.js';

const $ = s => document.querySelector(s); const esc = PI.esc; const plural = T.plural; const cap = T.cap;
const page = document.body.dataset.about || 'project';
const SALAL = 'plant:gaultheria-shallon';
const TITLE = { project: 'About', how: 'How it works', method: 'Research & Method', contribute: 'Contribute & Future', data: 'Sources & data', typography: 'Typography' };

(async function boot() {
  try {
    const d = await PI.loadSnapshot(); PI.mountTop($('#top'), { active: 'about', section: page, snapshot: d }); $('#foot').innerHTML = PI.footHtml(d);
    document.title = `${TITLE[page] || 'About'} · Planting Intelligence`;
    const render = { project, how, method, contribute, data, typography }[page] || project;
    $('#app').innerHTML = await render(d); window.about = { page, d };
    wire();
    if (location.hash.length > 1) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  } catch (e) { $('#app').innerHTML = `<p class="pi-loading">Could not load this page: ${esc(e.message)}</p>`; console.error(e); }
})();

function wire() {
  wireStage();
  // the Project cover is laid out for the width it is shown at, so its lettering keeps its size
  const plate = $('#ab-plate'); if (plate && COVER) { let last = 1180; const fit = () => { const w = Math.max(900, Math.min(1180, Math.round(plate.clientWidth))); if (w === last) return; last = w; plate.querySelector('svg').outerHTML = F.cover(COVER, w); }; fit(); window.addEventListener('resize', fit); }
  // an expander named by the address opens (and a link to one opens it)
  const openHash = () => { const el = location.hash.length > 1 && document.getElementById(location.hash.slice(1)); if (el?.tagName === 'DETAILS') { el.open = true; el.scrollIntoView(); } };
  openHash(); window.addEventListener('hashchange', openHash);
  const cap = $('#ab-cap'); const say = ev => { const t = ev.target.closest('.ab-grid td [title]'); if (t && cap) cap.textContent = t.title; };
  $('.ab-grid')?.addEventListener('mouseover', say); $('.ab-grid')?.addEventListener('focusin', say);
  // the section list marks the section being read
  const toc = [...document.querySelectorAll('.ab-toc a[href^="#"]')]; if (!toc.length || !('IntersectionObserver' in window)) return;
  const byId = new Map(toc.map(a => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { toc.forEach(a => a.removeAttribute('aria-current')); byId.get(e.target.id)?.setAttribute('aria-current', 'true'); } }, { rootMargin: '-20% 0px -70% 0px' });
  for (const id of byId.keys()) { const el = document.getElementById(id); if (el) io.observe(el); }
}

// ---------------------------------------------------------------- shared pieces
const mast = (h1, lede, side = '') => `<header class="ab-mast"><div><h1>${h1}</h1><p class="ab-lede">${lede}</p></div>${side ? `<div class="ab-mast-s">${side}</div>` : ''}</header>`;
const toc = items => `<nav class="ab-toc" aria-label="On this page">${items.map(([id, l]) => `<a href="#${id}">${l}</a>`).join('')}</nav>`;
const sec = (id, title, sub, body, cls = '') => `<section class="ab-sec ${cls}" id="${id}"><div class="ab-sec-h"><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div><div class="ab-sec-b">${body}</div></section>`;
const fig = (n, of, label) => `<div><dd>${n}${of != null ? `<small> / ${of}</small>` : ''}</dd><dt>${label}</dt></div>`;
const go = (...links) => `<p class="ab-go">${links.map(([href, l, ext]) => `<a href="${esc(href)}"${ext ? ' rel="noopener"' : ''}>${l}</a>`).join('')}</p>`;
const sci = s => `<i class="ab-sci">${esc(s)}</i>`;
const mono = s => `<span class="ab-id">${esc(s).replace(/:/g, ':<wbr>')}</span>`;
const pct = x => `${Math.round(x * 100)} %`;
const bySourceType = d => { const n = {}; for (const s of Object.values(d.sources)) n[s.type] = (n[s.type] || 0) + 1; return n; };
/** the one real item every About page follows: the USDA hedge-tolerance claim that links salal to Screen. Read from the snapshot. */
function item(d) {
  const sp = d.species.find(s => s.id === SALAL); const link = d.function_links.find(l => l.species === SALAL && l.function === 'z:screen'); if (!sp || !link) return null;
  const claim = d.claims[link.use_claims?.[0]] || null; const check = claim ? d.evidence_checks[claim.id] || null : null; const fn = d.functions.find(f => f.id === 'z:screen');
  return { sp, link, claim, check, fn, source: claim ? d.sources[claim.source_id] : null };
}

// ---------------------------------------------------------------- diagrams drawn in code from the snapshot (V4.2)
// Nothing in these figures is typed in: labels, ids, statuses and counts are read from the published snapshot, the engine's own
// tables and the reference garden. An unverified record is drawn dashed and never ticked.
const wrapT = (s, n) => { const out = []; let line = ''; for (const w of String(s).split(/\s+/)) { if (line && (line + ' ' + w).length > n) { out.push(line); line = w; } else line = line ? `${line} ${w}` : w; } if (line) out.push(line); return out; };
const cut = (s, n) => { s = String(s || ''); return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s; };
const tx = (x, y, lines, cls, lh = 17, anchor = 'start') => `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${[].concat(lines).map((l, i) => `<tspan x="${x}" dy="${i ? lh : 0}">${esc(l)}</tspan>`).join('')}</text>`;
const arrow = (x1, y, x2) => `<path class="cv-arrow" d="M${x1} ${y}H${x2 - 7}m0 -5l7 5l-7 5"/>`;
/** where the followed claim ends up: the reference garden's Screen decision for the species, computed by the engine */
async function ending(d) {
  try { const [eng, ref] = await Promise.all([T.loadEngine(), PI.loadReference()]); const K = new eng.Knowledge(d); const c = T.buildCase(ref, K, eng.E, { fn: 'z:screen', origin: 'reference' }); const dc = c && T.decide(c, 'z:screen', SALAL); if (!c || !dc) return null;
    return { E: eng.E, garden: ref.name || ref.id, bed: c.bed.name, n: dc.objects.length, outcome: dc.outcome, status: c.screen.evaluation?.status || null, covered: c.screen.evaluation?.covered_m ?? null, edge: c.screen.evaluation?.edge_length_m ?? null }; } catch (e) { console.error(e); return null; }
}
const srcShort = (d, id) => cut((d.sources[id]?.label || id).split(' (')[0], 34);
const decisionLines = (it, end) => end ? [end.n ? `${end.n} planted in the ${end.bed}` : `${T.OUTCOME[end.outcome]?.word || end.outcome} for the ${end.bed}`, end.status ? `Screen: ${end.status}` : 'not evaluated'] : ['read by the Studio', 'bed by bed'];
// ---------------------------------------------------------------- Project
async function project(d) {
  const L = PI.links; const it = item(d); const end = await ending(d); let ref = null, imgs = null; try { [ref, imgs] = await Promise.all([PI.loadReference(), PI.loadImages()]); } catch (e) { console.error(e); }
  const art = it && imgs?.art?.[it.sp.slug]; COVER = it && ref ? { d, it, end, E: end?.E || null, ref, T, artHref: art ? PI.artUrl(art.file) : null } : null;
  const rowsNote = it ? `${d.attributes.filter(a => a.species === it.sp.id).length} recorded fields` : '';
  return `<div class="ab ab-project">
  <header class="ab-mast ab-hero"><div><h1>Planting design that can show its sources.</h1>
    <p class="ab-lede">Planting Intelligence helps you explore planting options from traceable plant records. It is an experimental design workflow using a limited plant knowledge base.</p>
    <p class="ab-enter"><a class="pi-btn primary" href="${L.design()}">Try Design</a><a class="pi-btn" href="${L.knowledge()}">Explore Knowledge</a></p></div></header>
  ${it && ref ? `<figure class="ab-plate" id="ab-plate">${F.cover(COVER, 1180)}<figcaption>From a plant to a planting, on real material: ${sci(it.sp.scientific_name)}, ${rowsNote}, its links in the knowledge network, and the reference garden “${esc(ref.name || ref.id)}” in plan and elevation. Dashed lines are records no person has verified yet. The illustration is AI-generated artwork and the elevation is drawn from claimed mature sizes: neither is evidence. <a href="${esc(L.trace(SALAL, { fn: 'z:screen' }))}">Follow this record</a></figcaption></figure>` : ''}
  ${sec('why', 'Why this exists', 'Plant knowledge is scattered. A design needs it in one place.', `
    <div class="ab-three">
      <div><h3>Databases say what a plant is</h3><p>A mature height, a soil preference. Each source describes its own region, and they often disagree. Disagreements are kept side by side, never averaged.</p></div>
      <div><h3>Practice knows why it is chosen</h3><p>Why a designer reaches for a plant is rarely written down. A practitioner survey collects that knowledge, kept apart from published data.</p></div>
      <div><h3>A design needs both, for one site</h3><p>A planting decision joins a plant, a place and a purpose. The Studio makes that join with written rules, so every plant it places can be followed back to its sources.</p></div>
    </div>`)}
  ${sec('surfaces', 'Four ways in', '', `
    <ul class="ab-ways">
      <li><a href="${L.design()}"><b>Design</b><span>Describe a site, say what the planting should do, generate an arrangement and revise it.</span></a></li>
      <li><a href="${L.library()}"><b>Plants</b><span>A profile for each species, with its evidence one step below.</span></a></li>
      <li><a href="${L.knowledge()}"><b>Knowledge</b><span>The records as a network, a matrix and a table. Trace one decision to its sources.</span></a></li>
      <li><a href="${L.how()}"><b>About</b><span>How the engine works, how the database is built, how to contribute.</span></a></li>
    </ul>`)}
  ${sec('limits', 'What it is, and is not', 'A prototype for a method, not a planting service.', `
    <div class="ab-two">
      <div><h3>It can</h3><ul class="ab-ticks">
        <li>Turn a described site into an editable site model and planting beds.</li>
        <li>Check each species against a bed’s function and stated conditions, and say why it passed or failed.</li>
        <li>Arrange two spatial functions, Screen and Ground Cover, and show the sources behind every placed plant.</li>
      </ul></div>
      <div><h3>It cannot</h3><ul class="ab-ticks no">
        <li>Design a real planting. The plant list is small on purpose: enough to test the method.</li>
        <li>Vouch for every fact. Some records are unverified or conditional, and each page says which.</li>
        <li>Predict performance. Results are model estimates from claimed mature sizes, not field measurements.</li>
        <li>Read free language with a live model in this public preview. Descriptions are read by written, offline rules.</li>
      </ul></div>
    </div>
    ${go([L.how(), 'How it works'], [L.method(), 'Research & Method'], [PI.routes.data, 'Sources & data'], [L.contribute(), 'Contribute'])}`)}
  </div>`;
}

// ---------------------------------------------------------------- Sources & data (V4.2): the professional layer
// What the knowledge base holds, counted from the published snapshot at page load: sources, claims, verification, the AI source check
// (kept apart from verification), gaps and disagreements, credits. Reproducibility information, not project housekeeping.
async function data(d) {
  const st = d.stats; const L = PI.links; const cells = st.attribute_cells + st.cells_not_recorded; const claims = Object.values(d.claims); const chk = st.claims_by_check || {}; const Lk = st.links_by_status || {};
  const nBy = {}; for (const c of claims) nBy[c.source_id] = (nBy[c.source_id] || 0) + 1;
  const TY = [['database', 'Published plant databases', 'Size, requirements, uses and seasonal character, each for the source’s own region'], ['municipal', 'Municipal and regional open data', 'What is planted and listed locally'], ['practitioner', 'Practitioner survey, anonymous', 'Reasons for choosing a plant, observations and warnings, kept as their own kind of claim'], ['model', 'Model placeholder', 'Never evidence. Listed so that a placeholder can be told from a source']];
  const of = k => Object.values(d.sources).filter(s => s.type === k); const nClaims = k => claims.filter(c => c.source_type === k).length;
  const named = Object.values(d.sources).filter(s => s.type !== 'practitioner' && s.type !== 'model').sort((a, b) => (nBy[b.id] || 0) - (nBy[a.id] || 0));
  let imgs = null; try { imgs = await PI.loadImages(); } catch { imgs = null; } const nPh = Object.keys(imgs?.images || {}).length, nArt = Object.keys(imgs?.art || {}).length;
  return `<div class="ab ab-data">
  ${mast('Sources &amp; data.', 'What the knowledge base holds, what is verified, and what is missing or in disagreement. Every figure on this page is counted from the published snapshot.',
    `<p class="ab-prov">Knowledge snapshot <b>${esc(d.generated)}</b><br>schema ${esc(d.schema_version)} · ontology ${esc(d.ontology_version)}<br>versioned, not live</p>`)}
  <dl class="ab-figs" aria-label="This release in figures">
    ${fig(st.species, null, 'species, chosen to test the method')}
    ${fig(st.claims, null, 'claims, each one statement from one source')}
    ${fig(st.claims_by_status.verified || 0, st.claims, 'claims a person has verified')}
    ${fig(st.cells_with_disagreement, st.attribute_cells, 'recorded fields where sources disagree, every value kept')}
  </dl>
  ${sec('sources', 'Sources', 'Where each claim comes from.', `
    <table class="pi-table ab-src"><thead><tr><th>Kind of source</th><th class="n">Sources</th><th class="n">Claims</th><th>What it records</th></tr></thead><tbody>
      ${TY.filter(([k]) => of(k).length).map(([k, l, w]) => `<tr><td>${l}</td><td class="n">${k === 'practitioner' ? '<span class="ab-q">anonymous</span>' : of(k).length}</td><td class="n">${nClaims(k)}</td><td>${w}</td></tr>`).join('')}
    </tbody></table>
    <details class="pi-more-d"><summary>The published sources, with their claims</summary><table class="pi-table ab-src"><thead><tr><th>Source</th><th>Publisher</th><th class="n">Claims</th></tr></thead><tbody>
      ${named.map(s => `<tr><td>${s.url ? `<a href="${esc(s.url)}" rel="noopener">${esc(s.label)}</a>` : esc(s.label)}</td><td>${esc(s.publisher || '')}</td><td class="n">${nBy[s.id] || 0}</td></tr>`).join('')}
    </tbody></table><p class="ab-note">A source describes its own region and purpose. A claim keeps its place, its conditions and its confidence.</p></details>`)}
  ${sec('standing', 'Verification and source check', 'Two different things, never merged.', `
    <div class="ab-two">
      <div><h3>Verified by a person</h3><p><b>${st.claims_by_status.verified || 0}</b> of ${st.claims} claims. A claim is verified only when a person has opened the source. Unverified is not wrong; it is unchecked.</p>
        <span class="pi-split ab-links"><i class="v" style="flex:${st.claims_by_status.verified || 0}"></i><i class="n" style="flex:${st.claims_by_status.unverified || 0}"></i></span></div>
      <div><h3>AI source check</h3><p>An aid for reviewers that reads a source against its claim. It never verifies. ${chk.supported_by_source || 0} supported by the source, ${chk.partially_supported || 0} partially, ${chk.conflicting_evidence || 0} conflicting, ${chk.not_assessed || 0} not assessed.</p>
        <span class="pi-split ab-links"><i class="v" style="flex:${chk.supported_by_source || 0}"></i><i class="p" style="flex:${chk.partially_supported || 0}"></i><i class="c" style="flex:${chk.conflicting_evidence || 0}"></i><i class="n" style="flex:${chk.not_assessed || 0}"></i></span></div>
    </div>`)}
  ${sec('state', 'Recorded, missing, in disagreement', 'A gap is a missing record, never a statement about the plant.', `
    <dl class="ab-figs in">${fig(st.attribute_cells, cells, `fields recorded across ${st.species} species`)}${fig(st.cells_with_disagreement, null, 'fields where sources disagree')}${fig(st.cells_not_recorded, null, 'fields with no record')}</dl>
    ${coverage(d)}
    <h3 class="ab-h3">Plants and spatial functions</h3>
    <p>Of ${st.function_links} possible links, ${Lk.derived || 0} are ${tag('derived')} from a use a source records, ${Lk.candidate || 0} are ${tag('candidate')} links inferred from traits, and ${Lk.unknown || 0} have ${tag('unknown', 'no link')}: ${st.unknown_by_verdict?.['contradicted by traits'] || 0} because a recorded trait is outside what the function needs, ${st.unknown_by_verdict?.['evidence missing'] || 0} because a needed claim is missing.</p>
    <span class="pi-split ab-links"><i class="v" style="flex:${Lk.derived || 0}"></i><i class="p" style="flex:${Lk.candidate || 0}"></i><i class="n" style="flex:${Lk.unknown || 0}"></i></span>
    ${st.relations_with_missing_claims?.length ? `<p class="ab-note">${plural(st.relations_with_missing_claims.length, 'plant-to-plant record')} cites a claim that is not in the database. It is flagged in the release.</p>` : ''}
    ${go([L.explorer(null, null, 'matrix'), 'Every link and gap in the matrix'], [L.explorer(null, null, 'table'), 'Every field in the table'])}`)}
  ${sec('credits', 'Images and credits', 'Presentation, not evidence.', `
    <p>${nArt ? `The ${nArt} plant illustrations are AI-generated editorial artwork. They are not botanical plates and no claim is read from them. ` : ''}${nPh ? `${nPh} reference photographs come from ${esc(String(imgs?.retrieved_from || 'open-licence collections').split(' (')[0])} under open licences; each is credited with its photographer, licence and source on its Plant Profile, and none is verified by this project.` : ''}</p>
    <p>The database, its methods log and the code are public. To correct a record, quote the claim id shown beside it.</p>
    ${go([PI.REPO_URL, 'Repository and data', true], [`${PI.REPO_URL}/issues`, 'Report an error in a record', true], [L.method(), 'How the database is built'], [PI.routes.specimen, 'Type specimen'])}`)}
  </div>`;
}

// ---------------------------------------------------------------- How it works: the computed figure (V4.1)
// One saved garden (the reference project) in four views. Every count, length, status and species below is read at page load from
// `engine.js` through `trace.js` (assemble, generate, evaluateScreen, evaluateGround); nothing is typed in. The arrangement view re-runs
// `E.generate` with one existing parameter changed (the ground-layer pattern of one bed). State lives in the address: ?view= &pattern= &fn=.
const VIEWS = [['site', 'Input &amp; site'], ['eligibility', 'Evidence &amp; eligibility'], ['arrangement', 'Composition &amp; arrangement'], ['evaluation', 'Evaluation']];
let ST = null; let COVER = null;
const fold = (id, title, sub, body) => `<details class="ab-fold" id="${id}"><summary><span>${title}</span>${sub ? `<em>${sub}</em>` : ''}</summary><div class="ab-fold-b">${body}</div></details>`;
const r2 = n => Math.round(n * 100) / 100;
const areaOf = poly => r2(Math.abs(poly.reduce((a, q, i) => { const n = poly[(i + 1) % poly.length]; return a + q[0] * n[1] - n[0] * q[1]; }, 0)) / 2);
const boxOf = poly => { const xs = poly.map(q => q[0]), ys = poly.map(q => q[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; };
const liveBeds = p => (p.site.beds || []).filter(b => b.status !== 'rejected' && Array.isArray(b.polygon));
const common = (K, id) => K.sp(id)?.common_names?.[0] || K.name(id);

/** the whole site in plan, from a project and (optionally) a version's plant objects.
 *  plants: 'none' | 'all'; hot: bed ids drawn stronger; screen: a case whose screened edge and uncovered stretches are drawn; shares: bed id → text */
function stagePlan(proj, version, { plants = 'none', hot = [], screen = null, shares = null, label = '' } = {}) {
  const B = proj.site.boundary; if (!B) return ''; const S = boxOf(B); const m = 0.5; const X = x => r2(x - S.x0 + m), Y = y => r2(S.y1 - y + m); const pts = poly => poly.map(q => `${X(q[0])},${Y(q[1])}`).join(' ');
  const W = r2(S.x1 - S.x0 + 2 * m), H = r2(S.y1 - S.y0 + 2 * m);
  let h = `<polygon class="pl-site" points="${pts(B)}"/>`;
  for (const f of proj.site.features || []) if (f.kind === 'no-plant-zone' && f.polygon) { const b = boxOf(f.polygon); h += `<polygon class="pl-open" points="${pts(f.polygon)}"/><text class="st-t dim" x="${X((b.x0 + b.x1) / 2)}" y="${Y((b.y0 + b.y1) / 2)}" text-anchor="middle">kept open</text>`; }
  for (const b of liveBeds(proj)) h += `<polygon class="pl-bed${hot.includes(b.id) ? ' on' : ''}" points="${pts(b.polygon)}"/>`;
  for (const f of proj.site.features || []) if (f.kind === 'existing-tree' && f.position_m) h += `<circle class="pl-tree" cx="${X(f.position_m[0])}" cy="${Y(f.position_m[1])}" r="${f.radius_m ?? 1.5}"/><circle class="pl-trunk" cx="${X(f.position_m[0])}" cy="${Y(f.position_m[1])}" r=".09"/>`;
  if (plants === 'all' && version) {
    const of = o => `cx="${X(o.position_m[0])}" cy="${Y(o.position_m[1])}" r="${o.proxy_radius_m}"`;
    for (const o of version.plant_objects) if (o.role === 'ground') h += `<circle class="pl-ground st-g${hot.includes(o.bed_id) ? ' on' : ''}" ${of(o)}/>`;
    for (const o of version.plant_objects) if (o.role === 'accent') h += `<circle class="pl-crown accent" ${of(o)}/>`;
    for (const o of version.plant_objects) if (/^screen/.test(o.role)) h += `<circle class="pl-crown" ${of(o)}/><circle class="pl-stem" cx="${X(o.position_m[0])}" cy="${Y(o.position_m[1])}" r=".04"/>`;
  }
  if (screen?.screen.zone) for (const [i, e] of screen.screen.zone.edges.entries()) {
    const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) || 1; const at = t => [e.a[0] + (e.b[0] - e.a[0]) * t / len, e.a[1] + (e.b[1] - e.a[1]) * t / len];
    h += `<line class="pl-edge" x1="${X(e.a[0])}" y1="${Y(e.a[1])}" x2="${X(e.b[0])}" y2="${Y(e.b[1])}"/>`;
    if (plants === 'all') for (const g of (screen.screen.evaluation?.gaps || []).filter(g => g.edge === i)) { const a = at(g.from_m), b = at(g.to_m); h += `<line class="pl-gap-u" x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}"/><line class="pl-gap" x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}"/><text class="st-t gap" x="${X((a[0] + b[0]) / 2)}" y="${r2(Y((a[1] + b[1]) / 2) - .12)}" text-anchor="middle">${g.length_m} m open</text>`; }
  }
  // bed names (and, in the evaluation view, the estimate of each ground layer), set inside the bed where it is widest
  for (const b of liveBeds(proj)) { const bb = boxOf(b.polygon); const tall = (bb.y1 - bb.y0) > 1.6 * (bb.x1 - bb.x0); const cx = X((bb.x0 + bb.x1) / 2), cy = Y((bb.y0 + bb.y1) / 2); const t = shares?.[b.id] ? `${b.name} · ${shares[b.id]}` : b.name;
    h += `<text class="st-t bed${plants === 'all' ? ' over' : ''}" x="${cx}" y="${r2(cy + .06)}" text-anchor="middle"${tall ? ` transform="rotate(-90 ${cx} ${cy})"` : ''}>${esc(t)}</text>`; }
  h += `<g class="pl-dim"><line x1="${X(S.x0)}" y1="${r2(H - .2)}" x2="${X(S.x1)}" y2="${r2(H - .2)}"/><text x="${r2(W / 2)}" y="${r2(H - .02)}" text-anchor="middle">${r2(S.x1 - S.x0)} m</text><text x="${r2(W - .1)}" y=".3" text-anchor="end">N ↑</text></g>`;
  return `<svg class="kn-plan st-plan" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${h}</svg>`;
}
const KEYS = { bed: '<span><i class="k-bed"></i>planting bed</span>', crown: '<span><i class="k-crown"></i>Screen plant, mature crown from a claimed spread</span>', ground: '<span><i class="k-gl"></i>ground-layer plant</span>', accent: '<span><i class="k-accent"></i>accent</span>', edge: '<span><i class="k-edge"></i>screened edge</span>', gap: '<span><i class="k-gap"></i>not covered</span>', tree: '<span><i class="k-tree"></i>existing tree, estimated crown</span>' };
const key = (...ks) => `<p class="kn-key">${ks.map(k => KEYS[k]).join('')}</p>`;
// V4.2 read mode. Two ways to read the reference garden, and every view reads the same one:
//   saved        the version the Studio stored (its plant objects, its recorded evaluation measured again)
//   recomputed   the whole garden generated again in the browser by E.generate with the saved seed and one ground-layer pattern;
//                site, eligibility, arrangement and evaluation all read that run. Nothing is stored.
const savedRun = () => ST.gc?.runs.find(r => r.saved) || ST.gc?.runs[0] || null;
function cur() {
  const { c, gc, K, E } = ST;
  if (ST.mode !== 'recomputed' || !gc) return { mode: 'saved', proj: c.project, version: c.version, screen: c, ground: ST.gSaved || c, run: null };
  const run = gc.runs.find(r => r.key === ST.pattern) || savedRun();
  if (!run.screen) { const bed = run.proj.site.beds.find(b => b.id === c.bed.id); run.screen = T.caseOf(run.proj, K, E, { bed, version: run.version, dry: true, origin: 'reference' }); }
  return { mode: 'recomputed', proj: run.proj, version: run.version, screen: run.screen, ground: run.c, run };
}
/** the Ground Cover estimate of every bed asked for it, for the case being read: the recorded figures of a saved version, the engine's own for a run */
function groundOf(k) {
  if (!k.version) return []; const rec = k.version.evaluation?.ground_cover; if (rec?.length) return rec;
  return liveBeds(k.proj).filter(b => { try { return ST.E.assemble(k.proj, ST.K, b).wanted.includes('z:ground_cover'); } catch { return false; } }).map(b => { try { return ST.E.evaluateGround(b, k.version, k.proj); } catch { return null; } }).filter(Boolean);
}
const readWord = k => k.mode === 'saved' ? 'As saved' : 'Recomputed preview';
function readLine() {
  const k = cur(); const { ref, gc } = ST;
  return `<div class="st-seg ab-read-seg" role="group" aria-label="Which result to read"><button type="button" data-mode="saved" aria-pressed="${k.mode === 'saved'}">As saved</button><button type="button" data-mode="recomputed" aria-pressed="${k.mode === 'recomputed'}"${gc ? '' : ' disabled'}>Recomputed preview</button></div>
    <span class="ab-read-t" aria-live="polite">${k.mode === 'saved' ? `<b>${esc(ref.name || ref.id)}</b>, the garden as the Studio saved it.` : `<b>${esc(ref.name || ref.id)}</b>, generated again in your browser with <b>${esc(k.run.label)}</b> in the ${esc(gc.bed.name)}. All four views read this run; nothing is stored.`}</span>`;
}
function caseLine() {
  const { c, ref, d, fp } = ST; const v = c.version; const L = PI.links; const der = c.ref?.derived;
  return `<span><b>${esc(ref.name || ref.id)}</b>, a garden saved by the Studio. It is not the garden of the Studio’s guided example: that one has its tree and north bed drawn differently, so its plants and its Screen result differ.</span>
    <a href="${esc(L.trace(SALAL, { fn: 'z:screen' }))}">Full trace of the saved Screen decision</a>
    <details class="ab-case-d"><summary>Version and reproducibility</summary><p>${c.dry ? 'no saved arrangement: the engine’s own run' : `version <span class="ab-id">${esc(v.id)}</span> “${esc(v.label || '')}”${der ? `, changed after it was generated (${esc(der.how)})` : ''}`} · seed ${esc(v?.seed)} · knowledge ${esc(c.snapshot.design || d.generated)} · ${v?.input_fp && !der ? `fingerprint <span class="ab-id">${esc(v.input_fp)}</span>` : `no input fingerprint is stored with this version${fp ? `; its inputs read now give <span class="ab-id">${esc(fp)}</span>` : ''}`}. A recomputed preview uses the same seed, geometry and knowledge snapshot.</p></details>`;
}
const metric = (n, label, d = '') => `<div><dd>${n}${d ? ` <span class="st-d">${d}</span>` : ''}</dd><dt>${label}</dt></div>`;

function stageHtml() {
  const { c, ref, K, gc, view } = ST; const k = cur(); const proj = k.proj; const v = k.version; const sc = k.screen; const ev = sc.screen.evaluation; const pl = sc.screen.plan; const beds = liveBeds(proj);
  const FNL = new Map(ST.d.functions.map(f => [f.id, f.label])); const bedId = gc?.bed.id; const gAll = groundOf(k); const gSaved = groundOf({ proj: c.project, version: c.version });
  const share = b => gAll.find(g => g.bed_id === b)?.ground_cover_share ?? null; const gs = share(bedId); const gs0 = gSaved.find(g => g.bed_id === bedId)?.ground_cover_share ?? null;
  const objs = v ? v.plant_objects : []; const data = `data-read="${k.mode}" data-pattern="${k.run ? k.run.key : 'saved'}" data-objects="${objs.length}" data-ground="${gs != null ? Math.round(gs * 100) : ''}" data-covered="${ev ? ev.covered_m : ''}"`;
  const pan = (h3, body, more) => `<div class="ab-pan" ${data}><p class="st-read">${readWord(k)}</p><h3>${h3}</h3>${body}<p class="st-more">${more}</p></div>`;
  if (view === 'site') {
    const conds = Object.entries(ref.site?.conditions || {}); const unk = conds.filter(([, x]) => !x || x.status === 'unknown'); const S = boxOf(proj.site.boundary);
    return `<figure class="ab-fig">${stagePlan(proj, null, { hot: [], label: `Plan of the ${r2(S.x1 - S.x0)} by ${r2(S.y1 - S.y0)} metre site with ${beds.length} planting beds, before any plant is placed` })}${key('bed', 'tree')}</figure>
    ${pan('What was said, and what was not', `${c.said ? `<blockquote class="ab-said sm">${esc(c.said)}</blockquote>` : ''}
      <dl class="st-m">${metric(beds.length, 'planting beds on the site model')}${metric(`${unk.length} of ${conds.length}`, 'site conditions left unknown')}</dl>
      <p class="ab-note">Nothing is assumed for an unknown condition. A check that needs one comes back uncertain.</p>`, `<a class="st-ev" href="#intent">View evidence: how the sentence is read</a>`)}`;
  }
  if (view === 'eligibility') {
    const fn = ST.fn; const cc = fn === 'z:screen' ? sc : k.ground; const ck = `${k.mode}|${k.run?.key || ''}|${fn}`; const all = ST.all[ck] || (ST.all[ck] = T.decisions(cc, fn)); const lab = FNL.get(fn) || fn;
    const ok = all.filter(x => x.cand && x.cand.fit !== 'fails'); const pend = ok.filter(x => T.pending(x)); const n = o => all.filter(x => x.outcome === o).length;
    return `<figure class="ab-fig">${stagePlan(proj, null, { hot: [cc.bed.id], screen: fn === 'z:screen' ? cc : null, label: `Plan of the site with the ${cc.bed.name} marked: the bed the ${all.length} species are checked for` })}${key('bed', ...(fn === 'z:screen' ? ['edge'] : []), 'tree')}</figure>
    ${pan(`${all.length} species checked for one bed`, `<div class="st-seg" role="group" aria-label="Which bed and function">${[['z:screen', sc], ...(gc ? [['z:ground_cover', k.ground]] : [])].map(([f, x]) => `<button type="button" data-fn="${f}" aria-pressed="${f === fn}">${esc(FNL.get(f) || f)} · ${esc(x.bed.name)}</button>`).join('')}</div>
      <dl class="st-m">${metric(ok.length, `pass the engine’s checks${pend.length ? `, ${pend.length} with a check still uncertain` : ''}`)}${metric(n('excluded'), `excluded${n('unknown') ? ` · ${n('unknown')} evidence unknown` : ''}${n('other_role') ? ` · ${n('other_role')} used for another function here` : ''}`)}</dl>
      <ul class="st-list tight">${all.map(x => `<li><a href="${esc(PI.links.trace(x.species, { fn }))}" title="${esc(cap(T.tidy(x.reason)))}"><span class="st-n">${esc(common(K, x.species))}</span>${T.outD(x)}</a></li>`).join('')}</ul>
      <p class="ab-note">Passing a check is not a recommendation for ${esc(lab)}. “Evidence unknown” is a missing record, not a verdict on the plant.</p>`, `<a class="st-ev" href="#checks">View evidence: the checks on one real claim</a>`)}`;
  }
  if (view === 'arrangement') {
    const run = k.run; const inBed = o => o.bed_id === bedId && (o.role === 'ground' || o.role === 'accent'); const nBed = objs.filter(inBed).length; const nSaved = c.version ? c.version.plant_objects.filter(inBed).length : 0;
    const opt = (key, l, t) => `<label><input type="radio" name="st-pattern" value="${key}"${(run ? run.key : 'saved') === key ? ' checked' : ''}><span><b>${l}</b>${t ? `<em>${t}</em>` : ''}</span></label>`;
    return `<figure class="ab-fig">${stagePlan(proj, v, { plants: 'all', hot: bedId ? [bedId] : [], screen: sc, label: `Plan of the site with ${objs.length} plant objects${run ? `, the ${gc.bed.name} generated as ${run.label}` : ' as saved'}` })}${key('crown', 'ground', 'accent', 'tree')}</figure>
    ${pan(`${objs.length} plant objects${run ? ', generated just now' : ', as saved'}`, `
      ${gc ? `<fieldset class="st-opt"><legend>Ground-layer pattern of the ${esc(gc.bed.name)}</legend>
        ${opt('saved', 'As saved', 'the stored version')}${gc.runs.map(r => opt(r.key, esc(r.label), r.saved ? 'the saved pattern, generated again' : 'recomputed')).join('')}</fieldset>
      <dl class="st-m">${metric(nBed, `plants in the ${esc(gc.bed.name)}`, run ? `saved: ${nSaved}` : '')}${metric(gs != null ? pct(gs) : 'not measured', 'of its ground under a mature crown, an estimate', run && gs0 != null ? `saved: ${pct(gs0)}` : '')}</dl>
      <p class="ab-note">${run ? `The engine generated the whole garden again with the saved seed and only this pattern set${run.saved ? '. The saved version was last changed in one bed only, so a full run can differ from it' : ''}. The Evaluation view now reads this run too.` : 'Choose a pattern: the engine runs again in your browser, and the plan, the counts and the evaluation change together.'}${pl?.reason ? ` Screen: ${esc(pl.reason)}.` : ''}</p>` : ''}`, `<a class="st-ev" href="#arrangement">View evidence: spacing and row rules</a>`)}`;
  }
  // evaluation: the case being read, measured on the model
  const ev0 = c.screen.evaluation; const shares = Object.fromEntries(gAll.map(g => [g.bed_id, pct(g.ground_cover_share)])); const evc = ev ? Object.entries(ev.checks) : []; const nameOf = g => g.name || beds.find(b => b.id === g.bed_id)?.name || g.bed_id;
  return `<figure class="ab-fig">${stagePlan(proj, v, { plants: 'all', hot: [sc.bed.id], screen: sc, shares, label: `Plan of the site as evaluated: the screened edge with ${ev?.gaps?.length || 0} uncovered stretch${ev?.gaps?.length === 1 ? '' : 'es'}, and the estimate of each ground layer` })}${key('crown', 'edge', 'gap', 'ground')}${T.edgeStrip(sc)}</figure>
  ${pan('Measured on the model, not in a garden', `
    ${ev ? `<p class="st-verdict ${esc(String(ev.status).replace(/\s+/g, '_'))}">Screen: ${esc(ev.status)}</p>
    <p><b>${ev.covered_m} of ${ev.edge_length_m} m covered</b> by a mature crown along the ${esc(sc.bed.name)}’s screened edge${ev.gaps?.length ? `; ${ev.gaps.map(g => `${g.length_m} m`).join(' and ')} left open` : ''}.${k.run && ev0 ? ` <span class="st-d">saved: ${ev0.covered_m} m</span>` : ''}</p>
    <ul class="st-checks">${evc.map(([n, x]) => `<li>${esc(cap(T.human(n)))} ${T.res(x)}</li>`).join('')}</ul>` : '<p>No Screen was evaluated in this garden.</p>'}
    ${gAll.length ? `<h4>Ground Cover: an estimate, with no pass mark</h4><ul class="st-checks">${gAll.map(g => { const s0 = gSaved.find(x => x.bed_id === g.bed_id)?.ground_cover_share; return `<li>${esc(nameOf(g))} <span><span class="pi-res estimate">${pct(g.ground_cover_share)} of ${g.plantable_m2} m²</span>${k.run && s0 != null && s0 !== g.ground_cover_share ? ` <span class="st-d">saved: ${pct(s0)}</span>` : ''}</span></li>`; }).join('')}</ul>
    <p class="ab-note">Model estimates from claimed mature sizes, not field measurements. The engine sets no threshold for Ground Cover, so it is never met or not met.</p>` : ''}`,
    `${k.run ? `<a class="st-ev" href="#evaluation">View evidence: every reason and check</a>` : `<a class="st-ev" href="${esc(PI.links.trace(SALAL, { fn: 'z:screen' }))}">View evidence: the full trace</a>`}`)}`;
}

function wireStage() {
  const root = $('#figure'); if (!root || !ST) return; const panel = $('#ab-stage-b'); const tabs = [...root.querySelectorAll('[role="tab"]')]; const read = $('#ab-read');
  const sync = (focus = false) => {
    for (const t of tabs) { const on = t.dataset.view === ST.view; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); }
    panel.setAttribute('aria-labelledby', `ab-tab-${ST.view}`); panel.innerHTML = stageHtml(); if (read) read.innerHTML = readLine(); root.dataset.read = ST.mode;
    const q = new URLSearchParams(location.search); q.set('view', ST.view); if (ST.mode === 'recomputed') { q.set('mode', 'recomputed'); q.set('pattern', cur().run.key); } else { q.delete('mode'); q.delete('pattern'); } if (ST.fn === 'z:ground_cover') q.set('fn', 'ground'); else q.delete('fn');
    history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
  };
  root.addEventListener('click', ev => {
    const t = ev.target.closest('[role="tab"]'); if (t) { ST.view = t.dataset.view; sync(); return; }
    const m = ev.target.closest('[data-mode]'); if (m && !m.disabled) { ST.mode = m.dataset.mode; if (ST.mode === 'recomputed' && !ST.gc.runs.some(r => r.key === ST.pattern)) ST.pattern = savedRun().key; sync(); read?.querySelector(`[data-mode="${ST.mode}"]`)?.focus(); return; }
    const f = ev.target.closest('[data-fn]'); if (f) { ST.fn = f.dataset.fn; sync(); panel.querySelector(`[data-fn="${ST.fn}"]`)?.focus(); }
  });
  root.querySelector('[role="tablist"]').addEventListener('keydown', ev => {
    const i = tabs.findIndex(t => t.dataset.view === ST.view); const to = ev.key === 'ArrowRight' ? (i + 1) % tabs.length : ev.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : ev.key === 'Home' ? 0 : ev.key === 'End' ? tabs.length - 1 : -1;
    if (to < 0) return; ev.preventDefault(); ST.view = tabs[to].dataset.view; sync(true);
  });
  root.addEventListener('change', ev => { if (ev.target.name === 'st-pattern') { const val = ev.target.value; if (val === 'saved') ST.mode = 'saved'; else { ST.mode = 'recomputed'; ST.pattern = val; } sync(); panel.querySelector('input[name="st-pattern"]:checked')?.focus(); } });
}

// ---------------------------------------------------------------- How it works
async function how(d) {
  const [eng, ref] = await Promise.all([T.loadEngine(), PI.loadReference()]); const E = eng.E; const K = new eng.Knowledge(d); const L = PI.links;
  const c = T.buildCase(ref, K, E, { fn: 'z:screen', origin: 'reference' }); if (!c) throw new Error('the reference garden holds no bed for Screen');
  const it = item(d); const sp = it.sp; const dc = T.decide(c, 'z:screen', SALAL); const all = T.decisions(c, 'z:screen'); const ev = c.screen.evaluation; const pl = c.screen.plan; const R = E.ARRANGEMENT_RULES; const req = c.asm.requirement || E.screenRequirement(c.asm.wanted_functions || []);
  const brief = ref.brief || {}; const conds = Object.entries(ref.site?.conditions || {}); const known = conds.filter(([, v]) => v && v.status !== 'unknown'); const FNL = new Map(d.functions.map(f => [f.id, f.label]));
  const said = c.said; const fnRows = (brief.functions || []).map(f => `<tr><td>${esc(FNL.get(f.function) || f.function)}${f.alternative ? ' <span class="ab-q">alternative to check</span>' : ''}</td><td>${esc(T.human(f.where).replace(/-/g, ' '))}</td><td>${esc(f.basis)}</td><td>${T.arranged(E, f.function) ? T.res('arranged') : `<span class="pi-out recorded_only">recorded only</span>`}</td></tr>`).join('');
  const sup = E.FUNCTION_SUPPORT; const arr = d.functions.filter(f => sup[f.id]?.arranged), rec = d.functions.filter(f => !sup[f.id]?.arranged);
  // stage 2: every species of the snapshot checked for the screened bed, in the engine's own outcome words
  const outRows = all.map(x => `<tr${x.species === SALAL ? ' class="on"' : ''}><td><a href="${esc(L.trace(x.species, { fn: 'z:screen' }))}">${sci(K.name(x.species))}</a></td><td>${T.out(x.outcome)}</td><td>${esc(cap(T.tidy(x.reason)))}</td></tr>`).join('');
  const nOut = k => all.filter(x => x.outcome === k).length;
  const checks = dc.cand ? Object.entries(dc.cand.checks).map(([k, v]) => `<tr><td>${esc(cap(T.human(k)))}</td><td>${T.res(v.result)}</td><td>${esc(cap(T.tidy(v.detail || '')))}</td></tr>`).join('') : '';
  const picks = role => (c.asm.picks[role] || []).map(p => sci(K.name(p.id))).join(', ') || 'none';
  const placed = pl ? pl.placed[0] + pl.placed[1] : c.screen.objects.length; const expected = pl ? pl.expected[0] + pl.expected[1] : null;
  const evChecks = ev ? Object.entries(ev.checks).map(([k, v]) => `<tr><td>${esc(cap(T.human(k)))}</td><td>${T.res(v)}</td></tr>`).join('') : '';
  // the Ground Cover example: one bed of the reference garden, generated three times by the engine with only the pattern changed
  const gc = groundRuns(ref, K, E);
  const ruleRow = (k, r) => `<tr><td>${esc(cap(T.human(k)))}</td><td class="ab-val">${r.value} <span>${esc(r.unit)}</span></td><td>${T.res(r.source)}</td><td>${esc(r.note ? cap(r.note) : '')}</td></tr>`;
  const KEY = ['screen_target_height', 'screen_spacing', 'ground_spacing', 'size_proxy', 'row_inset', 'area_sample']; const rest = Object.keys(R).filter(k => !KEY.includes(k));
  const nH = Object.values(R).filter(r => r.source === 'heuristic').length;
  const stage = (n, id, name, value, standing) => `<a href="#${id}"><span><b>${n}</b>${name}</span><strong>${value}</strong><em>${standing}</em></a>`;
  const fp = (() => { try { return T.inputFp(c.project, T.genOf(c.version)); } catch { return null; } })();
  const gSaved = gc ? T.buildCase(ref, K, E, { fn: 'z:ground_cover', bedId: gc.bed.id, origin: 'reference' }) : null;
  ST = { d, ref, K, E, c, gc, gSaved, fp, all: {}, view: 'site', mode: 'saved', pattern: null, fn: 'z:screen' };
  // ?view= · ?mode=recomputed[&pattern=<key>] · ?fn=ground. A V4.1 link that names only a pattern meant a recomputed arrangement.
  const q = new URLSearchParams(location.search); if (VIEWS.some(v => v[0] === q.get('view'))) ST.view = q.get('view'); if (q.get('fn') === 'ground' && gc) ST.fn = 'z:ground_cover';
  if (gc && (q.get('mode') === 'recomputed' || gc.runs.some(r => r.key === q.get('pattern')))) { ST.mode = 'recomputed'; ST.pattern = gc.runs.some(r => r.key === q.get('pattern')) ? q.get('pattern') : (gc.runs.find(r => r.saved) || gc.runs[0]).key; }
  return `<div class="ab ab-how">
  ${mast('What the engine actually computes.', 'One saved garden, followed from what was said to what was measured. Every plant, count and metre on this page is computed by the planting engine in your browser.',
    `<p class="ab-prov">Written rules, no live language model<br>Results are model estimates, not field measurements</p>`)}
  <section class="ab-stage" id="figure" data-read="${ST.mode}" aria-label="The reference garden, computed in four views">
    <div class="ab-read" id="ab-read">${readLine()}</div>
    <div class="ab-tabs" role="tablist" aria-label="What to look at">${VIEWS.map(([k, l], i) => `<button type="button" role="tab" id="ab-tab-${k}" data-view="${k}" aria-controls="ab-stage-b" aria-selected="${k === ST.view}" tabindex="${k === ST.view ? 0 : -1}"><b>${i + 1}</b>${l}</button>`).join('')}</div>
    <div class="ab-stage-b" id="ab-stage-b" role="tabpanel" aria-labelledby="ab-tab-${ST.view}" tabindex="0">${stageHtml()}</div>
    <div class="ab-case">${caseLine()}</div>
  </section>
  <h2 class="ab-below">The rules behind each view</h2>

  ${fold('intent', 'Intent &amp; site', 'What you say and draw. Anything not stated stays unknown.', `
    ${said ? `<blockquote class="ab-said">${esc(said)}</blockquote><p class="ab-by">${T.who('you')} the sentence the reference garden was started with</p>` : ''}
    <p>Offline rules read the sentence. They look for dimensions, existing trees, open areas and a short list of wishes, and they name the rule behind each reading. No language model is connected to this public preview.</p>
    <table class="pi-table"><thead><tr><th>Spatial function</th><th>Where</th><th>Why the rules proposed it</th><th>Engine</th></tr></thead><tbody>${fnRows}</tbody></table>
    <p class="ab-by">${T.who('rule')} offline parser${brief.evidence?.length ? `: ${brief.evidence.map(e => esc(e.rule)).join(' · ')}` : ''}</p>
    <div class="ab-unk"><h3>Left unknown, not assumed</h3><ul>${conds.map(([k, v]) => `<li>${esc(cap(T.human(k)))} <span class="pi-res ${v?.status === 'unknown' ? 'unknown' : 'met'}">${esc(v?.status === 'unknown' ? 'unknown' : v?.value ?? v?.status)}</span></li>`).join('')}</ul>
    <p class="ab-note">A check that needs an unknown condition comes back <b>uncertain</b>, never passed.</p></div>`)}

  ${fold('checks', 'Eligibility &amp; evidence checks', 'Every species is checked for the bed. The reason is kept either way.', `
    <p>The ${esc(c.bed.name)} is asked to be a Screen${req?.target_height_m ? ` of ${req.target_height_m} m (${esc(req.target_basis || '')})` : ''}. The engine checks each species for evidence of the function, the height, and the site conditions. Here is ${sci(sp.scientific_name)}:</p>
    <dl class="pi-ledger ab-led">
      ${it.claim ? T.row('source', `<blockquote>${esc(it.check?.excerpt || it.claim.text)}</blockquote><p class="pi-led-n">${esc(T.sourceName(d, it.claim.source_id))}${it.check?.locator ? `, ${esc(it.check.locator.split(':')[0].toLowerCase())}` : ''}</p>`, T.sourceLink(d, it.claim.source_id), 'source') : ''}
      ${it.claim ? T.row('claim', `<p>Landscape use = <b>${esc(T.valueLabels(d, it.claim).join(', '))}</b></p><p class="pi-led-n">${esc(it.claim.text)}</p>`, `${mono(it.claim.id)}<span>confidence ${it.claim.confidence}</span>`) : ''}
      ${it.claim ? T.row('verification', `<p>${tag(it.claim.status)} No reviewer has opened the source for this claim yet.</p>`, '', it.claim.status === 'verified' ? 'person' : null) : ''}
      ${it.check ? T.row('ai', `<p>${tag(it.check.result, T.AI_WORD[it.check.result])} ${esc(it.check.missing_context || it.check.explanation || '')}</p>`, `<span>read ${esc(String(it.check.reviewed_at || '').slice(0, 10))}</span>`) : ''}
      ${T.row('rule', `<p>${tag(it.link.status)} A recorded use that maps to Screen links the species to the function${it.link.rule ? ` (${esc(it.link.rule)})` : ''}. The traits Screen requires are met by recorded claims: ${it.link.requirements.map(r => `${esc(r.alternative_labels[0].toLowerCase())} <span class="pi-res ${esc(r.result)}">${esc(r.result)}</span>`).join(', ')}.</p>`, `${mono(it.link.id)}<span>claims ${esc(it.link.verification)}</span>`)}
    </dl>
    ${checks ? `<h3 class="ab-h3">The engine’s checks for ${sci(sp.scientific_name)} in the ${esc(c.bed.name)}</h3><table class="pi-table ab-checks"><thead><tr><th>Check</th><th>Result</th><th>Why</th></tr></thead><tbody>${checks}</tbody></table>` : ''}
    <details class="pi-more-d"><summary>All ${all.length} species for this bed’s Screen</summary>
      <table class="pi-table ab-out"><thead><tr><th>Species</th><th>Outcome</th><th>Reason</th></tr></thead><tbody>${outRows}</tbody></table>
      <p class="ab-note">“Eligible” means the engine’s checks passed or are pending on unknown site conditions. It is not a horticultural recommendation. “Evidence unknown” means a record is missing, which is not the same as unsuitable.</p></details>`)}

  ${fold('composition', 'Plant composition', 'Which of the species that qualify are used.', `
    <p>From the species that pass, the engine takes the best-ranked for each role: at most ${E.COMPOSITION.max_species.screen} for a Screen row and ${E.COMPOSITION.max_species.ground} for a ground layer. You can replace its mix in Compose with any species that qualifies for the bed. A species you ask for is still checked; one that fails is not planted.</p>
    <table class="pi-table"><thead><tr><th>Role in the ${esc(c.bed.name)}</th><th>Mix</th><th>Outcome for ${sci(sp.scientific_name)}</th></tr></thead><tbody>
      <tr><td>Screen row</td><td>${picks('screen')}</td><td>${T.out(dc.outcome)} <span class="ab-q">${esc(T.tidy(dc.reason))}</span></td></tr>
      <tr><td>Ground layer</td><td>${picks('ground')}</td><td>${T.out(T.decide(c, 'z:ground_cover', SALAL).outcome)}</td></tr>
      ${c.asm.picks.accent?.length ? `<tr><td>Accents</td><td>${picks('accent')}</td><td></td></tr>` : ''}
    </tbody></table>
    <p class="ab-by">${T.who('rule')} ranking and mix: engine.js <span class="ab-id">assemble</span> · ${T.who('you')} any change to the mix</p>`)}

  ${fold('arrangement', 'Spatial arrangement', 'Where each plant stands, by named operators and stated spacing.', `
    <div class="ab-draw"><div>${T.planSvg(c, { fn: 'z:screen', species: SALAL })}<p class="kn-key"><span><i class="k-bed"></i>planting bed</span><span><i class="k-crown"></i>mature crown, from a claimed spread</span><span><i class="k-edge"></i>screened edge</span><span><i class="k-gap"></i>not covered</span><span><i class="k-tree"></i>existing tree, estimated</span></p></div>
    <div>${pl ? `<p>${pl.rows === 1 ? 'One row' : `${pl.rows} rows`} along the ${pl.edge_length_m} m edge: ${expected} positions at ${pl.step_m} m, <b>${placed} planted</b>.${pl.shortfall ? ` ${esc(cap(T.tidy(pl.shortfall)))}.` : ''}</p>
      <p>Spacing: ${esc(pl.spacing_rule)}. ${T.res(pl.spacing_source)}</p>
      <p>${esc(cap(pl.reason || ''))}.</p>` : '<p>No row plan was computed for this bed.</p>'}
      <p class="ab-note">Crowns are drawn at half the claimed mature spread. They are size proxies with their claim id on every plant object, not a picture of how the plants will grow.</p></div></div>
    <p class="ab-by">${T.who('rule')} operators ${(sup['z:screen']?.operators || []).map(o => `<span class="ab-id">${esc(o)}</span>`).join(' ')} · seeded and deterministic: the same input gives the same garden</p>`)}

  ${fold('evaluation', 'Evaluation &amp; revision', 'The engine measures its own result on the model, and says so when it falls short.', `
    ${ev ? `<p class="ab-verdict ${esc(String(ev.status).replace(/\s+/g, '_'))}">Screen: ${esc(ev.status)}</p>
    <ul class="ab-reasons">${(ev.reasons || []).map(r => `<li>${T.res(r.kind === 'unmet' ? 'not met' : r.kind)} ${esc(cap(r.text))}</li>`).join('')}</ul>
    ${T.edgeStrip(c)}
    <div class="ab-two"><table class="pi-table"><thead><tr><th>Check</th><th>Result</th></tr></thead><tbody>${evChecks}</tbody></table>
    <div><p>${ev.covered_m} m of ${ev.edge_length_m} m lies under a mature crown. The target height of ${ev.target_height_m} m is ${esc(ev.target_basis)}.</p><p class="ab-note">${esc(cap(ev.note || ''))}</p></div></div>` : '<p>Nothing was evaluated for this bed.</p>'}
    <h3 class="ab-h3">Revision</h3>
    <p>A result is where revision starts. In Compose you can state the target height, require year-round cover, change the row, or choose other species that qualify; the engine runs again and the plan, the schedule and this evaluation change together. If a change gives the same result, the page says why.</p>
    ${go([L.trace(SALAL, { fn: 'z:screen' }), 'The full trace of this decision'], [L.design(), 'Open the Studio'])}`)}

  ${fold('ground', 'Ground Cover patterns, side by side', 'A pattern is a real instruction to the engine. Its result is an estimate with no pass mark.', gc ? `
    <p>The ${esc(gc.bed.name)} of the same garden, generated three times with only the pattern changed. Each run gives a different set of plant objects, and the estimate is measured again.</p>
    <div class="ab-runs">${gc.runs.map(r => `<figure>${r.svg}<figcaption><b>${esc(r.label)}</b><span>${esc(cap(r.text))}</span><span class="ab-run-n">${r.plants} plants${r.species.length ? `: ${r.species.map(([id, n]) => `${n} ${esc(K.sp(id)?.common_names?.[0] || K.name(id))}`).join(', ')}` : ''}</span><span class="ab-est">Ground Cover: an estimate, ${r.share != null ? pct(r.share) : 'not measured'}</span></figcaption></figure>`).join('')}</div>
    <p class="ab-note">The share is the part of the plantable bed area under the mature crowns of the ground layer, at claimed spreads, on a ${R.area_sample.value} m grid. The engine sets no threshold for it, so no page calls it met or not met. Clustered patches leave ground open on purpose, and the estimate counts that ground as uncovered.</p>
    <p class="ab-by">${T.who('rule')} operators ${gc.runs.map(r => `<span class="ab-id">${esc(r.operator)}</span>`).join(' ')} · ${T.who('estimate')} engine.js <span class="ab-id">evaluateGround</span></p>` : '<p>The reference garden holds no Ground Cover bed to demonstrate.</p>')}

  ${fold('who', 'Who or what decides', 'Five kinds of work, kept apart on every page.', `
    <table class="pi-table ab-who"><thead><tr><th>Kind</th><th>What it is here</th><th>What it is not</th></tr></thead><tbody>
      <tr><td>${T.who('you')}<b>Human input</b></td><td>The outline, the beds, the stated conditions, what each bed is for, the species you ask to consider, the arrangement you keep.</td><td>Never overridden silently. Never assumed where you said nothing.</td></tr>
      <tr><td>${T.who('rule')}<b>Offline rule</b></td><td>Reading your sentence, proposing beds, the knowledge-graph rules, the checks, the arrangement operators, the evaluation. Deterministic and written down.</td><td>Not a language model. Not learned from data.</td></tr>
      <tr><td>${T.who('record')}<b>Record</b></td><td>Every fact about a plant: a claim with its source, place, conditions and confidence, verified or not by ${T.who('person')}.</td><td>Not a recommendation. Unverified is unchecked, not wrong.</td></tr>
      <tr><td>${T.who('ai')}<b>AI source assessment</b></td><td>An AI assistant read each source against its claim and recorded whether the source supports it: ${d.stats.claims_by_check.supported_by_source || 0} supported, ${d.stats.claims_by_check.partially_supported || 0} partially, ${d.stats.claims_by_check.conflicting_evidence || 0} conflicting, ${d.stats.claims_by_check.not_assessed || 0} not assessed.</td><td>Not verification. It never changes a claim’s status and never selects a plant.</td></tr>
      <tr><td>${T.who('estimate')}<b>Heuristic</b></td><td>${nH} of the engine’s ${Object.keys(R).length} numbers, such as spacing factors and the default target height. Chosen by the implementer and named wherever they decide something.</td><td>Not from a source. Not a horticultural standard.</td></tr>
    </tbody></table>
    <p class="ab-note">The Plant Library’s illustrations are AI-generated editorial artwork. They are not evidence, and no fact is read from them.</p>`)}

  ${fold('rules', 'The numbers the engine uses', 'Heuristics with their provenance, not scientific performance claims.', `
    <table class="pi-table ab-rules"><thead><tr><th>Rule</th><th>Value</th><th>From</th><th>Note</th></tr></thead><tbody>${KEY.filter(k => R[k]).map(k => ruleRow(k, R[k])).join('')}</tbody></table>
    <details class="pi-more-d"><summary>The other ${rest.length + Object.keys(E.HEURISTICS).length} numbers</summary><table class="pi-table ab-rules"><tbody>${rest.map(k => ruleRow(k, R[k])).join('')}${Object.entries(E.HEURISTICS).map(([k, h]) => `<tr><td>${esc(cap(T.human(k)))}</td><td class="ab-val">${h.value}</td><td>${T.res('heuristic')}</td><td>${esc(cap(h.text.replace(/^heuristic: /, '')))}</td></tr>`).join('')}</tbody></table></details>
    <p class="ab-by">read from design/js/engine.js: <span class="ab-id">ARRANGEMENT_RULES</span> <span class="ab-id">HEURISTICS</span> · “claim” is read from the database, “geometry” follows from the shapes, “heuristic” was chosen by the implementer</p>`)}

  ${fold('functions', 'Arranged, or recorded only', 'The knowledge base records five spatial functions. The engine arranges two.', `
    <table class="pi-table"><thead><tr><th>Spatial function</th><th>Engine</th><th>What you get</th></tr></thead><tbody>
      ${arr.map(f => `<tr><td><b>${esc(f.label)}</b></td><td>${T.res('arranged')}</td><td>Plant objects by ${(sup[f.id].operators || []).map(o => `<span class="ab-id">${esc(o)}</span>`).join(' ')}; ${f.id === 'z:screen' ? 'covered edge length against the asked length, with a status' : 'an estimate of covered ground, no status'}.</td></tr>`).join('')}
      ${rec.map(f => `<tr><td><b>${esc(f.label)}</b></td><td><span class="pi-out recorded_only">recorded only</span></td><td>${esc(cap((sup[f.id]?.why || 'no arrangement rule').replace(/^recorded only — /, '')))}. No plant is placed and no metric is shown.</td></tr>`).join('')}
    </tbody></table>
    <p class="ab-note">Values such as low maintenance are selection preferences. Ecology and seasonal interest influence where accents go in a ground layer. None of them is an optimised or validated score.</p>
    ${go([L.method(), 'How the knowledge base is built'], [L.explorer(null, null, 'matrix'), 'Every species and function in the matrix'])}`)}
  </div>`;
}
/** Ground Cover runs on the reference garden: the bed with the largest ground layer, generated once per pattern by E.generate with the
 *  seed the saved version carries. The project is cloned; nothing is stored. */
function groundRuns(ref, K, E) {
  try {
    const base = JSON.parse(JSON.stringify(ref)); const cur = (base.versions || []).find(v => v.id === base.current_version_id) || null; const beds = T.tracedBeds(base, K, E, 'z:ground_cover'); if (!beds.length) return null;
    const n = b => cur ? cur.plant_objects.filter(o => o.bed_id === b.id && o.role === 'ground').length : 0; const bed0 = beds.slice().sort((a, b) => n(b) - n(a))[0]; const seed = cur?.seed ?? T.DRY_SEED;
    const runs = Object.entries(E.COMPOSITION.patterns).map(([key, p]) => {
      const proj = JSON.parse(JSON.stringify(ref)); const bed = proj.site.beds.find(b => b.id === bed0.id); bed.composition = { ...(bed.composition || {}), pattern: key };
      const all = proj.site.beds.filter(b => b.status !== 'rejected' && Array.isArray(b.polygon)).map(b => b.id);
      const version = E.generate(proj, K, all, seed, { density: 1, stagger: true, id_start: 0 }); const c = T.caseOf(proj, K, E, { bed, version, dry: true, origin: 'reference' });
      const objs = version.plant_objects.filter(o => o.bed_id === bed.id && (o.role === 'ground' || o.role === 'accent')); const by = {}; for (const o of objs) by[o.species_id] = (by[o.species_id] || 0) + 1;
      const g = c.ground.evaluation;
      return { key, proj, version, c, bedId: bed.id, saved: E.compositionOf(bed0).pattern === key, label: p.label, text: p.text, operator: c.ground.group?.operator || p.operator, plants: objs.length, species: Object.entries(by).sort((a, b) => b[1] - a[1]), share: g?.ground_cover_share ?? null, svg: T.planSvg(c, { fn: 'z:ground_cover', zoom: true }) };
    });
    return { bed: bed0, seed, savedN: n(bed0) + (cur ? cur.plant_objects.filter(o => o.bed_id === bed0.id && o.role === 'accent').length : 0), runs };
  } catch (e) { console.error(e); return null; }
}

// ---------------------------------------------------------------- Research & Method
const STEPS = ['Local Data Extraction', 'Data Integration & Structured Claims', 'Data Validation & Verification', 'Survey Analysis & Knowledge Requirements', 'Professional Plant Knowledge Enrichment', 'Planting Design Knowledge Integration', 'Multimodal Knowledge Graph Construction'];
async function method(d) {
  const st = d.stats; const L = PI.links; const it = item(d); const claims = Object.values(d.claims); const chk = st.claims_by_check; const ty = bySourceType(d);
  const n = f => claims.filter(f).length; const local = n(c => c.source_type === 'municipal'); const pract = claims.filter(c => c.source_type === 'practitioner'); const db = n(c => c.source_type === 'database');
  const salal = claims.filter(c => c.plant === it.sp.slug); const salalLocal = salal.filter(c => c.source_type === 'municipal'); const salalPract = salal.filter(c => c.source_type === 'practitioner'); const salalDb = salal.filter(c => c.source_type === 'database');
  const gates = d.facets.filter(f => f.gate); const Lk = st.links_by_status; const cells = st.attribute_cells + st.cells_not_recorded; const name = (it.sp.common_names[0] || it.sp.scientific_name).toLowerCase();
  const end = await ending(d); const E = end?.E || (await T.loadEngine()).E;   // the reference garden: where the claim ends up
  const cl = it.claim; const ck = it.check; const FNL = id => d.functions.find(f => f.id === id)?.label || id;
  const notes = { local: salalLocal.length ? wrapT(`${plural(salalLocal.length, 'local claim')} about ${name}`, 19) : wrapT(`No local record of ${name}. The absence is kept.`, 19), survey: wrapT(salalPract.length ? `${plural(salalPract.length, 'practitioner claim')} about ${name} stand beside it, kept apart` : `No practitioner claim about ${name} in this release`, 19) };
  let imgs = null; try { imgs = await PI.loadImages(); } catch { imgs = null; } const art = imgs?.art?.[it.sp.slug]; const fctx = { d, it, end, E, T, artHref: art ? PI.artUrl(art.file) : null };
  const step = (i, does, more, walk) => { const fg = F.step(i, fctx); return `<li class="ab-step${i === 3 ? ' through' : ''}" id="step-${i}"><div class="ab-step-n" aria-hidden="true">${i}</div>
    <div class="ab-step-b"><h3><span class="sr">Step ${i}: </span>${esc(STEPS[i - 1])}</h3><p>${does}</p><div class="ab-step-w"><span class="ab-step-wl">The followed record here</span>${walk}</div><details class="pi-more-d ab-step-d"><summary>In this release, and who does it</summary>${more}</details></div>
    ${fg ? `<figure class="ab-fx" data-fig="${i}">${fg.svg}<figcaption>${fg.cap}</figcaption></figure>` : ''}</li>`; };
  const rel = (today, who, extra = '') => `<p class="ab-today">${today}</p><p class="ab-by">${who}</p>${extra}`;
  const kinds = Object.entries(T.KIND).map(([k, v]) => `<div class="pi-led"><dt>${esc(v.label)}</dt><dd><p>${esc(v.says)}</p></dd><dd class="pi-led-p">${T.who(v.who)}</dd></div>`).join('');
  const kg = Object.entries(d.rules).filter(([id]) => !/^M4\d$/.test(id)).sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true })).map(([id, text]) => `<tr><td><b>${esc(id)}</b></td><td>${esc(cap(text).replace(/\(to confirm\)/g, '(provisional)'))}.</td></tr>`).join('');   // a rule the snapshot marks as not yet confirmed reads as provisional to a visitor
  return `<div class="ab ab-method">
  ${mast('Seven steps from a source to a knowledge graph.', 'The database is the research. It is built by one method in seven steps, and validation continues through every step after the third.',
    `<p class="ab-prov">One real record is followed on this page:<br>${sci(it.sp.scientific_name)} recorded as a hedge</p>`)}
  <ol class="ab-seven" data-claim="${esc(cl.id)}" aria-label="The seven steps">${STEPS.map((n, i) => `<li${i >= 2 ? ' class="v"' : ''}><a href="#step-${i + 1}"><b>${i + 1}</b><span>${esc(n)}</span></a></li>`).join('')}</ol>
  <p class="ab-seven-k"><span><i></i>building the record</span><span><i class="v"></i>validation continues through every later step</span></p>

  <section class="ab-sec wide" id="steps"><div class="ab-sec-h"><h2>The seven steps</h2><p>What each step does, drawn from the material it works on.</p></div>
  <ol class="ab-steps">
    ${step(1, 'Open local data is fetched and stored as published: what is planted in the city, with its snapshot date.',
      rel(`${local} claims from ${ty.municipal || 0} municipal and regional open-data sources.`, `${T.who('record')} fetched by script, stored as published`),
      `<p>${salalLocal.length ? `${plural(salalLocal.length, 'local claim')} about ${esc(name)}.` : `<b>No local record of ${esc(name)}.</b> The absence is kept as an absence.`} The hedge claim does not come from this step.</p>`)}
    ${step(2, 'Every statement becomes one claim: one plant, one field, one value, one source. Sources that disagree are kept side by side.',
      rel(`${st.claims} claims across ${d.facets.length} fields; ${st.attribute_cells} of ${cells} species-by-field cells recorded, ${st.cells_with_disagreement} with a disagreement kept.`, `${T.who('record')} ${T.who('rule')} schema and vocabulary checks on landing`),
      `<p>Landscape use = <b>${esc(T.valueLabels(d, cl).join(', '))}</b>, source ${esc(T.sourceName(d, cl.source_id))}, confidence ${cl.confidence}.</p><p>${mono(cl.id)}</p>`)}
    ${step(3, 'A claim is verified only when a person has opened the source. An AI source check helps reviewers and is part of this step; it never verifies.',
      rel(`${st.claims_by_status.verified || 0} of ${st.claims} claims verified by a person. AI source check: ${chk.supported_by_source || 0} supported, ${chk.partially_supported || 0} partially, ${chk.conflicting_evidence || 0} conflicting, ${chk.not_assessed || 0} not assessed.`, `${T.who('person')} verifies · ${T.who('ai')} assesses, never verifies · ${T.who('rule')} validates`, '<p class="ab-carry">Validation does not end here. It runs again at every later step: each new claim, link and release is checked.</p>'),
      `<p>${tag(cl.status)} ${ck ? tag(ck.result, `AI: ${T.AI_WORD[ck.result]}`) : ''}</p>${ck?.missing_context ? `<p>${esc(ck.missing_context)}</p>` : ''}`)}
    ${step(4, 'The practitioner survey is analysed for what designers need to know and cannot find. It shapes which fields the database must hold; it does not vote on plants.',
      rel(`${pract.length} practitioner claims in this release, kept as their own kind; ${gates.length} of ${d.facets.length} fields marked as must-pass gates${gates.length ? ` (${gates.map(f => esc(f.label.toLowerCase())).join(', ')})` : ''}.`, `${T.who('respondent')} ${T.who('person')} a researcher maps each statement by hand`),
      `<p>${salalPract.length ? `${plural(salalPract.length, 'practitioner claim')} about ${esc(name)}, stored as ${[...new Set(salalPract.map(c => T.human(c.claim_kind)))].map(esc).join(' and ')}.` : `No practitioner claim about ${esc(name)} in this release.`} None of them is the hedge claim; they stand beside it.</p>`)}
    ${step(5, 'Professional plant sources are read one plant and one source at a time. Only structured values are taken, each with its address and context.',
      rel(`${db} claims from ${ty.database || 0} published plant databases.`, `${T.who('source')} ${T.who('person')} assisted extraction, reviewed per source`),
      `<p>This is where the record enters. ${esc(T.sourceName(d, cl.source_id))}${ck?.excerpt ? ` states: <q>${esc(ck.excerpt)}</q>.` : '.'}</p>`)}
    ${step(6, 'Planting design knowledge is added as spatial functions with the traits each requires. Written rules link a species to a function, and every link carries the standing of the claims under it.',
      rel(`${st.function_links} possible links between ${st.species} species and ${st.functions} functions: ${Lk.derived || 0} derived from a recorded use, ${Lk.candidate || 0} candidate from traits, ${Lk.unknown || 0} with no link.`, `${T.who('rule')} named on every link`),
      `<p>${tag(it.link.status)} The recorded use maps to <b>${esc(it.fn.label)}</b>${it.link.rule ? ` by rule ${esc(it.link.rule)}` : ''}. ${plural(it.link.requirements.filter(r => r.result === 'met').length, 'required trait')} met by recorded claims.</p>`)}
    ${step(7, 'Claims, concepts, rules and links are built into one graph and published as a dated snapshot. Every page of this platform reads that one file.',
      rel(`${st.concepts} concepts, ${st.concept_links} concept links, ${st.relations_live} live plant-to-plant relations. The graph holds text and structured records; its slot for images and plans is still empty, so it is not yet multimodal in content.`, `${T.who('rule')} built by script, tested, released by ${T.who('person')}`),
      `<p>The Studio reads the link. ${end ? `In the reference garden, ${end.n ? `${end.n} ${esc(name)} are planted along the ${esc(end.bed)}’s screened edge` : `${esc(name)} is ${esc(T.OUTCOME[end.outcome]?.word || end.outcome)} for the ${esc(end.bed)}`}${end.status ? `, and the engine reports <span class="pi-res ${esc(end.status.replace(/\s+/g, '_'))}">Screen: ${esc(end.status)}</span>` : ''}.` : ''}</p>${go([L.trace(SALAL, { fn: 'z:screen' }), 'Trace this decision'])}`)}
  </ol></section>

  ${sec('values', 'From a value to a result', 'What Design can act on today, and what is only recorded.', `
    <table class="pi-table ab-vfe"><thead><tr><th>Value</th><th>Spatial function</th><th>Engine</th><th>Evaluation</th></tr></thead><tbody>
      <tr><td><b>Privacy</b></td><td>${esc(FNL('z:screen'))}</td><td>A row along an edge, spaced at ${E.ARRANGEMENT_RULES.screen_spacing.value} × the claimed spread</td><td>Edge under mature crowns, in metres: met, not met or uncertain</td></tr>
      <tr><td><b>Ground coverage</b></td><td>${esc(FNL('z:ground_cover'))}</td><td>A ground layer in one of ${Object.keys(E.COMPOSITION.patterns).length} patterns</td><td>Share under mature crowns: an estimate with no pass mark</td></tr>
      <tr class="mute"><td>Not offered as a value</td><td>${d.functions.filter(f => !E.FUNCTION_SUPPORT[f.id]?.arranged).map(f => esc(f.label)).join(' · ')}</td><td>No arrangement rule</td><td>No result is shown</td></tr>
    </tbody></table>
    <p class="ab-note">Results are model estimates from claimed mature sizes, not field measurements. A missing link is a gap in the records, not a statement that a plant is unsuitable.</p>
    ${go([L.how(), 'See the engine compute one garden'], [L.knowledge(), 'Explore the network'])}`)}

  ${sec('kinds', 'Eight kinds of statement', 'Kept apart on every page, in this order, with these words.', `<dl class="pi-ledger ab-led">${kinds}</dl>`)}

  <h2 class="ab-below">More on the method</h2>
  ${fold('pipeline', 'The method is not the scripts', 'Seven research steps; one chain of automated scripts.', `
    <p>The seven steps describe research work: reading sources, mapping statements, reviewing claims. Most of it is done or checked by a person. The automated part is one chain of scripts, <span class="ab-id">tools/pipeline.py</span>, which rebuilds the graph from the claim files whenever they change:</p>
    <ol class="ab-pipe"><li>ontology<span>concepts and their relations</span></li><li>graph<span>claim edges, growth forms</span></li><li>knowledge graph<span>typed, evidenced links, gaps</span></li><li>XYZ projection<span>form · attributes · functions</span></li><li>explorer snapshot<span>the file every page reads</span></li><li>validation<span>schema, ids, links</span></li></ol>
    <p class="ab-note">The scripts implement parts of steps 3, 6 and 7. They never extract a source, never verify a claim and never read a survey response.</p>`)}
  ${fold('rules', 'Graph rules', 'Everything between a claim and a link is written down.', `
    <p>A species is linked to a spatial function in one of two ways: a source records a use the ontology maps to the function (${tag('derived')}), or every trait the function requires is met by recorded claims (${tag('candidate')}, never promoted). Anything else is ${tag('unknown')} and is listed as a gap, not drawn.</p>
    <table class="pi-table ab-kg"><tbody>${kg}</tbody></table>`)}
  ${go([PI.routes.data, 'Sources & data: what is recorded, verified and missing'], [L.how(), 'How the engine uses the graph'], [L.contribute(), 'How practitioners contribute'])}
  </div>`;
}
function coverage(d) {
  const AT = new Map(d.attributes.map(a => [`${a.species}|${a.facet}`, a])); const groups = d.groups.map(g => ({ g, facets: d.facets.filter(f => f.group === g.id) })).filter(x => x.facets.length);
  const thin = d.facets.filter(f => f.n_species < d.species.length).sort((a, b) => a.n_species - b.n_species).slice(0, 5);
  return `<div class="ab-grid-w"><table class="ab-grid" aria-label="Coverage of ${d.facets.length} fields for ${d.species.length} species"><thead><tr><th></th>${groups.map(x => `<th colspan="${x.facets.length}">${esc(x.g.label)}</th>`).join('')}</tr></thead><tbody>${d.species.map(s => `<tr><th><a href="${esc(PI.links.profile(s.id))}">${esc(s.scientific_name)}</a></th>${groups.map(x => x.facets.map((f, i) => { const a = AT.get(`${s.id}|${f.id}`); const cls = !a ? 'no' : a.disagreement.length ? 'dis' : 'rec'; const t = `${s.scientific_name} · ${f.label}: ${!a ? 'not recorded' : `${plural(a.n_claims, 'claim')} from ${plural(a.n_sources, 'source')}${a.disagreement.length ? ', sources disagree' : ''}`}`; return `<td class="${i === 0 ? 'g' : ''}">${a ? `<a class="${cls}" href="${esc(PI.links.explorer(s.id, { kind: 'attr', id: a.id }, 'table'))}" title="${esc(t)}" aria-label="${esc(t)}"></a>` : `<span class="${cls}" title="${esc(t)}"></span>`}</td>`; }).join('')).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="pi-key ab-key"><span><i class="v"></i>recorded</span><span><i class="p"></i>recorded, sources disagree</span><span><i class="n"></i>not recorded</span></p><p class="ab-cap" id="ab-cap" aria-live="polite">Point at a square to read its species and field. A recorded square opens its claims.</p>
    ${thin.length ? `<p>Least recorded: ${thin.map(f => `${esc(f.label.toLowerCase())} (${f.n_species} of ${d.species.length})`).join(', ')}.</p>` : ''}`;
}

// ---------------------------------------------------------------- Contribute & Future
const KIND_WORD = { attribute: ['attribute', 'attributes'], selection_reason: ['reason for choosing a plant', 'reasons for choosing a plant'], observation: ['observation', 'observations'], warning: ['warning', 'warnings'] };
const KIND_CLS = { attribute: 'v', selection_reason: 's', observation: 'p', warning: 'c' };
async function contribute(d) {
  const st = d.stats; const L = PI.links; const claims = Object.values(d.claims); const pract = claims.filter(c => c.source_type === 'practitioner'), pub = claims.filter(c => c.source_type !== 'practitioner');
  const kindWord = (key, n) => (KIND_WORD[key] || [T.human(key), T.human(key)])[n === 1 ? 0 : 1];
  const kinds = list => { const n = {}; for (const c of list) n[c.claim_kind || 'attribute'] = (n[c.claim_kind || 'attribute'] || 0) + 1; return Object.entries(n).sort((a, b) => b[1] - a[1]); };
  const kindRow = (label, list) => { const k = kinds(list); return `<div class="ab-kind"><p><b>${list.length}</b> ${label}</p><span class="pi-split">${k.map(([key, n]) => `<i class="${KIND_CLS[key] || 'n'}" style="flex:${n}" title="${n} ${esc(kindWord(key, n))}"></i>`).join('')}</span><p class="pi-key">${k.map(([key, n]) => `<span><i class="${KIND_CLS[key] || 'n'}"></i>${n} ${esc(kindWord(key, n))}</span>`).join('')}</p></div>`; };
  const practSources = new Set(pract.map(c => c.source_id)).size; const practPlants = new Set(pract.map(c => c.plant)).size; const nResp = Object.values(d.sources).filter(x => x.type === 'practitioner').length;
  const coListed = d.relations.filter(r => r.live && r.type === 'co_listed').length; const withMeta = pract.filter(c => c.practitioner_meta).length; const gates = d.facets.filter(f => f.gate);
  let E = null; try { E = (await T.loadEngine()).E; } catch (e) { console.error(e); } const sup = E?.FUNCTION_SUPPORT || {};
  const arr = d.functions.filter(f => sup[f.id]?.arranged).map(f => f.label), rec = d.functions.filter(f => sup[f.id] && !sup[f.id].arranged).map(f => f.label);
  const path = [
    ['Contribution', 'A survey response or an error report arrives. It is stored where it was given; nothing else happens automatically.', 'person'],
    ['Candidate', 'A researcher reads it. Each statement is queued as a candidate with its context. Plant names outside the database wait for a later release.', 'person'],
    ['Review', 'A reviewer decides whether the candidate can be stated as a claim, and in whose words. Statements that cannot be cited stay out.', 'person'],
    ['Structured claim', 'The statement is written as a claim with an anonymous source id, its own kind (reason, observation, warning) and the observer’s context. It starts unverified.', 'rule'],
    ['Validation', 'Schema and graph checks run. A reviewer may verify the claim against what was said; an AI reading of a published source sits beside it as an aid.', 'person'],
    ['Release', 'A dated snapshot is published. The Library, the Explorer and the Studio read the same file, so a change reaches all three together.', 'person'],
  ];
  return `<div class="ab">
  ${mast('Knowledge from practice.', 'People who design and grow plantings in Metro Vancouver know why they choose a plant, and what happens next. This research collects that knowledge with care, and shows how it enters the record.',
    `<div class="ab-cta"><a class="pi-btn primary" href="${PI.SURVEY_URL}" rel="noopener">Take the survey</a><p>Short and anonymous. It opens as a separate site with its own protected database.</p></div>`)}
  ${toc([['why', 'Why practitioners'], ['survey', 'The survey'], ['path', 'From a contribution to a release'], ['changes', 'What it has changed'], ['now', 'Now and next'], ['report', 'Report an error']])}

  ${sec('why', 'Why practitioner knowledge', 'The two kinds of source record different things.', `
    <p>A published database gives a mature height or a hardiness zone. It rarely says why a designer reaches for a plant, or how it behaved in a garden here. Those are the things a planting decision turns on, and they live with practitioners.</p>
    <div class="ab-kinds">${kindRow('claims from published databases and open data', pub)}${kindRow(`claims from anonymous practitioner responses, about ${practPlants} of ${st.species} species`, pract)}</div>
    <p class="ab-note">The practitioner claims are few. They are kept apart from published data under an anonymous source id. They are contextual evidence, weighed with who observed what and where; they do not become verified plant facts by being submitted.</p>`)}

  ${sec('survey', 'What the survey asks', 'For designers, horticulturists, students and gardeners.', `
    <ul class="ab-list">
      <li><b>How you choose plants today.</b> Which conditions a plant must pass, and which you only compare.</li>
      <li><b>What you cannot find out.</b> The facts you look for and do not trust, or never find.</li>
      <li><b>How you would ask.</b> The words you would type into a plant database.</li>
      <li><b>What makes you trust a note.</b> What you need to know about who observed something, and where.</li>
      <li><b>Which plants you would consider.</b> A short list for a Metro Vancouver site, and why each is on it.</li>
    </ul>
    <div class="ab-privacy"><h3>What stays private</h3><p>Responses, the key that links a response to an anonymous source id, sign-in and reviewers’ notes stay in the survey’s own database. This site never reads them. A summary of the answers has not been approved for publication, so none is shown. The figures on this page are counted from the published release only and do not change when a response arrives.</p></div>
    <p class="ab-go"><a class="pi-btn primary" href="${PI.SURVEY_URL}" rel="noopener">Take the survey</a></p>`)}

  <section class="ab-sec wide" id="path"><div class="ab-sec-h"><h2>From a contribution to a release</h2><p>A contribution never becomes a verified record, or public data, by itself. A person decides at five of the six steps.</p></div>
    <ol class="ab-path">${path.map(([name, text, who], i) => `<li><span class="ab-path-n">${i + 1}</span><h3>${name}</h3><p>${text}</p>${T.who(who)}</li>`).join('')}</ol></section>

  ${sec('changes', 'What the survey has changed', 'Answers do not only add records. They shaped how records are stored and read.', `
    <dl class="ab-dl">
      <div><dt>A reason is its own kind of claim</dt><dd>What a respondent said about choosing a plant is stored as a selection reason, an observation or a warning, never as a plant attribute. ${pract.length} such claims are in this release.</dd></div>
      <div><dt>Who observed it travels with the claim</dt><dd>${withMeta} practitioner claims carry the observer’s background, how complete the observation is, and whether it may be cited.</dd></div>
      <div><dt>Listed together is not compatible</dt><dd>Plants a respondent named for the same site are recorded as co-listed: ${coListed} records. They are kept apart from any statement about how two plants behave together.</dd></div>
      <div><dt>Must-pass fields became gates</dt><dd>${gates.length} of ${d.facets.length} fields are marked as gates, following the survey’s question on conditions a plant must pass: ${gates.map(f => esc(f.label.toLowerCase())).join(', ')}.</dd></div>
      <div><dt>Names outside the database wait</dt><dd>A plant a respondent names that the database does not hold is kept as a candidate for a later release. It is not turned into a claim.</dd></div>
    </dl>`)}

  ${sec('now', 'Now and next', 'What works today, what is only recorded, and what is a research direction.', `
    <table class="pi-table ab-now"><thead><tr><th>Standing</th><th>What</th><th>Meaning</th></tr></thead><tbody>
      <tr><td><span class="ab-st now">Works today</span></td><td>${arr.length ? esc(arr.join(' and ')) : 'Screen and Ground Cover'} as spatial functions; ${st.species} species; site model, beds, arrangement, evaluation, export; the Decision Trace.</td><td>The engine arranges and measures these, and every result can be traced.</td></tr>
      <tr><td><span class="ab-st rec">Recorded only</span></td><td>${rec.length ? esc(rec.join(', ')) : 'Scrim, Ceiling / Canopy, Barrier'}.</td><td>The knowledge base records which species are linked to them. No arrangement rule exists, so nothing is planted or scored for them.</td></tr>
      <tr><td><span class="ab-st rec">A preference, not a metric</span></td><td>Low maintenance; ecology and seasonal interest.</td><td>They influence which species are preferred or where accents go. They are not optimised and not measured.</td></tr>
      <tr><td><span class="ab-st fut">Research direction</span></td><td>Pollinator value, carbon, rain gardens and stormwater, native-plant communities, establishment over time, cost and availability.</td><td>None is implemented. Each would need sources, claims and a tested rule before it could appear in Design as an objective.</td></tr>
      <tr><td><span class="ab-st fut">Research direction</span></td><td>More species; human verification of the ${st.claims_by_status.unverified || 0} unverified claims; images and plans as evidence; a connected language model for reading descriptions.</td><td>The method is built to scale. The content and the review are the work that remains.</td></tr>
    </tbody></table>
    <p class="ab-note">Nothing in the last two rows has a control anywhere on this platform. When a direction becomes real, it will arrive with its sources and its limits.</p>`)}

  ${sec('report', 'Report an error', 'Every record carries an id. Use it.', `
    <p>If a claim is wrong, misread or out of date, open an issue on the project repository and quote the claim id shown beside the record. An error report follows the same path as any contribution: it is reviewed by a person before anything changes.</p>
    <p>The database is versioned, not live. This release is dated <b>${esc(d.generated)}</b> (schema ${esc(d.schema_version)}, ontology ${esc(d.ontology_version)}), and the Studio records the release a design was made with.</p>
    ${go([`${PI.REPO_URL}/issues`, 'Report an error in a record', true], [L.method(), 'How the database is built'], [L.knowledge(), 'Explore the records'])}`)}
  </div>`;
}

// ---------------------------------------------------------------- Typography specimen
async function typography(d) {
  if (!document.querySelector('link[data-fraunces]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.dataset.fraunces = '1'; l.href = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;1,9..144,400&display=swap'; document.head.appendChild(l); }
  const sp = d.species.find(s => s.id === SALAL) || d.species[0]; const it = item(d);
  const scale = [['--pi-t-hero', 'Hero', 'display', 'Imagine your garden.'], ['--pi-t-page', 'Page title', 'display', 'Knowledge from practice.'], ['--pi-t-section', 'Section title', 'display', 'Eligibility & evidence checks'], ['--pi-t-card', 'Card title, name of a thing', 'display', 'North bed'], ['--pi-t-lede', 'Lede', 'sans', 'Describe your space and what you want to create.'], ['--pi-t-body', 'Body', 'sans', 'A claim is one statement from one source about one plant.'], ['--pi-t-ui', 'Controls', 'sans', 'Start designing · Target height · Add to this bed'], ['--pi-t-small', 'Secondary', 'sans', 'Kept open at your request'], ['--pi-t-mono', 'Record ids, provenance, metrics', 'mono', it?.claim?.id || 'gaultheria-shallon:landscape_use:usdaplants01']];
  return `<div class="ab ab-type">
  ${mast('Type specimen.', 'Three families, each with one job. Bricolage Grotesque speaks, DM Sans works, DM Mono records.', `<p class="ab-prov">Google Fonts, SIL Open Font Licence 1.1<br>tokens: platform/css/platform.css</p>`)}
  ${sec('hero', 'The hero, before and after', 'The same line in the V3 face and the V4 face.', `
    <div class="ab-ba"><figure><p class="ty-old">Imagine <em>your</em> garden.</p><figcaption>V3 · Fraunces 400, italic accent</figcaption></figure>
    <figure><p class="ty-new">Imagine <em>your garden.</em></p><figcaption>V4 · Bricolage Grotesque 600, colour accent. The family has no italic, so emphasis is colour.</figcaption></figure></div>`)}
  ${sec('families', 'Three families', 'What each is for, and what it is never used for.', `
    <div class="ab-fam">
      <div><p class="ty-d">Bricolage Grotesque</p><p class="ty-abc" style="font-family:var(--pi-display);font-weight:600">Aa Gg Rr 0123</p><p>Headings and the names of things: a page, a section, a bed. Weights 500 to 700. Never for controls, tables or running text.</p></div>
      <div><p class="ty-d" style="font-family:var(--pi-sans);font-weight:600;letter-spacing:-.01em">DM Sans</p><p class="ty-abc" style="font-family:var(--pi-sans)">Aa Gg Rr 0123</p><p>Everything operable and readable: body 16 px, controls 14 px, secondary 13 px. Its true italic sets scientific names: ${sci(sp.scientific_name)}.</p></div>
      <div><p class="ty-d" style="font-family:var(--pi-mono);font-weight:500;letter-spacing:0">DM Mono</p><p class="ty-abc" style="font-family:var(--pi-mono)">Aa Gg Rr 0123</p><p>Record ids, provenance and metrics only. If it is in mono, it is a fact about where something came from.</p></div>
    </div>`)}
  ${sec('scale', 'The scale', 'One token per step.', `
    <table class="ab-scale"><tbody>${scale.map(([tok, name, fam, text]) => `<tr><th><b>${name}</b><span>${tok}</span></th><td style="font-family:var(--pi-${fam});font-size:var(${tok});${fam === 'display' ? 'font-weight:600;letter-spacing:-.035em;line-height:1.05' : ''}">${esc(text)}</td></tr>`).join('')}</tbody></table>`)}
  ${sec('use', 'In use', 'A name, a record and its standing, as they appear across the platform.', `
    <div class="ab-use"><h3>${esc(sp.common_names?.[0] || '')}</h3><p>${sci(sp.scientific_name)} · ${esc(sp.growth_form_label || '')}</p>
    ${it?.claim ? `<p>${esc(it.claim.text)} ${tag(it.claim.status)} ${it.check ? tag(it.check.result, T.AI_WORD[it.check.result]) : ''}</p><p>${mono(it.claim.id)}</p>` : ''}
    <p><a class="pi-btn primary" href="${PI.links.design()}">Start designing</a> <a class="pi-btn" href="${PI.links.profile(sp.id)}">Read the profile</a></p></div>`)}
  </div>`;
}
