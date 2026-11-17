// Planting Intelligence · platform layer (2026-11-14, V2). One small module every public surface loads: the Garden Studio (design/),
// the Plant Library (platform/plants/) and Knowledge — its overview (platform/knowledge/), the Explorer (brain/explorer/), the Neural
// view (brain/), Research and Method (platform/knowledge/research/ · method/). It holds what the modules have to agree on and nothing else:
//
//   routes     where each module lives, as absolute URLs resolved from this file — never from a query string or a referrer
//   ids        a species is `plant:<slug>` inside the knowledge snapshot and `<slug>` in a URL; functions keep their `z:` ids and
//              claims their `<slug>:<field>:<n>` ids. Nothing else identifies a record.
//   links      the cross-module navigation contract (below)
//   design     a read-only look at the Studio's saved project, so another module can say what the user will return to
//   considered species the user asked the Studio to check for their design — a preference, never a planting decision
//   top bar    Design · Plants · Knowledge · About, the same on every page (V4); inside About: Project · How it works · Research & Method · Contribute & Future
//
// Navigation contract
//   Plant profile      <plants>#species=<slug>
//   Explorer, focused  <explore>#fk=species&fi=plant:<slug>            (the Explorer's own URL state; add ik/ii for one record,
//                                                                         v=graph|matrix|table|compare for the working view)
//   Neural, focused    <neural>#species=<slug>
//   Decision trace     <trace>#[fn=<function id>&]species=<slug>[&case=mine&bed=<bed id>][&plant=<plant object id>]
//                                                                        (one species followed from its sources into a bed, for a
//                                                                         spatial function: the reference garden, or a bed and a
//                                                                         plant object of the user's own design; fn defaults to Screen)
//   A bed in Compose   <design>?open=compose&bed=<bed id>[&species=<slug>][&fn=<function id>]   (checked against the saved project; an unknown
//                                                                         id is ignored and the project opens where it was left)
//   Back to a design   <design>                                         (the Studio reopens its saved project at the stage, bed,
//                                                                         view and selection it was left in: project.ui.view)
// A return path is therefore always the platform's own Design route. No module accepts a URL to go back to.
//
// No plant fact is written here. Everything about a plant is read from the published snapshot (routes.snapshot).

const LAYOUT = 'preview';   // tools/build_platform.py writes 'preview' into the published copy
const ROOT = new URL('../../', import.meta.url);   // the folder that holds every module, in both layouts
const PATHS = {
  repo: { design: 'design/', plants: 'platform/plants/', knowledge: 'brain/explorer/', explore: 'brain/explorer/', trace: 'platform/knowledge/trace/', neural: 'brain/', about: 'platform/about/', how: 'platform/about/how-it-works/', method: 'platform/about/method/', contribute: 'platform/about/contribute/', data: 'platform/about/data/', specimen: 'platform/about/typography/', snapshot: 'brain/data/explorer.json', images: 'platform/data/images.json', img: 'platform/img/', artwork: 'platform/data/artwork.json', art: 'platform/art/', reference: 'designs/demo-a.json' },
  preview: { design: '', plants: 'plants/', knowledge: 'knowledge/', explore: 'knowledge/', trace: 'knowledge/trace/', neural: 'knowledge/neural/', about: 'about/', how: 'about/how-it-works/', method: 'about/method/', contribute: 'about/contribute/', data: 'about/data/', specimen: 'about/typography/', snapshot: 'data/explorer.json', images: 'platform/data/images.json', img: 'platform/img/', artwork: 'platform/data/artwork.json', art: 'platform/art/', reference: 'data/designs/demo-a.json' },
}[LAYOUT];
export const routes = Object.fromEntries(Object.entries(PATHS).map(([k, v]) => [k, new URL(v, ROOT).href]));
routes.research = routes.method;   // V2/V3 name: Research now lives in About · Research & Method
export const SURVEY_URL = 'https://kaiyankay.github.io/planting-survey/';
export const REPO_URL = 'https://github.com/kaiyankay/planting-db';
/** the spatial function the Decision Trace opens on, and the functions it can follow into an arrangement: the ones the Studio's
 *  engine arranges today (design/js/engine.js FUNCTION_SUPPORT — tools/platform_tests.py checks the two lists agree) */
export const TRACE_FUNCTION = 'z:screen';
export const TRACE_FUNCTIONS = ['z:screen', 'z:ground_cover'];

export const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
export const slugOf = id => String(id || '').replace(/^plant:/, '');
export const speciesId = slug => `plant:${slugOf(slug)}`;

export const links = {
  design: () => routes.design,
  library: () => routes.plants,
  profile: id => `${routes.plants}#species=${encodeURIComponent(slugOf(id))}`,
  explorer: (id, inspect, view) => { if (!id) return view ? `${routes.explore}#v=${view}` : routes.explore; const p = new URLSearchParams({ fk: 'species', fi: speciesId(id) }); if (inspect) { p.set('ik', inspect.kind); p.set('ii', inspect.id); } if (view) p.set('v', view); return `${routes.explore}#${p}`; },
  /** the Explorer focused on any record kind it knows (species · function · concept), in one of its views */
  explorerFocus: (kind, id, { inspect = null, view = null } = {}) => { const p = new URLSearchParams({ fk: kind, fi: id }); if (inspect) { p.set('ik', inspect.kind); p.set('ii', inspect.id); } if (view) p.set('v', view); return `${routes.explore}#${p}`; },
  compare: (a, b) => `${routes.explore}#${new URLSearchParams({ a: speciesId(a), b: speciesId(b), v: 'compare' })}`,
  neural: id => id ? `${routes.neural}#species=${encodeURIComponent(slugOf(id))}` : routes.neural,
  knowledge: () => routes.knowledge,
  /** the Decision Trace of one species. `o`: a bed id (the user's own design), or { fn, bed, plant, v, pv } — the spatial function, a
   *  bed of the user's own design, one plant object, and what the link was made from: `v` the id of a generated version, or `pv` the
   *  input fingerprint of a preview that is not generated (platform/js/trace.js inputFp). The trace page reads exactly that, or says
   *  that the design has changed since. */
  trace: (id, o = null) => { const x = typeof o === 'string' ? { bed: o } : (o || {}); const p = new URLSearchParams(); if (x.fn && x.fn !== TRACE_FUNCTION) p.set('fn', x.fn); if (id) p.set('species', slugOf(id)); if (x.bed) { p.set('case', 'mine'); p.set('bed', x.bed); } if (x.plant) p.set('plant', x.plant); if (x.v) p.set('v', x.v); else if (x.pv) p.set('pv', x.pv); const h = p.toString(); return h ? `${routes.trace}#${h}` : routes.trace; },
  /** a bed of the saved design, opened in Compose (optionally with one species' evidence, and the function it is asked about) */
  compose: (bedId, id, fn = null) => { const p = new URLSearchParams({ open: 'compose', bed: bedId }); if (id) p.set('species', slugOf(id)); if (fn) p.set('fn', fn); return `${routes.design}?${p}`; },
  about: () => routes.about,
  how: () => routes.how,
  method: () => routes.method,
  contribute: () => routes.contribute,
  research: () => routes.method,   // V2/V3 name, kept for the modules that still call it
};
/** V3 addresses of the Decision Trace were <knowledge>#species=… ; Knowledge is now the Explorer, so a page that sits at the Knowledge
 *  address calls this first: a trace hash (species · fn · case · bed · plant, none of the Explorer's own keys) is sent on to the trace. */
export function forwardLegacyTrace() {
  const h = new URLSearchParams(location.hash.slice(1)); if (h.has('fk') || h.has('v') || h.has('a') || h.has('ik')) return false;
  if (!(h.has('species') || h.has('fn') || h.has('case') || h.has('bed'))) return false;
  if (new URL(routes.trace).pathname === location.pathname) return false;
  location.replace(routes.trace + location.hash); return true;
}

// ---------------------------------------------------------------- the Studio's saved project, read only
// design/js/model.js names its browser-storage key after the folder the Studio is served from; the same rule is applied to the
// Design route here, so every module looks at the project the Studio in this copy of the platform would open.
const designDir = () => new URL(routes.design).pathname.split('/').filter(Boolean).filter(x => !/\.html?$/.test(x)).pop() || 'design';
export const projectKey = () => { const d = designDir(); return d === 'design' ? 'pi.design.project.v1' : `pi.${d}.project.v1`; };
const STAGE_LABEL = { welcome: 'Imagine', site: 'Shape', intent: 'Compose', garden: 'Grow' };
/** what the user would return to in Design, or null when no design has been started in this browser */
export function activeDesign() {
  try {
    const p = JSON.parse(localStorage.getItem(projectKey()) || 'null'); if (!p || !p.ui?.unlocked?.site) return null;
    const stage = p.ui.stage && p.ui.stage !== 'welcome' ? p.ui.stage : (p.current_version_id ? 'garden' : p.ui.unlocked.intent ? 'intent' : 'site');
    const v = (p.versions || []).find(x => x.id === p.current_version_id) || null; const view = p.ui.view || {};
    const beds = (p.site?.beds || []).filter(b => b.status !== 'rejected'); const bed = stage === 'intent' && !view.composeNone ? beds.find(b => b.id === view.bedId) : null;
    const plant = stage === 'garden' && v && view.selectedPlant ? v.plant_objects.find(o => o.id === view.selectedPlant) : null;
    return { name: p.name, stage, stage_label: STAGE_LABEL[stage], bed: bed ? { id: bed.id, name: bed.name } : null, plant: plant ? { id: plant.id, species_id: plant.species_id } : null, beds: beds.length, plants: v ? v.plant_objects.length : 0, planted_species: v ? [...new Set(v.plant_objects.map(o => o.species_id))] : [] };
  } catch { return null; }
}
/** the Studio's saved project itself, parsed — for the evidence trace, which runs the planting engine on it. Never written back. */
export function savedProject() { try { const p = JSON.parse(localStorage.getItem(projectKey()) || 'null'); return p && p.site ? p : null; } catch { return null; } }
export function returnLabel(d = activeDesign()) { return d ? `Back to ${d.stage_label}${d.bed ? ` · ${d.bed.name}` : ''}` : null; }

// ---------------------------------------------------------------- species to consider in a design
// Kept beside the project, not inside a bed: the Library never chooses a bed. The Studio reads the list in Compose and shows each
// species with the engine's own check for the selected bed; only a species that qualifies there can be added to that bed's mix.
const consideredKey = () => projectKey().replace('.project.', '.considered.');
function readConsidered() { try { const l = JSON.parse(localStorage.getItem(consideredKey()) || '[]'); return Array.isArray(l) ? l.filter(x => x && typeof x.species_id === 'string') : []; } catch { return []; } }
export const considered = {
  list: () => readConsidered(),
  ids: () => readConsidered().map(x => x.species_id),
  has: id => readConsidered().some(x => x.species_id === speciesId(id)),
  add(id) { const l = readConsidered(); if (!l.some(x => x.species_id === speciesId(id))) l.push({ species_id: speciesId(id), added: new Date().toISOString(), from: 'plant-library' }); try { localStorage.setItem(consideredKey(), JSON.stringify(l)); } catch { } return l; },
  remove(id) { const l = readConsidered().filter(x => x.species_id !== speciesId(id)); try { localStorage.setItem(consideredKey(), JSON.stringify(l)); } catch { } return l; },
  clear() { try { localStorage.removeItem(consideredKey()); } catch { } },
};

// ---------------------------------------------------------------- the published snapshot
let snapshotP = null;
export function loadSnapshot() { return snapshotP || (snapshotP = fetch(routes.snapshot, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(`${routes.snapshot}: HTTP ${r.status}`); return r.json(); })); }
export const snapshotLine = d => `knowledge snapshot ${d.generated} · schema ${d.schema_version} · ${d.stats.species} species · ${d.stats.claims} claims, ${d.stats.claims_by_status.verified || 0} verified`;
let imagesP = null;
/** presentation assets of a species, never plant facts: `images` — one credited reference photograph (platform/data/images.json);
 *  `art` — one editorial illustration (platform/data/artwork.json), AI-generated and labelled so wherever it is shown */
export function loadImages() {
  const get = url => fetch(url, { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).catch(() => ({}));
  return imagesP || (imagesP = Promise.all([get(routes.images), get(routes.artwork)]).then(([ph, art]) => ({ ...ph, images: ph.images || {}, art: art.images || {}, art_about: art.about || '' })));
}
export const imageUrl = file => new URL(file, routes.img).href;
export const artUrl = file => new URL(file, routes.art).href;
/** the Studio's recorded demonstration garden (designs/demo-a.json): a project the Studio itself saved, used as the reference case */
let referenceP = null;
export function loadReference() { return referenceP || (referenceP = fetch(routes.reference, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(`${routes.reference}: HTTP ${r.status}`); return r.json(); })); }

// ---------------------------------------------------------------- top bar
// V4: four destinations and nothing else in the first level. Design uses the knowledge, Plants reads it, Knowledge explores it,
// About explains it (project · how it works · research & method · contribute & future).
const NAV = [['design', 'Design', 'Describe a site, set what the planting should do, generate and revise it'], ['plants', 'Plants', 'Ten species and what is recorded about them'], ['knowledge', 'Knowledge', 'The records behind the designs as a table, a matrix and a network'], ['about', 'About', 'The project, how the engine works, the research method, how to contribute']];
const ABOUT = [['project', 'Project', 'about'], ['how', 'How it works', 'how'], ['method', 'Research & Method', 'method'], ['contribute', 'Contribute & Future', 'contribute'], ['data', 'Sources & data', 'data']];
export function navHtml(active) { return `<nav class="pi-nav" aria-label="Planting Intelligence">${NAV.map(([k, l, t]) => `<a href="${routes[k]}" title="${esc(t)}"${k === active ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`; }
/** the second level of About */
export function aboutNav(section) { return `<nav class="pi-subnav" aria-label="About">${ABOUT.map(([k, l, r]) => `<a href="${routes[r]}"${k === section ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`; }
/** V3 name. Knowledge has no second level of pages any more (its views are switched inside the Explorer); kept so an older caller renders nothing. */
export function knowledgeNav() { return ''; }
/** the views of Knowledge as one switch, for a page that is one of them but is not the Explorer (the 3D network): Table · Matrix ·
 *  Network lead back into the Explorer, with the species in focus when there is one. Inside the Explorer the switch is its own toolbar. */
export function exploreSwitch(mode, id = null) { const to = v => id ? links.explorerFocus('species', speciesId(id), { view: v }) : `${routes.explore}#v=${v}`; return mode === 'neural' ? `<div class="pi-switch" role="group" aria-label="Views of the knowledge base"><a href="${esc(to('table'))}">Table</a><a href="${esc(to('matrix'))}">Matrix</a><a href="${esc(to('graph'))}">Network</a><a href="${esc(links.neural(id))}" aria-current="true" title="the same claims as one three-dimensional network">3D</a></div>` : ''; }
export function returnChip() { const d = activeDesign(); if (!d) return ''; return `<a class="pi-return" href="${routes.design}" title="${esc(d.name)} — reopens where you left it"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 3.5 5 8l4.5 4.5"/></svg>${esc(returnLabel(d))}</a>`; }
/** the bar of every page except the Studio (which keeps its own #top and takes navHtml into it). `section` names the About page
 *  (project · how · method · contribute) and brings the second level with it; `sub` is a module's own addition (a view switch). */
export function mountTop(el, { active, section = null, sub = '', snapshot = null, tone = 'light' } = {}) {
  el.classList.add('pi-top'); if (tone === 'dark') el.classList.add('pi-dark');
  el.innerHTML = `<a class="pi-wordmark" href="${routes.design}">Planting Intelligence</a>${navHtml(active)}<div class="pi-sub">${active === 'about' ? aboutNav(section) : ''}${sub}</div><div class="pi-right">${returnChip()}</div>`;
  return el;
}
export function footHtml(d) { return `<footer class="pi-foot"><span>Planting Intelligence · ARCH 540, UBC</span><a href="${routes.about}">About</a><a href="${routes.how}">How it works</a><a href="${routes.method}">Research &amp; Method</a><a href="${routes.contribute}">Contribute</a><a href="${routes.data}">Sources &amp; data</a></footer>`; }   // V4.2: snapshot figures live on Sources & data, not in every footer

// ---------------------------------------------------------------- brand-type trial (internal; the V4.2 type system is the default)
// ?type=a|b|c tries a variant for this tab, ?type=v4 leaves it. No font or trial stylesheet loads unless a variant is on. The comparison switch is a review tool: it is mounted only on a
// page opened with ?type=…, never in the ordinary interface. See platform/css/type-trial.css and platform/about/type-trial/.
export const TYPE_TRIAL = { a: 'A · Wordmark', b: 'B · Wordmark + Imagine', c: 'C · Wordmark + main titles' };
export const TYPE_DEFAULT = 'v4';   // the V4.2 type system; nct127 is an internal trial, loaded only by ?type=a|b|c
export const typeTrialUrl = new URL(LAYOUT === 'repo' ? 'platform/about/type-trial/' : 'about/type-trial/', ROOT).href;
export function typeTrial() {
  let asked = null, on = TYPE_DEFAULT;
  try { asked = new URLSearchParams(location.search).get('type'); } catch { /* no location */ }
  const framed = window.top !== window.self;   // the comparison page shows several variants at once: a frame never writes the tab's choice
  const valid = k => k === 'v4' || !!TYPE_TRIAL[k];
  try {
    if (framed) on = valid(asked) ? asked : TYPE_DEFAULT;
    else { if (asked !== null) { if (valid(asked) && asked !== TYPE_DEFAULT) sessionStorage.setItem('pi.type', asked); else sessionStorage.removeItem('pi.type'); } const kept = sessionStorage.getItem('pi.type'); on = valid(kept) ? kept : TYPE_DEFAULT; }
  } catch { on = valid(asked) ? asked : TYPE_DEFAULT; }   // storage blocked: the choice holds for this page only
  if (on === 'v4') on = null;
  const root = document.documentElement;
  if (on) root.dataset.type = on; else delete root.dataset.type;
  const sheet = () => { if (!document.querySelector('link[data-type-trial]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('../css/type-trial.css', import.meta.url).href; l.dataset.typeTrial = ''; document.head.appendChild(l); } };
  if (on) sheet();
  if (asked === null || framed || document.body?.dataset.typeTrialPage !== undefined) return on;   // the switch shows only when a variant was asked for by URL
  const mount = () => {
    if (document.querySelector('.pi-typeswitch')) return;
    sheet();
    const to = k => { const u = new URL(location.href); u.searchParams.set('type', k); return u.href; };
    const el = document.createElement('nav'); el.className = 'pi-typeswitch'; el.setAttribute('aria-label', 'Type comparison');
    el.innerHTML = `<span>Type</span><a href="${to('v4')}"${on ? '' : ' aria-current="true"'}>V4</a>${Object.keys(TYPE_TRIAL).map(k => `<a href="${to(k)}" title="${TYPE_TRIAL[k]}"${on === k ? ' aria-current="true"' : ''}>${k.toUpperCase()}</a>`).join('')}<a href="${typeTrialUrl}">Compare</a>`;
    document.body.appendChild(el);
  };
  if (document.body) mount(); else addEventListener('DOMContentLoaded', mount, { once: true });
  return on;
}
if (typeof document !== 'undefined') typeTrial();
