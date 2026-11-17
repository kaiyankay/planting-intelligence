// Knowledge — the overview, and the full Decision Trace. One question: what does a design rest on? It is answered on one real
// decision — one species, one spatial function, one planting bed — followed in five steps from a source to an evaluated arrangement:
//
//   1 Sources              where the knowledge comes from                                   (B of the trace: plant knowledge)
//   2 Claims & attributes  how a statement is stored and reviewed
//   3 Function             how traits relate to a spatial function and to other species
//   4 Selection            what the bed was asked to do, what is known of the site, whether the engine used the species (A, C)
//   5 Arrangement & result what was generated, by which rules, and what the engine measured (D, E)
//
// Nothing of the example is written here. Sources, claims, checks and links are read from the published snapshot; the bed is a
// project the Studio saved (the recorded demonstration garden, or this browser's own design); the decision, the arrangement and the
// evaluation are read from the Studio's engine, run on this page (trace.js). Screen and Ground Cover are followed into an
// arrangement; the other functions are recorded only and the page says so.
//   #species=<slug>                         follow another species into the same bed
//   #fn=<function id>                       another spatial function (default: Screen)
//   #bed=<bed id>                           another bed of the same garden that is asked for the function
//   #case=mine&bed=<id>[&plant=<object id>] a bed (and one plant object) of the visitor's own design
import * as PI from './platform.js';
import * as PC from './plantcard.js';
import * as T from './trace.js';

const $ = s => document.querySelector(s); const esc = PI.esc; const tag = PC.tag; const human = T.human; const plural = T.plural; const cap = T.cap;
const S = { d: null, imgs: null, K: null, E: null, ref: null, mine: null, c: null, sp: null, fn: null, plant: null, mineBeds: [], refBeds: [] };

(async function boot() {
  try {
    const [d, imgs, eng, ref] = await Promise.all([PI.loadSnapshot(), PI.loadImages(), T.loadEngine(), PI.loadReference().catch(() => null)]);
    Object.assign(S, { d, imgs, K: new eng.Knowledge(d), E: eng.E, ref, mine: PI.savedProject() });
    PI.mountTop($('#top'), { active: 'knowledge', section: 'overview', snapshot: d }); $('#foot').innerHTML = PI.footHtml(d);
    window.addEventListener('hashchange', () => render(false)); document.addEventListener('click', onClick); document.addEventListener('submit', onSearch);
    window.knowledge = { S, T, render };
    render(false);
  } catch (e) { $('#app').innerHTML = `<p class="pi-loading">Could not load the knowledge snapshot: ${esc(e.message)}</p>`; console.error(e); }
})();

// ---------------------------------------------------------------- state: which function, which bed, which species, which plant object
function resolve() {
  const p = new URLSearchParams(location.hash.slice(1)); const d = S.d, K = S.K, E = S.E;
  let fnId = d.functions.some(f => f.id === p.get('fn')) ? p.get('fn') : T.FN; let bedId = p.get('bed'); const mineAsked = p.get('case') === 'mine' && !!S.mine;
  // a plant object named in the link fixes the bed and the function, read from the design itself
  // V4: the link says what it was made from — v=<version id> (Grow) or pv=<preview fingerprint> (Compose). The page reads that, never another arrangement.
  const read = mineAsked ? (p.get('pv') ? { pv: p.get('pv') } : p.get('v') ? { v: p.get('v') } : null) : null;
  const cur = S.mine && !read?.pv ? ((read?.v && (S.mine.versions || []).find(v => v.id === read.v)) || (S.mine.versions || []).find(v => v.id === S.mine.current_version_id)) : null; let po = mineAsked && p.get('plant') && cur ? cur.plant_objects.find(o => o.id === p.get('plant')) || null : null;
  if (po) { fnId = T.fnOfObject(po); bedId = po.bed_id; }
  let c = null;
  if (mineAsked) c = T.buildCase(S.mine, K, E, { bedId, fn: fnId, origin: 'mine', read });
  if (!c && S.ref) c = T.buildCase(S.ref, K, E, { bedId, fn: fnId, origin: 'reference' });
  if (!c && S.mine) c = T.buildCase(S.mine, K, E, { fn: fnId, origin: 'mine' });
  if (po && (!c || c.origin !== 'mine' || c.bed.id !== po.bed_id)) po = null;
  const want = p.get('species') && PC.species(d, p.get('species')); const lead = (c && T.leadSpecies(c, fnId)) || d.function_links.find(l => l.function === fnId && l.drawn)?.species || d.species[0].id;
  Object.assign(S, { c, fn: d.functions.find(f => f.id === fnId), sp: (po && PC.species(d, po.species_id)) || want || PC.species(d, lead), plant: po, mineBeds: S.mine ? T.tracedBeds(S.mine, K, E, fnId) : [], refBeds: S.ref ? T.tracedBeds(S.ref, K, E, fnId) : [] });
}
/** the address of this trace with something changed. A change of function or garden drops the bed; a change of bed, function or species drops the plant object. */
function linkTo(o = {}) {
  const c = S.c; const fn = o.fn ?? S.fn.id; const mine = o.mine ?? (c?.origin === 'mine'); const same = fn === S.fn.id && mine === (c?.origin === 'mine');
  const bed = 'bed' in o ? o.bed : same ? c?.bed.id : null; const species = 'species' in o ? o.species : S.sp.slug; const plant = same && bed === c?.bed.id && species === S.sp.slug ? S.plant?.id : null;
  const p = new URLSearchParams();
  if (fn !== T.FN) p.set('fn', fn); if (species) p.set('species', species); if (mine) p.set('case', 'mine'); if (bed) p.set('bed', bed); if (plant) p.set('plant', plant);
  if (mine && c?.origin === 'mine' && c.ref) { if (c.ref.kind === 'preview' && (c.ref.asked_fp || c.ref.generated)) p.set('pv', c.ref.fp); else if (c.ref.kind === 'version' && c.ref.asked_id && !c.ref.missing) p.set('v', c.ref.id); }   /* stay on the arrangement the reader came for */
  return `#${p}`;
}

function render(scroll = true) {
  resolve(); const d = S.d, sp = S.sp, fn = S.fn; const link = d.function_links.find(l => l.species === sp.id && l.function === fn.id);
  document.title = `${sp.scientific_name} · ${fn.label} · Decision Trace · Planting Intelligence`;
  const step3 = relations(sp, fn, link);   // also prepares the pair block, shown after the five steps
  $('#app').innerHTML = `<div class="pi-doc kn" data-fn="${esc(fn.id)}" data-species="${esc(sp.slug)}" data-case="${esc(S.c?.origin || '')}" data-bed="${esc(S.c?.bed.id || '')}">${mast(d, sp, fn, link)}${chain(sp, fn, link)}${caseHtml(sp, fn, link)}
    <nav class="pi-toc kn-toc" aria-label="The five steps, from a source to a design"><a href="#" data-goto="kn-sources"><b>1</b> Sources</a><a href="#" data-goto="kn-claims"><b>2</b> Claims</a><a href="#" data-goto="kn-relations"><b>3</b> Function</a><a href="#" data-goto="kn-access"><b>4</b> Selection</a><a href="#" data-goto="kn-evaluation"><b>5</b> Arrangement &amp; result</a><a href="#" data-goto="kn-pair" class="kn-toc-x">Between two species</a><a href="#" data-goto="kn-explore" class="kn-toc-y">Explore the records</a></nav>
    ${sources(sp, fn, link)}${claims(sp, fn, link)}${step3}${selection(sp, fn, link)}${arrangement(sp, fn, link)}
    <section class="pi-sec kn-step" id="kn-pair" tabindex="-1"><h2>Between two species</h2><p class="pi-sec-l">Four different things, and only the first is a record of the pair.</p><div>${S.pairHtml || ''}</div></section>
    ${explore(sp, fn)}</div>`;
  if (scroll) $('#kn-case')?.scrollIntoView({ block: 'start' });
  spy();
}
/** the step bar under the page bar says where the reader is: the last step whose heading has passed under it */
let spyOn = false;
function spy() {
  const mark = () => { const ids = ['kn-sources', 'kn-claims', 'kn-relations', 'kn-access', 'kn-evaluation']; let cur = null; for (const id of ids) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top < 160) cur = id; } const ev = document.getElementById('kn-pair'); if (ev && ev.getBoundingClientRect().top < 160) cur = null;
    document.querySelectorAll('.kn-toc a[data-goto]').forEach(a => { if (a.dataset.goto === cur) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current'); }); };
  if (!spyOn) { spyOn = true; let t = 0; addEventListener('scroll', () => { if (!t) t = requestAnimationFrame(() => { t = 0; mark(); }); }, { passive: true }); }
  mark();
}
function onClick(ev) {
  const g = ev.target.closest('[data-goto]'); if (g) { ev.preventDefault(); const el = document.getElementById(g.dataset.goto); if (el) { el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); el.focus?.({ preventScroll: true }); } return; }
  const s = ev.target.closest('[data-follow]'); if (s) { ev.preventDefault(); const y = scrollY; history.replaceState(null, '', s.getAttribute('href')); render(false); scrollTo({ top: y }); document.querySelector(`[data-follow="${s.dataset.follow || ''}"][aria-pressed="true"]`)?.focus({ preventScroll: true }); }
}
function onSearch(ev) {
  const f = ev.target.closest('#kn-search'); if (!f) return; ev.preventDefault(); const q = f.q.value.trim().toLowerCase(); if (q.length < 2) return; const d = S.d;
  const hit = d.species.find(s => [s.scientific_name, ...(s.common_names || [])].some(n => n.toLowerCase().includes(q))); if (hit) { location.href = PI.links.explorer(hit.id); return; }
  const f2 = d.functions.find(x => [x.label, ...(x.aliases || [])].some(n => n.toLowerCase().includes(q))); if (f2) { location.href = PI.links.explorerFocus('function', f2.id); return; }
  const co = d.concepts.find(x => !x.no_plant_reaches && x.label.toLowerCase().includes(q)); if (co) { location.href = PI.links.explorerFocus('concept', co.id); return; }
  $('#kn-search-n').textContent = `Nothing in this snapshot is called “${f.q.value.trim()}”. Try a plant name, a spatial function or a trait.`;
}

// ---------------------------------------------------------------- masthead and the case
function mast(d, sp, fn, link) {
  // V4: the trace is entered from a decision (a plant, a function, a bed), not read as an essay: a way back to the Explorer with the
  // same focus, what the page is, and the snapshot it reads. The decision itself follows directly (the chain, then the case).
  const back = link ? PI.links.explorerFocus('species', sp.id, { inspect: { kind: 'link', id: link.id }, view: 'matrix' }) : PI.links.explorer(sp.id);
  return `<header class="pi-mast kn-mast">
    <div><a class="kn-back" href="${esc(back)}" title="Back to the Explorer, on ${esc(sp.scientific_name)} and ${esc(fn.label)}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 3.5 5 8l4.5 4.5"/></svg>Knowledge · Explorer</a>
      <h1>Decision Trace</h1>
      <p class="pi-lede">One decision, followed from its source to an evaluated bed: <span class="kn-path">source → claim → function → selection → arrangement → evaluation</span>.</p></div>
    <p class="pi-prov"><b>${esc(PI.snapshotLine(d))}</b><br>${d.stats.sources} sources · ${d.stats.links_drawn} of ${d.stats.function_links} plant-to-function links drawn<br>${d.stats.unknown_by_verdict?.['contradicted by traits'] || 0} ruled out by a recorded trait · ${d.stats.unknown_by_verdict?.['evidence missing'] || 0} with evidence missing</p>
  </header>`;
}
const names = ids => ids.map(id => `<i>${esc(PC.species(S.d, id).scientific_name)}</i>`).join(' and ');
/** the claims a function link rests on, as the same mono ids step 2 shows: one token carried through the steps */
const restsOn = link => (link?.use_claims || []).length ? `<span>rests on</span>${link.use_claims.map(T.idHtml).join('')}` : '';
/** the decision in five linked nodes, filled from the records: what a visitor sees before scrolling */
function chain(sp, fn, link) {
  const d = S.d, c = S.c, E = S.E; const uc = useClaims(link); const c0 = uc[0]; const chk = c0 ? d.evidence_checks[c0.id] : null; const isArr = T.arranged(E, fn.id); const dc = c ? T.decide(c, fn.id, sp.id) : null; const sx = c ? T.sectionOf(c, fn.id) : null;
  const n1 = c0 ? [esc(uc.length > 1 ? `${T.sourceName(d, c0.source_id)} and ${uc.length - 1} more` : T.sourceName(d, c0.source_id)), T.isSurvey(d, c0.source_id) ? 'a practitioner’s answer; the response stays private' : chk?.excerpt ? `“${esc(chk.excerpt.length > 64 ? chk.excerpt.slice(0, 62) + '…' : chk.excerpt)}”` : 'cited, no excerpt recorded'] : ['No source states this use', 'an explicit unknown'];
  const nv = uc.filter(x => x.status === 'verified').length;
  const n2 = c0 ? [`${esc(human(c0.field))} = ${esc(T.valueLabels(d, c0).slice(0, 2).join(', '))}`, `${nv ? `${T.res('verified')}${uc.length > 1 ? ` ${nv} of ${uc.length}` : ''}` : T.res('unverified')}${chk ? ` · AI: ${esc(T.AI_WORD[chk.result] || human(chk.result))}` : ''}`] : ['No claim for this use', `${sp.claims.live} claims record other traits`];
  const n3 = [`<i>${esc(sp.scientific_name)}</i> → ${esc(fn.label)}`, !link ? 'no record' : link.drawn ? `${esc(link.status)} by rule ${esc(link.rule || (link.rules || [])[0] || '')}${link.conflict ? `, ${T.res('conflict')} with a trait` : ''}` : link.verdict === 'contradicted by traits' ? 'no link: contradicted by a recorded trait' : 'no link: evidence missing'];
  const usable = c && isArr && dc.wanted ? T.decisions(c, fn.id).filter(x => ['planted', 'not_placed', 'eligible'].includes(x.outcome)).length : 0;
  const n4 = !c ? ['no design loaded', ''] : [T.out(dc.outcome), !isArr ? 'the engine has no arrangement rule' : !dc.wanted ? esc(dc.reason) : `${usable} of ${d.species.length} species can be used in ${esc(c.bed.name)}`];
  let n5 = ['nothing arranged', isArr ? 'no arrangement computed' : 'recorded only'];
  if (c && isArr && dc.wanted && c.version && sx?.evaluation) { if (fn.id === 'z:screen') { const pl = c.screen.plan; n5 = [pl ? `${pl.placed[0] + pl.placed[1]} of ${pl.expected[0] + pl.expected[1]} positions placed` : 'no row placed', `${esc(fn.label)}: ${T.res(sx.evaluation.status)}`]; } else { const g = c.ground.group; n5 = [g ? `${g.params.placed} placed, ${esc(g.params.pattern_label.toLowerCase())}` : 'no ground layer placed', `${T.res('estimate')} ${Math.round(sx.evaluation.ground_cover_share * 100)} % of the ground, no pass mark`]; } }
  const node = (id, n, name, [a, b]) => `<li><a href="#" data-goto="${id}"><span class="kn-chain-k"><b>${n}</b>${name}</span><strong>${a}</strong><span class="kn-chain-d">${b}</span></a></li>`;
  return `<ol class="kn-chain" aria-label="This decision, from its source to its result">${node('kn-sources', 1, 'Source', n1)}${node('kn-claims', 2, 'Claim', n2)}${node('kn-relations', 3, 'Function', n3)}${node('kn-access', 4, 'Selection', n4)}${node('kn-evaluation', 5, 'Arrangement &amp; result', n5)}</ol>`;
}
/** the change a derived version made to its parent, counted on the plant objects themselves (ids and positions), never written by hand */
function derivedChange(c) {
  const v = c.version, list = c.project.versions || []; const parent = list.find(x => x.id === (v.derived?.from_version_id || v.parent_version_id)) || null; if (!parent) return { parent: null, text: '' };
  const was = new Map(parent.plant_objects.map(o => [o.id, o])), now = new Map(v.plant_objects.map(o => [o.id, o]));
  const added = [...now.keys()].filter(id => !was.has(id)).length, removed = [...was.keys()].filter(id => !now.has(id)).length;
  const moved = [...now.values()].filter(o => was.has(o.id) && (was.get(o.id).position_m[0] !== o.position_m[0] || was.get(o.id).position_m[1] !== o.position_m[1])).length, swapped = [...now.values()].filter(o => was.has(o.id) && was.get(o.id).species_id !== o.species_id).length;
  const parts = [removed && `${plural(removed, 'plant')} removed`, added && `${plural(added, 'plant')} added`, moved && `${plural(moved, 'plant')} moved`, swapped && `${plural(swapped, 'plant')} changed species`].filter(Boolean);
  return { parent, n: [parent.plant_objects.length, v.plant_objects.length], added, removed, moved, swapped, text: `${parts.length ? parts.join(', ') : 'no plant added, removed or moved'}; ${parent.plant_objects.length} → ${v.plant_objects.length} plants` };
}
function caseRead(c) {
  const r = c.ref; const name = c.origin === 'mine' ? c.project.name : (c.project.name || 'the demonstration garden'); const alert = r.changed || r.missing; let title, body, ids;
  if (r.kind === 'preview') {
    title = 'Reading a preview'; ids = `preview fingerprint <span class="id">${esc(r.fp)}</span>${r.generated ? ` · current generated version <span class="id">${esc(r.generated.id)}</span>` : ''}`;
    body = `${r.changed ? 'This preview has changed since the link was made: the design was edited, so the page shows the preview as it is now. ' : ''}${esc(name)}, not generated${r.generated ? (r.generated.same_inputs ? `; version ${r.generated.n} was generated from the same inputs` : `; it differs from generated version ${r.generated.n} until you regenerate`) : ' yet'}.`;
  } else if (r.derived) {
    const ch = derivedChange(c); const how = r.derived.how; const an = /^[aeiou]/i.test(how) ? 'an' : 'a';
    title = `Reading version ${r.n}, ${an} ${how}${r.derived.from_n ? ` of version ${r.derived.from_n}` : ''}`;
    ids = `version <span class="id">${esc(r.id)}</span>${ch.parent ? ` · made from <span class="id">${esc(ch.parent.id)}</span>` : ''}${r.derived.objects_fp ? ` · plants <span class="id">${esc(r.derived.objects_fp)}</span>` : ''}${r.derived.base_input_fp ? ` · inputs of the generated version it descends from <span class="id">${esc(r.derived.base_input_fp)}</span>` : ''}`;
    body = `${r.missing ? 'The version named in the link is no longer in this design; the current version is shown. ' : ''}${esc(name)}${r.current ? '' : ', not its current version'}. This is not the engine’s run over the design’s inputs: the plants were changed afterwards${ch.text ? ` (${esc(ch.text)})` : ''}${c.version.label ? `, recorded as “${esc(c.version.label)}”` : ''}. Every check on this page is recomputed on the plants as they stand.`;
  } else {
    title = `Reading generated version ${r.n}`; ids = `version <span class="id">${esc(r.id)}</span>${r.fp ? ` · inputs <span class="id">${esc(r.fp)}</span>` : ''}`;
    body = `${r.missing ? 'The version named in the link is no longer in this design; the current version is shown. ' : ''}${esc(name)}${r.of > 1 ? `, version ${r.n} of ${r.of}` : ''}${r.current ? '' : ', not the current one'}${r.inputs_changed ? '. The design was edited after this version was generated: the checks are recomputed on the design as it is now' : ''}.`;
  }
  return `<div class="kn-case-read ${r.kind}${r.derived ? ' derived' : ''}${alert || r.inputs_changed ? ' changed' : ''}" data-case-read="${r.kind}" data-case-ref="${esc(r.kind === 'preview' ? r.fp : r.id)}" data-case-changed="${!!alert}" data-case-inputs-changed="${!!r.inputs_changed}" data-case-derived="${esc(r.derived?.how || '')}"${r.derived?.from_n ? ` data-case-from="${r.derived.from_n}"` : ''} role="${alert ? 'alert' : 'note'}"><p><b>${esc(title)}</b> ${body}</p><details class="kn-case-ids"><summary>Identifiers</summary><p>${ids}</p></details></div>`;
}

function caseHtml(sp, fn, link) {
  const c = S.c, d = S.d, E = S.E; const isArr = T.arranged(E, fn.id);
  const fnSw = `<div class="kn-sw"><span>Function</span>${d.functions.slice().sort((a, b) => (b.id === T.FN) - (a.id === T.FN) || T.arranged(E, b.id) - T.arranged(E, a.id)).map(f => `<a class="pi-chip" role="button" aria-pressed="${f.id === fn.id}" href="${linkTo({ fn: f.id })}" data-follow="fn" data-fn="${esc(f.id)}" title="${esc(f.definition)}">${esc(f.label)}${T.arranged(E, f.id) ? '' : '<small>recorded only</small>'}</a>`).join('')}</div>`;
  if (!c) return `<section class="kn-case" id="kn-case" tabindex="-1"><div class="kn-case-t"><h2>The decision being followed</h2><p class="pi-none">No saved design could be loaded, so the steps below show the records only.</p>${fnSw}</div></section>`;
  const p = c.project; const B = p.site.boundary; const w = B ? Math.max(...B.map(q => q[0])) - Math.min(...B.map(q => q[0])) : null, h = B ? Math.max(...B.map(q => q[1])) - Math.min(...B.map(q => q[1])) : null;
  const sec = T.sectionOf(c, fn.id); const objs = sec ? sec.objects : []; const planted = [...new Set(objs.map(o => o.species_id))]; const dc = T.decide(c, fn.id, sp.id); const bedB = `<b>${esc(c.bed.name)}</b>`;
  const where = c.origin === 'mine' ? `your design <b>${esc(p.name)}</b>` : `the Studio’s recorded demonstration garden`;
  let head;
  if (!isArr) head = `<b>${esc(fn.label)}</b> is recorded only. The knowledge base links species to it, but the planting engine has no arrangement rule for it, so nothing is planted for it in any bed.`;
  else if (!c.version) head = `No arrangement could be computed for ${bedB}. The checks below are what Compose would show.`;
  else if (fn.id === 'z:screen') head = objs.length ? `${c.dry ? `${bedB} has not been generated yet. In the engine’s dry run, the preview Compose shows, ${plural(objs.length, 'plant')} of ${names(planted)} stand as its ${esc(fn.label)}` : `${plural(objs.length, 'plant')} of ${names(planted)} stand as the ${esc(fn.label)} of ${bedB}`}. The engine’s own evaluation of that row: ${T.res(c.screen.evaluation.status)}.` : `No ${esc(fn.label)} plant stands in ${bedB}${c.dry ? ' in the engine’s dry run' : ''}: no species passed the bed’s checks.`;
  else { const g = c.ground.group, ev = c.ground.evaluation; const gr = objs.filter(o => o.role === 'ground'), ac = objs.filter(o => o.role === 'accent'); const who = `${plural(gr.length, 'plant')} of ${names([...new Set(gr.map(o => o.species_id))])}${ac.length ? `, with ${plural(ac.length, 'accent')} of ${names([...new Set(ac.map(o => o.species_id))])},` : ''}`;
    head = objs.length ? `${c.dry ? `${bedB} has not been generated yet. In the engine’s dry run, the preview Compose shows, ${who} cover its ground` : `${who} cover the ground of ${bedB}`}${g ? ` in ${esc(g.params.pattern_label.toLowerCase())}` : ''}. The engine’s estimate: ${ev ? Math.round(ev.ground_cover_share * 100) : '?'} % of the plantable ground under mature crowns. It sets no pass mark.` : `No ground-layer plant stands in ${bedB}${c.dry ? ' in the engine’s dry run' : ''}.`; }
  const about = `<p class="kn-case-sp" data-outcome="${esc(dc.outcome)}"><i>${esc(sp.scientific_name)}</i> in this bed: ${T.out(dc.outcome)}. ${esc(cap(dc.reason))}.</p>`;
  const po = S.plant ? `<p class="kn-case-po">The plant you selected, <span class="id">${esc(S.plant.id)}</span>, stands at ${S.plant.position_m.join(', ')} m${S.plant.role === 'accent' ? ' as an accent' : S.plant.role === 'screen-layer' ? ' in the second row' : ''}. It is ringed on the plan.</p>` : '';
  const ver = c.version && !c.dry ? ` ${c.ref?.derived ? `Version ${c.ref.n}` : c.ref?.n ? `Generated version ${c.ref.n}` : 'The saved version'}, recorded ${esc((c.version.created || '').slice(0, 10))}; checked and measured again on this page from the current snapshot${sec?.recorded ? (sec.same ? ', with the same result.' : ', and the result differs from the recorded one: the page shows the new one.') : '.'}` : c.dry ? ` Computed on this page with the seed and spacing Compose uses (seed ${esc(c.version?.seed ?? T.DRY_SEED)}); nothing is saved to your design.` : '';
  const stale = c.snapshot.design && c.snapshot.now && c.snapshot.design !== c.snapshot.now && !c.dry ? ` The design was made with the knowledge snapshot of ${esc(c.snapshot.design)}; this page reads ${esc(c.snapshot.now)}.` : '';
  // V4.2: what is being read, said first and by name. A version whose plants were changed after the engine generated them (a manual
  // edit, a typed edit, a partial regeneration) is never called generated: the line names how it was made, the version it came from and
  // what changed. The preview's fingerprint and a version's id are different things and are kept one level down, under "Identifiers".
  const readLine = c.ref && (c.origin === 'mine' || c.ref.derived) ? caseRead(c) : '';
  const other = S.mine && S.ref ? `<p class="kn-case-sw">${c.origin === 'mine' ? `<a href="${linkTo({ mine: false })}" data-follow>Use the demonstration garden instead</a>` : S.mineBeds.length ? `<a href="${linkTo({ mine: true, bed: S.mineBeds[0].id })}" data-follow>Trace this in your own design: ${esc(S.mine.name)} · ${esc(S.mineBeds[0].name)}</a>` : isArr ? `<span class="pi-none">Your design ${esc(S.mine.name)} has no bed asked to be ${esc(fn.label)}.</span>` : ''}${c.origin === 'mine' ? ` · <a href="${PI.links.design()}">${esc(PI.returnLabel() || 'Back to the design')}</a>` : ''}</p>` : '';
  const bedSw = isArr && c.beds.length > 1 ? `<div class="kn-sw"><span>Bed</span>${c.beds.map(b => `<a class="pi-chip" role="button" aria-pressed="${b.id === c.bed.id}" href="${linkTo({ bed: b.id })}" data-follow="bed" data-bed="${esc(b.id)}">${esc(b.name)}</a>`).join('')}</div>` : '';
  const spSw = `<div class="kn-sw"><span>Species</span>${d.species.map(s => { const o = T.decide(c, fn.id, s.id); return `<a class="pi-chip" role="button" aria-pressed="${s.id === sp.id}" href="${linkTo({ species: s.slug })}" data-follow="species" data-species="${esc(s.slug)}" data-outcome="${esc(o.outcome)}" title="${esc(s.common_names[0] || '')}: ${esc(T.OUTCOME[o.outcome].word)}"><i>${esc(s.scientific_name)}</i>${o.outcome === 'planted' ? '<small>planted</small>' : ''}</a>`; }).join('')}</div>`;
  const key = `<p class="kn-key"><span><i class="k-bed"></i>the bed</span>${isArr ? '<span><i class="k-crown"></i>mature crown, from a claimed spread</span>' : ''}${fn.id === 'z:screen' ? `<span><i class="k-edge"></i>screened edge</span>${c.screen.evaluation?.gaps?.length ? '<span><i class="k-gap"></i>not covered</span>' : ''}` : ''}${S.plant ? '<span><i class="k-pick"></i>the selected plant</span>' : ''}${(p.site.features || []).some(f => f.kind === 'existing-tree') ? '<span><i class="k-tree"></i>existing tree, canopy assumed</span>' : ''}</p>`;
  return `<section class="kn-case" id="kn-case" tabindex="-1">
    <div class="kn-case-d">${T.planSvg(c, { fn: fn.id, species: sp.id, plant: S.plant?.id })}${key}</div>
    <div class="kn-case-t"><h2>The decision being followed</h2>${readLine}
      <p class="kn-case-l">${head}</p>${about}${po}
      <p class="kn-case-m">${w ? `A ${w} × ${h} m site in ` : ''}${where}${c.said ? `, described in one sentence: “${esc(c.said)}”` : ''}.${ver}${stale}</p>${other}
      <div class="kn-sws">${fnSw}${bedSw}${spSw}</div>
    </div></section>`;
}

// ---------------------------------------------------------------- 1 Sources
const sec = (id, n, title, lede, body) => `<section class="pi-sec kn-step" id="${id}" tabindex="-1"><h2><span class="kn-n">${n}</span>${title}</h2><p class="pi-sec-l">${lede}</p><div>${body}</div></section>`;
const more = (label, body, open = false) => `<details class="pi-more-d"${open ? ' open' : ''}><summary>${label}</summary>${body}</details>`;
function useClaims(link) { return (link?.use_claims || []).map(id => S.d.claims[id]).filter(Boolean); }
function sources(sp, fn, link) {
  const d = S.d; const cl = useClaims(link); const byType = {}; for (const s of Object.values(d.sources)) byType[s.type] = (byType[s.type] || 0) + 1;
  const nOf = sid => Object.values(d.claims).filter(c => c.source_id === sid).length; const pract = Object.values(d.sources).filter(s => s.type === 'practitioner');
  const rows = cl.length ? cl.map(c => { const so = d.sources[c.source_id] || {}; const chk = d.evidence_checks[c.id]; const survey = so.type === 'practitioner';
    const body = survey ? `<p>A practitioner answered the project survey. The response itself stays in the survey’s protected database; what is published is the project’s paraphrase of it, in step 2.</p>`
      : chk?.excerpt ? `<blockquote>${esc(chk.excerpt)}</blockquote><p class="pi-led-n">Where on the page: ${esc(chk.locator || 'not recorded')}. The excerpt was recorded when the source was read for the check in step 2.</p>` : `<p>The source page is cited; no excerpt of it is recorded.</p>`;
    return T.row('source', body, `<span>${T.sourceLink(d, c.source_id)}</span><span>${esc(T.SOURCE_TYPE[so.type] || human(so.type || ''))}${so.publisher && !survey ? ` · ${esc(so.publisher)}` : ''}</span>${so.licence_tier ? `<span>licence tier ${esc(so.licence_tier)}</span>` : ''}`, survey ? 'respondent' : 'source'); }).join('')
    : T.row('source', `<p><b>No source states that <i>${esc(sp.scientific_name)}</i> can be used as a ${esc(fn.label)}.</b> ${link?.status === 'candidate' ? 'The link in step 3 is an inference from recorded traits.' : 'Whatever the database says about this pair comes from the trait check in step 3.'}</p>`, '<span>an explicit unknown</span>', null);
  const all = `<table class="pi-table"><thead><tr><th>Source</th><th>Kind</th><th>Publisher</th><th class="n">Claims</th></tr></thead><tbody>${Object.values(d.sources).filter(s => s.type !== 'practitioner').map(s => ({ s, n: nOf(s.id) })).sort((a, b) => b.n - a.n).map(({ s, n }) => `<tr><td>${s.url ? `<a href="${esc(s.url)}" rel="noopener">${esc(s.label.split(' — ')[0])}</a>` : esc(s.label)}</td><td>${esc(T.SOURCE_TYPE[s.type] || s.type)}</td><td>${esc(s.publisher || '')}</td><td class="n">${n}</td></tr>`).join('')}<tr><td>Practitioner survey</td><td>${plural(pract.length, 'anonymous respondent')}</td><td>${esc(pract[0]?.publisher || '')}</td><td class="n">${pract.reduce((a, s) => a + nOf(s.id), 0)}</td></tr></tbody></table>`;
  return sec('kn-sources', 1, 'Sources', 'Where the knowledge comes from.',
    `<p>Knowledge enters as statements from named sources. This release cites ${d.stats.sources}: ${[['database', 'published plant database'], ['municipal', 'municipal open-data set'], ['practitioner', 'anonymous practitioner response']].filter(([k]) => byType[k]).map(([k, w]) => plural(byType[k], w)).join(', ')}${byType.model ? `, and ${plural(byType.model, 'model placeholder')} that is never counted as evidence` : ''}.</p>
    <dl class="pi-ledger">${rows}</dl>
    ${more(`All ${d.stats.sources} sources of this release`, all)}<p class="kn-go"><a href="${PI.links.research()}">How practitioner knowledge is collected</a></p>`);
}

// ---------------------------------------------------------------- 2 Claims & attributes
function claimRows(c) {
  const d = S.d; const chk = d.evidence_checks[c.id]; const survey = T.isSurvey(d, c.source_id); const vals = T.valueLabels(d, c);
  const ver = c.status === 'verified' ? `<p>${tag('verified')} A reviewer checked this claim against ${survey ? 'the response' : 'its source'}.</p>` : `<p>${tag('unverified')} No person has checked this claim against its source yet. Unverified is not wrong; it is unchecked.</p>`;
  const ai = chk ? `<p>${tag(chk.result, T.AI_WORD[chk.result] || human(chk.result))} ${esc(chk.explanation || '')}</p>${chk.missing_context ? `<p class="pi-led-n">Missing context: ${esc(chk.missing_context)}</p>` : ''}` : `<p>${tag('not_assessed', 'not assessed')} ${c.status === 'verified' ? 'Claims a person had already verified were not sent to the assistant.' : 'No assessment is on record for this claim.'}</p>`;
  return T.row('claim', `<p>${esc(c.text)}</p><p class="pi-led-n">${esc(human(c.field))} = ${vals.map(esc).join(' · ')}${c.conditions?.length ? ` · when ${c.conditions.map(x => esc(x.label)).join(', ')}` : ''}${c.cultivar ? ` · cv. ${esc(c.cultivar)}` : ''}</p>${more('The record as stored', `<pre class="pi-json">${esc(JSON.stringify(c, null, 1))}</pre>`)}`,
      `${T.idHtml(c.id)}<span>${T.sourceLink(d, c.source_id)}${c.place_label ? ` · ${esc(c.place_label)}` : ''}</span><span>recorded ${esc(c.recorded_at || '')} · confidence ${esc(c.confidence)}</span>`)
    + T.row('verification', ver, '', c.status === 'verified' ? 'person' : null)
    + T.row('ai', ai, chk ? `<span>${esc(human(chk.method || ''))} · ${esc((chk.reviewed_at || '').slice(0, 10))}</span><span>never changes the claim</span>` : '<span>no assessment on record</span>', chk ? 'ai' : null);
}
function claims(sp, fn, link) {
  const d = S.d, st = d.stats; const cl = useClaims(link); const chk = st.claims_by_check; const v = st.claims_by_status.verified || 0;
  const bar = parts => `<span class="pi-split">${parts.filter(p => p[1]).map(([cls, n]) => `<i class="${cls}" style="flex:${n}"></i>`).join('')}</span>`;
  const body = cl.length ? `<dl class="pi-ledger">${cl.map(claimRows).join('')}</dl>` : `<dl class="pi-ledger">${T.row('claim', `<p><b>There is no claim that <i>${esc(sp.scientific_name)}</i> is used as a ${esc(fn.label)}.</b> Its ${sp.claims.live} claims record other things: size, habit, light, soil. Step 3 shows which of them the function check reads.</p>`, '<span>an explicit unknown</span>', null)}</dl>`;
  return sec('kn-claims', 2, 'Claims &amp; attributes', 'How a statement is stored and reviewed.',
    `<p>A statement becomes a claim: one plant, one field, one value, kept with its source, place, conditions and a confidence. Two separate checks follow. A person verifies it against the source. Independently, an AI assistant has read each source and recorded whether it supports the claim, as a starting point for reviewers.</p>
    ${body}
    <div class="kn-figs"><div><p><b>${v}</b> of ${st.claims} claims verified by a person</p>${bar([['v', v], ['u', st.claims - v]])}<p class="pi-key"><span><i class="v"></i>verified</span><span><i class="u"></i>unverified</span></p></div>
      <div><p><b>${chk.supported_by_source || 0}</b> of ${st.claims} found supported by the AI source assessment</p>${bar([['s', chk.supported_by_source], ['p', chk.partially_supported], ['c', chk.conflicting_evidence], ['n', chk.not_assessed]])}<p class="pi-key"><span><i class="s"></i>supported ${chk.supported_by_source || 0}</span><span><i class="p"></i>partially ${chk.partially_supported || 0}</span><span><i class="c"></i>conflicting ${chk.conflicting_evidence || 0}</span><span><i class="n"></i>not assessed ${chk.not_assessed || 0}</span></p></div></div>
    <p>Claims are plain JSON, one file per species. The same records fill a GIS-style attribute table: one cell per plant and field, every distinct value kept beside its claims, nothing averaged. <i>${esc(sp.scientific_name)}</i> has ${sp.claims.live} live claims in ${d.attributes.filter(a => a.species === sp.id).length} of ${d.facets.length} fields.</p>
    <p class="kn-go"><a href="${PI.links.explorer(sp.id, null, 'table')}">Open its row in the attribute table</a><a href="${PI.links.profile(sp.id)}">Read its plant profile</a></p>`);
}

// ---------------------------------------------------------------- 3 Relationships
function partner(sp) {   // the species to compare with: one planted in the same bed, else one with a direct record
  const d = S.d, c = S.c; const inBed = c ? [...new Set(c.plants.map(o => o.species_id))].filter(id => id !== sp.id) : [];
  const withRecord = d.pairs.filter(p => (p.a === sp.id || p.b === sp.id) && p.direct_relations.length).map(p => p.a === sp.id ? p.b : p.a);
  const id = inBed.find(x => withRecord.includes(x)) || inBed[0] || withRecord[0] || d.species.find(s => s.id !== sp.id).id;
  return { other: PC.species(d, id), sameBed: !!c && inBed.includes(id) && c.plants.some(o => o.species_id === sp.id) };
}
function relations(sp, fn, link) {
  const d = S.d; const SP = new Map(d.species.map(s => [s.id, s]));
  const reqs = (link?.requirements || []).map(r => `<tr><td>${esc(r.strength)}</td><td>${r.alternative_labels.map(esc).join(' <span class="or">or</span> ')}${r.to_confirm ? ' <span class="pi-led-n">(requirement to confirm)</span>' : ''}</td><td>${T.res(r.result)}${r.evidence?.length ? ` <span class="pi-led-n">${plural(new Set(r.evidence.map(e => e.claim)).size, 'claim')}: ${[...new Set(r.evidence.map(e => e.target_label))].map(esc).join(', ')}${r.evidence.some(e => e.conditions?.length) ? ', some under stated conditions' : ''}</span>` : ''}${r.contrary?.length ? ` <span class="pi-led-n">recorded instead: ${r.contrary.map(x => `${esc(x.target_label)} (${esc(T.sourceName(d, x.source_id))})`).join(', ')}</span>` : ''}${!r.evidence?.length && !r.contrary?.length ? ' <span class="pi-led-n">nothing recorded</span>' : ''}</td></tr>`).join('');
  let say;
  if (!link) say = '<p>No record.</p>';
  else if (link.status === 'derived') say = `<p>${tag('derived')}${tag(link.verification === 'none' ? 'none' : link.verification, link.verification === 'none' ? 'no claim to verify' : link.verification)}${link.conflict ? tag('conflict', 'a trait claim contradicts it') : ''} A source records the use <b>${esc(link.via_use_labels.join(', '))}</b>, and the ontology maps that use to ${esc(fn.label)}. The link is no stronger than the claim under it${link.verification === 'verified' ? ': a person verified a use claim' : ': no person has verified it'}.</p>`;
  else if (link.status === 'candidate') say = `<p>${tag('candidate')} No source states this use. Every trait ${esc(fn.label)} requires is met by recorded claims, so the link is an inference. It is never promoted until a source records the use.</p>`;
  else say = `<p>${tag('unknown', link.verdict === 'contradicted by traits' ? 'no link: contradicted by a recorded trait' : 'no link: evidence missing')} ${link.verdict === 'contradicted by traits' ? `No link is drawn. A recorded claim places the plant outside a trait ${esc(fn.label)} requires, shown below with its source.` : `No link is drawn. The database has no claim on a trait ${esc(fn.label)} requires. Not known is not the same as unsuitable.`}</p>`;
  const rule = (link?.rules || []).map(r => d.rules[r] ? `<p class="pi-led-n"><b>${esc(r)}</b> ${esc(d.rules[r])}</p>` : '').join('');
  const col = d.function_links.filter(l => l.function === fn.id).sort((a, b) => ({ derived: 0, documented: 0, candidate: 1, unknown: 2 }[a.status] - { derived: 0, documented: 0, candidate: 1, unknown: 2 }[b.status]));
  const colHtml = `<table class="pi-table"><thead><tr><th>Species</th><th>Link</th><th>Basis</th></tr></thead><tbody>${col.map(l => `<tr${l.species === sp.id ? ' class="on"' : ''}><td><a href="${linkTo({ species: SP.get(l.species).slug })}" data-follow><i>${esc(SP.get(l.species).scientific_name)}</i></a></td><td>${l.drawn ? tag(l.status) : tag('unknown', l.verdict === 'contradicted by traits' ? 'no link: contradicted' : 'no link: no evidence')}${l.conflict ? tag('conflict') : ''}</td><td>${l.drawn ? (l.via_use_labels?.length ? `recorded use: ${esc(l.via_use_labels.join(', '))}` : 'inferred from recorded traits') : esc(l.verdict || 'unknown')}</td></tr>`).join('')}</tbody></table>`;
  // species A and species B: four things kept apart
  const { other, sameBed } = partner(sp); const pair = d.pairs.find(p => (p.a === sp.id && p.b === other.id) || (p.b === sp.id && p.a === other.id));
  const rels = (pair?.direct_relations || []).map(id => d.relations.find(r => r.id === id)).filter(Boolean); const sharedF = (pair?.attributes || []).filter(r => r.shared.length);
  const combos = pair?.complementarity?.combinations || []; const fnName = id => d.functions.find(f => f.id === id)?.label || id; const swap = pair && pair.a !== sp.id;
  const bio = rels.filter(r => ['companion', 'competes', 'facilitates', 'co_occurs_with'].includes(r.type));
  S.pairHtml = `<p>${sameBed ? `In this bed <i>${esc(sp.scientific_name)}</i> stands with <i>${esc(other.scientific_name)}</i>.` : `Take <i>${esc(sp.scientific_name)}</i> and <i>${esc(other.scientific_name)}</i>.`} What the knowledge base holds about the two together is four separate things, and only the first is a record of the pair.</p>
    <dl class="pi-ledger kn-ab">
      <div class="pi-led"><dt>Recorded relationship</dt><dd>${rels.length ? rels.map(r => `<p>${tag(r.kg_status)}${r.placeholder ? tag('candidate', 'model placeholder') : tag(r.status)} <b>${esc(human(r.type))}</b> ${esc(r.text || '')}</p>`).join('') : '<p><b>None recorded.</b> An honest absence, not evidence that the two are incompatible.</p>'}</dd><dd class="pi-led-p">${rels.length ? rels.map(r => `<span>${esc(T.sourceName(d, r.source_id))}</span>`).join('') : '<span>an explicit unknown</span>'}</dd></div>
      <div class="pi-led"><dt>Shared attributes</dt><dd><p>${plural(sharedF.length, 'field')} with a value in common${sharedF.length ? `, such as ${sharedF.slice(0, 3).map(r => `${esc(r.label)}: ${esc(r.shared.map(x => r.labels[x]).slice(0, 2).join(', '))}`).join('; ')}` : ''}. A computable overlap. Sharing growing conditions does not make two plants companions.</p></dd><dd class="pi-led-p">${T.who('record')}<span>computed from each plant’s own claims</span></dd></div>
      <div class="pi-led"><dt>Inferred spatial complementarity</dt><dd><p>${combos.length ? `${combos.slice(0, 3).map(x => `${esc(fnName(swap ? x.b_function : x.a_function))} + ${esc(fnName(swap ? x.a_function : x.b_function))}`).join(', ')}${combos.length > 3 ? ` and ${combos.length - 3} more` : ''}: the two plants’ function links allow these roles side by side. A layering hypothesis for a designer to test on site.` : 'The two plants’ function links allow no distinct pair of roles.'}</p></dd><dd class="pi-led-p">${T.who('rule')}<span>from the function links, not from the pair</span></dd></div>
      <div class="pi-led"><dt>Biological association</dt><dd><p>${bio.length ? `Only what is recorded above, with its status. ${bio.some(r => r.placeholder) ? 'A model placeholder is a question to check against a source, not evidence.' : ''}` : '<b>Not supported by any record.</b> Nothing here says these two grow well together, compete, or help each other. The platform does not infer it.'}</p></dd><dd class="pi-led-p"><span>${bio.length ? 'see the record' : 'an explicit unknown'}</span></dd></div>
    </dl>
    <p class="kn-go"><a href="${PI.links.compare(sp.id, other.id)}">Compare the two side by side</a></p>`;
  return sec('kn-relations', 3, 'Function', 'How traits relate to a spatial function, and species to each other.',
    `<p>${esc(fn.label)} is not a plant attribute. It is a role a planting plays: ${esc(fn.definition.charAt(0).toLowerCase() + fn.definition.slice(1))} The knowledge graph links a species to it only by a written rule, and checks the traits the role needs against the plant’s claims.</p>
    <dl class="pi-ledger">${T.row('rule', `${say}${rule}`, `${link ? T.idHtml(link.id) : ''}${restsOn(link)}`, link?.drawn ? 'rule' : null)}</dl>
    ${reqs ? `<table class="pi-table kn-req"><thead><tr><th></th><th>${esc(fn.label)} needs</th><th>Recorded for <i>${esc(sp.scientific_name)}</i></th></tr></thead><tbody>${reqs}</tbody></table><p class="pi-led-n">The requirements come from the planting-design literature (${esc((fn.source_of_term || '').split(',').slice(0, 2).join(','))}), not from a plant source. A met trait is a recorded attribute; it is not yet a screen in a garden.</p>` : ''}
    ${more(`All ${col.length} species against ${esc(fn.label)}: ${fn.n_linked} linked, ${col.filter(l => l.verdict === 'contradicted by traits').length} contradicted by a recorded trait, ${col.filter(l => !l.drawn && l.verdict !== 'contradicted by traits').length} with evidence missing`, colHtml)}
    <p class="kn-go kn-views"><span>The same records in three views</span><a href="${PI.links.explorerFocus('function', fn.id, { view: 'graph', inspect: link ? { kind: 'link', id: link.id } : null })}">Graph</a><a href="${PI.links.explorerFocus('function', fn.id, { view: 'matrix', inspect: link ? { kind: 'link', id: link.id } : null })}">Function matrix</a><a href="${PI.links.explorerFocus('function', fn.id, { view: 'table' })}">Attribute table</a></p>
`);
}


// ---------------------------------------------------------------- 4 Selection: what was asked, what is known of the site, the decision
const STATUS_WORD = { 'user-stated': 'stated', 'user-drawn': 'drawn', 'user-calibrated': 'calibrated', 'user-accepted': 'accepted as proposed', 'user-edited': 'edited by you', assumed: 'assumed', inferred: 'estimated from words', unknown: 'unknown', 'ai-suggested': 'suggested, not accepted' };
const CHECKS = { 'z:screen': [['evidence', 'Evidence'], ['site', 'Site'], ['height', 'Height'], ['geometry', 'Row fits']], 'z:ground_cover': [['evidence', 'Evidence'], ['site', 'Site'], ['geometry', 'Fits the bed']] };
function selection(sp, fn, link) {
  const d = S.d, c = S.c, E = S.E; const title = 'Selection', lede = 'What the bed was asked to do, what is known of the site, and whether the engine used this species.';
  if (!c) return sec('kn-access', 4, title, lede, `<p>The Studio keeps no plant data of its own: for every bed it asks the snapshot about each species. No saved design is available to show it on.</p>`);
  const p = c.project, bed = c.bed, asm = c.asm; const dc = T.decide(c, fn.id, sp.id); const r = asm.rows.find(x => x.id === sp.id); const req = asm.requirement; const cand = dc.cand;
  const cond = k => { const v = asm.conditions[k]; return v && v.value && v.status !== 'unknown' ? `${esc(human(v.value))} <span class="pi-led-n">${esc(STATUS_WORD[v.status] || v.status)}</span>` : '<span class="pi-none">unknown</span>'; };
  const bfn = (bed.functions || []).find(f => f.function === fn.id) || p.brief.functions.find(f => f.function === fn.id && !f.alternative);
  const asked = asm.wanted.map(id => { const f = d.functions.find(x => x.id === id); return `${esc(f?.label || id)}${T.arranged(E, id) ? '' : ' <span class="pi-led-n">recorded only</span>'}`; }).join(' · ') || '<span class="pi-none">nothing</span>';
  const site = `<dl class="kn-site"><div><dt>Outline</dt><dd>${p.site.boundary ? `${esc(STATUS_WORD[p.site.boundary_status] || p.site.boundary_status || 'drawn')}` : 'not drawn'}</dd></div><div><dt>${esc(bed.name)}</dt><dd>${bed.area_m2} m² · ${esc(STATUS_WORD[bed.status] || bed.status)}</dd></div><div><dt>Asked of this bed</dt><dd>${asked}</dd></div><div><dt>Light</dt><dd>${cond('light')}</dd></div><div><dt>Water</dt><dd>${cond('water')}</dd></div><div><dt>Soil</dt><dd>${cond('soil_type')}</dd></div>${fn.id === 'z:screen' && req ? `<div><dt>Target height</dt><dd>${req.target_height_m ?? '?'} m <span class="pi-led-n">${esc(/heuristic/.test(req.target_basis || '') ? 'not stated: the engine’s default' : req.target_basis || '')}</span></dd></div><div><dt>Year-round cover</dt><dd>${req.year_round ? 'required' : `<span class="pi-led-n">${esc(/not stated/.test(req.year_round_basis || '') ? 'not stated: reported, not required' : req.year_round_basis || '')}</span>`}</dd></div>` : ''}</dl>`;
  const read = p.brief.provenance === 'offline-parser' || !p.brief.provenance ? 'offline rules' : esc(p.brief.provenance);
  const siteRow = T.row('site', `${c.said ? `<blockquote>${esc(c.said)}</blockquote>` : ''}<p class="kn-read">${T.who('rule')} Read by ${read}, a listed set of patterns, not by a language model${bfn?.basis ? `: ${esc(bfn.basis)}` : ''}.</p>${site}`, `<span>${c.origin === 'mine' ? esc(p.name) : 'the demonstration garden'}</span><span>what was not stated stays unknown</span>`);
  if (!dc.arranged) return sec('kn-access', 4, title, lede,
    `<p><b>${esc(fn.label)} stops here.</b> ${esc(cap(dc.reason))}. A bed can be given the function, and the Studio records and reports it, but no species is selected for it and nothing is drawn. What the knowledge base holds about <i>${esc(sp.scientific_name)}</i> and ${esc(fn.label)} is step 3.</p>
    <dl class="pi-ledger">${siteRow}</dl>
    <p class="kn-go">${S.E.FUNCTION_SUPPORT ? d.functions.filter(f => T.arranged(E, f.id)).map(f => `<a href="${linkTo({ fn: f.id })}" data-follow>Follow ${esc(sp.scientific_name)} as ${esc(f.label)} instead</a>`).join('') : ''}<a href="${PI.links.method()}#rules">Which functions the engine arranges</a></p>`);
  const gate = r ? ['light', 'water', 'soil'].map(k => `<tr><td>${k}</td><td>${T.res(r.gate[k].result)}</td><td>${esc(r.gate[k].detail)}${k === 'light' && r.gate.light.standing_text ? `<div class="kn-standing" data-light-standing style="margin-top:4px;font-size:12.5px;color:var(--pi-ink-3)">Evidence standing: ${esc(r.gate.light.standing_text)}</div>` : ''}</td></tr>`).join('') : '';
  const own = cand ? Object.entries(cand.checks).filter(([k]) => k !== 'site').map(([k, v]) => `<tr><td>${esc(k === 'evidence' ? 'function' : k === 'geometry' ? 'fits' : k.replace('_', ' '))}</td><td>${T.res(v.result)}</td><td>${esc(T.tidy(v.detail))}</td></tr>`).join('') : '';
  const size = r ? `<tr><td>size</td><td><span class="pi-res estimate">proxy</span></td><td>crown ${r.proxy.radius_m * 2} m across${r.proxy.spread.claim ? `, from the claimed spread ${r.proxy.spread.min}–${r.proxy.spread.max} m` : ', spread not recorded'}${r.proxy.height.claim ? `; height ${r.proxy.height.min}–${r.proxy.height.max} m claimed` : '; height not recorded'}. One claimed range chosen by a stated rule, never a measurement.</td></tr>` : '';
  const decision = T.row('engine', `<p class="kn-outcome" data-outcome="${esc(dc.outcome)}">${T.out(dc.outcome)} ${esc(cap(dc.reason))}.</p><p class="pi-led-n">${esc(T.OUTCOME[dc.outcome].says)}</p>${dc.wanted && r ? `<table class="pi-table kn-gate"><tbody>${gate}${own}${size}</tbody></table>` : ''}`,
    `<span>checked on this page, now</span>${restsOn(link)}${r?.proxy.spread.claim || r?.proxy.height.claim ? '<span>sizes from</span>' : ''}${r?.proxy.spread.claim ? T.idHtml(r.proxy.spread.claim) : ''}${r?.proxy.height.claim ? T.idHtml(r.proxy.height.claim) : ''}`);
  // every species for this bed and function, by outcome
  const all = T.decisions(c, fn.id); const cols = CHECKS[fn.id]; const cell = (x, k) => !x.cand ? '<span class="pi-none">—</span>' : k === 'geometry' && x.cand.checks.form?.result === 'fails' ? T.res('fails') : x.cand.checks[k] ? T.res(x.cand.checks[k].result) : '<span class="pi-none">—</span>';
  const tableOf = list => `<table class="pi-table kn-cand"><thead><tr><th>Species</th>${cols.map(([, l]) => `<th>${l}</th>`).join('')}<th>Outcome</th></tr></thead><tbody>${list.map(x => { const s = PC.species(d, x.species); return `<tr${x.species === sp.id ? ' class="on"' : ''} data-species="${esc(s.slug)}" data-outcome="${esc(x.outcome)}" data-fit="${esc(x.fit || '')}"><td><a href="${linkTo({ species: s.slug })}" data-follow><i>${esc(s.scientific_name)}</i></a><span class="pi-led-n">${esc(cap(x.reason))}</span></td>${cols.map(([k]) => `<td>${cell(x, k)}</td>`).join('')}<td><b>${T.out(x.outcome)}</b></td></tr>`; }).join('')}</tbody></table>`;
  const front = ['planted', 'not_placed', 'eligible', 'other_role']; const shown = all.filter(x => front.includes(x.outcome) || x.species === sp.id), rest = all.filter(x => !shown.includes(x));
  const count = {}; for (const x of all) count[x.outcome] = (count[x.outcome] || 0) + 1; const tally = Object.keys(T.OUTCOME).filter(k => count[k]).map(k => `${count[k]} ${T.OUTCOME[k].word}`).join(' · ');
  const restTally = {}; for (const x of rest) restTally[x.outcome] = (restTally[x.outcome] || 0) + 1;
  const table = !dc.wanted ? '' : `<h3 class="pi-h3">Every species, for this bed</h3>
    <p>The engine checked all ${all.length} species against ${esc(bed.name)} on this page, just now: <span data-tally>${esc(tally)}</span>. A species that fails a check is not planted, whoever asks for it. One that passes with open points may be planted, and is reported as uncertain.</p>
    ${shown.length ? tableOf(shown) : ''}${rest.length ? more(`${shown.length ? `The other ${rest.length}` : `All ${rest.length}`}: ${Object.keys(T.OUTCOME).filter(k => restTally[k]).map(k => `${restTally[k]} ${T.OUTCOME[k].word}`).join(', ')}`, tableOf(rest), !shown.length) : ''}
    <p class="pi-led-n">Four results are kept apart: <b>excluded by a check</b> has a claim or a measurement against it; <b>evidence unknown</b> lacks a record and is not a judgement of the plant; <b>eligible, not selected</b> passed but is not in the mix; <b>selected, not placed</b> is in the mix and found no position.</p>`;
  return sec('kn-access', 4, title, lede,
    `<p>The Studio keeps no plant data of its own. For every bed it asks the snapshot about each species: does it pass the site’s light, water and soil; what supports it for the bed’s function; how large does it get. What it asks <em>against</em> is yours: the site you stated.</p>
    <dl class="pi-ledger">${siteRow}${decision}</dl>
    ${table}
    <p class="kn-go">${c.origin === 'mine' ? `<a href="${PI.links.compose(bed.id, sp.id, fn.id)}">Open ${esc(bed.name)} in Compose</a>` : `<a href="${PI.links.design()}">Describe a site of your own</a>`}<a href="${PI.links.profile(sp.id)}#sec-studio">How the Studio draws this plant</a></p>`);
}

// ---------------------------------------------------------------- 5 Arrangement and result: what was generated, by which rules, what was measured
const RULES_OF = { 'z:screen': ['screen_spacing', 'row_inset', 'row_end_margin', 'edge_tolerance', 'stagger_offset', 'neighbour_clearance', 'tree_keepout', 'screen_target_height'], 'z:ground_cover': ['ground_spacing', 'ground_jitter', 'rhythm_band', 'patch_radius', 'patch_gap', 'edge_tolerance', 'neighbour_clearance', 'tree_keepout', 'area_sample'] };
function arrangement(sp, fn, link) {
  const c = S.c, d = S.d, E = S.E; const title = 'Arrangement &amp; result', lede = 'What was generated, by which rules, and what the engine can and cannot establish.';
  if (!c) return sec('kn-evaluation', 5, title, lede, `<p>No saved design is available to evaluate.</p>`);
  const dc = T.decide(c, fn.id, sp.id); const v = c.version; const R = E.ARRANGEMENT_RULES; const used = RULES_OF[fn.id]?.filter(k => R[k]) || [];
  if (!dc.arranged) return sec('kn-evaluation', 5, title, lede, `<p><b>Nothing is arranged or evaluated for ${esc(fn.label)}.</b> ${esc(cap(dc.reason))}. The engine arranges ${d.functions.filter(f => T.arranged(E, f.id)).map(f => esc(f.label)).join(' and ')} today; the other functions are recorded and can be explored, and the platform does not show a planting for them.</p><p class="kn-go"><a href="${PI.links.explorerFocus('function', fn.id)}">Explore ${esc(fn.label)} in the records</a><a href="${PI.links.method()}#limits">Limits</a></p>`);
  if (!dc.wanted) return sec('kn-evaluation', 5, title, lede, `<p>${esc(cap(dc.reason))}, so nothing was arranged for it here.</p>`);
  const sx = T.sectionOf(c, fn.id); const ev = sx.evaluation;
  if (!v || !ev) return sec('kn-evaluation', 5, title, lede, `<p>No arrangement has been computed for ${esc(c.bed.name)}, so there is nothing to evaluate. ${c.origin === 'mine' ? `<a href="${PI.links.compose(c.bed.id, sp.id, fn.id)}">Open it in Compose</a>` : ''}</p>`);
  const inIt = dc.outcome === 'planted'; const note = inIt ? '' : `<p><i>${esc(sp.scientific_name)}</i> is not part of this arrangement (${T.out(dc.outcome)}), so what follows is about the plants that were placed.</p>`;
  const provE = `<span>${c.dry ? 'dry run on this page' : esc(v.label || '')} · seed ${esc(v.seed)}</span>${c.dry ? '' : `<span class="id">${esc(v.id || '')}</span>`}<span>${esc((v.generator?.operators || []).join(', '))}</span><span>${c.dry ? 'not saved to the design' : 'same input, same garden'}</span>`;
  const provV = `<span>measured on the model</span><span>${c.dry ? 'computed here, on the dry run' : sx.same ? 'recomputed here: same result' : sx.recorded ? 'recomputed here: differs from the recorded result' : 'computed here'}</span>`;
  const po = S.plant; const here = po ? `<p class="kn-po">The plant you selected, <span class="id">${esc(po.id)}</span>, is ${po.role === 'accent' ? 'an accent that took a ground position' : po.role === 'screen-layer' ? 'in the second row' : fn.id === 'z:screen' ? 'in the row' : 'in the ground layer'} at ${po.position_m.join(', ')} m, drawn with a crown of ${r2(po.proxy_radius_m * 2)} m${po.proxy_source?.claim ? ` from the claim <span class="id">${esc(po.proxy_source.claim)}</span>` : ''}${po.origin && po.origin !== 'generated' ? `. It was ${esc(human(po.origin))}, not placed by the generator` : ''}.</p>` : '';
  let engine, verdict, rows, limits;
  if (fn.id === 'z:screen') {
    const pl = c.screen.plan; const lead = pl ? PC.species(d, pl.lead.species_id) : null; const chk = ev.checks; const line = (name, r, text) => `<tr><td>${name}</td><td>${T.res(r)}</td><td>${text}</td></tr>`;
    engine = `${here}${pl ? `<p>${pl.rows === 1 ? 'One row' : `${pl.rows} rows`} along the screened edge of ${pl.edge_length_m} m${lead ? `, planted with <i>${esc(lead.scientific_name)}</i>` : ''}: ${pl.expected[0] + pl.expected[1]} positions at ${pl.step_m} m, <b>${pl.placed[0] + pl.placed[1]} placed</b>${pl.shortfall ? `. ${esc(cap(T.tidy(pl.shortfall)))}` : ''}.</p><p class="pi-led-n">Spacing: ${esc(pl.spacing_rule)}. The factor is the engine’s own ${esc(pl.spacing_source)}: the database holds no spacing claim. ${esc(cap(pl.reason))}.</p>` : `<p>No row was placed for this bed.</p>`}${T.edgeStrip(c)}<p class="kn-key"><span><i class="k-crown"></i>mature crown</span><span><i class="k-miss"></i>position dropped</span><span><i class="k-gap"></i>edge not covered</span></p>`;
    rows = line('Continuity', chk.continuity, `${ev.covered_m} m of ${ev.edge_length_m} m lies under a mature crown${ev.gaps.length ? `; ${plural(ev.gaps.length, 'gap')} of ${ev.gap_total_m} m` : ''}`)
      + line(`Height ${ev.target_height_m} m`, chk.target_height, `reached for certain on ${ev.cover_at_target_certain_m} m, possibly on ${ev.cover_at_target_possible_m} m, if the plants reach the top of their claimed ranges${/heuristic/.test(ev.target_basis) ? '. The target itself is a default; none was stated' : ''}`)
      + line('Year-round cover', chk.year_round, ev.year_round_required ? `evergreen on ${ev.cover_evergreen_m} m` : `not asked for; evergreen on ${ev.cover_evergreen_m} m`)
      + line('Evidence', chk.evidence === 'supported' ? 'meets' : chk.evidence, `${ev.species.map(s => `${esc(PC.species(d, s.species_id).scientific_name)}: link ${esc(s.link_status)}${s.conflict ? ', in conflict with a recorded trait' : ''}, ${s.link_verified ? 'verified by a person' : 'not verified by a person'}`).join('; ')}. The link is the one in step 3`);
    const bad = ev.status === 'not met', unc = ev.status === 'uncertain';
    verdict = `<div class="kn-verdict ${bad ? 'bad' : unc ? 'unc' : 'ok'}"><p class="kn-verdict-s">${esc(fn.label)}: ${esc(ev.status)}</p><ul>${ev.reasons.map(r => `<li>${esc(cap(r.text))}.</li>`).join('') || '<li>Every check the engine can make is met on claimed sizes.</li>'}</ul></div>`;
    limits = [['Whether it screens', 'The engine projects mature crowns onto the edge. It does not measure opacity, and it reports this itself: not a measured or verified screening performance.'], ['How it grows', 'Sizes are claimed mature ranges. Establishment, growth rate on this site and pruning are not modelled.']];
  } else {
    const g = c.ground.group, a = c.ground.accent; const by = {}; for (const o of c.ground.objects) { const k = `${o.species_id}|${o.role}`; by[k] = (by[k] || 0) + 1; }
    const mix = c.asm.picks.ground.map(x => x.id); const placedSp = [...new Set(c.ground.objects.filter(o => o.role === 'ground').map(o => o.species_id))]; const missing = mix.filter(id => !placedSp.includes(id)); const comp = c.ground.composition;
    const counts = Object.entries(by).map(([k, n]) => { const [id, role] = k.split('|'); return `${n} <i>${esc(PC.species(d, id).scientific_name)}</i>${role === 'accent' ? ' as accents' : ''}`; }).join(', ');
    engine = `${here}${g ? `<p><b>${esc(g.params.pattern_label)}.</b> ${esc(cap(g.params.pattern_rule))}. ${comp.custom ? 'This arrangement was chosen in Compose' : 'This is the engine’s default arrangement'}${comp.variation ? `, variation ${comp.variation}` : ''}.</p>
      <p>The mix for this bed is ${names(mix) || 'empty'}${dc.chosen ? ', chosen in Compose among the species that qualify' : ', the engine’s own choice'}. Placed: ${counts || 'nothing'}${missing.length ? `. ${names(missing)} ${missing.length === 1 ? 'is' : 'are'} in the mix and got no position` : ''}. <b>${g.params.placed} placed</b> of about ${g.params.expected_count} positions${a ? `; every ${a.params.every}th ground position toward ${esc(a.params.toward)} was given to an accent species` : ''}.</p>
      <p class="pi-led-n">Spacing ${g.params.spacing_m} m: ${esc(g.params.spacing_rule)}. The factor is the engine’s own ${esc(g.params.spacing_source)}: the database holds no spacing claim. ${esc(cap(g.params.expected_note))}.</p>` : `<p>${esc(cap(c.unresolved.find(u => /ground/i.test(u)) || 'No ground layer was placed in this bed'))}.</p>`}
      ${T.planSvg(c, { fn: fn.id, species: sp.id, plant: po?.id, zoom: true })}<p class="kn-key"><span><i class="k-crown"></i><i>${esc(sp.scientific_name)}</i>, mature crown</span><span><i class="k-other"></i>other species of the ground layer</span>${a ? '<span><i class="k-accent"></i>accent</span>' : ''}${po ? '<span><i class="k-pick"></i>the selected plant</span>' : ''}</p>`;
    const pct = x => `${Math.round(x * 100)} %`;
    rows = `<tr><td>Ground under the ground layer</td><td>${T.res('estimate')}</td><td>${pct(ev.ground_cover_share)}: ${ev.ground_cover_m2} m² of ${ev.plantable_m2} m² plantable ground lies under a mature crown of the ground layer</td></tr>
      <tr><td>Ground under any crown</td><td>${T.res('estimate')}</td><td>${pct(ev.any_crown_share)}, counting the other plants of the bed</td></tr>
      <tr><td>Plants placed</td><td>${T.res('geometry')}</td><td>${ev.plants}${ev.expected_count != null ? ` of about ${ev.expected_count} positions the pattern offers` : ''}${ev.spacing_m ? `, ${ev.spacing_m} m apart` : ''}${ev.patches != null ? `, in ${plural(ev.patches, 'patch', 'patches')}` : ''}</td></tr>
      <tr><td>Pass mark</td><td><span class="pi-none">none</span></td><td>The engine sets no threshold for ground cover, so it reports no met or not met. None is invented here.</td></tr>`;
    verdict = `<div class="kn-verdict unc"><p class="kn-verdict-s">${esc(fn.label)}: an estimate, ${pct(ev.ground_cover_share)}</p><ul>${ev.reasons.map(r => `<li>${esc(cap(r.text))}.</li>`).join('')}<li>Share of the plantable ground under the mature crowns of the ground layer. A geometric figure from claimed spreads.</li></ul></div>`;
    limits = [['Whether the ground closes', 'The figure is the share of ground under claimed mature crowns. It is not the cover a planting reaches, and it says nothing about weed suppression; the engine reports this itself.'], ['How it grows', 'Establishment, spread over time and how the species meet at their edges are not modelled.'], ...(g?.params.pattern === 'patches' ? [['The open ground between patches', 'Clustered patches leave ground unplanted on purpose. The estimate counts it as uncovered.']] : [])];
  }
  const unknownSite = ['light', 'water', 'soil_type'].filter(k => { const x = c.asm.conditions[k]; return !x || !x.value || x.status === 'unknown'; }).map(k => k.replace('_type', ''));
  limits.push(['Whether the site suits it', unknownSite.length ? `${cap(unknownSite.length > 1 ? `${unknownSite.slice(0, -1).join(', ')} and ${unknownSite[unknownSite.length - 1]}` : unknownSite[0])} ${unknownSite.length === 1 ? 'was' : 'were'} not stated for this site, so no site gate can pass: every candidate is uncertain at best.` : 'The stated light, water and soil are checked against recorded requirements; microclimate is not.'],
    ['How the plants behave together', 'No record, no assessment. Shared conditions are never read as compatibility.'],
    ['Cost and ecological performance', cap(`${esc(v.evaluation?.cost_note || 'no prices in the database')}; ${esc(v.evaluation?.ecology_note || 'no ecological score')}.`)]);
  return sec('kn-evaluation', 5, title, lede,
    `<p>The engine arranges the species that passed, then measures its own result on the model. It reports geometry and claimed sizes. A recorded attribute is not a performance: a claimed mature height does not prove a privacy screen, and a claimed spread does not prove closed ground.</p>${note}
    <dl class="pi-ledger">
      ${T.row('engine', engine, provE)}
      ${T.row('evaluation', `${verdict}<table class="pi-table kn-eval"><tbody>${rows}</tbody></table><p class="pi-led-n">${esc(ev.note)}</p>`, `${provV}${fn.id === 'z:screen' ? restsOn(link) : ''}`)}
    </dl>
    <h3 class="pi-h3">What this cannot establish</h3>
    <dl class="kn-limits">${limits.map(([k, t]) => `<div><dt>${k}</dt><dd>${t}</dd></div>`).join('')}</dl>
    ${more(`${used.length + 1} numbers behind this arrangement, and where each comes from`, `<table class="pi-table"><thead><tr><th>Rule</th><th>Value</th><th>From</th></tr></thead><tbody><tr><td>size proxy</td><td>${R.size_proxy.value} ${esc(R.size_proxy.unit)}</td><td>${T.res(R.size_proxy.source)}</td></tr>${used.map(k => `<tr><td>${esc(k.replace(/_/g, ' '))}</td><td>${R[k].value} ${esc(R[k].unit)}</td><td>${T.res(R[k].source)}</td></tr>`).join('')}</tbody></table><p class="pi-led-n">A heuristic is a number the implementer chose. No source or claim backs it, and it is named wherever it decides something.</p>`)}
    <p class="kn-go">${c.origin === 'mine' ? `<a class="pi-btn primary" href="${PI.links.design()}">${esc(PI.returnLabel() || 'Back to the design')}</a><a href="${PI.links.compose(c.bed.id, sp.id, fn.id)}">Open ${esc(c.bed.name)} in Compose</a>` : `<a class="pi-btn primary" href="${PI.links.design()}">Design a garden of your own</a>`}<a href="${PI.links.method()}">Who or what decides at each step</a></p>`);
}
const r2 = n => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- ways into the records
function explore(sp, fn) {
  const d = S.d; const L = PI.links;
  return `<section class="pi-sec kn-step" id="kn-explore" tabindex="-1"><h2>Explore the records</h2><p class="pi-sec-l">The table, the matrix and the network are three views of the same records, not three databases.</p><div>
    <form id="kn-search" class="kn-search" role="search"><label for="kn-q">Search a plant, a spatial function or a trait</label><div><input id="kn-q" name="q" type="search" autocomplete="off" spellcheck="false" placeholder="${esc([sp.common_names[0], fn.label, fn.requirements[fn.requirements.length - 1]?.alternative_labels[0]].filter(Boolean).map(x => x.toLowerCase()).join(', '))}…"><button class="pi-btn primary" type="submit">Open</button></div><p id="kn-search-n" class="pi-led-n" aria-live="polite"></p></form>
    <h3 class="pi-h3">Start from a spatial function</h3>
    <ul class="kn-fns">${d.functions.map(f => `<li><a href="${L.explorerFocus('function', f.id)}"><b>${esc(f.label)}</b><span>${esc(f.definition)}</span><small>${f.n_linked} linked · ${f.n_unknown} unknown</small></a></li>`).join('')}</ul>
    <h3 class="pi-h3">Or choose a view</h3>
    <ul class="pi-list kn-views-l">
      <li><a href="${L.explorerFocus('species', sp.id, { view: 'table' })}"><b>Table</b></a> Plants by attributes: ${d.facets.length} fields per species, with every value and where sources disagree.</li>
      <li><a href="${L.explorerFocus('species', sp.id, { view: 'matrix' })}"><b>Matrix</b></a> ${d.species.length} species by ${d.functions.length} spatial functions. Every cell opens its evidence; no link is a gap, not a verdict.</li>
      <li><a href="${L.explorerFocus('species', sp.id, { view: 'graph' })}"><b>Network</b></a> Plants, attributes and spatial functions with the records that join them; a focus opens its relationships one layer at a time.</li>
      <li><a href="${L.explorer(null, null, 'compare')}"><b>Compare A and B</b></a> Two species: shared attributes, recorded relationships, spatial complementarity and unknowns, kept apart.</li>
      <li><a href="${L.neural(sp.id)}"><b>3D network</b></a> The same claims as one immersive three-dimensional network.</li>
    </ul>
    <p class="kn-go"><a href="${L.method()}">Research &amp; Method</a><a href="${L.how()}">How the engine works</a><a href="${L.library()}">Plant Library</a></p></div></section>`;
}
