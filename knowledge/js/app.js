// Planting Intelligence · Knowledge (the Explorer; Phase 1 brief 2026-11-07, Platform V2 2026-11-14, V4 2026-11-15, V4.1 2026-11-16).
// ONE database, three views switched in one state — Network | Matrix | Table — and the Inspector as a docked panel beside them.
// V4.1: Knowledge opens on the Network, an evidence explorer (not an editor): the X · Y · Z overview, a focus that is explored in
// place — the reader switches edge classes on, 1 or 2 hops, Collapse / Reset — an Inspector for every node and every line, and a
// comparison of two plants. Every view reads the same projection (brain/data/explorer.json, tools/build_explorer.py) and the same
// state S; a click anywhere changes S and what is on screen is re-rendered from it. Nothing about the plants is written here.
// The state lives in the URL hash, so a view can be shared and Back / Forward walk through it:
//   v           the view: graph (the Network, the default; `network` is read as graph) | matrix | table | compare (an action, not a tab).
//               Without v: the Network; `tab=compare` the comparison; a record alone (V1 links) the view it belongs to.
//   fk, fi      the focus, shared by the three views: species · function · concept (fi = its id) or pair (with a and b)
//   e           the edge classes switched on around the focus, comma-separated (model.js explore): use · inferred · req · met ·
//               a knowledge-group id · claims · rel · gaps; `none` for nothing; absent = the default of the focus kind
//   h           2 = two hops (absent = one)          only   1 = what the walk did not reach is taken out of the picture
//   a, b        the two species of the comparison
//   ik, ii      the inspected record: link · attr · concept_link · relation · req · species · function · concept
//   q           the species filter of the table and the matrix          g   the knowledge groups the table shows (absent = default)
//   x           V1–V4 layers, still read (traits · gaps · relations · a group id) and added to the default
// Only records are drawn: no line means no link is recorded. A Trace action appears when a species is in context.
import { load } from './model.js';
import * as CX from './cells.js';   // V4.3 — the cell renderers of the attribute table
import * as PI from '../../platform/js/platform.js';   // platform bar, cross-module links
import * as PC from '../../platform/js/plantcard.js';   // the shared plant card
PI.forwardLegacyTrace();   // a V3 trace address (<knowledge>#species=…) is sent on to the Decision Trace

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const human = s => String(s ?? '').replace(/_/g, ' ');
const plural = (n, w, ws = w + 's') => `${n} ${n === 1 ? w : ws}`;
const ic = d => `<svg class="ic" viewBox="0 0 16 16" aria-hidden="true">${d}</svg>`;
const IC = {
  graph: ic('<circle cx="4" cy="4.5" r="1.7"/><circle cx="12" cy="6" r="1.7"/><circle cx="6.5" cy="12" r="1.7"/><path d="M5.7 4.8 10.3 5.7M4.5 6.2l1.4 4.2M10.9 7.3 7.7 10.8"/>'),
  matrix: ic('<rect x="2.5" y="2.5" width="11" height="11" rx="1"/><path d="M2.5 6.2h11M2.5 9.8h11M6.2 2.5v11M9.8 2.5v11"/>'),
  table: ic('<rect x="2.5" y="3" width="11" height="10" rx="1"/><path d="M2.5 6.3h11M6.5 6.3V13"/>'),
  compare: ic('<rect x="2.5" y="3" width="4.4" height="10" rx="1"/><rect x="9.1" y="3" width="4.4" height="10" rx="1"/>'),
  plus: ic('<path d="M8 3.5v9M3.5 8h9"/>'), check: ic('<path d="m3.5 8.5 3 3 6-7"/>'), x: ic('<path d="m4 4 8 8M12 4l-8 8"/>'),
  swap: ic('<path d="M3 5.5h9.5M10 3l2.5 2.5L10 8M13 10.5H3.5M6 8 3.5 10.5 6 13"/>'),
  search: ic('<circle cx="7" cy="7" r="4.3"/><path d="m10.3 10.3 3.2 3.2"/>'), back: ic('<path d="M9.5 3.5 5 8l4.5 4.5"/>'),
  trace: ic('<circle cx="3.5" cy="8" r="1.6"/><circle cx="12.5" cy="8" r="1.6"/><path d="M5.1 8h5.8M8.6 5.6 11 8l-2.4 2.4"/>'), cube: ic('<path d="M8 2 13.2 5v6L8 14 2.8 11V5L8 2Zm0 6 5.2-3M8 8v6M8 8 2.8 5"/>'),
};
const VIEWS = [['graph', 'Network', 'Plants (X), spatial functions (Z) and attributes (Y), and the records that join them: focus a node, expand it, open a line'], ['matrix', 'Matrix', 'Plants × spatial functions: which links rest on a recorded use, which are inferred, which are missing'], ['table', 'Table', 'Plants × attributes: the exact values recorded for each plant, and what is not recorded']];
const VIEW_IDS = [...VIEWS.map(v => v[0]), 'compare'];
const CLASS_KEYS = new Set(['use', 'inferred', 'req', 'met', 'claims', 'rel', 'gaps']);
const KIND_WORD = { species: 'Species', function: 'Spatial function', concept: 'Concept', pair: 'Pair' };
const S = { M: null, focus: null, a: null, b: null, inspect: null, view: null, x: new Set(), hops: 1, only: false, notice: [], groups0: null, inspClosed: false, q: '', sort: null, groups: new Set(), identity: false, pan: { x: 0, y: 0, k: 1 }, layout: null, layoutKey: '', imgs: null,
  push: false, hash: null, prev: null, layers: new Map(),
  mf: null, hid: new Set(), hid0: new Set(), tm: 'marks', tonly: false, cell: {}, gridKeep: null, pref: null, fresh: null, seen: null };   /* V4.2 — mf: which matrix cells keep their strength · hid: table columns switched off · cell: the grid cell that holds the keyboard · fresh: what the last expansion added */   /* push: the next change of the address is a step the Back button returns to · prev: the focus before this one · layers: what was opened around each record */
const fkey = f => f && f.kind !== 'pair' ? `${f.kind}=${f.id}` : null;
const ekey = e => `${e.kind}:${e.id || e.source + '>' + e.target}`;

// ------------------------------------------------------------------ boot
(async function boot() {
  try {
    const url = new URLSearchParams(location.search).get('data') || '../data/explorer.json';
    S.M = await load(url);
    // the table opens on the knowledge groups that hold an attribute a spatial function requires; the others are one click away
    // V4.3 — the table opens as a visual sheet: the columns that have a drawn cell (light, height, spread, leaf retention, flower
    // colour, flowering months). Every other attribute is one click away in Columns; a stored choice or the address wins.
    { const want = new Set(SHEET); const gs = new Set(S.M.facets.filter(f => want.has(f.id)).map(f => f.group)); S.groups0 = gs.size ? gs : new Set(S.M.groups.map(g => g.id)); S.groups = new Set(S.groups0);
      S.hid0 = new Set([...tableFacets()].filter(f => S.groups0.has(f.group) && !want.has(f.id)).map(f => f.id)); S.hid = new Set(S.hid0);
      try { const pr = JSON.parse(localStorage.getItem('pi.kn.table.v43') || 'null'); if (pr && Array.isArray(pr.g)) S.pref = { g: pr.g.filter(g => S.M.GR.has(g)), hc: (pr.hc || []).filter(colOk), tm: pr.tm === 'text' ? 'text' : 'marks' }; } catch { /* no stored preference */ } }
    PI.mountTop($('#pitop'), { active: 'knowledge', snapshot: S.M.d }); PI.loadImages().then(i => { S.imgs = i; renderInspector(); });
    readHash(); initUi(); update();
    const onNav = () => { const h = location.hash || ''; if (h === S.hash) return; const was = S.focus; readHash(); if (fkey(was) && fkey(S.focus) && fkey(was) !== fkey(S.focus)) S.prev = was; update(); };   // Back / Forward, or an address typed by hand
    window.addEventListener('hashchange', onNav); window.addEventListener('popstate', onNav);
    window.explorer = { S, M: S.M, update, setFocus, setInspect, setAB, setView, toggleLayer, act, renderTable, traceContext, graphFor: () => S.M.graphFor(S.focus, S.a, S.b, S.x, { hops: S.hops, only: S.only }) };   // for tests and the console
    $('#loading').classList.add('gone');
    const rp = new URLSearchParams(location.search).get('replay'); if (rp) replay(rp);
  } catch (e) { $('#err').textContent = `could not load: ${e.message}\n\nserve the planting-db root:  python3 -m http.server 8766  → http://localhost:8766/brain/explorer/`; console.error(e); }
})();

/** for tests (tools/explorer_tests.py): ?replay=focus:species=<id>;e:<class>;hops:2;only;inspect:link=<id>;cmp:<id>;view:matrix;back;
 *  forward;q:<text>;click:<css selector>;reset walks the page through real state changes and history steps, and leaves what the
 *  page showed after each one in <script id="replay-out"> */
async function replay(steps) {
  const out = []; const txt = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const snap = step => out.push({ step, hash: location.hash, view: S.view, focus: fkey(S.focus), q: S.q, e: [...S.x].sort().join(','), hops: S.hops, only: S.only, a: S.a, b: S.b, inspect: S.inspect ? `${S.inspect.kind}=${S.inspect.id}` : null,
    pressed: document.querySelector('#views button[aria-pressed="true"]')?.dataset.view || null, crumb: $('#crumb .c b')?.textContent || null,
    marked: document.querySelectorAll('#stage .view:not([hidden]) tr.focus, #stage .view:not([hidden]) .node.focus').length, cmp: document.querySelectorAll('#stage .view:not([hidden]) tr.cmp').length,
    lit: [...document.querySelectorAll('#v-graph:not([hidden]) .node.lit')].map(n => n.dataset.id), gaps: document.querySelectorAll('#v-graph:not([hidden]) .node.gap').length, ctx: document.querySelectorAll('#v-graph:not([hidden]) .node.ctx').length,
    lines: [...document.querySelectorAll('#v-graph:not([hidden]) .edge.lit:not(.hit)')].map(n => n.dataset.cls), rel: document.querySelectorAll('#v-graph:not([hidden]) .edge.relation:not(.hit)').length, blocked: txt($('#gwarn')),
    insp: $('#inspector').hidden ? null : txt($('#ibody .title')), kind: $('#inspector').hidden ? null : txt($('#ibody .kind')), claims: $('#inspector').hidden ? 0 : document.querySelectorAll('#ibody .claim').length,
    links: $('#inspector').hidden ? [] : [...document.querySelectorAll('#ibody a[href]')].map(a => a.getAttribute('href')), secs: [...document.querySelectorAll('#v-compare:not([hidden]) .csec')].map(x => x.dataset.sec), trace: $('#trace')?.getAttribute('href') || null });
  const op = sel => { const el = document.querySelector(sel); return el ? +getComputedStyle(el).opacity : null; }; const sop = sel => { const el = document.querySelector(sel); return el ? +getComputedStyle(el).strokeOpacity : null; };
  const snap2 = () => Object.assign(out[out.length - 1], { op: { ctx: op('#v-graph:not([hidden]) .node.ctx'), lit: op('#v-graph:not([hidden]) .node.lit'), ectx: sop('#v-graph:not([hidden]) .edge.ctx'), elit: sop('#v-graph:not([hidden]) .edge.lit:not(.hit)') }, fresh: document.querySelectorAll('#v-graph:not([hidden]) .node.new').length, ends: [...document.querySelectorAll('#v-graph:not([hidden]) .node.end')].map(n => n.dataset.id), selw: (() => { const el = document.querySelector('#v-graph:not([hidden]) .edge.sel:not(.hit)'); return el ? parseFloat(getComputedStyle(el).strokeWidth) : null; })(),
    key: [...document.querySelectorAll('#v-graph:not([hidden]) #gkey li')].map(li => txt(li)), suggest: [...document.querySelectorAll('#ghead .layer.suggest')].map(b => b.dataset.layer), ab: [...document.querySelectorAll('#v-graph:not([hidden]) .node.species.a, #v-graph:not([hidden]) .node.species.b')].map(n => n.dataset.id), abdim: op('#svg.ab .node:not(.abon)'),
    tcols: document.querySelectorAll('#v-table:not([hidden]) th[data-act="tsort"]').length, trows: document.querySelectorAll('#v-table:not([hidden]) tbody tr').length, selrow: document.querySelectorAll('#v-table:not([hidden]) tr.selrow').length, colon: document.querySelectorAll('#v-table:not([hidden]) td.colon').length, tsel: document.querySelector('#v-table:not([hidden]) td.sel')?.dataset.inspect || null, sticky: (() => { const th = document.querySelector('#v-table:not([hidden]) tbody th'); return th ? getComputedStyle(th).position : null; })(), rowh: (() => { const tr = document.querySelector('#v-table:not([hidden]) tbody tr'); return tr ? Math.round(tr.getBoundingClientRect().height) : null; })(), more: [...document.querySelectorAll('#v-table:not([hidden]) td .more')].slice(0, 3).map(x => txt(x)),
    active: document.activeElement?.dataset?.r !== undefined ? `${document.activeElement.dataset.r},${document.activeElement.dataset.c}` : null, vrows: document.querySelectorAll('#ibody .vrow').length, adv: !!document.querySelector('#ibody details.adv:not([open]) pre.raw'), standing: [...document.querySelectorAll('#ibody dl.standing')].slice(0, 1).flatMap(d => [...d.querySelectorAll('dt')].map(x => txt(x))),
    mquiet: document.querySelectorAll('#v-matrix:not([hidden]) td.quiet').length, moff: document.querySelectorAll('#v-matrix:not([hidden]) td.off').length, mcol: document.querySelectorAll('#v-matrix:not([hidden]) td.col').length, mrows: [...document.querySelectorAll('#v-matrix:not([hidden]) tr.a, #v-matrix:not([hidden]) tr.b')].length, mq: op('#v-matrix:not([hidden]) td.quiet .cell'), mcmp: txt($('#mcmp')), msel: document.querySelector('#v-matrix:not([hidden]) td.sel')?.dataset.inspect || null, mf: S.mf, sort: S.sort, hid: [...S.hid], groups: [...S.groups], tonly: S.tonly, tm: S.tm,
    lv: { sel: sop('#v-graph:not([hidden]) .edge.sel:not(.hit)'), rel: sop('#v-graph:not([hidden]) .edge.lit.dim:not(.hit)'), bg: sop('#v-graph:not([hidden]) .edge.ctx'), nend: op('#v-graph:not([hidden]) .node.end'), nrel: op('#v-graph:not([hidden]) #svg.insp .node.lit:not(.end):not(.focus)') }, labels: [...document.querySelectorAll('#v-graph:not([hidden]) text.elabel')].map(x => txt(x)), more: Object.fromEntries([...document.querySelectorAll('#v-graph:not([hidden]) .node[data-more]')].map(n => [n.dataset.id, +n.dataset.more])), badges: document.querySelectorAll('#v-graph:not([hidden]) text.nbadge').length,
    cx: [...document.querySelectorAll('#v-table:not([hidden]) td[data-cx]')].reduce((o, td) => { o[td.dataset.cx] = (o[td.dataset.cx] || 0) + 1; return o; }, {}), flowers: document.querySelectorAll('#ibody table.fst tr').length });
  const settle = () => $('#svg')?.classList.remove('enter');   // the entrance animation is over before a step is measured
  settle(); snap('start'); snap2();
  for (const st of steps.split(';')) {
    const [k, ...r] = st.split(':'); const v = r.join(':'); const kv = () => { const [a, ...b] = v.split('='); return [a, b.join('=')]; };
    if (k === 'view') setView(v); else if (k === 'focus') { const [fk, fi] = kv(); setFocus(fk === 'none' ? null : fk, fi); } else if (k === 'back') history.back(); else if (k === 'forward') history.forward(); else if (k === 'q') { S.q = v; S.push = true; update(); }
    else if (k === 'e') toggleLayer(v); else if (k === 'hops') act('hops', v); else if (k === 'only') act('only'); else if (k === 'reset') act('reset'); else if (k === 'inspect') { const [ik, ii] = kv(); setInspect(ik, ii); } else if (k === 'cmp') act('cmp', v);
    else if (k === 'click') document.querySelector(v)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    else if (k === 'mf' || k === 'tm' || k === 'tg' || k === 'tc' || k === 'tsort' || k === 'tonly' || k === 'collapse' || k === 'close-insp') act(k, v || undefined);
    else if (k === 'ab') { const [w, id] = kv(); setAB(w, id); }
    else if (k === 'cell') { const [box, rc] = kv(); const [r, c] = rc.split(','); const el = document.querySelector(`#${box} [data-r="${r}"][data-c="${c}"]`); if (el) { el.focus(); S.cell[box] = [+r, +c]; } }
    else if (k === 'key') document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: v, bubbles: true }));
    await new Promise(res => setTimeout(res, 60)); settle(); await new Promise(res => setTimeout(res, 300)); snap(st); snap2();
  }
  const el = document.createElement('script'); el.type = 'application/json'; el.id = 'replay-out'; el.textContent = JSON.stringify(out); document.body.append(el);
}

// ------------------------------------------------------------------ state ↔ url
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1)); const M = S.M; S.notice = []; const miss = (what, id) => { if (id) S.notice.push(`${what} ${id}`); };
  const fk = p.get('fk'), fi = p.get('fi');
  S.focus = fk === 'pair' ? { kind: 'pair' } : fk && fi && M.kindOf(fi) === fk ? { kind: fk, id: fi } : null; if (fk && fk !== 'pair' && !S.focus) miss(fk, fi || '(no id)');
  S.a = M.SP.has(p.get('a')) ? p.get('a') : null; S.b = M.SP.has(p.get('b')) ? p.get('b') : null; if (p.get('a') && !S.a) miss('species', p.get('a')); if (p.get('b') && !S.b) miss('species', p.get('b'));
  if (S.focus?.kind === 'pair' && !(S.a && S.b)) S.focus = null;
  const ik = p.get('ik'), ii = p.get('ii');
  S.inspect = ik && ii && inspectable(ik, ii) ? { kind: ik, id: ii } : null; if (ik && ii && !S.inspect) miss(human(ik), ii);
  // the classes switched on: `e` is the whole set; a V1–V4 `x` adds its layers to the default of the focus kind
  const okKey = k => CLASS_KEYS.has(k) || M.GR.has(k); const kind = S.focus?.kind;
  if (p.has('e')) S.x = new Set(p.get('e').split(',').filter(okKey));
  else { S.x = new Set(kind && kind !== 'pair' ? M.defaultX(kind) : []); for (const k of (p.get('x') || '').split(',').filter(Boolean)) { if (k === 'traits') (kind === 'species' ? ['claims'] : ['req', 'met']).forEach(y => S.x.add(y)); else if (k === 'relations') S.x.add('rel'); else if (okKey(k)) S.x.add(k); } }
  S.hops = p.get('h') === '2' ? 2 : 1; S.only = p.get('only') === '1'; if (fkey(S.focus)) S.layers.set(fkey(S.focus), { x: new Set(S.x), hops: S.hops });
  if (p.has('g')) { const gs = p.get('g').split(',').filter(g => M.GR.has(g)); S.groups = new Set(gs); } else S.groups = new Set(S.pref ? S.pref.g : S.groups0);
  S.hid = new Set(p.has('hc') ? p.get('hc').split(',').filter(colOk) : p.has('g') ? [] : S.pref ? S.pref.hc : S.hid0); S.tm = p.has('tm') ? (p.get('tm') === 'text' ? 'text' : 'marks') : S.pref?.tm || 'marks';   // table columns switched off; with neither in the address, the stored preference
  S.mf = ['linked', 'conflict', 'unknown'].includes(p.get('mf')) ? p.get('mf') : null; S.sort = colOk(p.get('ts')) ? p.get('ts') : null; S.tonly = p.get('to') === '1';
  const v = p.get('v') === 'network' ? 'graph' : p.get('v');
  S.view = VIEW_IDS.includes(v) ? v : S.focus ? 'graph' : p.get('tab') === 'compare' ? 'compare' : S.inspect ? viewForRecord(S.inspect) : 'graph';
  S.q = p.get('q') || ''; const tq = $('#tq'); if (tq && tq.value !== S.q) tq.value = S.q;
  S.inspClosed = false;
}
/** a record named in the URL without a focus or a view: the view it belongs to (a graph record brings its own focus) */
function viewForRecord(i) {
  const M = S.M; if (i.kind === 'attr' || i.kind === 'nr') return 'table'; if (i.kind === 'link') return 'matrix';
  if (i.kind === 'concept_link') S.focus = { kind: 'species', id: M.CL.get(i.id).species }; else if (i.kind === 'relation') S.focus = { kind: 'species', id: M.RE.get(i.id).a }; else if (i.kind !== 'req') S.focus = { kind: i.kind, id: i.id };
  if (i.kind === 'req') { const r = M.req(i.id); S.focus = { kind: 'function', id: r.fn }; }
  S.x = new Set(M.defaultX(S.focus.kind)); if (i.kind === 'relation') S.x.add('rel'); if (i.kind === 'concept_link') S.x.add(M.CL.get(i.id).group);
  return 'graph';
}
function writeHash() {
  const p = new URLSearchParams();
  if (S.focus) { p.set('fk', S.focus.kind); if (S.focus.id) p.set('fi', S.focus.id); }
  if (S.a) p.set('a', S.a); if (S.b) p.set('b', S.b);
  if (S.inspect) { p.set('ik', S.inspect.kind); p.set('ii', S.inspect.id); }
  if (!(S.view === 'graph' && (S.focus || !S.inspect))) p.set('v', S.view);   // the Network is the default; a record alone (a V1 link) still opens the view it belongs to
  if (S.q.trim()) p.set('q', S.q.trim());
  if (fkey(S.focus)) { const d = S.M.defaultX(S.focus.kind); if (d.length !== S.x.size || d.some(k => !S.x.has(k))) p.set('e', S.x.size ? [...S.x].join(',') : 'none'); if (S.hops === 2) p.set('h', '2'); if (S.only) p.set('only', '1'); }
  if (S.groups.size !== S.groups0.size || [...S.groups].some(g => !S.groups0.has(g)) || S.hid.size !== S.hid0.size || [...S.hid].some(c => !S.hid0.has(c))) { p.set('g', [...S.groups].join(',')); if (S.hid.size) p.set('hc', [...S.hid].join(',')); }
  if (S.tm === 'text') p.set('tm', 'text');
  if (S.mf) p.set('mf', S.mf); if (S.sort) p.set('ts', S.sort); if (S.tonly) p.set('to', '1');
  const h = p.toString() ? '#' + p.toString() : location.pathname + location.search; if ((location.hash || location.pathname + location.search) !== h) history[S.push && S.hash !== null ? 'pushState' : 'replaceState'](null, '', h);
  S.push = false; S.hash = location.hash || '';
}
function inspectable(kind, id) { const M = S.M; return kind === 'link' ? M.LK.has(id) : kind === 'attr' ? M.AT.has(id) : kind === 'concept_link' ? M.CL.has(id) : kind === 'relation' ? M.RE.has(id) : kind === 'req' ? !!M.req(id) : kind === 'nr' ? M.SP.has(id.split('~')[0]) && M.FA.has(id.split('~')[1]) : kind === 'species' ? M.SP.has(id) : kind === 'function' ? M.FN.has(id) : kind === 'concept' ? M.CO.has(id) : false; }
/** focus a record. The focus is shared: the table, the matrix and the Network keep their view and mark it; from the comparison the Network opens. */
function setFocus(kind, id) {
  const was = S.focus; if (fkey(was)) S.layers.set(fkey(was), { x: new Set(S.x), hops: S.hops });   // what was opened around a record is kept for when the focus returns to it
  S.focus = kind ? { kind, id } : null; if (fkey(was) && fkey(S.focus) && fkey(was) !== fkey(S.focus)) S.prev = was; else if (!S.focus) S.prev = null;
  const kept = S.layers.get(fkey(S.focus)); S.x = new Set(kept ? kept.x : kind && kind !== 'pair' ? S.M.defaultX(kind) : []); S.hops = kept ? kept.hops : 1; if (!S.focus) S.only = false;
  if (kind !== 'pair') S.inspect = null; S.inspClosed = false; if (kind && (kind === 'pair' || S.view === 'compare')) S.view = 'graph'; S.push = true; update();
}
function setInspect(kind, id) { S.inspect = kind ? { kind, id } : null; S.inspClosed = false; update(); }
function setView(v) { S.view = VIEW_IDS.includes(v) ? v : 'table'; if (S.focus?.kind === 'pair' && S.view !== 'graph' && S.view !== 'compare') S.focus = null; if (S.view === 'compare' && !S.a && S.focus?.kind === 'species' && S.focus.id !== S.b) S.a = S.focus.id; S.inspClosed = false; S.push = true; update(); }
/** switch one edge class on or off around the focus. A class that only shows at two hops (a plant's required traits lie behind its
 *  functions) opens the second hop with it; one knowledge group and `all claim lines` replace each other. A step Back returns from. */
function toggleLayer(k) {
  if (!fkey(S.focus)) return; const l = S.M.layersFor(S.focus, S.hops).find(x => x.key === k);
  if (S.x.has(k)) S.x.delete(k); else { S.x.add(k); if (l?.deep) S.hops = 2; if (k === 'claims') for (const g of S.M.groups) S.x.delete(g.id); else if (S.M.GR.has(k)) S.x.delete('claims'); }
  S.layers.set(fkey(S.focus), { x: new Set(S.x), hops: S.hops }); S.push = true; update();
}
function setAB(which, id) { if (which === 'a') { if (S.b === id) S.b = S.a; S.a = S.a === id ? null : id; } else { if (S.a === id) S.a = S.b; S.b = S.b === id ? null : id; } if (S.focus?.kind === 'pair' && !(S.a && S.b)) S.focus = null; update(); }
function pick(which, v) { if (which === 'a') { if (v && v === S.b) S.b = S.a; S.a = v; } else { if (v && v === S.a) S.a = S.b; S.b = v; } if (S.focus?.kind === 'pair' && !(S.a && S.b)) S.focus = null; update(); }
const inspectorOpen = () => !S.inspClosed && !!(S.inspect || (S.focus && S.view !== 'compare'));
function update() {
  writeHash(); renderFrame(); renderInspector();   // the panel is shown or hidden first, so the working view measures the rectangle it will really have
  if (S.view === 'graph') renderGraph(); else if (S.view === 'matrix') renderMatrix(); else if (S.view === 'table') renderTable(); else renderCompare();
}

// ------------------------------------------------------------------ ui wiring
function initUi() {
  $('#views').innerHTML = VIEWS.map(([k, l, t]) => `<button data-view="${k}" aria-pressed="false" title="${esc(t)}">${IC[k]}<span>${l}</span></button>`).join('');
  document.body.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.closest?.('#svg .node, #svg .edge.hit')) { ev.preventDefault(); ev.target.closest('.node, .edge.hit').dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
  $('#howbody').innerHTML = howHtml();
  document.body.addEventListener('click', ev => {
    if (!ev.target.closest('#how')) $('#how').open = false;
    if (!ev.target.closest('#tcols')) $('#tcols')?.removeAttribute('open');
    const t = ev.target.closest('[data-focus],[data-inspect],[data-ab],[data-view],[data-layer],[data-act]'); if (!t) return;
    if (t.tagName === 'A') ev.preventDefault();
    if (t.dataset.focus !== undefined) { const [k, ...rest] = t.dataset.focus.split('='); setFocus(k === 'none' || !k ? null : k, rest.join('=')); }
    else if (t.dataset.inspect !== undefined) { const [k, ...rest] = t.dataset.inspect.split('='); setInspect(k, rest.join('=')); }
    else if (t.dataset.ab) { ev.stopPropagation(); setAB(t.dataset.ab, t.dataset.id); }
    else if (t.dataset.view) setView(t.dataset.view);
    else if (t.dataset.layer) toggleLayer(t.dataset.layer);
    else if (t.dataset.act) act(t.dataset.act, t.dataset.id);
  });
  document.body.addEventListener('change', ev => { const t = ev.target.closest('[data-pick]'); if (t) pick(t.dataset.pick, t.value || null); const c = ev.target.closest('[data-cmp]'); if (c && c.value) act('cmp', c.value); });
  wireSearch($('#search'), $('#results'));
  document.addEventListener('keydown', ev => {
    const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(ev.target.tagName);
    if (ev.key === '/' && !typing) { $('#search')?.focus(); ev.preventDefault(); return; }
    if (ev.key !== 'Escape' || typing) return;
    if ($('#tcols')?.open) $('#tcols').open = false;
    else if ($('#how').open) $('#how').open = false;
    else if (inspectorOpen()) { const gc = document.activeElement?.closest?.('#tablewrap, #mbody'); if (gc) S.gridKeep = gc.id; act('close-insp'); }   // the grid cell keeps the keyboard
    else if (S.focus) setFocus(null);
  });
  initGraphInteraction(); gridKeys('tablewrap'); gridKeys('mbody');
}
/** the search of the toolbar: species, functions and the concepts a plant reaches; Enter focuses the hit */
function wireSearch(inp, res) {
  let hi = -1, cur = [];
  const show = () => { const q = inp.value.trim(); res.innerHTML = cur.length ? cur.map((n, i) => `<div class="${i === hi ? 'hi' : ''}" data-i="${i}"><span>${n.kind === 'species' ? `<i class="sci">${esc(n.label)}</i>` : esc(n.label)}${n.sub ? ` <span class="faint">· ${esc(n.sub)}</span>` : ''}</span><small>${esc(n.kind)}</small></div>`).join('') : q.length >= 2 ? `<div class="none">Nothing in this snapshot matches “${esc(q)}”. Try part of a plant name, a trait or a spatial function.</div>` : ''; res.classList.toggle('open', cur.length > 0 || q.length >= 2); };
  const go = i => { const n = cur[i]; if (!n) return; inp.value = ''; cur = []; show(); inp.blur(); setFocus(n.kind, n.id); };
  inp.addEventListener('input', () => { cur = S.M.search(inp.value); hi = cur.length ? 0 : -1; show(); });
  inp.addEventListener('keydown', ev => { if (ev.key === 'ArrowDown') { hi = Math.min(cur.length - 1, hi + 1); show(); ev.preventDefault(); } else if (ev.key === 'ArrowUp') { hi = Math.max(0, hi - 1); show(); ev.preventDefault(); } else if (ev.key === 'Enter') go(hi); else if (ev.key === 'Escape') { inp.value = ''; cur = []; show(); inp.blur(); } });
  inp.addEventListener('blur', () => setTimeout(() => { cur = []; res.classList.remove('open'); }, 150));
  res.addEventListener('mousedown', ev => { const d = ev.target.closest('[data-i]'); if (d) { ev.preventDefault(); go(+d.dataset.i); } });
}
function act(a, id) {
  if (a === 'home') act('reset');
  else if (a === 'back-focus') { if (S.prev) setFocus(S.prev.kind, S.prev.id); }
  else if (a === 'swap') { [S.a, S.b] = [S.b, S.a]; update(); }
  else if (a === 'pair') { if (S.a && S.b) setFocus('pair'); }
  else if (a === 'pick-a' || a === 'pick-b') pick(a.slice(-1), $(`#sel-${a.slice(-1)}`)?.value || null);
  else if (a === 'clear-ab') { S.a = S.b = null; if (S.focus?.kind === 'pair') S.focus = null; update(); }
  else if (a === 'tq') { S.q = $('#tq').value; update(); }
  else if (a === 'tg') { const g = id; if (S.groups.has(g)) S.groups.delete(g); else S.groups.add(g); savePref(); writeHash(); if (S.view === 'compare') renderCompare(); else renderTable(); }
  else if (a === 'tc') { if (S.hid.has(id)) S.hid.delete(id); else S.hid.add(id); savePref(); writeHash(); renderTable(); }
  else if (a === 'tm') { S.tm = id === 'text' ? 'text' : 'marks'; savePref(); writeHash(); renderTable(); }
  else if (a === 'tonly') { S.tonly = !S.tonly; writeHash(); renderTable(); }
  else if (a === 'csv') tableCsv();
  else if (a === 'mf') { S.mf = id || null; S.push = true; update(); }
  else if (a === 'copy-raw') { const pre = document.querySelector('#ibody details.adv pre.raw'); if (pre) navigator.clipboard?.writeText(pre.textContent).then(() => { const b = document.querySelector('#ibody .copy'); if (b) b.textContent = 'Copied'; }).catch(() => {}); }
  else if (a === 'tident') { S.identity = !S.identity; renderTable(); }
  else if (a === 'tsort') { S.sort = S.sort === id ? null : id; writeHash(); renderTable(); }
  else if (a === 'fit') { S.pan = { x: 0, y: 0, k: 1 }; applyView(); }
  else if (a === 'hops') { S.hops = String(id) === '2' ? 2 : 1; if (fkey(S.focus)) S.layers.set(fkey(S.focus), { x: new Set(S.x), hops: S.hops }); S.push = true; update(); }
  else if (a === 'only') { S.only = !S.only; S.push = true; update(); }
  else if (a === 'collapse') { if (fkey(S.focus)) { S.x = new Set(S.M.defaultX(S.focus.kind)); S.hops = 1; S.inspect = null; S.layers.set(fkey(S.focus), { x: new Set(S.x), hops: 1 }); S.push = true; update(); } }
  else if (a === 'reset') { S.focus = null; S.inspect = null; S.x = new Set(); S.hops = 1; S.only = false; S.prev = null; S.view = 'graph'; S.layers.clear(); S.pan = { x: 0, y: 0, k: 1 }; S.push = true; update(); }
  else if (a === 'cmp') { const me = S.focus?.kind === 'species' ? S.focus.id : S.a; if (me && id && S.M.SP.has(id) && id !== me) { S.a = me; S.b = id; S.view = 'compare'; S.inspect = null; S.push = true; update(); } }
  else if (a === 'dismiss') { S.notice = []; renderFrame(); }
  else if (a === 'close-insp') { S.inspect = null; S.inspClosed = true; update(); }
  else if (a === 'open-insp') { S.inspClosed = false; update(); }
}

// ------------------------------------------------------------------ frame: which pane is on screen, the toolbar, what is focused
/** the decision a Trace would follow, when one is in context: a species (the focus, or the species of the inspected link) and the
 *  spatial function to follow it for — the inspected link's or the focused function when the engine arranges it, else Screen */
function traceContext() {
  const M = S.M, i = S.inspect, f = S.focus; const l = i?.kind === 'link' ? M.LK.get(i.id) : null;
  const sp = l ? l.species : f?.kind === 'species' ? f.id : i?.kind === 'species' ? i.id : i?.kind === 'attr' ? M.AT.get(i.id).species : i?.kind === 'nr' ? i.id.split('~')[0] : i?.kind === 'concept_link' ? M.CL.get(i.id).species : null; if (!sp) return null;
  const want = l ? l.function : f?.kind === 'function' ? f.id : null; const fn = want && PI.TRACE_FUNCTIONS.includes(want) ? want : PI.TRACE_FUNCTION;
  return { species: sp, fn, asked: want, href: PI.links.trace(sp, { fn }) };
}
function renderFrame() {
  const M = S.M;
  for (const k of VIEW_IDS) $(`#v-${k}`).hidden = S.view !== k;
  document.querySelectorAll('#views button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === S.view)));
  const f = S.focus; const nm = id => `<i class="sci">${esc(M.name(id))}</i>`; let h = ''; const pv = S.prev && f && f.kind !== 'pair' && fkey(S.prev) !== fkey(f) && inspectable(S.prev.kind, S.prev.id) ? S.prev : null;
  if (pv) h += `<button class="back" data-act="back-focus" title="Back to ${esc(M.name(pv.id))}, with what was opened around it">${IC.back}${pv.kind === 'species' ? nm(pv.id) : esc(M.name(pv.id))}</button>`;
  if (f && f.kind !== 'pair') h += `<span class="c">${KIND_WORD[f.kind]} <b data-act="open-insp" title="Show its record">${f.kind === 'species' ? nm(f.id) : esc(M.name(f.id))}</b><button class="x" data-focus="none" aria-label="Clear the focus" title="Clear the focus">${IC.x}</button></span>`;
  if (S.inspClosed && f && S.view !== 'compare') h += `<button class="showev" data-act="open-insp" title="Open the evidence panel again">Show evidence</button>`;
  if (S.a || S.b) h += `<span class="c ab" title="${esc([S.a && 'A ' + M.name(S.a), S.b && 'B ' + M.name(S.b)].filter(Boolean).join(' · '))}">${S.a ? `${tag('A')}${nm(S.a)}` : ''}${S.b ? ` ${tag('B')}${nm(S.b)}` : ''}<button class="x" data-act="clear-ab" aria-label="Clear A and B" title="Clear A and B">${IC.x}</button></span>`;
  if (f || S.inspect) h += `<button class="back reset" data-act="reset" title="Back to the whole Network: clear the focus, what was expanded and the selection">Reset</button>`;
  if (S.notice.length) h += `<span class="c notice" role="status" title="${esc(S.notice.join(' · '))}">${plural(S.notice.length, 'record')} named by this link ${S.notice.length === 1 ? 'is' : 'are'} not in the current snapshot<button class="x" data-act="dismiss" aria-label="Dismiss" title="Dismiss">${IC.x}</button></span>`;
  $('#crumb').innerHTML = h;
  // secondary actions: the Decision Trace when a species is in context, the comparison, the same records in three dimensions
  const t = traceContext(); const fsp = t?.species || (f?.kind === 'species' ? f.id : null);
  $('#acts').innerHTML = `${t ? `<a class="trace" id="trace" href="${esc(t.href)}" title="Follow ${esc(M.name(t.species))} from its sources to a bed of a design, for ${esc(M.name(t.fn))}: source → claim → function → selection → arrangement → evaluation${t.asked && t.asked !== t.fn ? ` (${esc(M.name(t.asked))} is recorded only: the engine does not arrange it)` : ''}">${IC.trace}<span>Trace</span><span class="lbl">· ${esc(M.name(t.fn))}</span></a>` : ''}<button data-view="compare" aria-pressed="${S.view === 'compare'}" title="Compare two plants: shared attributes, recorded relations, complementarity, unknowns">${IC.compare}<span class="lbl">Compare</span></button><a href="${esc(PI.links.neural(fsp))}" title="The same claims as one three-dimensional network${fsp ? `, opened on ${esc(M.name(fsp))}` : ''}">${IC.cube}<span class="lbl">3D network</span></a>`;
  document.title = `${f && f.kind !== 'pair' ? M.name(f.id) + ' · ' : ''}Knowledge · Planting Intelligence`;
}
function howHtml() {
  const M = S.M, v = M.vocab.status;
  return `<h3>One database, three views</h3><p><b>Network</b> plants (X), spatial functions (Z) and attributes (Y) with the records that join them. <b>Matrix</b> plants × spatial functions. <b>Table</b> plants × attributes, with exact values. Claims, sources, verification and the AI source check are the evidence under all three: they open in the Inspector for whatever you select. The selection stays when you switch, and Back returns to where you were.</p>
    <h3>Exploring the Network</h3><p>Point at a node to preview its records. Click it to <b>focus</b> it: its first-order records stay lit, the rest steps back, and the Inspector opens. <b>Expand</b> switches an edge class on around the focus, one or two hops deep. A walk never returns to another plant through a shared function or trait: sharing is not a relation. What a step adds fades in and keeps a dashed ring until the next step. An expansion that would add more than ${M.constructor.SAFE} attributes is not applied: its count is shown and the groups to choose from are highlighted. <b>Collapse</b> returns to the first-order records, <b>Reset</b> to the whole Network.</p>
    <h3>Lines</h3><div class="lg"><p><i></i><b>recorded use</b> a source records a use the ontology maps to the function (solid)</p><p><i class="candidate"></i><b>inferred</b> every required trait is met by claims, but no source states the use (dashed): a candidate</p><p><i class="conflict"></i><b>conflict</b> a recorded use and a trait claim disagree (dash-dot); both records are kept</p><p><i class="req"></i><b>requirement</b> a trait the function requires, from the literature (dotted)</p><p><i class="trait"></i><b>claim line</b> a claim about the plant reaches an attribute value (thin)</p><p><i class="rel"></i><b>plant-to-plant record</b> only what relations.json holds; sharing a trait never draws a line between two plants</p><p><i class="ghost"></i><b>no link</b> a missing link is never a line: it is marked on the node as a gap, with its reason. Not known is not “unsuitable”.</p></div>
    <h3>Three separate statements on every record</h3><p><b>Status</b> ${tag('documented')} ${tag('derived')} ${tag('candidate')} ${tag('unknown')} what kind of knowledge a line is.</p><p><b>Verification</b> ${tag('verified')} ${tag('unverified')} ${tag('none')} whether a person verified a supporting claim. ${M.stats.claims_by_status.verified || 0} of ${M.stats.claims} claims are verified; a ✓ in the matrix or the table marks one.</p><p><b>AI source check</b> ${tag('supported_by_source')} ${tag('partially_supported')} ${tag('conflicting_evidence')} an assessment by the review pipeline, shown apart. It never verifies anything.</p>
    <h3>What is never done here</h3><p>No value is averaged or picked as best: a field shows every claim. No missing link is drawn: it is listed as a gap, with its requirement check and the reason (contradicted by a recorded trait, or no evidence). Retired plant-to-plant records are listed as history. Nothing is promoted, and exploring changes no record.</p>
    <h3>Matrix and Table</h3><p>The matrix compares plants across the five functions; it is not a score. Set A and B on two rows for a summary beside it. The table shows one or two values per cell and counts the rest; the Record Inspector lists every value with its source, scope and standing. <b>Columns</b> chooses the attributes shown.</p><h3>Working with it</h3><p>Click a name or a node to focus it, a line or a cell for its evidence. Nodes and lines take the keyboard: Tab to one, Enter to open it. In the matrix and the table, arrow keys move between cells. <b>Compare</b> sets two plants side by side. <b>Trace</b> follows a plant in context from its sources into a bed of a design. <b>/</b> search · <b>Esc</b> close the evidence, then clear the focus.</p>
    <h3>Data</h3><p class="mono">brain/data/explorer.json · ${esc(M.d.generated)} · ${esc(M.d.generated_by)} · ${esc(M.d.method)}<br>inputs: ${esc(M.d.inputs.join(', '))}</p>`;
}

// ------------------------------------------------------------------ graph (SVG, deterministic force layout around the focus)
const R_OF = n => n.focus ? 13 : n.kind === 'function' ? 11 : n.kind === 'species' ? 8.5 : 4.6;
/** where each node stands. The overview and every focus use the same three columns (X plants · Z functions · Y attributes), placed by
 *  rule, so a node keeps its place while the reader focuses and expands; only a pair of plants is spread by a small force layout. */
function layout(g, W, H) {
  const nodes = g.nodes.map(n => ({ ...n })); const byId = new Map(nodes.map(n => [n.id, n]));
  if (g.xyz) {   // three columns in the order of the argument — a plant (X) is linked to a function (Z), which requires traits (Y)
    const top = 96, bot = H - (W < 1000 ? 108 : g.focus ? 104 : 78), col = { species: W * (W < 1000 ? .3 : .27), function: W * .5, concept: W * (W < 1000 ? .68 : .71) };
    const put = (kind, inset) => { const ks = nodes.filter(n => n.kind === kind); const a = top + (bot - top) * inset, b = bot - (bot - top) * inset; ks.forEach((nd, i) => { nd.x = col[kind]; nd.y = ks.length === 1 ? (a + b) / 2 : a + (b - a) * (i / (ks.length - 1)); }); return ks.length > 1 ? (b - a) / (ks.length - 1) : b - a; };
    put('species', 0); put('function', .1); const stepY = put('concept', 0);
    return { nodes, byId, xyz: true, col, stepY };
  }
  const real = nodes; const cx = W / 2, cy = H / 2 + 8, RX = Math.max(120, Math.min(W * 0.42, W / 2 - 104)), RY = Math.max(90, H * 0.37), R = (RX + RY) / 2, strip = 0;
  const ringOf = n => n.kind === 'function' ? .42 : 1;
  for (const k of ['function', 'species', 'concept']) {
    const ks = real.filter(n => n.kind === k && !n.focus).sort((a, b) => k === 'concept' ? String(a.group || '').localeCompare(String(b.group || '')) || a.label.localeCompare(b.label) : 0); const n = ks.length;
    ks.forEach((nd, i) => { const a = (i / Math.max(1, n)) * Math.PI * 2 + (k === 'species' ? .3 : k === 'concept' ? .9 : -Math.PI / 2); const r = ringOf(nd); nd.x = cx + Math.cos(a) * RX * r; nd.y = cy + Math.sin(a) * RY * r; nd.vx = nd.vy = 0; });
  }
  if (g.pair) { const [a, b] = g.pair; for (const id of [a, b]) { const n = byId.get(id); n.y = cy; n.fixed = true; n.vx = n.vy = 0; } byId.get(a).x = cx - RX * .5; byId.get(b).x = cx + RX * .5; }
  if (!g.pair) return { nodes, byId };
  const edges = g.edges.filter(e => byId.has(e.source) && byId.has(e.target)).map(e => ({ s: byId.get(e.source), t: byId.get(e.target), rel: e.rel }));
  const rest = e => e.rel === 'suited_for' ? R * .8 : e.rel === 'requires_trait' ? R * .6 : e.rel === 'has_trait' || e.rel === 'grows_in' ? R * .55 : R * .75;
  const N = real.length;
  for (let it = 0; it < 260; it++) {
    const alpha = 1 - it / 260, k = .9 * alpha + .05;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const a = real[i], b = real[j]; let dx = b.x - a.x, dy = b.y - a.y; let d2 = dx * dx + dy * dy; if (d2 < 1) { dx = (i - j) * .1 + .1; dy = .1; d2 = .02; }
      const d = Math.sqrt(d2); const min = R_OF(a) + R_OF(b) + (a.kind === 'concept' && b.kind === 'concept' ? 28 : 38);
      const f = (d < min ? (min - d) * .22 : 0) + 380 * k / d2;
      const fx = dx / d * f, fy = dy / d * f; if (!a.fixed) { a.vx -= fx; a.vy -= fy; } if (!b.fixed) { b.vx += fx; b.vy += fy; }
    }
    for (const e of edges) { if (e.s.fixed && e.t.fixed) continue; let dx = e.t.x - e.s.x, dy = e.t.y - e.s.y; const d = Math.max(1, Math.hypot(dx, dy)); const f = (d - rest(e)) * .018 * (e.rel === 'suited_for' ? 1.4 : 1); const fx = dx / d * f, fy = dy / d * f; if (!e.s.fixed) { e.s.vx += fx; e.s.vy += fy; } if (!e.t.fixed) { e.t.vx -= fx; e.t.vy -= fy; } }
    for (const n of real) {
      if (n.fixed) continue;
      const dx = n.x - cx, dy = n.y - cy, dn = Math.max(.01, Math.hypot(dx / RX, dy / RY)), tr = ringOf(n); const f = (tr - dn) * R * .02;   // soft elliptical ring: keeps the concentric reading
      n.vx += dx / (dn * RX) * f * (RX / R); n.vy += dy / (dn * RY) * f * (RY / R);
      n.vx *= .6; n.vy *= .6; n.x += n.vx; n.y += n.vy;
      n.x = Math.max(60, Math.min(W - 60, n.x)); n.y = Math.max(36, Math.min(H - strip - 40, n.y));
    }
  }
  return { nodes, byId };
}
function initGraphInteraction() {
  const svg = $('#svg'); let drag = null;
  svg.addEventListener('mousedown', ev => { if (ev.target.closest('.node, .edge')) return; drag = { x: ev.clientX, y: ev.clientY, vx: S.pan.x, vy: S.pan.y }; svg.classList.add('dragging'); });
  window.addEventListener('mousemove', ev => { if (!drag) return; S.pan.x = drag.vx + (ev.clientX - drag.x); S.pan.y = drag.vy + (ev.clientY - drag.y); applyView(); });
  window.addEventListener('mouseup', () => { drag = null; svg.classList.remove('dragging'); });
  svg.addEventListener('wheel', ev => { ev.preventDefault(); const r = svg.getBoundingClientRect(); const mx = ev.clientX - r.left, my = ev.clientY - r.top; const k0 = S.pan.k, k1 = Math.max(.4, Math.min(3, k0 * (ev.deltaY < 0 ? 1.12 : .89))); S.pan.x = mx - (mx - S.pan.x) * k1 / k0; S.pan.y = my - (my - S.pan.y) * k1 / k0; S.pan.k = k1; applyView(); }, { passive: false });
  const tip = $('#tip');
  svg.addEventListener('mousemove', ev => { const t = ev.target.closest('[data-tip]'); if (!t) { tip.style.display = 'none'; return; } tip.innerHTML = t.dataset.tip; tip.style.display = 'block'; tip.style.left = `${Math.min(ev.clientX + 14, innerWidth - 340)}px`; tip.style.top = `${ev.clientY + 12}px`; });
  svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; light(null); });
  // a node under the pointer (or the keyboard focus) lights its own records: the lines that meet it and, in the overview, the lines
  // among what it reaches — so a plant shows its functions, the traits it is recorded with, and which requirements those meet
  let lit = null;
  const light = id => {
    if (id === lit) return; lit = id; svg.classList.toggle('hl', !!id); svg.querySelectorAll('.on').forEach(el => el.classList.remove('on')); const g = S.g; if (!id || !g) return;
    const on = new Set([id]), E = new Set(); g.edges.forEach((e, i) => { if (e.source === id || e.target === id) { E.add(i); on.add(e.source); on.add(e.target); } });
    if (g.xyz && !g.focus) g.edges.forEach((e, i) => { if (on.has(e.source) && on.has(e.target)) E.add(i); });
    svg.querySelectorAll('[data-ei]').forEach(el => { if (E.has(+el.dataset.ei)) el.classList.add('on'); }); svg.querySelectorAll('.node[data-id]').forEach(el => { if (on.has(el.dataset.id)) el.classList.add('on'); });
  };
  svg.addEventListener('mouseover', ev => { const n = ev.target.closest('.node[data-id]'); light(n ? n.dataset.id : null); });
  svg.addEventListener('focusin', ev => { const n = ev.target.closest('.node[data-id]'); light(n ? n.dataset.id : null); }); svg.addEventListener('focusout', () => light(null));
  new ResizeObserver(() => { if (S.view === 'graph') drawGraph(); }).observe($('#gbody'));
}
function applyView() { const g = $('#svg g.view'); if (g) g.setAttribute('transform', `translate(${S.pan.x},${S.pan.y}) scale(${S.pan.k})`); }
function renderGraph() {
  const M = S.M, f = S.focus; const g = M.graphFor(f, S.a, S.b, S.x, { hops: S.hops, only: S.only }); const single = f && f.kind !== 'pair'; const layers = single ? M.layersFor(f, S.hops) : [];
  const ek = k => g.edges.filter(e => e.kind === k && !e.ctx).length; const lit = g.nodes.filter(n => n.lit && !n.focus);
  const title = !f ? 'Plants, spatial functions and attributes' : f.kind === 'pair' ? `<i class="sci">${esc(M.name(S.a))}</i> and <i class="sci">${esc(M.name(S.b))}</i>` : f.kind === 'species' ? `<i class="sci">${esc(M.name(f.id))}</i>` : esc(M.name(f.id));
  const nk = k => lit.filter(n => n.kind === k).length; const parts = single ? [[nk('species'), 'plant'], [nk('function'), 'function'], [nk('concept'), 'attribute']].filter(x => x[0]).map(x => plural(x[0], x[1])) : [];
  const sub = !f ? `${ek('link')} recorded links between plants and functions, ${ek('requirement')} requirements. Click a node to focus it, a line for its evidence.` : f.kind === 'pair' ? 'what both reach, the functions of each, direct records' : `${parts.length ? `Reaches ${parts.join(', ')} within ${S.hops === 2 ? 'two hops' : 'one hop'}` : 'Nothing is reached with the classes switched on'} · ${plural(g.edges.filter(e => !e.ctx).length, 'line')}${g.nodes.some(n => n.gap) ? ` · ${g.nodes.filter(n => n.gap).length} marked without a link` : ''}`;
  const on = l => S.x.has(l.key); const sugg = new Set((g.blocked || []).flatMap(b => b.narrow.map(n => n.key)));
  { const key = fkey(f) || ''; const nN = new Set(g.nodes.filter(n => n.lit || n.focus).map(n => n.id)), eN = new Set(g.edges.filter(e => !e.ctx && !e.latent).map(ekey));   // what this step added around the same focus: shown as new, once
    S.fresh = key && S.seen && S.seen.key === key ? { n: new Set([...nN].filter(x => !S.seen.n.has(x))), e: new Set([...eN].filter(x => !S.seen.e.has(x))) } : null; if (S.fresh && !S.fresh.n.size && !S.fresh.e.size) S.fresh = null; S.seen = { key, n: nN, e: eN }; }
  const btn = l => `<button class="layer ${l.traits ? 'claim' : ''} ${sugg.has(l.key) ? 'suggest' : ''}" data-layer="${esc(l.key)}" aria-pressed="${on(l)}" title="${esc(l.label)}${l.n ? (l.deep ? ': lies two hops away; switching it on opens the second hop' : l.mark ? ': mark them in place; no line is drawn for a missing link' : '') : ': nothing recorded to add'}" ${l.n || on(l) ? '' : 'disabled'}>${on(l) ? IC.check : IC.plus}${esc(l.short || l.label)}<small>${l.n}</small></button>`;
  const ctl = single ? `<div class="layers many" role="group" aria-label="Expand the focus by edge class"><span class="lab">Expand</span>${layers.filter(l => !l.traits).map(btn).join('')}${layers.some(l => l.traits) ? `<span class="gap"></span><span class="lab">Claim lines</span>${layers.filter(l => l.traits).map(btn).join('')}` : ''}</div>
    <div class="gtools" role="group" aria-label="Depth and scope"><span class="lab">Depth</span><span class="seg">${[1, 2].map(h => `<button data-act="hops" data-id="${h}" aria-pressed="${S.hops === h}" title="${h === 1 ? 'Only what a record joins to the focus directly' : 'Also what those reach. A walk never returns to another ' + (f.kind === 'species' ? 'plant' : f.kind === 'function' ? 'function' : 'attribute') + ' through a shared node: sharing is not a relation'}">${h} hop${h > 1 ? 's' : ''}</button>`).join('')}</span><button data-act="only" aria-pressed="${S.only}" title="Take what the walk did not reach out of the picture">Only linked</button><button data-act="collapse" title="Back to the first-order records of the focus">Collapse</button><button data-act="reset" title="Back to the whole Network">Reset</button></div>` : '';
  $('#ghead').innerHTML = `<h2>${title}</h2><span class="sub" id="gsub">${esc(sub)}</span>${ctl}<div class="right"><button data-act="fit" title="Reset pan and zoom">Fit</button></div>`;
  $('#gnote').textContent = f?.kind === 'pair' ? `Small circles are the ${g.nodes.filter(n => n.kind === 'concept').length} concepts both plants reach; hover one for its name. A line joins the two plants only where a relation was recorded.` : '';
  // an expansion that would pass the safe number of attribute nodes is not applied: its count is shown, with the ways to narrow it
  $('#gwarn').innerHTML = (g.blocked || []).map(b => `<p><b>Too many attributes (${b.n}).</b> ${esc(b.label)} would pass the ${M.constructor.SAFE} the Network keeps legible, so it is not expanded; nothing is hidden or cut.${b.narrow.length ? ` Choose one group: ${b.narrow.map(n => `<button class="layer suggest" data-layer="${esc(n.key)}">${IC.plus}${esc(n.label)}<small>${n.n}</small></button>`).join(' ')}` : ' Use one hop, or switch another claim group off.'} <button class="layer" data-layer="${esc(b.key)}">${IC.x}Dismiss</button></p>`).join('');
  drawGraph(g);
}
/** the line styles that are in this graph, and nothing else. Each class differs by its stroke pattern as well as its colour. */
function keyHtml(g) {
  const E = g.edges.filter(e => !e.ctx || !g.focus), k = []; const links = E.filter(e => e.kind === 'link');
  if (links.some(e => e.status !== 'candidate' && !e.conflict)) k.push(['', 'recorded use']);
  if (links.some(e => e.status === 'candidate' && !e.conflict)) k.push(['candidate', 'inferred from traits']);
  if (links.some(e => e.conflict)) k.push(['conflict', 'recorded use in conflict with a trait claim']);
  if (E.some(e => e.kind === 'requirement')) k.push(['req', 'trait a function requires']);
  if (E.some(e => e.kind === 'concept_link' && !e.latent)) k.push(['trait', 'claim line']);
  if (E.some(e => e.kind === 'relation' && e.status !== 'candidate')) k.push(['rel', 'plant-to-plant record']);
  if (E.some(e => e.kind === 'relation' && e.status === 'candidate')) k.push(['relc', 'placeholder between plants, not evidence']);
  if (g.nodes.some(n => n.gap)) k.push(['ghost', 'no link recorded: a gap, not “unsuitable”']);
  if (g.focus) k.push(['more', 'records of that node not shown; focus it to open them']);
  return k.map(([c, t]) => `<li><i class="${c}"></i>${t}</li>`).join('');
}
const LINEWORD = e => e.kind === 'link' ? (e.status === 'candidate' ? 'inferred' : 'recorded use') + (e.conflict ? ' · conflict' : '') : e.kind === 'requirement' ? (e.strength || 'requires') : e.kind === 'relation' ? human(e.rel) + (e.placeholder ? ' (placeholder)' : '') : '';
function drawGraph(g = S.M.graphFor(S.focus, S.a, S.b, S.x, { hops: S.hops, only: S.only })) {
  const M = S.M, svg = $('#svg'); const box = $('#gbody').getBoundingClientRect(); const Wfull = Math.max(300, box.width), H = Math.max(240, box.height);
  const reserve = S.inspClosed && S.focus && S.focus.kind !== 'pair' && innerWidth > 1100 ? (innerWidth <= 1320 ? 340 : 400) : 0;   // the Inspector was closed: the drawing keeps the rectangle it had beside it, so nothing moves
  const W = Math.max(300, Wfull - reserve); $('#gkey').innerHTML = keyHtml(g);
  const key = `${g.pair ? 'pair' : 'xyz'}|${S.a}|${S.b}|${g.nodes.map(n => n.id).join(',')}|${Math.round(W)}x${Math.round(H)}`;   // the columns move only when the set of nodes does
  const fresh = S.layoutKey !== key; S.g = g;
  if (fresh) { S.layout = layout(g, W, H); S.layoutKey = key; S.pan = { x: 0, y: 0, k: 1 }; }
  const L = S.layout; const sel = S.inspect; $('#gbody').classList.toggle('xyz', !!L.xyz); const foc = !!g.focus; const meta = new Map(g.nodes.map(n => [n.id, n]));
  const geo = (a, b, e) => !L.xyz ? `x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"` : e.kind === 'relation' ? `d="M${a.x},${a.y} C${a.x + 30 + Math.abs(a.y - b.y) * .12},${a.y} ${b.x + 30 + Math.abs(a.y - b.y) * .12},${b.y} ${b.x},${b.y}"` : `d="M${a.x},${a.y} C${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${b.y} ${b.x},${b.y}"`; const EL = L.xyz ? 'path' : 'line';
  const edgeSel = e => sel && ((sel.kind === 'link' && e.kind === 'link' && sel.id === e.id) || (sel.kind === 'concept_link' && e.kind === 'concept_link' && sel.id === e.id) || (sel.kind === 'relation' && e.kind === 'relation' && sel.id === e.id) || (sel.kind === 'req' && e.kind === 'requirement' && sel.id === e.id));
  const inspectOf = e => e.kind === 'link' ? `link=${e.id}` : e.kind === 'concept_link' ? `concept_link=${e.id}` : e.kind === 'relation' ? `relation=${e.id}` : e.kind === 'requirement' ? `req=${e.id}` : '';
  const edgeTip = e => { const a = M.name(e.source), b = M.name(e.target); return `${esc(a)} <span class="m">${esc(human(e.rel))}</span> ${esc(b)}<div class="m">${esc(LINEWORD(e) || e.status)} · ${esc(human(e.verification))}${e.placeholder ? ' · model placeholder' : ''} — click for its evidence</div>`; };
  const recSel = sel && !['species', 'function', 'concept'].includes(sel.kind);
  const selEdge = g.edges.find(edgeSel); const ends = new Set(selEdge ? [selEdge.source, selEdge.target] : []); const fr = S.fresh;   // the two ends of the inspected line; what the last expansion added
  const abset = !foc && L.xyz && S.a && S.b ? new Set([S.a, S.b]) : null; const abN = new Set(abset || []); if (abset) for (const e of g.edges) if (!e.latent && (abset.has(e.source) || abset.has(e.target))) { abN.add(e.source); abN.add(e.target); }   // A and B set, nothing focused: the two plants and what their records reach
  let h = `<g class="view" transform="translate(${S.pan.x},${S.pan.y}) scale(${S.pan.k})">`, marks = '';
  const litLinks = g.edges.filter(e => !e.ctx && !e.latent && (e.kind === 'link' || e.kind === 'relation' || (foc && e.kind === 'requirement'))).length;
  g.edges.forEach((e, ei) => {
    const a = L.byId.get(e.source), b = L.byId.get(e.target); if (!a || !b) return; const isSel = edgeSel(e);
    const cls = `edge ${esc(e.rel)} ${esc(e.status)} ${e.kind === 'relation' ? 'relation' : ''} ${e.conflict ? 'conflict' : ''} ${e.latent && !isSel ? 'latent' : ''} ${e.ctx ? 'ctx' : foc ? 'lit' : ''} ${isSel ? 'sel' : ''} ${recSel && !isSel ? 'dim' : ''} ${fr?.e.has(ekey(e)) ? 'new' : ''} ${abset && !e.latent && (abset.has(e.source) || abset.has(e.target)) ? 'abon' : ''}`;
    h += `<${EL} class="${cls}" data-ei="${ei}" data-cls="${esc(e.cls || e.kind)}" style="--i:${ei}" ${geo(a, b, e)}></${EL}>${e.latent || e.ctx ? '' : `<${EL} class="edge hit" ${geo(a, b, e)} tabindex="0" role="button" aria-label="${esc(M.name(e.source))} to ${esc(M.name(e.target))}: ${esc(LINEWORD(e) || 'claim line')}. Open its evidence" data-inspect="${esc(inspectOf(e))}" data-tip="${esc(edgeTip(e))}"></${EL}>`}`;
    // a lit line names its class in words where the lines are few enough to carry a word each: the class is never told by colour alone
    if (L.xyz && !e.ctx && LINEWORD(e) && (isSel || (foc && e.conflict))) {   // V4.3 — a line carries words only when it is the inspected one (its class, in full) or a conflict; every other line is named by the legend, its tooltip and its accessible name
      const far = e.source === g.center ? b : a, near = far === a ? b : a; const t = e.source === g.center || e.target === g.center ? .3 : .5;   // the word stands near the far end of its line, where the lines of a focus have fanned apart
      const bow = e.kind === 'relation' ? 30 + Math.abs(a.y - b.y) * .12 : null; const c1x = bow !== null ? far.x + bow : (far.x + near.x) / 2, c2x = bow !== null ? near.x + bow : c1x; const u = 1 - t;
      const mx = u * u * u * far.x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * near.x, my = u * u * u * far.y + 3 * u * u * t * far.y + 3 * u * t * t * near.y + t * t * t * near.y;
      marks += `<text class="elabel ${e.conflict ? 'conflict' : ''} ${isSel ? 'sel' : ''}" x="${mx + (bow !== null ? 6 : 0)}" y="${my - (isSel ? 9 : 5)}" text-anchor="${bow !== null ? 'start' : 'middle'}">${esc(isSel ? LINEWORD(e) : 'conflict')}</text>`; }
    if (!L.xyz && e.kind === 'relation') { marks += `<text class="elabel" x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 4}" text-anchor="middle">${esc(LINEWORD(e))}</text>`; }
  });
  if (L.xyz) {   // the three axes, named once above their columns
    const nY = g.nodes.filter(n => n.kind === 'concept').length; const hd = (x, anchor, ax, name, sub) => `<text class="colh" x="${x}" y="40" text-anchor="${anchor}"><tspan class="ax">${ax}</tspan> · ${name}</text><text class="cols" x="${x}" y="59" text-anchor="${anchor}">${sub}</text>`;
    h += hd(L.col.species + 10, 'end', 'X', 'Plants', 'species, with their growth form') + hd(L.col.function, 'middle', 'Z', 'Spatial functions', 'what a planting does in space') + hd(L.col.concept - 10, 'start', 'Y', 'Attributes', foc ? `${nY} shown of ${M.concepts.filter(c => !c.no_plant_reaches).length} recorded values` : `the ${nY} traits a function requires${W < 1000 ? '' : `, of ${M.concepts.filter(c => !c.no_plant_reaches).length} recorded values`}`);
  }
  let ni = 0; const tight = L.xyz && L.stepY < 30;
  // V4.3 — how many records of a lit node are not in the picture (function links, claim lines, plant-to-plant records): a small +n on
  // the node; focusing the node is how they are opened. Counted from the records, never estimated.
  const shown = new Map(); for (const e of g.edges) { if (e.ctx || e.latent || !['link', 'concept_link', 'relation'].includes(e.kind)) continue; for (const id of [e.source, e.target]) shown.set(id, (shown.get(id) || 0) + 1); }
  const total = id => M.SP.has(id) ? M.linksOf(id).filter(l => l.drawn).length + (M.clinksOf.get(id) || []).length + M.relationsOf(id).length : M.FN.has(id) ? M.linksTo(id).filter(l => l.drawn).length : (M.clinksOf.get(id) || []).length;
  const hiddenOf = (n, m) => foc && L.xyz && m.lit && !m.focus && !m.gap ? Math.max(0, total(n.id) - (shown.get(n.id) || 0)) : 0;
  for (const n of L.nodes) {
    const m = meta.get(n.id) || n; const recOnly = n.kind === 'function' && !PI.TRACE_FUNCTIONS.includes(n.id);   // the Studio's engine does not arrange it: its knowledge is recorded, nothing is planted for it
    const r = R_OF(m); const cls = `node ${n.kind} ${hiddenOf(n, m) ? 'more' : ''} ${m.focus ? 'focus' : ''} ${foc ? (m.lit ? 'lit' : m.gap ? 'gap' : 'ctx') : ''} ${recOnly ? 'rec' : ''} ${m.req ? 'req' : ''} ${S.a === n.id ? 'a' : ''} ${S.b === n.id ? 'b' : ''} ${ends.has(n.id) ? 'end' : ''} ${fr?.n.has(n.id) ? 'new' : ''} ${abN.has(n.id) ? 'abon' : ''}`;
    const dense = L.nodes.length > 28 && n.kind === 'concept'; const mute = dense && !!g.pair;   // a pair's many shared concepts are named on hover
    const cutT = (t, w) => { const mx = Math.max(10, Math.floor(w / 6.6)); return t.length > mx ? t.slice(0, mx - 1) + '…' : t; };
    const gapWord = m.gap ? `no link · ${m.verdict === 'contradicted by traits' ? 'contradicted' : 'evidence missing'}` : '';
    const label = L.xyz ? (n.kind === 'species' ? `<text x="${n.x - r - 9}" y="${n.y + 1}" text-anchor="end" font-size="13.5" font-style="italic" font-weight="500">${esc(n.label)}</text><text class="subl" x="${n.x - r - 9}" y="${n.y + 15}" text-anchor="end">${esc(gapWord || (n.sub || '').toLowerCase())}</text>`
      : n.kind === 'function' ? `<text x="${n.x}" y="${n.y + r + 16}" text-anchor="middle" font-size="13.5">${esc(n.label)}</text><text class="subl" x="${n.x}" y="${n.y + r + 30}" text-anchor="middle">${gapWord || (recOnly ? 'recorded only' : 'arranged in Design')}</text>`
      : `<text x="${n.x + r + 9}" y="${n.y + (tight ? 4 : 1)}" text-anchor="start" font-size="${tight ? 12.5 : 13}">${esc(cutT(n.label, W - n.x - 24))}</text>${tight ? '' : `<text class="subl" x="${n.x + r + 9}" y="${n.y + 15}" text-anchor="start">${esc((M.co(n.id)?.facet_label || '').toLowerCase())}</text>`}`)
      : mute ? '' : n.kind === 'species' ? `<text x="${n.x}" y="${n.y + r + 14}" text-anchor="middle" font-size="12.5" font-style="italic">${esc(n.label)}</text>` : `<text x="${n.x}" y="${n.y + r + (n.kind === 'concept' ? 12 : 14)}" text-anchor="middle" font-size="${n.kind === 'function' ? 12.5 : dense ? 9.5 : 11}">${esc(dense && n.label.length > 26 ? n.label.slice(0, 24) + '…' : n.label)}</text>`;
    const gapTip = m.gap ? ` · ${esc(m.verdict)}: no link is recorded to the focus, so no line is drawn — click for the requirement check` : '';
    const tipText = n.kind === 'species' ? `<i>${esc(n.label)}</i><div class="m">species · ${(M.sp(n.id).common_names || [])[0] ? esc(M.sp(n.id).common_names[0]) + ' · ' : ''}${M.sp(n.id).claims.live} live claims${gapTip}</div>` : n.kind === 'function' ? `${esc(n.label)}<div class="m">spatial function · ${M.fn(n.id).n_linked} linked · ${M.fn(n.id).n_unknown} without a link${recOnly ? ' · recorded only: the Studio\'s engine does not arrange it' : ''}${gapTip}</div>` : `${esc(n.label)}<div class="m">${esc(M.co(n.id)?.facet_label || 'concept')} · ${M.co(n.id)?.n_species ?? 0} species</div>`;
    const more = hiddenOf(n, m); const badge = more ? `<text class="nbadge" x="${n.kind === 'species' ? n.x + r + 4 : n.kind === 'concept' ? n.x - r - 4 : n.x + r + 3}" y="${n.y - r + 1}" text-anchor="${n.kind === 'concept' ? 'end' : 'start'}">+${more}</text>` : '';
    const ab = S.a === n.id ? `<text x="${n.x + r + 3}" y="${n.y - r - 2}" font-size="9.5" font-weight="700" style="fill:var(--olive-deep)">A</text>` : S.b === n.id ? `<text x="${n.x + r + 3}" y="${n.y - r - 2}" font-size="9.5" font-weight="700" style="fill:var(--ink)">B</text>` : '';
    h += `<g class="${cls}" tabindex="0" role="button" aria-label="${esc(n.label)}, ${n.kind === 'function' ? 'spatial function' : n.kind === 'concept' ? 'attribute' : 'species'}${m.gap ? ', no link recorded to the focus' : m.focus ? ', the focus' : ''}" data-id="${esc(n.id)}" style="--i:${ni++}" ${m.gap ? `data-inspect="link=${esc(m.link)}"` : `data-focus="${n.kind}=${esc(n.id)}"`} data-tip="${esc(tipText + (more ? `<div class="m">+${more} more ${more === 1 ? 'record' : 'records'} of this node not shown here — click to focus it and expand</div>` : ''))}" ${more ? `data-more="${more}"` : ''}>${m.focus ? `<circle class="halo" cx="${n.x}" cy="${n.y}" r="${r + 5}"></circle>` : ''}${fr?.n.has(n.id) ? `<circle class="newring" cx="${n.x}" cy="${n.y}" r="${r + 4.5}"></circle>` : ''}${S.b === n.id ? `<rect class="bmark" x="${n.x - r - 4}" y="${n.y - r - 4}" width="${2 * r + 8}" height="${2 * r + 8}" rx="3"></rect>` : S.a === n.id ? `<circle class="amark" cx="${n.x}" cy="${n.y}" r="${r + 4}"></circle>` : ''}<circle cx="${n.x}" cy="${n.y}" r="${r}"></circle>${label}${ab}${badge}</g>`;
  }
  h += marks + `</g>`;
  svg.setAttribute('viewBox', `0 0 ${Wfull} ${H}`); svg.innerHTML = h; svg.classList.remove('hl'); svg.classList.toggle('foc', foc); svg.classList.toggle('ab', !!abset); svg.classList.toggle('insp', !!selEdge);
  if (fresh && !fr) { svg.classList.add('enter'); clearTimeout(S.enterT); S.enterT = setTimeout(() => svg.classList.remove('enter'), 1600); }
}

// ------------------------------------------------------------------ matrix
const cellWord = l => l.status === 'derived' ? 'recorded use' : l.status === 'candidate' ? 'inferred from traits' : l.status === 'documented' ? 'stated' : l.verdict === 'contradicted by traits' ? 'no link · contradicted' : 'no link · evidence missing';
/** the same standing in the matrix cell: the word, and for a missing link the reason on its own line — never a bare blank */
const MK = k => `<i class="mk ${k}" aria-hidden="true"></i>`;
const cellKind = l => l.drawn ? (l.status === 'candidate' ? 'inf' : 'rec') : l.verdict === 'contradicted by traits' ? 'out' : 'gap';
const cellHtml = l => l.drawn ? MK(cellKind(l)) + esc(l.status === 'candidate' ? 'inferred' : cellWord(l)) : `${MK(cellKind(l))}<span class="nl">no link<small>${l.verdict === 'contradicted by traits' ? 'contradicted' : 'evidence missing'}</small></span>`;
/** V4.3 — the five states of a matrix cell, each with its own mark and its words, always on screen. Shape and fill carry the state;
 *  a missing link is quiet and is not a verdict on the plant. */
const MKEY = [['rec', 'recorded use', 'a source records the use'], ['inf', 'inferred', 'traits meet the requirements; no source states the use'], ['cf', 'conflict', 'a recorded use and a trait claim disagree; both kept'], ['out', 'no link · contradicted', 'a recorded trait lies outside a requirement'], ['gap', 'no link · evidence missing', 'not known; not “unsuitable”']];
const rowsFor = () => { const q = S.q.trim().toLowerCase(); return S.M.species.filter(s => !q || [s.scientific_name, ...(s.common_names || []), s.family, s.growth_form_label].join(' ').toLowerCase().includes(q)); };
/** a matrix cell in one short sentence (the hover and the accessible name); its claims and sources are in the Inspector */
const cellSay = l => (l.drawn ? (l.status === 'candidate' ? 'Inferred from traits (no source states the use)' : `Recorded use (${l.verification === 'verified' ? 'a use claim verified by a person' : 'unverified'})`) : `No link: ${l.verdict === 'contradicted by traits' ? 'contradicted by a recorded trait' : 'evidence missing'}`) + (l.conflict ? ', in conflict with a trait claim' : '');
const MF = [['', 'All cells'], ['linked', 'Linked'], ['conflict', 'Conflicts'], ['unknown', 'No link']];
const mfMatch = (l, k) => !k || (k === 'linked' ? l.drawn : k === 'conflict' ? !!l.conflict : !l.drawn);
/** V4.2 — the matrix compares, it does not score. What is selected (a function column, a species row, A and B, the inspected cell)
 *  keeps its full strength; every other cell steps back but stays readable and clickable. All of it is read from the state. */
function renderMatrix() {
  const M = S.M; const il = S.inspect?.kind === 'link' ? M.LK.get(S.inspect.id) : null;
  const ff = S.focus?.kind === 'function' ? S.focus.id : null, fs = S.focus?.kind === 'species' ? S.focus.id : null; const colsel = il ? il.function : ff, rowsel = il ? il.species : fs;
  const mrows = rowsFor(); const hasSel = !!(S.a || S.b || colsel || rowsel);
  $('#mhead').innerHTML = `<h2>Plants × spatial functions</h2><span class="sub">${mrows.length === M.species.length ? `${M.species.length} species` : `${mrows.length} of ${M.species.length} species (filter “${esc(S.q.trim())}”)`} × ${M.functions.length} functions. A cell opens its evidence. It is not a suitability score: no link is not “unsuitable”.</span><span class="seg mf" role="group" aria-label="Emphasise cells">${MF.map(([k, l]) => `<button data-act="mf" data-id="${k}" aria-pressed="${(S.mf || '') === k}" title="${k ? 'Keep these cells at full strength; the others step back and stay clickable' : 'Every cell at full strength'}">${l}</button>`).join('')}</span><span class="scrollcue">Scroll sideways for the other functions.</span>`;
  const gapsOf = f => { const u = M.linksTo(f.id).filter(l => !l.drawn); const c = u.filter(l => l.verdict === 'contradicted by traits').length; return `${c} contradicted by a recorded trait, ${u.length - c} with no evidence`; };
  const cur = S.cell.mbody || [0, 1];
  let h = `<ul id="mkey" aria-label="What a cell's mark means">${MKEY.map(([k, w, d]) => `<li data-k="${k}">${MK(k)}<b>${w}</b><span>${d}</span></li>`).join('')}</ul><div class="mwrap"><table class="matrix ${hasSel ? 'has-sel' : ''} ${S.mf ? 'has-mf' : ''}"><thead><tr><th>species</th>${M.functions.map(f => `<th class="${ff === f.id ? 'focus' : ''}"${colsel === f.id ? ' data-on="1"' : ''} data-focus="function=${esc(f.id)}" title="${esc(f.definition)} Without a link: ${esc(gapsOf(f))}.">${esc(f.label)}<small><span>${f.n_linked} linked · ${f.n_unknown} without</span>${PI.TRACE_FUNCTIONS.includes(f.id) ? '<span class="eng" title="The Studio\'s engine arranges plants for this function and evaluates the result">arranged in Design</span>' : '<span class="rec" title="The knowledge is recorded; the Studio\'s engine does not arrange or evaluate plants for this function">recorded only</span>'}</small></th>`).join('')}</tr></thead><tbody>`;
  mrows.forEach((s, r) => {
    const linked = ff && M.link(s.id, ff).drawn; const isA = S.a === s.id, isB = S.b === s.id; const rowOn = isA || isB || rowsel === s.id;
    h += `<tr class="${fs === s.id ? 'focus' : ''} ${linked ? 'linked' : ''} ${isA || isB ? 'cmp' : ''} ${isA ? 'a' : ''} ${isB ? 'b' : ''} ${rowOn ? 'on' : ''}"><th data-focus="species=${esc(s.id)}"><i class="sci">${esc(s.scientific_name)}</i><span class="cn">${esc((s.common_names || [])[0] || '')}</span><span class="abp" role="group" aria-label="Compare ${esc(s.scientific_name)}"><button data-ab="a" data-id="${esc(s.id)}" aria-pressed="${isA}" title="${isA ? 'A in the comparison: click to clear' : 'Set as A for a comparison'}">A</button><button data-ab="b" data-id="${esc(s.id)}" aria-pressed="${isB}" title="${isB ? 'B in the comparison: click to clear' : 'Set as B for a comparison'}">B</button></span></th>`;
    M.functions.forEach((f, c) => {
      const l = M.link(s.id, f.id); const selc = il && il.id === l.id; const on = rowOn || colsel === f.id; const off = !mfMatch(l, S.mf);
      h += `<td class="${ff === f.id || fs === s.id ? 'focus' : ''} ${selc ? 'sel' : ''} ${colsel === f.id ? 'col' : ''} ${hasSel && !on ? 'quiet' : ''} ${off ? 'off' : ''}" data-inspect="link=${esc(l.id)}" data-r="${r}" data-c="${c + 1}" tabindex="${cur[0] === r && cur[1] === c + 1 ? 0 : -1}" role="button" aria-label="${esc(M.name(s.id))}, ${esc(f.label)}: ${esc(cellSay(l))}. Open its evidence" title="${esc(cellSay(l))}" data-k="${cellKind(l)}${l.conflict ? ' cf' : ''}"><span class="cell ${esc(l.status)} ${l.conflict ? 'conflict' : ''} ${l.verdict === 'contradicted by traits' ? 'contradicted' : ''}">${cellHtml(l)}${l.verification === 'verified' ? ` <span class="v" title="${l.n_verified} use claim${l.n_verified === 1 ? '' : 's'} verified by a person">✓${l.n_verified}</span>` : ''}</span>${l.conflict ? `<span class="cf">${MK('cf')}conflict</span>` : ''}</td>`;
    });
    h += `</tr>`;
  });
  h += `</tbody></table>${matrixAside()}</div>`;
  h += `<details id="mlegend"><summary>How to read a cell</summary><div><p><b>recorded use</b> derived: a source records a use the ontology maps to the function (KG-R1).</p><p><b>inferred</b> candidate: every required trait is met by claims, but no source states the use (KG-R4).</p><p><b>no link</b> contradicted: a recorded trait lies outside a requirement of the function.</p><p><b>no link</b> evidence missing: no claim on a required trait. Not known is not the same as unsuitable.</p><p><b>conflict</b> a documented use and a trait claim disagree; both are kept.</p><p><b>✓n</b> n use claims verified by a person. Status and verification are separate.</p><p><b>recorded only</b> the function's knowledge is recorded, but the Studio's engine does not arrange plants for it.</p></div></details>`;
  $('#mbody').innerHTML = h; const mb = $('#mbody'); $('#v-matrix').classList.toggle('scrolls', mb.scrollWidth > mb.clientWidth + 2); restoreCell('mbody');
}
/** beside the matrix: A and B across the five functions, in words. A shared function is not a relation between the two plants. */
function matrixAside() {
  const M = S.M; if (!S.a && !S.b) return '';
  const nm = id => `<i class="sci">${esc(M.name(id))}</i>`;
  if (!(S.a && S.b)) return `<aside id="mcmp" aria-label="Comparison"><h3>Compare two plants</h3><p>${tag(S.a ? 'A' : 'B')} ${nm(S.a || S.b)} is set. Choose the other plant with the A or B button of its row.</p></aside>`;
  const p = M.pair(S.a, S.b); const word = l => l.drawn ? (l.status === 'candidate' ? 'inferred' : 'recorded use') + (l.conflict ? ' · conflict' : '') : `no link · ${l.verdict === 'contradicted by traits' ? 'contradicted' : 'evidence missing'}`;
  const rows = M.functions.map(f => ({ f, la: M.link(S.a, f.id), lb: M.link(S.b, f.id) })); const n = k => rows.filter(k).length;
  return `<aside id="mcmp" aria-label="Comparison summary"><h3>${tag('A')} ${nm(S.a)} <span class="amp">and</span> ${tag('B')} ${nm(S.b)}</h3>
    <table><tr><th>function</th><th>A</th><th>B</th></tr>${rows.map(x => `<tr><td><span class="link" data-focus="function=${esc(x.f.id)}">${esc(x.f.label)}</span></td><td class="${x.la.drawn ? 'y' : 'n'}" data-inspect="link=${esc(x.la.id)}">${esc(word(x.la))}</td><td class="${x.lb.drawn ? 'y' : 'n'}" data-inspect="link=${esc(x.lb.id)}">${esc(word(x.lb))}</td></tr>`).join('')}</table>
    <p class="small">Linked for both: ${n(x => x.la.drawn && x.lb.drawn)} · A only: ${n(x => x.la.drawn && !x.lb.drawn)} · B only: ${n(x => !x.la.drawn && x.lb.drawn)} · neither: ${n(x => !x.la.drawn && !x.lb.drawn)}.</p>
    <p class="small muted">${p?.direct_relations?.length ? `${plural(p.direct_relations.length, 'direct record')} between the two plants in relations.json.` : 'No direct record joins the two plants.'} Sharing a function is not a relation between them.</p>
    <button class="go" data-view="compare" title="Shared attributes, direct records, complementarity as a hypothesis, unknown and conflicting — side by side">Compare selected</button></aside>`;
}
function cellTitle(l) { const M = S.M; return `${M.name(l.species)} → ${M.name(l.function)}: ${l.status}${l.conflict ? ' · conflict' : ''}${l.verdict ? ` · ${l.verdict}` : ''} · ${l.verification}${l.via_use_labels?.length ? ` · use: ${l.via_use_labels.join(', ')}` : ''} — click for the evidence`; }

// ------------------------------------------------------------------ attribute table
/** V4.2 — the attribute table reads like a GIS attribute table: a pinned species column, column groups, one short value per cell and
 *  the record itself in the Inspector. Which columns show is state (groups + hidden columns), kept in the address and as a preference. */
/** V4.3 — two columns are read from the seasonal claims themselves (the flower colour words and the flowering months each source
 *  states); they are views of recorded claims, not new records, and a click opens the cell that holds those claims (Colour). */
const SHEET = ['exposure', 'height_class', 'spread_class', 'evergreen', '~flower', '~bloom'];
const DERIVED = [{ id: '~flower', label: 'Flower colour', after: 'colour', base: 'colour', definition: 'The colour words each source uses for the flowers, read from the seasonal claims.' }, { id: '~bloom', label: 'Flowering months', after: 'colour', base: 'colour', definition: 'The months each source names for flowering, read from the seasonal claims. A season named only in words has no months here.' }];
function tableFacets() { const out = []; for (const f of S.M.facets) { out.push(f); for (const d of DERIVED) if (d.after === f.id) out.push({ ...d, group: f.group, group_label: f.group_label, derived: true, gate: false }); } return out; }
const colOk = c => !!c && (S.M.FA.has(c) || DERIVED.some(d => d.id === c));
const facetShown = f => S.groups.has(f.group) && !S.hid.has(f.id);
function savePref() { try { localStorage.setItem('pi.kn.table.v43', JSON.stringify({ g: [...S.groups], hc: [...S.hid], tm: S.tm })); S.pref = { g: [...S.groups], hc: [...S.hid], tm: S.tm }; } catch { /* no storage: the address still carries the columns */ } }
/** what a cell shows: one or two short values in full, and how many more there are, in words. Nothing is cut to an ellipsis alone. */
function cellVals(a) {
  const L = a.values.map(v => v.label); const two = L.length > 1 && L[0].length <= 18 && L[1].length <= 18 ? 2 : 1; const rest = L.length - two;
  return `<span class="val">${esc(L.slice(0, two).join(' · '))}</span>${rest > 0 ? `<span class="more">+${rest} value${rest > 1 ? 's' : ''}</span>` : ''}`;
}
function tableRows(ff) {
  const M = S.M; let rows = rowsFor();
  if (S.tonly) { const keep = new Set([S.a, S.b, S.focus?.kind === 'species' ? S.focus.id : null, S.inspect?.kind === 'attr' ? M.AT.get(S.inspect.id).species : null, S.inspect?.kind === 'nr' ? S.inspect.id.split('~')[0] : null].filter(Boolean)); if (keep.size) rows = rows.filter(s => keep.has(s.id)); }
  const rank = { derived: 0, documented: 0, candidate: 1, unknown: 2 };
  if (ff) rows = rows.slice().sort((a, b) => { const la = M.link(a.id, ff.id), lb = M.link(b.id, ff.id); return rank[la.status] - rank[lb.status] || (la.verdict === 'evidence missing') - (lb.verdict === 'evidence missing') || a.scientific_name.localeCompare(b.scientific_name); });
  if (S.sort) rows = rows.slice().sort((a, b) => (M.attr(b.id, S.sort)?.n_values || 0) - (M.attr(a.id, S.sort)?.n_values || 0));
  return rows;
}
function renderTable() {
  const M = S.M; const ff = S.focus?.kind === 'function' ? M.fn(S.focus.id) : null, fs = S.focus?.kind === 'species' ? S.focus.id : null;
  const req = new Set(ff ? ff.required_facets : []); const marks = S.tm !== 'text'; const TF = tableFacets();
  if (!$('#tq')) {
    $('#tcontrols').innerHTML = `<h2>Plants × attributes</h2><input id="tq" type="search" placeholder="Filter plants" aria-label="Filter plants by name, family or growth form" value="${esc(S.q)}" style="width:150px"><span class="seg tm" role="group" aria-label="How cells are shown"><button data-act="tm" data-id="marks" title="Draw the cells that can be drawn: sizes on one scale, months, light, colour, leaf, evidence">Marks</button><button data-act="tm" data-id="text" title="Every cell as its recorded words">Text</button></span><details id="tcols"><summary title="Choose the attribute groups and columns shown">Columns <small id="tcn"></small></summary><div class="colpanel" id="tcolpanel"></div></details><button data-act="tonly" id="tonly" aria-pressed="false" title="Show only the rows that are selected: A and B, the focused plant, the plant of the inspected cell">Only selected</button><button data-act="csv" title="Download the rows and columns shown as a CSV file: every value of each cell, as recorded">Export CSV</button><span class="sub" id="thint"></span><details id="tlegend"><summary>How to read the marks</summary>${CX.legendHtml()}</details>`;
    $('#tq').addEventListener('input', () => { S.q = $('#tq').value; writeHash(); renderTable(); });
  }
  document.querySelectorAll('#tcontrols .tm button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.id === 'text') === !marks))); $('#tlegend').hidden = !marks;
  const selA = S.inspect?.kind === 'attr' ? M.AT.get(S.inspect.id) : null; const selN = S.inspect?.kind === 'nr' ? S.inspect.id.split('~') : null;
  const selSp = selA ? selA.species : selN ? selN[0] : null, selFa = selA ? selA.facet : selN ? selN[1] : null;   // the selected cell marks its whole row and column
  const cols = TF.filter(f => facetShown(f) || req.has(f.id) || (!f.derived && f.id === selFa));   // a column the focused function requires, or the inspected cell stands in, is shown even when its group is off
  $('#tcn').textContent = `${cols.length} of ${TF.length}`; $('#tonly').setAttribute('aria-pressed', String(!!S.tonly));
  $('#tcolpanel').innerHTML = `<p class="small muted">Every attribute of the snapshot is here; the choice is kept for next time.</p>` + M.groups.map(g => { const fs2 = TF.filter(f => f.group === g.id); const on = S.groups.has(g.id);
    return `<fieldset><legend><label><input type="checkbox" ${on ? 'checked' : ''} data-act="tg" data-id="${esc(g.id)}"><b>${esc(g.label)}</b> <small>${fs2.length}</small></label></legend>${fs2.map(f => `<label title="${esc(f.definition || f.label)}"><input type="checkbox" ${on && !S.hid.has(f.id) ? 'checked' : ''} ${on ? '' : 'disabled'} data-act="tc" data-id="${esc(f.id)}">${esc(f.label)}${req.has(f.id) ? ' <small>required</small>' : ''}${f.derived ? ' <small>from the seasonal claims</small>' : ''}</label>`).join('')}</fieldset>`; }).join('') + `<fieldset><legend><label title="growth form, family, origin, plant type and claim counts"><input type="checkbox" ${S.identity ? 'checked' : ''} data-act="tident"><b>Family &amp; origin</b></label></legend></fieldset>`;
  $('#thint').textContent = (ff ? `Columns ${ff.label} requires are marked; linked plants come first. ` : '') + 'Click a cell for its record: every value, source, scope and standing. Arrow keys move, Enter opens.';
  const rows = tableRows(ff);
  const groupsRow = []; let last = null;
  for (const f of cols) { if (f.group !== last) { groupsRow.push({ g: f.group, n: 1 }); last = f.group; } else groupsRow[groupsRow.length - 1].n++; }
  const nId = S.identity ? 5 : 2; const cur = S.cell.tablewrap || [0, 1]; const tab = (r, c) => `data-r="${r}" data-c="${c}" tabindex="${cur[0] === r && cur[1] === c ? 0 : -1}"`;
  const scale = { height_class: CX.sizeScale(M, 'height_class'), spread_class: CX.sizeScale(M, 'spread_class') };   // one scale per column, from every plant's statements
  const axis = f => !marks ? '' : scale[f.id] ? CX.sizeAxis(scale[f.id]) : f.id === '~bloom' ? CX.monthAxis() : '';
  let h = `<table class="attr ${marks ? 'marks' : 'words'}"><thead><tr class="groups"><th colspan="1"></th><th colspan="${nId}">identity</th>${groupsRow.map(x => `<th colspan="${x.n}">${esc(M.GR.get(x.g).label)}</th>`).join('')}</tr><tr class="cols"><th>Plant</th><th title="read from the sources (rule M29)">Growth form</th>${S.identity ? '<th>Family</th><th>Origin</th><th>KPU type</th>' : ''}<th title="The standing of the plant's whole record: live claims, how many a person verified, sources read, cells whose sources differ. An AI source check is not a verification.">Evidence</th>${cols.map(f => `<th class="${req.has(f.id) ? 'req' : ''} ${S.sort === f.id ? 'sorted' : ''} ${selFa === f.id ? 'selcol' : ''} ${axis(f) ? 'hasaxis' : ''}" data-col="${esc(f.id)}" data-act="tsort" data-id="${esc(f.id)}" aria-sort="${S.sort === f.id ? 'descending' : 'none'}" title="${esc(f.definition || f.label)} · ${f.gate ? 'a condition the Studio checks against the site' : 'compared, not checked'} · click to sort by the number of values">${esc(f.label)}${f.gate ? ' <span class="g">gate</span>' : ''}${axis(f)}</th>`).join('')}</tr></thead><tbody>`;
  const evSay = a => CX.cellEvidenceSay(a); const evMark = a => marks ? CX.cellEvidence(a) : `${a.disagreement.length ? ` <span class="dis" title="Sources record different values without a stated condition">sources differ</span>` : ''}${a.variation.length ? ` <span class="dis cond" title="The value depends on a stated condition">by condition</span>` : ''}${a.verification === 'verified' ? ` <span class="ver" title="A claim behind this cell was verified by a person">✓</span>` : ''}`;
  rows.forEach((s, r) => {
    const l = ff ? M.link(s.id, ff.id) : null;
    h += `<tr class="${fs === s.id ? 'focus' : ''} ${l ? (l.drawn ? 'linked' : 'unknown-fn') : ''} ${selSp === s.id ? 'selrow' : ''} ${S.a === s.id || S.b === s.id ? 'cmp' : ''} ${S.a === s.id ? 'a' : ''} ${S.b === s.id ? 'b' : ''}"><th data-focus="species=${esc(s.id)}"><i class="sci">${esc(s.scientific_name)}</i>${S.a === s.id ? ` ${tag('A')}` : ''}${S.b === s.id ? ` ${tag('B')}` : ''}${l ? `<span class="st">${esc(cellWord(l))}${l.conflict ? ' · conflict' : ''}</span>` : ''}</th>`;
    h += `<td class="ident" data-cx="form" data-inspect="species=${esc(s.id)}" ${tab(r, 1)} aria-label="${esc(s.scientific_name)}, growth form: ${esc(s.growth_form_label || 'not recorded')}" title="Growth form, read from the sources (rule M29) — click for the plant's record">${marks ? CX.growthForm(s) : `${esc(s.growth_form_label || 'not recorded')}${s.growth_form_status && s.growth_form_status !== 'supported' ? ` <small class="faint">${esc(human(s.growth_form_status))}</small>` : ''}`}</td>`;
    if (S.identity) h += `<td class="ident">${esc(s.family || 'not recorded')}</td><td class="ident">${esc(human(s.origin_status) || 'not recorded')}</td><td class="ident">${esc(s.kpu_plant_type || 'not recorded')}</td>`;
    { const e = CX.evidenceOf(M, s); h += `<td class="ident" data-cx="evidence" data-inspect="species=${esc(s.id)}" ${tab(r, nId)} aria-label="${esc(s.scientific_name)}, evidence: ${esc(e.say)}" title="${esc(e.say)}">${marks ? CX.evidenceCell(M, s) : `${e.live} live · ${e.verified} verified · ${plural(e.srcs, 'source')}${e.dis ? ` · ${plural(e.dis, 'cell')} differ` : ''}`}</td>`; }
    cols.forEach((f, ci) => {
      const c = ci + 1 + nId; const col = !f.derived && selFa === f.id ? 'colon' : '';
      if (f.derived) {   // read from the seasonal claims; the record behind it is the plant's Colour cell
        const base = M.attr(s.id, f.base); const d = f.id === '~flower' ? CX.flowerColour(M, s) : CX.flowering(M, s); const nr = d.say === 'not recorded';
        const words = f.id === '~flower' ? (d.words || []).map(w => w.word).join(' · ') : (d.each || []).join(' · ');
        h += `<td class="${nr ? 'nr' : ''} ${base && selA?.id === base.id ? 'sel' : ''}" data-cx="${f.id === '~flower' ? 'flower' : 'bloom'}" ${base ? `data-inspect="attr=${esc(base.id)}"` : `data-inspect="nr=${esc(s.id)}~${esc(f.base)}"`} ${tab(r, c)} aria-label="${esc(s.scientific_name)}, ${esc(f.label)}: ${esc(d.say)}" title="${esc(nr ? `No source states ${f.label.toLowerCase()} for this plant` : d.say)}">${nr ? CX.missing() : marks ? d.html : `<span class="tc"><span class="val">${esc(words)}</span></span>`}</td>`; return; }
      const a = M.attr(s.id, f.id);
      if (!a) { const selc = selN && selN[0] === s.id && selN[1] === f.id; h += `<td class="nr ${req.has(f.id) ? 'req' : ''} ${col} ${selc ? 'sel' : ''}" data-inspect="nr=${esc(s.id)}~${esc(f.id)}" ${tab(r, c)} aria-label="${esc(s.scientific_name)}, ${esc(f.label)}: not recorded">${CX.missing()}</td>`; return; }
      const selc = selA?.id === a.id; const all = a.values.map(v => v.label).join(' · ');
      const kind = !marks ? '' : scale[f.id] ? 'size' : f.id === 'exposure' ? 'light' : f.id === 'evergreen' ? 'leaf' : f.id === 'colour' ? 'colour' : '';
      const say = kind === 'size' ? CX.sizeWords(M, a).say : all;
      const body = kind === 'size' ? CX.sizeCell(M, a, scale[f.id]) : kind === 'light' ? CX.exposure(a) : kind === 'leaf' ? CX.leaf(a) : kind === 'colour' ? CX.coloursHtml(CX.colourWords(a.values.flatMap(v => v.sources.map(src => ({ word: v.label, src, cultivar: v.cultivars.length && !v.claims.some(cid => !M.claim(cid)?.cultivar) ? 'cv' : null }))))) : cellVals(a);
      h += `<td class="${req.has(f.id) ? 'req' : ''} ${col} ${selc ? 'sel' : ''}" ${kind ? `data-cx="${kind}"` : ''} data-inspect="attr=${esc(a.id)}" ${tab(r, c)} aria-label="${esc(s.scientific_name)}, ${esc(f.label)}: ${esc(say)}. ${esc(evSay(a))}" title="${esc(kind === 'size' ? say : all)}"><span class="tc">${body}${evMark(a)}</span></td>`;
    });
    h += `</tr>`;
  });
  h += `</tbody></table>`;
  if (!rows.length) h += `<p class="tempty">No plant matches “${esc(S.q.trim())}”. Clear the filter to see all ${M.species.length}.</p>`;
  $('#tablewrap').innerHTML = h; restoreCell('tablewrap');
}
/** the rows and columns on screen as CSV: every value of a cell, as recorded (nothing chosen or averaged) */
function tableCsv() {
  const M = S.M; const ff = S.focus?.kind === 'function' ? M.fn(S.focus.id) : null; const req = new Set(ff ? ff.required_facets : []); const cols = tableFacets().filter(f => facetShown(f) || req.has(f.id));
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const val = (s, f) => { if (f.id === '~flower') { const d = CX.flowerColour(M, s); return d.words.length ? d.words.map(w => `${w.word} (${w.srcs.size})`).join(' | ') : 'not recorded'; } if (f.id === '~bloom') { const d = CX.flowering(M, s); return d.each?.length ? d.each.join(' | ') : 'not recorded'; } const a = M.attr(s.id, f.id); if (!a) return 'not recorded'; return f.id === 'height_class' || f.id === 'spread_class' ? (CX.sizeWords(M, a).each.join(' | ') || a.values.map(v => v.label).join(' | ')) : a.values.map(v => v.label).join(' | '); };
  const lines = [['species', 'common name', 'growth form', ...cols.map(f => f.label)].map(q).join(',')];
  for (const s of tableRows(ff)) lines.push([s.scientific_name, (s.common_names || [])[0] || '', s.growth_form_label || 'not recorded', ...cols.map(f => val(s, f))].map(q).join(','));
  const url = URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = `planting-intelligence-attributes-${M.d.generated}.csv`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
/** grids (the table, the matrix): one cell is in the tab order; arrows move, Home / End jump along the row, Enter opens the record */
function gridKeys(id) {
  const box = $('#' + id);
  box.addEventListener('keydown', ev => {
    const c = ev.target.closest('[data-r][data-c]'); if (!c) return; const r = +c.dataset.r, k = +c.dataset.c, K = ev.key;
    if (K === 'Enter' || K === ' ') { ev.preventDefault(); S.gridKeep = id; S.cell[id] = [r, k]; c.dispatchEvent(new MouseEvent('click', { bubbles: true })); return; }
    const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[K]; if (!d && K !== 'Home' && K !== 'End') return; ev.preventDefault();
    let t; if (d) t = box.querySelector(`[data-r="${r + d[0]}"][data-c="${k + d[1]}"]`); else { const row = [...box.querySelectorAll(`[data-r="${r}"]`)]; t = K === 'Home' ? row[0] : row[row.length - 1]; }
    if (t) { c.tabIndex = -1; t.tabIndex = 0; t.focus(); S.cell[id] = [+t.dataset.r, +t.dataset.c]; }
  });
  box.addEventListener('click', ev => { const c = ev.target.closest('[data-r][data-c]'); if (c) { S.cell[id] = [+c.dataset.r, +c.dataset.c]; S.gridKeep = id; } }, true);   // before the page re-renders the grid
}
function restoreCell(id) { if (S.gridKeep !== id) return; S.gridKeep = null; const [r, c] = S.cell[id] || []; $('#' + id).querySelector(`[data-r="${r}"][data-c="${c}"]`)?.focus({ preventScroll: false }); }

// ------------------------------------------------------------------ evidence inspector (the contextual panel)
const tag = (s, extra = '') => s ? `<span class="pi-tag ${esc(String(s).replace(/\s+/g, '_'))}">${esc(human(s))}${extra}</span>` : '';
/** the name of the selected record first, then what kind of record it is, then its facts — never a label above the title */
/** a function link's standing in words: an unknown link names why there is no link; a verification says how many claims it covers */
const VERDICT = { 'supported by traits': 'required traits met', 'contradicted by traits': 'contradicted by a recorded trait', 'evidence missing': 'evidence missing' };
const verdictWord = v => VERDICT[v] || v;
const stTag = l => l.status === 'unknown' ? `<span class="pi-tag unknown">no link: ${l.verdict === 'contradicted by traits' ? 'contradicted by a recorded trait' : esc(l.verdict || 'unknown')}</span>` : tag(l.status);
const verTag = x => { const v = x?.verification; if (!v) return ''; if (v === 'none') return `<span class="pi-tag none">no claim to verify</span>`; const n = (x.n_verified || 0) + (x.n_unverified || 0); return `<span class="pi-tag ${esc(v)}">${esc(human(v))}${n ? ` · ${v === 'verified' ? `${x.n_verified} of ${plural(n, 'claim')}` : plural(n, 'claim')}` : ''}</span>`; };
const head = (title, kind = '', facts = '') => `<h2 class="title">${title}</h2>${kind ? `<p class="kind">${kind}</p>` : ''}${facts ? `<p class="facts">${facts}</p>` : ''}`;
function sourceLine(sid) { const s = S.M.source(sid); const name = s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>` : esc(s.label); return `${name}${s.type ? ` · ${esc(s.type)}` : ''}${s.licence_tier ? ` · tier ${esc(s.licence_tier)}` : ''}${s.geo ? ` · ${esc(s.geo)}` : ''}`; }
function claimHtml(cid) {
  const M = S.M, c = M.claim(cid); if (!c) return `<div class="claim"><div class="meta">${esc(cid)} — not in the projection's claim index</div></div>`;
  const chk = M.checks[cid];
  const cond = c.conditions?.length ? ` · <b>when</b> ${c.conditions.map(x => esc(x.label)).join(', ')}` : '';
  const pm = c.practitioner_meta; const who = pm?.observer_background ? `<br><b>observer</b> ${esc(pm.observer_background)}${pm.completeness ? ` · ${esc(pm.completeness)}` : ''}${pm.citable === false ? ' · not citable' : ''}` : '';
  return `<div class="claim"><div class="txt">${esc(c.text)}</div><div class="meta"><b>source</b> ${sourceLine(c.source_id)} · ${esc(c.source_type)}${c.place_label ? ` · <b>place</b> ${esc(c.place_label)}` : ''}${cond}${c.cultivar ? ` · <b>cv.</b> ${esc(c.cultivar)}` : ''} · <b>conf</b> ${esc(c.confidence)}${c.context ? `<br><b>context</b> ${esc(c.context)}` : ''}${who}<br>${tag(c.status)} ${tag(c.evidence_check, ' <span style="opacity:.7">AI</span>')}${c.status === 'retired' ? ` retired${c.retired_by ? ` by ${esc(c.retired_by)}` : ''}` : ''}<br><span class="faint">${esc(c.id)} · ${esc(c.field)} · ${esc(c.recorded_at || '')}</span></div>${chk ? `<details class="ai"><summary>AI source check: ${esc(human(chk.result))} (${esc(chk.method)}, ${esc((chk.reviewed_at || '').slice(0, 10))}) — an assessment, not a verification</summary><div class="small muted"><b>locator</b> ${esc(chk.locator || '—')}<br><b>excerpt</b> ${esc(chk.excerpt || '—')}<br><b>reading</b> ${esc(chk.explanation || '')}${chk.missing_context ? `<br><b>missing context</b> ${esc(chk.missing_context)}` : ''}${chk.conflicting_claims?.length ? `<br><b>conflicting claims</b> ${chk.conflicting_claims.map(x => `<span class="mono">${esc(x)}</span>`).join(', ')}${chk.conflict_reading ? ` — ${esc(chk.conflict_reading)}` : ''}` : ''}</div></details>` : ''}</div>`;
}
function ruleHtml(rules) { if (!rules) return ''; return (Array.isArray(rules) ? rules : String(rules).split(' · ')).map(r => S.M.rules[r] ? `<p class="note"><b>${esc(r)}</b> ${esc(S.M.rules[r])}</p>` : '').join(''); }
function reqHtml(reqs, verdicts) {
  const M = S.M; if (!reqs?.length) return '<p class="faint small">no requirement recorded for this concept</p>';
  return `<h3>Requirement check ${verdicts ? `<small>${esc(Object.values(verdicts).map(verdictWord).join(' / '))}</small>` : ''}</h3>` + reqs.map(r => `<div class="reqrow"><div>${esc(r.strength)} ${r.alternative_labels.map((l, i) => `<span class="link" data-focus="concept=${esc(r.alternatives[i])}">${esc(l)}</span>`).join(' <span class="faint">or</span> ')}${r.to_confirm ? ' <span class="faint">(to confirm)</span>' : ''}${r.concept_label ? ` <span class="faint">· ${esc(r.concept_label)}</span>` : ''}</div><div class="r ${esc(r.result)}">${esc(r.result)}</div>${r.evidence?.length ? `<div class="alt">${r.evidence.map(x => `${esc(x.target_label)}${x.claim ? ` — <span class="mono">${esc(x.claim)}</span> ${tag(x.verification)}` : ` — ${esc(x.source_id)}`}${x.cultivar ? ` cv. ${esc(x.cultivar)}` : ''}${x.conditions?.length ? ` when ${esc(x.conditions.map(c => c.label || c.concept_id || c).join(', '))}` : ''}`).join('<br>')}</div>` : ''}${r.contrary?.length ? `<div class="alt warn">contrary: ${r.contrary.map(x => `${esc(x.target_label)} (${esc(x.source_id)}${x.claim ? `, <span class="mono">${esc(x.claim)}</span>` : ''})`).join(', ')}</div>` : ''}${r.source ? `<div class="alt faint">${esc(r.source)}</div>` : ''}</div>`).join('');
}
/** the first thing the Inspector says about a node: what it is linked to, what is missing, what is in conflict — as counts that open */
const stat = (n, word, cls = '') => `<span class="stat ${cls}"><b>${n}</b>${esc(word)}</span>`;
function summaryHtml(kind, id) {
  const M = S.M; let st = '';
  if (kind === 'species') { const L = M.linksOf(id); const cells = M.attrs.filter(a => a.species === id); const nr = M.facets.length - cells.length;
    st = stat(L.filter(l => l.drawn && l.status !== 'candidate').length, 'recorded use') + stat(L.filter(l => l.status === 'candidate').length, 'inferred') + stat(L.filter(l => !l.drawn && l.verdict !== 'contradicted by traits').length, 'evidence missing', 'miss') + stat(L.filter(l => l.verdict === 'contradicted by traits').length, 'contradicted', 'miss') + stat(L.filter(l => l.conflict).length + cells.filter(a => a.disagreement.length).length, 'in conflict', 'conf') + stat(nr, `of ${M.facets.length} attributes not recorded`, 'miss'); }
  else if (kind === 'function') { const L = M.linksTo(id); st = stat(L.filter(l => l.drawn && l.status !== 'candidate').length, 'recorded use') + stat(L.filter(l => l.status === 'candidate').length, 'inferred') + stat(L.filter(l => !l.drawn && l.verdict !== 'contradicted by traits').length, 'evidence missing', 'miss') + stat(L.filter(l => l.verdict === 'contradicted by traits').length, 'contradicted', 'miss') + stat(L.filter(l => l.conflict).length, 'in conflict', 'conf') + stat(M.fn(id).requirements.length, 'requirements'); }
  else { const es = M.clinksOf.get(id) || []; st = stat(es.length, 'plants reach it') + stat(M.species.length - es.length, 'no claim', 'miss') + stat((M.co(id).required_by || []).length, 'functions require it'); }
  const isFocus = S.focus && S.focus.kind === kind && S.focus.id === id; const others = M.species.filter(x => x.id !== id);
  let acts = isFocus ? '' : `<button data-focus="${kind}=${esc(id)}">Focus</button>`;
  if (kind === 'species') acts += `<select data-cmp aria-label="Compare ${esc(M.name(id))} with another plant" title="Compare the two plants: shared attributes, differences, function evidence, what is unknown and what is in conflict"><option value="">Compare with…</option>${others.map(o => `<option value="${esc(o.id)}">${esc(o.scientific_name)}</option>`).join('')}</select><a href="${esc(PI.links.profile(id))}">Plant Profile</a><a href="${esc(PI.links.trace(id, { fn: PI.TRACE_FUNCTION }))}" title="Follow this plant from its sources into a bed of a design">Design Trace</a>`;
  return `<div class="summ" aria-label="Linked, missing and in conflict">${st}</div><div class="next" role="group" aria-label="Next">${acts}</div>`;
}
/** one requirement line: a spatial function requires a trait. It rests on the literature the ontology cites, not on a plant claim. */
function requirementHtml(e) {
  const M = S.M; const f = M.fn(e.fn), c = M.co(e.target), r = e.ref; const es = M.clinksOf.get(c.id) || []; const have = new Set(es.map(x => x.species));
  let h = head(`${fnLink(f.id)} <span class="arrow">requires</span> <span class="link" data-focus="concept=${esc(c.id)}">${esc(c.label)}</span>`, `spatial function → attribute · requirement · ${esc(r.strength)}`, `<span class="pi-tag documented">literature</span> ${r.to_confirm ? tag('to confirm') : ''}`);
  h += `<p>${esc(r.text || '')} ${r.alternatives.length > 1 ? `Any one of ${esc(r.alternative_labels.join(', '))} meets it.` : ''}</p><h3>Source <small>the ontology's citation, not a plant claim</small></h3><div class="claim"><div class="txt">${esc(r.literature || 'no citation recorded')}</div><div class="meta">${r.note ? `${esc(r.note)}<br>` : ''}${r.to_confirm ? 'Marked to confirm: the reading of the source is not settled. ' : ''}No person verifies a requirement as a claim; it is a rule of the ontology (${esc(M.d.ontology_version || '')}).<br><span class="faint">${esc(r.id)}</span></div></div>`;
  h += `<p class="note"><b>How it is used</b> ${esc(M.rules['KG-R4'] || '')}</p>`;
  h += `<h3>Plants with a claim on it <small>${es.length} of ${M.species.length}</small></h3>` + (es.map(x => `<div class="row" data-inspect="concept_link=${esc(x.id)}"><div class="b"><i class="sci">${esc(M.name(x.species))}</i> ${tag(x.status)} ${verTag(x)}<div class="meta">${plural(x.claims.length, 'claim')} · ${esc(x.sources.join(', '))}</div></div></div>`).join('') || '<p class="small faint">none</p>');
  const miss = M.species.filter(x => !have.has(x.id)); if (miss.length) h += `<p class="small faint">No claim on this trait: ${miss.map(x => `<i class="sci">${esc(x.scientific_name)}</i>`).join(', ')}. Not known is not the same as lacking it.</p>`;
  return h;
}
function renderInspector() {
  const M = S.M; if (!M) return; const open = inspectorOpen(); $('#inspector').hidden = !open; if (!open) return;
  const f = S.focus; $('#isub').innerHTML = S.inspect && f && f.kind !== 'pair' && !(S.inspect.kind === f.kind && S.inspect.id === f.id) ? `<span class="link" data-inspect="" title="Back to the record of the focus">${f.kind === 'species' ? `<i class="sci">${esc(M.name(f.id))}</i>` : esc(M.name(f.id))}</span>` : '';
  $('#ibody').innerHTML = evidenceHtml(); $('#ibody').scrollTop = 0;
}
function evidenceHtml() {
  const M = S.M, i = S.inspect;
  if (!i) {
    if (S.focus?.kind === 'function') return functionHtml(M.fn(S.focus.id));
    if (S.focus?.kind === 'species') return speciesHtml(M.sp(S.focus.id));
    if (S.focus?.kind === 'concept') return conceptHtml(M.co(S.focus.id));
    if (S.focus?.kind === 'pair') return pairHtml();
    return '';
  }
  if (i.kind === 'link') return linkHtml(M.LK.get(i.id));
  if (i.kind === 'attr') return attrHtml(M.AT.get(i.id));
  if (i.kind === 'nr') return nrHtml(i.id);
  if (i.kind === 'concept_link') return conceptLinkHtml(M.CL.get(i.id));
  if (i.kind === 'relation') return relationHtml(M.RE.get(i.id), true);
  if (i.kind === 'req') return requirementHtml(M.req(i.id));
  if (i.kind === 'species') return speciesHtml(M.sp(i.id));
  if (i.kind === 'function') return functionHtml(M.fn(i.id));
  if (i.kind === 'concept') return conceptHtml(M.co(i.id));
  return '';
}
const spLink = id => `<span class="link" data-focus="species=${esc(id)}"><i class="sci">${esc(S.M.name(id))}</i></span>`;
const fnLink = id => `<span class="link" data-focus="function=${esc(id)}">${esc(S.M.name(id))}</span>`;
function pairHtml() {
  const M = S.M; const p = M.pair(S.a, S.b);
  let h = head(`${spLink(S.a)} <span class="arrow">and</span> ${spLink(S.b)}`, 'two species in the graph', `${p.n_shared} shared knowledge nodes · ${plural(p.direct_relations.length, 'live direct record')} · ${p.retired_relations.length} retired`);
  h += `<p>The graph shows the concepts both plants reach, the functions each is linked to, and any direct record between them. A line joins the two plants only where a relation was recorded.</p><p class="go"><span class="link" data-view="compare">Open the comparison</span></p>`;
  h += `<h3>Direct records <small>${p.direct_relations.length} live</small></h3>` + (p.direct_relations.length ? p.direct_relations.map(id => { const r = M.RE.get(id); return `<div class="row" data-inspect="relation=${esc(id)}"><div class="b">${esc(human(r.type))} ${tag(r.kg_status)} ${tag(r.status)}${r.placeholder ? ` ${tag('model placeholder')}` : ''}<div class="meta">${esc(M.source(r.source_id).label)}</div></div></div>`; }).join('') : '<p class="small"><b>None recorded.</b> An honest absence, not evidence of incompatibility.</p>');
  return h;
}
/** the structured record behind what is inspected, for checking and export. Never the reading view: it sits last, closed. */
function rawHtml(obj, what) { return `<details class="adv"><summary>Advanced: raw record (JSON)</summary><p class="small muted">The structured database record behind ${what}, as the snapshot stores it (brain/data/explorer.json). For checking and export; the reading view is above.</p><button class="copy" data-act="copy-raw">Copy the record</button><pre class="raw" tabindex="0">${esc(JSON.stringify(obj, null, 2))}</pre></details>`; }
const srcName = sid => { const s = S.M.source(sid); return s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>` : esc(s.label); };
/** the AI source check of some claims, counted by its result — an assessment, shown apart from a person's verification */
function aiLine(cids) { const ai = {}; for (const cid of cids || []) { const k = S.M.claim(cid)?.evidence_check; if (k) ai[k] = (ai[k] || 0) + 1; } return Object.keys(ai).length ? Object.entries(ai).map(([k, v]) => `${esc(human(k))}${v > 1 ? ` ${v}` : ''}`).join(' · ') : null; }
/** V4.2 — a line's first screen: the relation, what it means, where its evidence stands (three separate short rows), the one claim
 *  that carries it, what to do next. Rules, every claim, the requirement check and the ids are one disclosure further. */
function linkHtml(l) {
  const M = S.M; const s = M.sp(l.species), f = M.fn(l.function); const arranged = PI.TRACE_FUNCTIONS.includes(l.function);
  let h = head(`${spLink(s.id)} <span class="arrow">→</span> ${fnLink(f.id)}`, `species → spatial function · ${esc(l.evidence_kind === 'use_claim' ? 'recorded use' : l.evidence_kind === 'trait_inference' ? 'trait inference' : 'no link')}`, `${stTag(l)} ${l.conflict ? tag('conflict') : ''}`);
  if (l.status === 'derived' && l.use_claims.length) h += `<p>A source records the use <b>${esc(l.via_use_labels.join(', '))}</b>, which the ontology maps to ${esc(f.label)} (rule KG-R1).</p>`;
  else if (l.status === 'candidate') h += `<p>No source states this use. Every <b>required</b> trait of ${esc(f.label)} is met by recorded claims (KG-R4), so the link is a <b>candidate</b> — an inference, never promoted, nothing to verify until a source records the use.</p>`;
  else if (l.status === 'unknown') h += `<p>No link is drawn. ${l.verdict === 'contradicted by traits' ? `A recorded claim places <i class="sci">${esc(s.scientific_name)}</i> outside a requirement of ${esc(f.label)} — evidence against, under the conditions, cultivar and source stated below.` : `The database has no claim on a trait ${esc(f.label)} requires — not known, which is not the same as unsuitable.`} <span class="muted">No source lists the plant for this function either.</span></p>`;
  if (l.conflict) h += `<p class="warn small">Conflict: the documented use and a trait claim disagree — shown, not resolved. The use claim stays; the requirement check names the contrary claim.</p>`;
  { const n = (l.n_verified || 0) + (l.n_unverified || 0); const ai = aiLine(l.use_claims);
    h += `<h3 class="stand-h">Where the evidence stands</h3><dl class="facts3 standing"><div><dt>Relation</dt><dd>${l.drawn ? (l.status === 'candidate' ? 'inferred by trait: a candidate, not a recorded use' : 'recorded use, mapped to the function by the ontology') : 'none recorded: a gap, not “unsuitable”'}${l.conflict ? ' · in conflict with a trait claim' : ''}</dd></div><div><dt>Source claim</dt><dd>${l.use_claims?.length ? `${esc(l.via_use_labels.join(', '))} · ${[...new Set(l.use_claims.map(c => M.claim(c)?.source_id).filter(Boolean))].map(srcName).join(', ')}` : 'none: no source states this use'}</dd></div><div><dt>Human verification</dt><dd>${l.status === 'candidate' ? 'nothing to verify until a source records the use' : n ? `${l.verification === 'verified' ? '' : 'unverified · '}${l.n_verified || 0} of ${plural(n, 'use claim')} verified by a person` : 'no claim to verify'}</dd></div><div><dt>AI source check</dt><dd>${ai ? `${ai}: an assessment kept apart, never a verification` : 'none on a use claim'}</dd></div></dl>`; }
  { const c = M.claim((l.use_claims || [])[0]); if (c) h += `<blockquote class="keyclaim">${esc(c.text)}<cite>${srcName(c.source_id)}${c.place_label ? ` · ${esc(c.place_label)}` : ''}</cite></blockquote>`; }
  h += `<div class="next" role="group" aria-label="Next"><a href="${esc(PI.links.profile(l.species))}">Plant Profile</a>${arranged ? `<a href="${esc(PI.links.trace(l.species, { fn: l.function }))}" title="Follow this plant from its source to a bed in a design, with the engine's own evaluation">Trace this into a design</a>` : ''}</div>`;
  if (!arranged && l.drawn) h += `<p class="small muted">${esc(f.label)} is recorded only: the Studio's engine does not arrange plants for it, so there is no design to trace it into.</p>`;
  if (l.verification_note) h += `<p class="small faint">${esc(l.verification_note)}</p>`;
  let more = ruleHtml(l.rules);
  if (l.use_claims?.length) more += `<h3>Use claims <small>${l.use_claims.length}</small></h3>` + l.use_claims.map(claimHtml).join('');
  if (l.missing?.length) more += `<h3>Missing or contradicted</h3>` + l.missing.map(m => `<div class="reqrow"><div>${esc(m.strength)} ${esc(m.alternative_labels.join(' or '))}</div><div class="r ${esc(m.result)}">${esc(m.result)}</div></div>`).join('');
  more += reqHtml(l.requirements, l.verdicts);
  const evc = [...new Set((l.requirements || []).flatMap(r => [...r.evidence.map(x => x.claim), ...r.contrary.map(x => x.claim)]).filter(Boolean))];
  if (evc.length) more += `<details><summary>trait claims behind the check (${evc.length})</summary>${evc.map(claimHtml).join('')}</details>`;
  more += `<p class="small faint mono" style="margin-top:10px">${esc(l.id)} · kg: ${esc((l.underlying || []).join(' · '))}${l.xyz_edge ? ` · xyz: ${esc(l.xyz_edge)}` : ''}</p>`;
  h += `<details class="more" ${l.drawn ? '' : 'open'}><summary>See source &amp; rule</summary>${more}</details>` + rawHtml(l, 'this link');
  return h;
}
/** V4.2 — the Record Inspector of one table cell: each distinct value with its sources, its scope and its standing, in short rows.
 *  The claims themselves and the raw record are one disclosure further. Nothing is averaged or chosen. */
function attrHtml(a) {
  const M = S.M; const s = M.sp(a.species), f = M.FA.get(a.facet);
  let h = head(`${spLink(s.id)} <span class="arrow">·</span> ${esc(f.label)}`, `attribute cell · ${esc(M.GR.get(a.group).label)}${f.gate ? ' · checked against the site in Design' : ''}`, `${plural(a.n_values, 'value')} · ${plural(a.n_claims, 'claim')} · ${plural(a.n_sources, 'source')}`);
  if (a.disagreement.length) h += `<p class="small"><span class="pi-tag conflict">sources differ</span> Sources disagree: ${a.disagreement.map(d => esc(d.text.replace(/^Sources disagree on [^:]+:\s*/, ''))).join(' ')}</p>`;
  if (a.variation.length) h += `<p class="small"><span class="pi-tag to_confirm">varies by condition</span> ${a.variation.map(d => esc(d.text)).join(' ')}</p>`;
  if (!a.disagreement.length && !a.variation.length) h += `<p class="small muted">${a.n_values > 1 ? 'Several values are recorded and none contradicts another.' : 'One value is recorded.'}</p>`;
  if (a.facet === 'colour') { const fl = CX.flowerStatements(M, s); if (fl.length) h += `<h3 class="stand-h">Flowers, as each source states them <small>read from the same claims</small></h3><table class="cmp fst"><tr><th>source</th><th>flower colour</th><th>flowering months</th></tr>${fl.map(x => `<tr><td>${srcName(x.src)}${x.cultivar ? ` <small class="muted">cultivar ${esc(x.cultivar)}</small>` : ''}</td><td>${x.colours.length ? esc(x.colours.join(', ')) : '<span class="muted">not stated</span>'}</td><td>${x.months.length ? esc(x.months.map(m => CX.MONTH_NAMES[m - 1]).join(' ')) : '<span class="muted">no month named</span>'}</td></tr>`).join('')}</table>`; else h += `<p class="small"><b>Flowers: not recorded.</b> No claim of this plant names a flower colour or a flowering month.</p>`; }
  if (a.facet === 'height_class' || a.facet === 'spread_class') { const w = CX.sizeWords(M, a); if (w.st.length) h += `<h3 class="stand-h">${a.facet === 'height_class' ? 'Height' : 'Spread'}, as each source states it <small>nothing averaged</small></h3><ul class="small fsz">${w.each.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`; }
  h += `<h3 class="stand-h">Recorded values <small>each kept with its own claims</small></h3>`;
  for (const v of a.values) {
    const srcs = [...new Set(v.claims.map(c => M.claim(c)?.source_id).filter(Boolean))]; const places = [...new Set(v.claims.map(c => M.claim(c)?.place_label).filter(Boolean))];
    const scope = [v.conditions.length ? `when ${v.conditions.join(', ')}` : '', v.cultivars.length ? `cultivar ${v.cultivars.join(', ')}` : '', places.length ? places.join(', ') : ''].filter(Boolean).join(' · ');
    const nv = v.n_verified ?? v.claims.filter(c => M.claim(c)?.status === 'verified').length; const ai = aiLine(v.claims);
    h += `<div class="vrow"><div class="vl">${esc(v.label)}${M.CO.has(v.concept) ? ` <span class="link small" data-focus="concept=${esc(v.concept)}" title="Focus this value in the Network: which plants reach it, which functions require it">in the Network</span>` : ''}</div><dl class="facts3 standing"><div><dt>Source</dt><dd>${srcs.length ? srcs.map(srcName).join(', ') : v.entity ? 'the plant\'s entity record, not a sourced claim' : 'not stated'}</dd></div><div><dt>Scope</dt><dd>${esc(scope) || 'no condition or cultivar stated'}</dd></div><div><dt>Human verification</dt><dd>${v.claims.length ? `${nv ? '' : 'unverified · '}${nv} of ${plural(v.claims.length, 'claim')} verified by a person` : 'no claim to verify'}</dd></div><div><dt>AI source check</dt><dd>${ai ? `${ai}: an assessment, never a verification` : 'none'}</dd></div></dl>${v.numbers?.length ? `<p class="small mono muted">${v.numbers.map(n => esc(Object.entries(n).map(([k, x]) => `${k} ${x}`).join(' · '))).join(' ; ')}</p>` : ''}</div>`;
  }
  // with A and B set, the other plant's record of the same attribute stands beside this one
  { const other = S.a && S.b && (a.species === S.a || a.species === S.b) ? (a.species === S.a ? S.b : S.a) : null;
    if (other) { const o = M.attr(other, a.facet); h += `<h3>${tag(other === S.a ? 'A' : 'B')} <i class="sci">${esc(M.name(other))}</i> <small>the same attribute</small></h3>` + (o ? `<div class="row" data-inspect="attr=${esc(o.id)}"><div class="b">${esc(o.values.map(v => v.label).join(' · '))}<div class="meta">${plural(o.n_claims, 'claim')} · ${plural(o.n_sources, 'source')}${o.disagreement.length ? ' · sources differ' : ''} · open its record</div></div></div>` : `<p class="small"><b>Not recorded.</b> The snapshot holds no claim on ${esc(f.label)} for this plant; that is not a difference between the two plants.</p>`); } }
  h += `<div class="next" role="group" aria-label="Next"><a href="${esc(PI.links.profile(s.id))}">Plant Profile</a></div>`;
  let more = a.rule ? ruleHtml(a.rule) : '';
  for (const v of a.values) more += `<h3>${esc(v.label)} <small>${v.claims.length ? plural(v.claims.length, 'claim') : v.entity ? 'entity record' : ''} ${tag(v.status)}</small></h3>` + (v.claims.map(claimHtml).join('') || (v.entity ? `<p class="small muted">Read from the plant's entity record (identity_review), not from a sourced claim.</p>` : ''));
  more += `<p class="small faint mono" style="margin-top:10px">${esc(a.id)}${a.underlying.xyz_edges.length ? ` · xyz: ${esc(a.underlying.xyz_edges.join(' · '))}` : ''}</p>`;
  h += `<details class="more"><summary>See the claims and sources (${a.n_claims})</summary>${more}</details>` + rawHtml(a, 'this cell');
  return h;
}
/** a cell with no record: said as that, and as nothing more */
function nrHtml(id) {
  const M = S.M; const [sid, fid] = id.split('~'); const s = M.sp(sid), f = M.FA.get(fid); const have = M.species.filter(x => M.attr(x.id, fid));
  return head(`${spLink(s.id)} <span class="arrow">·</span> ${esc(f.label)}`, `attribute cell · ${esc(M.GR.get(f.group).label)}`, `<span class="pi-tag unknown">not recorded</span>`) +
    `<p>The snapshot holds no claim on ${esc(f.label.toLowerCase())} for <i class="sci">${esc(s.scientific_name)}</i>. Not recorded means no source was read for it yet: it does not mean the plant lacks the trait, and it is not a contradiction.</p><p class="small muted">${esc(f.definition || '')}</p>` +
    `<h3>Recorded for <small>${have.length} of ${M.species.length} plants</small></h3>` + (have.map(x => { const a = M.attr(x.id, fid); return `<div class="row" data-inspect="attr=${esc(a.id)}"><div class="b"><i class="sci">${esc(x.scientific_name)}</i><div class="meta">${esc(a.values.map(v => v.label).join(' · '))}</div></div></div>`; }).join('') || '<p class="small faint">no plant</p>') +
    `<div class="next" role="group" aria-label="Next"><a href="${esc(PI.links.profile(s.id))}">Plant Profile</a></div>`;
}
function conceptLinkHtml(e) {
  const M = S.M; const s = M.sp(e.species), c = M.co(e.concept);
  let h = head(`${spLink(s.id)} <span class="arrow">${esc(human(e.rel))}</span> <span class="link" data-focus="concept=${esc(c.id)}">${esc(c.label)}</span>`, `species → concept · ${esc(c.facet_label || c.facet)}`, `${tag(e.status)} ${verTag(e)}`);
  if (e.rule) h += ruleHtml(e.rule);
  if (e.entity) h += `<p class="small muted">Recorded in the plant's entity record, not in a sourced claim.</p>`;
  if (e.conditions.length) h += `<p class="small muted">stated conditions: ${esc(e.conditions.join(', '))}</p>`;
  if (e.cultivars.length) h += `<p class="small muted">cultivar-level claims: ${esc(e.cultivars.join(', '))}</p>`;
  h += `<h3>Claims <small>${e.claims.length} · ${plural(e.sources.length, 'source')}</small></h3>` + (e.claims.map(claimHtml).join('') || '<p class="faint small">none (entity record)</p>');
  const a = M.attr(s.id, c.facet); if (a) h += `<p class="small"><span class="link" data-inspect="attr=${esc(a.id)}">every value of ${esc(c.facet_label || c.facet)} for this plant (${a.n_values})</span></p>`;
  h += `<p class="small faint mono" style="margin-top:10px">${esc(e.id)} · kg: ${esc(e.underlying.slice(0, 6).join(' · '))}${e.underlying.length > 6 ? ` · +${e.underlying.length - 6}` : ''}</p>`;
  return h;
}
function relationHtml(r, full = false) {
  const M = S.M;
  let h = full ? head(`${spLink(r.a)} <span class="arrow">${esc(human(r.type))}${r.direction ? ` (${esc(r.direction)})` : ''}</span> ${spLink(r.b)}`, 'plant-to-plant record · relations.json', `${tag(r.kg_status)} ${tag(r.status)} ${r.placeholder ? tag('model placeholder') : ''}`) : '';
  h += `<div class="claim"><div class="txt">${esc(r.text || '')}</div><div class="meta"><b>source</b> ${sourceLine(r.source_id || '')} · ${esc(r.source_type)} · conf ${esc(r.confidence)}${r.context ? `<br><b>context</b> ${esc(r.context)}` : ''}${r.rule ? `<br><b>rule</b> ${esc(r.rule)}` : ''}${r.note ? `<br>${esc(r.note)}` : ''}${r.placeholder && r.live ? `<br><span class="warn">a model placeholder: a candidate to be verified against ${esc((r.verify_against || []).join(', ') || 'a source')}; it is not evidence</span>` : ''}${!r.live ? `<br><span class="warn">retired ${esc(r.retired_at || '')}${r.retired_by ? ` by ${esc(r.retired_by)}` : ''}${r.retired_reason ? ` — ${esc(r.retired_reason)}` : ''} · history, never drawn</span>` : ''}${r.derived_from?.length ? `<br><b>derived from</b> ${r.derived_from.map(x => `<span class="mono">${esc(x)}</span>`).join(', ')}` : ''}${r.supporting_claims?.length ? `<br><b>supporting claims</b> ${r.supporting_claims.map(x => `<span class="mono">${esc(x)}</span>`).join(', ')}` : ''}${r.citation ? `<br><b>citation</b> ${esc(r.citation)}` : ''}<br><span class="faint">${esc(r.id)} · ${esc(r.recorded_at || '')}${r.recorded_by ? ` · ${esc(r.recorded_by)}` : ''}</span></div></div>`;
  if (full) { const cl = [...(r.derived_from || []), ...(r.supporting_claims || [])].filter(c => M.claim(c)); if (cl.length) h += `<details><summary>claims named (${cl.length})</summary>${cl.map(claimHtml).join('')}</details>`; h += `<p class="note">Direct plant-to-plant knowledge comes only from records like this one. Co-listing in a survey means a designer thought of the two together — not that they are compatible. Shared traits connect plants only through the trait.</p>`; }
  return h;
}
function speciesHtml(s) {
  const M = S.M; const links = M.linksOf(s.id); const rels = M.relationsOf(s.id), retired = M.relationsOf(s.id, false).filter(r => !r.live);
  let h = head(`<a class="sp" href="${esc(PI.links.profile(s.id))}" title="open the Plant Profile in the Plant Library"><i class="sci">${esc(s.scientific_name)}</i></a>`, `species · ${esc(s.growth_form_label || '')}${s.growth_form_status && s.growth_form_status !== 'supported' ? ` (growth form ${esc(human(s.growth_form_status))})` : ''}`, `${esc((s.common_names || []).join(' · '))} · ${esc(s.family)} · ${esc(human(s.origin_status))} · ${esc(s.kpu_plant_type)} · ${s.claims.live} live claims (${s.claims.verified} verified, ${s.claims.retired} retired)`);
  h += summaryHtml('species', s.id);
  h += PC.miniHtml(M.d, s.id, S.imgs, { here: 'explorer', extra: `<a href="${esc(PI.links.neural(s.id))}">3D network</a>` });
  h += `<p class="small">Mark for a comparison: <span class="link" data-ab="a" data-id="${esc(s.id)}">${S.a === s.id ? 'A ✓' : 'set as A'}</span> · <span class="link" data-ab="b" data-id="${esc(s.id)}">${S.b === s.id ? 'B ✓' : 'set as B'}</span>${S.a && S.b ? ` · <span class="link" data-view="compare">open the comparison</span>` : ''}</p>`;
  const gapWhy = l => (l.missing || []).map(m => `${esc(m.strength)} ${esc(m.alternative_labels.join(' or '))} ${esc(m.result)}`).join('; ') || 'open the requirement check';
  h += `<h3>Spatial functions <small>${links.filter(l => l.drawn).length} linked · ${links.filter(l => !l.drawn).length} without a link</small></h3>` + links.map(l => `<div class="row" data-inspect="link=${esc(l.id)}"><div class="b">${esc(M.name(l.function))} ${stTag(l)} ${l.drawn ? verTag(l) : ''} ${l.conflict ? tag('conflict') : ''}<div class="meta">${l.drawn ? (l.via_use_labels.length ? `use: ${esc(l.via_use_labels.join(', '))} (${esc(l.use_sources.join(', '))})` : 'inferred from traits (KG-R4), no source states this use') : gapWhy(l)}</div></div></div>`).join('');
  h += `<h3>Growth form <small>${s.growth_form_status === 'supported' ? 'read from the sources' : esc(human(s.growth_form_status || 'not established'))}</small></h3><p class="small">${esc(s.growth_form_label || 'unknown')}, by rule M29: ${Object.entries(s.growth_form_evidence || {}).map(([k, v]) => `<b>${esc(k)}</b> ${esc(v)}`).join(' · ') || 'no evidence listed'}</p>`;
  h += `<h3>Plant-to-plant records <small>${rels.length} live · ${retired.length} retired</small></h3>` + (rels.length ? rels.map(r => `<div class="row" data-inspect="relation=${esc(r.id)}"><div class="b">${esc(human(r.type))} <i class="sci">${esc(M.name(r.a === s.id ? r.b : r.a))}</i> ${tag(r.kg_status)} ${tag(r.status)}${r.placeholder ? ` ${tag('model placeholder')}` : ''}<div class="meta">${esc(M.source(r.source_id).label)}</div></div></div>`).join('') : '<p class="faint small">none live in relations.json</p>');
  if (retired.length) h += `<details><summary>retired records (${retired.length}) — history, not evidence</summary>${retired.map(r => `<div class="row" data-inspect="relation=${esc(r.id)}"><div class="b">${esc(human(r.type))} <i class="sci">${esc(M.name(r.a === s.id ? r.b : r.a))}</i> ${tag('retired')}<div class="meta">${esc(r.retired_reason || r.note || '')}</div></div></div>`).join('')}</details>`;
  const cells = M.attrs.filter(a => a.species === s.id); const nr = M.facets.filter(f => !M.attr(s.id, f.id));
  h += `<h3>Attributes <small>${cells.length} facets recorded · ${nr.length} not recorded · ${cells.filter(a => a.disagreement.length).length} with disagreement</small></h3><p class="small">${cells.map(a => `<span class="chip" data-inspect="attr=${esc(a.id)}">${esc(M.FA.get(a.facet).label)}<small>${a.n_values}</small>${a.disagreement.length ? '<small class="warn">disagree</small>' : ''}${a.verification === 'verified' ? '<small style="color:var(--olive-deep)">✓</small>' : ''}</span>`).join('')}</p>`;
  if (nr.length) h += `<p class="small faint">not recorded: ${esc(nr.map(f => f.label).join(', '))}</p>`;
  h += `<p class="note">Plants sharing a concept are connected only through that concept. A shared trait is never read as a companion relation; a function link is never a planting verdict.</p><p class="small faint mono">${esc(s.file)} · ${esc(s.id)}</p>`;
  return h;
}
function functionHtml(f) {
  const M = S.M; const links = M.linksTo(f.id);
  let h = head(esc(f.label), `spatial function · stands for ${esc(f.underlying_labels.join(' + '))}${PI.TRACE_FUNCTIONS.includes(f.id) ? ' · arranged in Design' : ' · recorded only'}`, esc(f.definition));
  h += summaryHtml('function', f.id);
  h += `<h3>Requires <small>literature · ${f.requirements.length}</small></h3>` + f.requirements.map(r => `<div class="row static"><div class="b">${esc(r.strength)}: ${r.alternative_labels.map((l, i) => M.CO.has(r.alternatives[i]) && !M.co(r.alternatives[i]).no_plant_reaches ? `<span class="link" data-focus="concept=${esc(r.alternatives[i])}">${esc(l)}</span>` : `<span class="muted">${esc(l)}</span>`).join(' <span class="faint">or</span> ')}${r.to_confirm ? ` ${tag('to confirm')}` : ''}${r.no_plant_reaches ? ' <span class="faint small">(no plant reaches any alternative)</span>' : ''}<div class="meta">${esc(r.literature || '')}${r.note ? ` — ${esc(r.note)}` : ''}</div></div></div>`).join('');
  const order = { derived: 0, documented: 0, candidate: 1, unknown: 2 };
  h += `<h3>Species <small>${links.filter(l => l.drawn).length} linked · ${links.filter(l => !l.drawn).length} without a link, listed as gaps</small></h3>` + links.slice().sort((a, b) => order[a.status] - order[b.status] || M.name(a.species).localeCompare(M.name(b.species))).map(l => `<div class="row" data-inspect="link=${esc(l.id)}"><div class="b"><i class="sci">${esc(M.name(l.species))}</i> ${stTag(l)} ${l.drawn ? verTag(l) : ''} ${l.conflict ? tag('conflict') : ''}<div class="meta">${l.drawn ? (l.via_use_labels.length ? `use: ${esc(l.via_use_labels.join(', '))} (${esc(l.use_sources.join(', '))})` : 'all required traits met (KG-R4); no source states this use') + ' · ' + esc(Object.values(l.verdicts || {}).map(verdictWord).join(' / ')) : (l.missing || []).map(m => `${esc(m.strength)} ${esc(m.alternative_labels.join(' or '))} ${esc(m.result)}`).join('; ')}</div></div></div>`).join('');
  h += `<p class="small faint">term: ${esc(f.source_of_term || '')}</p><p class="note">A function is a potential spatial role, not a plant attribute: the link depends on several traits, planting configuration and context. Blank is not unsuitable; ‘contradicted’ names the claim that contradicts.</p>`;
  return h;
}
function conceptHtml(c) {
  const M = S.M; const es = M.clinksOf.get(c.id) || [];
  let h = head(esc(c.label), `attribute value · ${esc(c.facet_label || c.facet)} · ${esc(M.GR.get(c.group)?.label || '')}`, esc(c.definition || ''));
  h += summaryHtml('concept', c.id);
  h += `<h3>Species <small>${es.length}</small></h3>` + es.map(e => `<div class="row" data-inspect="concept_link=${esc(e.id)}"><div class="b"><i class="sci">${esc(M.name(e.species))}</i> ${tag(e.status)} ${verTag(e)}<div class="meta">${plural(e.claims.length, 'claim')} · ${esc(e.sources.join(', '))}${e.conditions.length ? ` · when ${esc(e.conditions.join(', '))}` : ''}</div></div></div>`).join('');
  if (c.required_by?.length) h += `<h3>Required by</h3><p>${c.required_by.map(fid => `<span class="chip" data-focus="function=${esc(fid)}">${esc(M.name(fid))}</span>`).join('')}</p>`;
  h += `<p class="note">An indirect connection: the plants listed reach the same concept, which says nothing about planting them together.</p>`;
  return h;
}

// ------------------------------------------------------------------ A / B comparison: four sections, never conflated
function renderCompare() {
  const M = S.M;
  const opts = sel => `<option value="">choose a species</option>` + M.species.map(s => `<option value="${esc(s.id)}" ${sel === s.id ? 'selected' : ''}>${esc(s.scientific_name)}</option>`).join('');
  $('#chead').innerHTML = `<h2>Compare two plants</h2><label>${tag('A')}<select id="sel-a" data-pick="a" aria-label="Plant A">${opts(S.a)}</select></label><label>${tag('B')}<select id="sel-b" data-pick="b" aria-label="Plant B">${opts(S.b)}</select></label><button data-act="swap" ${S.a && S.b ? '' : 'disabled'} title="Swap A and B" aria-label="Swap A and B" style="padding:6px 8px">${IC.swap}</button><div class="right"><button data-act="pair" ${S.a && S.b ? '' : 'disabled'} title="Show the two plants, what both reach and any direct record as a graph" style="display:inline-flex;gap:6px;align-items:center">${IC.graph}The pair as a graph</button><button data-view="graph" title="Back to the Network; A and B stay marked there, in the matrix and in the table" style="display:inline-flex;gap:6px;align-items:center">${IC.back}Back to the Network</button></div>`;
  $('#cbody').innerHTML = compareHtml(); $('#cbody').scrollTop = 0;
}
function compareHtml() {
  const M = S.M; const V = M.vocab.pair_sections;
  if (!(S.a && S.b)) return `<div class="empty"><h2>Two plants, four separate questions</h2><p>Choose ${S.a || S.b ? 'the second species' : 'two species'} above. The comparison never merges these into one verdict about planting the two together:</p><dl><div><dt>Shared attributes</dt><dd>${esc(V.shared_attributes)}</dd></div><div><dt>Direct recorded relationships</dt><dd>${esc(V.direct_relations)}</dd></div><div><dt>Potential spatial complementarity</dt><dd>${esc(V.spatial_complementarity)}</dd></div><div><dt>Evidence and unknowns</dt><dd>${esc(V.evidence_unknowns)}</dd></div></dl></div>`;
  const a = M.sp(S.a), b = M.sp(S.b), p = M.pair(S.a, S.b); const swap = p.a !== S.a;   // the projection stores the pair once; A/B may be the other way round
  const A = { id: S.a, only: swap ? 'only_b' : 'only_a', rec: swap ? 'b_recorded' : 'a_recorded', dis: swap ? 'b_disagreement' : 'a_disagreement', fn: swap ? 'b_function' : 'a_function', st: swap ? 'b_status' : 'a_status', cf: swap ? 'b_conflict' : 'a_conflict', fns: swap ? 'b_functions' : 'a_functions', unk: swap ? 'b_unknown' : 'a_unknown' };
  const B = { id: S.b, only: swap ? 'only_a' : 'only_b', rec: swap ? 'a_recorded' : 'b_recorded', dis: swap ? 'a_disagreement' : 'b_disagreement', fn: swap ? 'a_function' : 'b_function', st: swap ? 'a_status' : 'b_status', cf: swap ? 'a_conflict' : 'b_conflict', fns: swap ? 'a_functions' : 'b_functions', unk: swap ? 'a_unknown' : 'b_unknown' };
  let h = `<div class="cmp-h"><h2>${tag('A')} ${spLink(a.id)} <span class="amp">and</span> ${tag('B')} ${spLink(b.id)}</h2><p>${esc(a.growth_form_label)} · ${esc(b.growth_form_label)} — ${p.n_shared} shared knowledge nodes in kg.json · ${plural(p.direct_relations.length, 'live direct record')} · ${p.retired_relations.length} retired</p></div><div class="cmp-grid"><div>`;
  // shared attributes
  const rows = p.attributes.filter(r => S.groups.has(r.group));
  const nShared = rows.filter(r => r.shared.length).length, nDiff = rows.filter(r => r.only_a.length || r.only_b.length).length, nOne = rows.filter(r => !(r.a_recorded && r.b_recorded)).length;
  h += `<section class="csec" data-sec="shared_attributes"><h3>Shared attributes <small>${nShared} facets with a shared value · ${nDiff} with differing values · ${nOne} recorded for one plant only</small></h3><p class="small muted">${esc(V.shared_attributes)}</p>`;
  h += `<table class="cmp"><tr><th>facet</th><th>A</th><th>B</th></tr>` + rows.map(r => { const cell = (side, only) => !r[side.rec] ? `<td class="nr">not recorded</td>` : `<td>${r.shared.map(c => `<span class="v shared">${esc(r.labels[c])}</span>`).join('')}${r[only].map(c => `<span class="v">${esc(r.labels[c])}</span>`).join('')}${r[side.dis] ? ' <span class="warn mono">disagree</span>' : ''}</td>`; const ca = M.attr(a.id, r.facet), cb = M.attr(b.id, r.facet); return `<tr class="f"><td title="${esc(M.GR.get(r.group).label)}">${esc(r.label)}${ca ? ` <span class="link mono" data-inspect="attr=${esc(ca.id)}" title="the claims behind A's value">A</span>` : ''}${cb ? ` <span class="link mono" data-inspect="attr=${esc(cb.id)}" title="the claims behind B's value">B</span>` : ''}</td>${cell(A, A.only)}${cell(B, B.only)}</tr>`; }).join('') + `</table><p class="small faint">Bold olive = the same concept reached by both plants' claims. The knowledge groups shown follow the attribute table's checkboxes.</p></section></div><div>`;
  // direct relations
  h += `<section class="csec" data-sec="direct_relations"><h3>Direct recorded relationships <small>${p.direct_relations.length} live · ${p.retired_relations.length} retired</small></h3><p class="small muted">${esc(V.direct_relations)}</p>`;
  h += p.direct_relations.length ? p.direct_relations.map(id => { const r = M.RE.get(id); return `<div class="row" data-inspect="relation=${esc(id)}"><div class="b">${esc(human(r.type))} ${r.direction ? `<span class="faint">(${esc(r.direction)})</span>` : ''} ${tag(r.kg_status)} ${tag(r.status)} ${r.placeholder ? tag('model placeholder') : ''}<div class="meta">${esc(M.source(r.source_id).label)} · ${esc((r.text || '').slice(0, 140))}${(r.text || '').length > 140 ? '…' : ''}</div></div></div>`; }).join('') : `<p class="small"><b>None recorded.</b> relations.json holds no live record for this pair — an honest absence, not evidence of incompatibility.</p>`;
  if (p.retired_relations.length) h += `<details><summary>retired records (${p.retired_relations.length}) — history, not evidence</summary>${p.retired_relations.map(id => { const r = M.RE.get(id); return `<div class="row" data-inspect="relation=${esc(id)}"><div class="b">${esc(human(r.type))} ${tag('retired')} <span class="faint small">${esc(r.source_id)}</span><div class="meta">${esc(r.retired_reason || r.note || '')}</div></div></div>`; }).join('')}</details>`;
  h += `</section>`;
  // spatial complementarity
  const c = p.complementarity; const combos = c.combinations.slice().sort((x, y) => (y.different_layer - x.different_layer) || (x.a_function + x.b_function).localeCompare(y.a_function + y.b_function));
  h += `<section class="csec" data-sec="spatial_complementarity"><h3>Potential spatial complementarity <small>${plural(combos.length, 'combination')} · ${plural(c.same_function.length, 'shared function')}</small></h3><p class="small muted">${esc(V.spatial_complementarity)}</p>`;
  const fnChips = side => c[side.fns].length ? c[side.fns].map(fid => { const l = M.link(side.id, fid); return `<span class="chip" data-inspect="link=${esc(l.id)}">${esc(M.name(fid))}<small>${esc(l.status)}${l.conflict ? ' · conflict' : ''}</small></span>`; }).join('') : '<span class="faint">no function linked</span>';
  { const cell = id => fid => { const l = M.link(id, fid); return `<td data-inspect="link=${esc(l.id)}" class="fe ${l.drawn ? '' : 'nr'}" title="Open the evidence of this cell">${esc(cellWord(l))}${l.conflict ? ' <span class="warn mono">conflict</span>' : ''}${l.verification === 'verified' ? ' <span class="ver">✓</span>' : ''}</td>`; };
    h += `<table class="cmp fev"><tr><th>function evidence</th><th>A</th><th>B</th></tr>${M.functions.map(f => `<tr><td>${esc(f.label)}</td>${cell(A.id)(f.id)}${cell(B.id)(f.id)}</tr>`).join('')}</table><p class="small faint">Each cell is one plant's own record for the function. Two cells in a row say nothing about the two plants together.</p>`; }
  h += `<p class="small">${tag('A')} ${fnChips(A)}<br>${tag('B')} ${fnChips(B)}</p>`;
  h += combos.length ? combos.map(x => `<div class="combo"><span class="fn a">A · ${esc(M.name(x[A.fn]))}</span><span class="plus">with</span><span class="fn b">B · ${esc(M.name(x[B.fn]))}</span><span class="small faint">${x.different_layer ? 'different layers — a layering hypothesis' : 'same layer — an arrangement hypothesis'}${x[A.st] === 'candidate' || x[B.st] === 'candidate' ? ' · rests on a candidate link' : ''}${x[A.cf] || x[B.cf] ? ' · a link carries a conflict' : ''}</span></div>`).join('') : `<p class="small faint">No distinct function combination: the plants' live links allow no layering hypothesis.</p>`;
  if (c.same_function.length) h += `<p class="small muted">Both are linked to ${esc(c.same_function.map(f => M.name(f)).join(', '))} — alternatives for the same role, not a complement.</p>`;
  h += `<p class="note">${esc(c.note)}. Site, spacing and the plants' behaviour with each other are not in these links.</p></section>`;
  // evidence / unknowns
  const claimsOf = id => Object.values(M.claims).filter(x => x.plant === M.sp(id).slug && x.status !== 'retired');
  const ca = claimsOf(a.id), cb = claimsOf(b.id); const srcs = id => [...new Set(claimsOf(id).map(x => x.source_id))];
  const nrA = M.facets.filter(f => !M.attr(a.id, f.id)).map(f => f.label), nrB = M.facets.filter(f => !M.attr(b.id, f.id)).map(f => f.label);
  const chk = cl => { const n = {}; for (const x of cl) n[x.evidence_check] = (n[x.evidence_check] || 0) + 1; return Object.entries(n).map(([k, v]) => `${esc(human(k))} ${v}`).join(' · '); };
  const fnBy = (id, test) => M.linksOf(id).filter(test).map(l => `<span class="link" data-inspect="link=${esc(l.id)}">${esc(M.name(l.function))}</span>`).join(', ') || '—';
  const behaviour = M.relationsBetween(a.id, b.id).some(r => r.type === 'competes' || r.type === 'companion' || r.type === 'co_occurs_with');
  h += `<section class="csec" data-sec="evidence_unknowns"><h3>Evidence and unknowns</h3><p class="small muted">${esc(V.evidence_unknowns)}</p>`;
  h += `<table class="cmp"><tr><th></th><th>A</th><th>B</th></tr><tr><td>claims cited here</td><td>${ca.length} (${ca.filter(x => x.status === 'verified').length} verified)</td><td>${cb.length} (${cb.filter(x => x.status === 'verified').length} verified)</td></tr><tr><td>sources</td><td class="small">${srcs(a.id).map(sourceLine).join('<br>')}</td><td class="small">${srcs(b.id).map(sourceLine).join('<br>')}</td></tr><tr><td>AI evidence checks</td><td class="small">${chk(ca)}</td><td class="small">${chk(cb)}</td></tr><tr class="sep"><th colspan="3">Unknown: nothing recorded</th></tr><tr><td>functions with evidence missing</td><td class="small">${fnBy(A.id, l => !l.drawn && l.verdict !== 'contradicted by traits')}</td><td class="small">${fnBy(B.id, l => !l.drawn && l.verdict !== 'contradicted by traits')}</td></tr><tr><td>facets not recorded</td><td class="small">${esc(nrA.join(', ') || '—')}</td><td class="small">${esc(nrB.join(', ') || '—')}</td></tr><tr class="sep"><th colspan="3">In conflict: records that disagree</th></tr><tr><td>functions contradicted by a recorded trait</td><td class="small">${fnBy(A.id, l => l.verdict === 'contradicted by traits')}</td><td class="small">${fnBy(B.id, l => l.verdict === 'contradicted by traits')}</td></tr><tr><td>recorded use in conflict with a trait claim</td><td class="small">${fnBy(A.id, l => l.conflict)}</td><td class="small">${fnBy(B.id, l => l.conflict)}</td></tr><tr><td>attribute disagreements</td><td class="small">${M.attrs.filter(x => x.species === a.id && x.disagreement.length).map(x => `<span class="link" data-inspect="attr=${esc(x.id)}">${esc(M.FA.get(x.facet).label)}</span>`).join(', ') || '—'}</td><td class="small">${M.attrs.filter(x => x.species === b.id && x.disagreement.length).map(x => `<span class="link" data-inspect="attr=${esc(x.id)}">${esc(M.FA.get(x.facet).label)}</span>`).join(', ') || '—'}</td></tr></table>`;
  h += `<p class="small"><b>How the two plants behave with each other:</b> ${behaviour ? 'see the direct record above — the only place such a statement can come from' : 'no record. Nothing biological is inferred from shared attributes or from complementary functions'}.</p><p class="small faint">Human review decisions on these claims: none recorded in this projection (the Review Workbench keeps them privately; nothing is verified by the AI).</p></section></div></div>`;
  return h;
}
