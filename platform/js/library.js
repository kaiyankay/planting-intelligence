// Plant Library — the atlas of the species in the published knowledge snapshot and one profile per species.
//   #                     the atlas (optionally #form=Tree&fn=z:screen&origin=non_native — the Filters tray writes these); ?card=3 adds a short growth-form line to the cards
//   #species=<slug>       a Plant Profile; &tab=design|growth|evidence|unknown picks its tab (design when absent),
//                         &open=<facet or function id> opens one row of that tab on its claims
// The page reads brain/data/explorer.json through platform.js and never writes to it. It borrows two things from the Garden
// Studio so that a profile shows what the design engine does with the record: the knowledge adapter (design/js/knowledge.js:
// size proxy, gate vocabulary) and the plan symbol (design/js/render.js). The only thing this page stores is the list of species
// the user asked the Studio to check (platform.js `considered`).
import * as PI from './platform.js';
import * as PC from './plantcard.js';

const $ = s => document.querySelector(s); const esc = PI.esc;
const S = { d: null, imgs: null, K: null, R: null, form: null, fn: null, origin: null, q: '', shown: null, tab: 'design', tray: false };
const CARD3 = new URLSearchParams(location.search).get('card') === '3';   // V4.1 comparison: a third, one-word growth-form line

(async function boot() {
  try {
    const [d, imgs, KM, R] = await Promise.all([PI.loadSnapshot(), PI.loadImages(), import(new URL('js/knowledge.js', PI.routes.design).href), import(new URL('js/render.js', PI.routes.design).href)]);
    Object.assign(S, { d, imgs, K: new KM.Knowledge(d), R });
    PI.mountTop($('#top'), { active: 'plants', snapshot: d }); $('#foot').innerHTML = PI.footHtml(d);
    window.addEventListener('hashchange', route); document.addEventListener('click', onClick);
    window.addEventListener('storage', () => { PI.mountTop($('#top'), { active: 'plants', snapshot: d }); route(false); });
    window.library = { S, PI, PC, route };
    route(false);
  } catch (e) { $('#app').innerHTML = `<p class="pi-loading">Could not load the knowledge snapshot: ${esc(e.message)}</p>`; console.error(e); }
})();

const symbolOf = id => { try { return S.R.symbol(S.R.form(S.K, id, null), id, 1, 'present', { k: 20 }); } catch { return null; } };

function route(scroll = true) {
  const p = new URLSearchParams(location.hash.slice(1)); const slug = p.get('species'); const s = slug ? PC.species(S.d, slug) : null;
  S.form = p.get('form'); S.fn = p.get('fn'); S.origin = p.get('origin'); const tab = PC.TABS.some(t => t[0] === p.get('tab')) ? p.get('tab') : 'design';
  if (s && S.shown === s.slug && document.querySelector('.pi-profile')) { showTab(tab); openRow(p.get('open')); return; }   // a tab of the profile already on the page: no re-render, open rows stay open
  S.tab = tab; S.shown = s ? s.slug : null;
  if (slug && !s) { $('#app').innerHTML = `<div class="pi-crumb"><a href="${PI.links.library()}">← Plant Library</a></div><p class="pi-loading">No species “${esc(slug)}” in this knowledge snapshot. The Library holds ${S.d.species.length} species.</p>`; return; }
  if (s) renderProfile(s); else renderAtlas();
  if (scroll) { scrollTo({ top: 0 }); $('#app').focus({ preventScroll: true }); }
  if (s) openRow(p.get('open'));
}
/** #species=<slug>&tab=growth&open=<facet id | function id>: one row of the profile opened on its claims */
function openRow(id) { if (!id) return; const el = [...document.querySelectorAll('details[data-facet], details[data-function]')].find(e => (e.dataset.facet || e.dataset.function) === id); if (!el || el.closest('[hidden]')) return; el.open = true; el.scrollIntoView({ block: 'center' }); }

// ---------------------------------------------------------------- atlas
function renderAtlas() {
  const d = S.d; const des = PI.activeDesign(); const cons = new Set(PI.considered.ids());
  document.title = 'Plant Library · Planting Intelligence';
  const forms = [...new Set(d.species.map(s => s.growth_form_label))]; const nForm = f => d.species.filter(s => s.growth_form_label === f).length;
  const linked = fn => d.function_links.filter(l => l.function === fn && l.drawn).map(l => l.species);
  const origins = [...new Set(d.species.map(s => s.origin_status))].filter(Boolean); const oLabel = o => PC.originLabel(d, d.species.find(s => s.origin_status === o)); const nOrigin = o => d.species.filter(s => s.origin_status === o).length;
  const show = d.species.filter(s => (!S.form || s.growth_form_label === S.form) && (!S.fn || linked(S.fn).includes(s.id)) && (!S.origin || s.origin_status === S.origin));
  const href = (form, fn, origin = S.origin) => { const p = new URLSearchParams(); if (form) p.set('form', form); if (fn) p.set('fn', fn); if (origin) p.set('origin', origin); const h = p.toString(); return h ? `#${h}` : '#'; };
  const note = s => { const n = des?.planted_species.includes(s.id) ? `<span>planted in ${esc(des.name)}</span>` : ''; const c = cons.has(s.id) ? '<span class="wait">being considered for your design</span>' : ''; return n || c ? `${n}${n && c ? ' · ' : ''}${c}` : ''; };
  const gridHtml = () => { const c = show.filter(s => { const q = S.q.trim().toLowerCase(); return !q || [s.scientific_name, ...s.common_names, s.family, s.growth_form_label].some(t => String(t).toLowerCase().includes(q)); });
    return { n: c.length, html: c.map(s => PC.cardHtml(d, s.id, S.imgs, { symbol: symbolOf(s.id), note: note(s), form: CARD3 })).join('') || `<p class="lib-empty">${S.q.trim() ? `No species in this snapshot matches “${esc(S.q.trim())}”${S.form || S.fn || S.origin ? ' with these filters' : ''}.` : 'No species in this snapshot matches all of these filters.'} That is a gap in the records, not a statement about the plants. <a href="#">Show all ${d.species.length} plants</a></p>` }; };
  const g = gridHtml();
  // V4.2: the plants lead. One line, a search and a Filters button; the three filter groups live in a tray that opens on request, and
  // what is chosen shows as one row of chips. A choice in one group never drops a choice in another (each link carries all three).
  const active = [S.form && ['Growth form', S.form, href(null, S.fn)], S.fn && ['Linked to', d.functions.find(f => f.id === S.fn)?.label || S.fn, href(S.form, null)], S.origin && ['Origin', oLabel(S.origin), href(S.form, S.fn, null)]].filter(Boolean);
  $('#app').innerHTML = `
    <header class="pi-mast lib-mast">
      <div><h1>Plants</h1>
        <p class="pi-lede">${d.species.length} species recorded for planting in Metro Vancouver. Open one to read it.</p></div>
      <div class="lib-bar" role="group" aria-label="Find a plant">
        <label class="lib-search"><span class="sr">Search the plants</span><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/></svg><input type="search" id="lib-q" placeholder="Search by name" value="${esc(S.q)}" autocomplete="off"></label>
        <button type="button" class="lib-fbtn" id="lib-fbtn" aria-expanded="${S.tray}" aria-controls="lib-tray"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M4.5 8h7M7 12h2"/></svg>Filters${active.length ? `<small>${active.length}</small>` : ''}</button>
        <span class="lib-count" id="lib-count" aria-live="polite">${g.n} of ${d.species.length} shown</span>
      </div>
    </header>
    <div class="lib-tray" id="lib-tray" role="group" aria-label="Filter the library"${S.tray ? '' : ' hidden'}>
      <div class="lib-fg"><span class="lib-fl" id="lf-form">Growth form</span><div role="group" aria-labelledby="lf-form">
        ${forms.map(f => `<a class="pi-chip" role="button" aria-pressed="${S.form === f}" href="${href(S.form === f ? null : f, S.fn)}">${esc(f)}<small>${nForm(f)}</small></a>`).join('')}</div></div>
      <div class="lib-fg"><span class="lib-fl" id="lf-fn">Linked to a spatial function</span><div role="group" aria-labelledby="lf-fn">
        ${d.functions.map(f => `<a class="pi-chip" role="button" aria-pressed="${S.fn === f.id}" href="${href(S.form, S.fn === f.id ? null : f.id)}" title="${esc(f.definition)}">${esc(f.label)}<small>${linked(f.id).length}</small></a>`).join('')}</div></div>
      <div class="lib-fg"><span class="lib-fl" id="lf-origin">Origin</span><div role="group" aria-labelledby="lf-origin">
        ${origins.map(o => `<a class="pi-chip" role="button" data-origin="${esc(o)}" aria-pressed="${S.origin === o}" href="${href(S.form, S.fn, S.origin === o ? null : o)}">${esc(oLabel(o))}<small>${nOrigin(o)}</small></a>`).join('')}</div></div>
    </div>
    ${active.length ? `<p class="lib-active" id="lib-active"><span class="sr">Filters in use:</span>${active.map(([k, l, h]) => `<a class="lib-on" href="${h}" title="remove this filter"><small>${esc(k)}</small>${esc(l)}<span aria-hidden="true">×</span><span class="sr"> (remove)</span></a>`).join('')}<a class="lib-clear" href="#">Clear all</a></p>` : ''}
    ${des ? `<p class="lib-design"><span>Your design <b>${esc(des.name)}</b> is at ${esc(des.stage_label)}${des.plants ? `, with ${des.plants} plants of ${des.planted_species.length} species` : ''}.</span>${cons.size ? `<span>${cons.size} species being considered.</span>` : ''}<a href="${PI.links.design()}">${esc(PI.returnLabel(des))}</a></p>` : ''}
    <div class="lib-grid${CARD3 ? ' three' : ''}" id="lib-grid">${g.html}</div>
    <p class="lib-art">${S.imgs?.art && Object.keys(S.imgs.art).length ? 'The illustrations are AI-generated editorial artwork, not evidence. ' : ''}Plant facts link to their sources. <a href="${PI.routes.data}">Sources &amp; data</a></p>`;
  $('#lib-q').addEventListener('input', ev => { S.q = ev.target.value; const g = gridHtml(); $('#lib-grid').innerHTML = g.html; $('#lib-count').textContent = `${g.n} of ${d.species.length} shown`; });
  $('#lib-fbtn').addEventListener('click', () => { S.tray = !S.tray; $('#lib-tray').hidden = !S.tray; $('#lib-fbtn').setAttribute('aria-expanded', String(S.tray)); if (S.tray) $('#lib-tray a')?.focus(); });
  $('#lib-tray').addEventListener('keydown', ev => { if (ev.key === 'Escape') { S.tray = false; $('#lib-tray').hidden = true; $('#lib-fbtn').setAttribute('aria-expanded', 'false'); $('#lib-fbtn').focus(); } else if (ev.key === ' ' && ev.target.matches('a[role="button"]')) { ev.preventDefault(); ev.target.click(); } });
}

// ---------------------------------------------------------------- profile
function studioHtml(s) {
  const f = S.R.form(S.K, s.id, null); const des = PI.activeDesign(); const p = f.proxy;
  let mine = '';
  if (des?.planted_species.includes(s.id)) mine = `<p class="pi-studio-d">In your design <b>${esc(des.name)}</b> this species is planted. <a href="${PI.links.design()}">${esc(PI.returnLabel(des))}</a></p>`;
  return `<div class="pi-studio"><svg viewBox="-1.25 -1.25 2.5 2.5" role="img" aria-label="the plan symbol of ${esc(s.scientific_name)}"><g>${symbolOf(s.id) || ''}</g></svg>
    <div><ul>${Object.entries(f.basis).map(([k, v]) => `<li><b>${esc(k.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()))}</b> ${esc(String(v).toLowerCase().startsWith(k.replace(/_/g, ' ') + ' ') ? String(v).slice(k.length + 1) : v)}</li>`).join('')}
      <li><b>Size used on the plan</b> crown ${p.radius_m * 2} m across${p.spread.claim ? ` from <span class="pi-src">${esc(p.spread.claim)}</span>` : ''}${p.spread.alternatives ? `, one of ${p.spread.alternatives + 1} claimed ranges` : ''}${p.height_m != null ? `; height about ${p.height_m} m` : '; height unknown'}. A proxy chosen from the claims, never a measurement.</li></ul>
      <p class="pi-studio-n">Whether it is planted is decided bed by bed in Compose: the bed's light, water and soil are checked against the recorded requirements above, then the function's own requirements (for a Screen: target height, year-round cover, room for a row). A species that fails a check is not planted, whoever asked for it.</p>${mine}</div></div>`;
}
function renderProfile(s) {
  const d = S.d; const des = PI.activeDesign(); const i = d.species.indexOf(s); const prev = d.species[(i + d.species.length - 1) % d.species.length], next = d.species[(i + 1) % d.species.length];
  document.title = `${s.scientific_name} (${s.common_names[0] || ''}) · Plant Library`;
  $('#app').innerHTML = `<div class="pi-crumb"><a href="${PI.links.library()}#">← Plant Library</a><span class="pi-pn"><a href="${PI.links.profile(prev.id)}" title="previous species: ${esc(prev.scientific_name)}">‹ ${esc(prev.common_names[0] || prev.scientific_name)}</a><a href="${PI.links.profile(next.id)}" title="next species: ${esc(next.scientific_name)}">${esc(next.common_names[0] || next.scientific_name)} ›</a></span></div>`
    + PC.detailHtml(d, s.id, S.imgs, { design: des, isConsidered: PI.considered.has(s.id), returnLabel: PI.returnLabel(des), symbol: symbolOf(s.id), studio: studioHtml(s), tab: S.tab })
    + `<nav class="pi-next pi-profile" aria-label="More species"><a href="${PI.links.profile(prev.id)}"><span>Previous</span><b>${esc(prev.common_names[0] || prev.scientific_name)}</b><i>${esc(prev.scientific_name)}</i></a><a href="${PI.links.profile(next.id)}"><span>Next</span><b>${esc(next.common_names[0] || next.scientific_name)}</b><i>${esc(next.scientific_name)}</i></a></nav>`;
}

function showTab(tab) {
  S.tab = tab;
  document.querySelectorAll('.pi-panel').forEach(el => { el.hidden = el.id !== `tab-${tab}`; });
  document.querySelectorAll('.pi-tabs [role="tab"]').forEach(a => a.setAttribute('aria-selected', String(a.dataset.tab === tab)));
}
function onClick(ev) {
  const b = ev.target.closest('[data-consider]'); if (!b) return;
  const slug = b.dataset.consider; if (PI.considered.has(slug)) PI.considered.remove(slug); else PI.considered.add(slug);
  const s = PC.species(S.d, slug); const y = scrollY; const open = [...document.querySelectorAll('details[open][data-facet], details[open][data-function]')].map(e => e.dataset.facet ? `[data-facet="${e.dataset.facet}"]` : `[data-function="${e.dataset.function}"]`);
  renderProfile(s); open.forEach(q => document.querySelector(`details${q}`)?.setAttribute('open', '')); scrollTo({ top: y });
  document.querySelector('[data-consider]')?.focus({ preventScroll: true });
}
