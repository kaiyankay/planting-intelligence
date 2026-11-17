// Planting Intelligence · V4.1 brand-type trial page (2026-11-16). Compares the V4 type system with three variants that use Kay's own
// typeface ("nct127") on the real pages, side by side, at 1440×900 and 1280×800. It decides nothing: the V4 system stays the default
// until Kay confirms a variant. What each variant changes is in platform/css/type-trial.css; the switch is PI.typeTrial().
import * as PI from './platform.js';

const $ = (s, r = document) => r.querySelector(s); const esc = PI.esc;
// Read from the font file itself (fontTools, 2026-11-16) — not from its appearance. Update if the file is replaced.
const FACTS = {
  family: 'nct127', style: 'Regular', weight: 500, glyphs: 465, chars: 352, upm: 1000, cap: 700, xh: 500,
  scripts: 'Basic Latin, Latin-1, Latin Extended-A, common punctuation, fi/fl ligatures', features: 'kern (GPOS)',
  file: 'platform/fonts/nct127-Regular.woff2', bytes: 17448, source_bytes: 53496,
  lacks: ['→'],   // of the characters the site sets in display type
  meta: 'The file names no designer, copyright or licence, and its embedding flag (OS/2 fsType) reads “Preview & Print”. It is used here on Kay’s statement that the typeface is her own design and on her permission for this website; the flag and every other table are left as she made them.',
};
const VARIANTS = [
  ['a', 'A', 'Wordmark only', 'The name in the top bar is set in the trial face. Every heading stays Bricolage Grotesque.'],
  ['b', 'B', 'Wordmark + Imagine headline', 'A, plus the one large headline on the first page of Design.'],
  ['c', 'C', 'Wordmark + main page titles', 'B, plus the main title of each destination: Plants, a plant profile, Knowledge, the About pages. Section, panel and card headings stay Bricolage Grotesque.'],
];
const PAGES = [
  ['imagine', 'Imagine', () => PI.routes.design, 'fresh=1'],
  ['plants', 'Plants', () => PI.routes.plants, ''],
  ['knowledge', 'Knowledge', () => PI.routes.knowledge, ''],
  ['about', 'About', () => PI.routes.about, ''],
  ['method', 'Research & Method', () => PI.routes.method, ''],
];
const SIZES = [[1440, 900], [1280, 800]];
const state = { v: 'b', p: 'imagine', s: 0 };
try { const q = new URLSearchParams(location.hash.slice(1)); if (VARIANTS.some(x => x[0] === q.get('v'))) state.v = q.get('v'); if (PAGES.some(x => x[0] === q.get('p'))) state.p = q.get('p'); if (q.get('s') === '1280') state.s = 1; } catch { /* default */ }

const urlOf = (page, type) => { const [, , base, extra] = PAGES.find(x => x[0] === page); const u = new URL(base()); u.searchParams.set('type', type); for (const [k, v] of new URLSearchParams(extra)) u.searchParams.set(k, v); return u.href; };
const seg = (name, items, cur) => `<div class="tt-seg" role="group" aria-label="${name}">${items.map(([k, l]) => `<button type="button" data-${name}="${k}" aria-pressed="${String(k) === String(cur)}">${esc(l)}</button>`).join('')}</div>`;

function frames() {
  const [w, h] = SIZES[state.s]; const v = VARIANTS.find(x => x[0] === state.v);
  const one = (type, label, note) => `<figure class="tt-frame"><figcaption><b>${esc(label)}</b><span>${esc(note)}</span><a href="${urlOf(state.p, type)}" target="_blank" rel="noopener">Open this page</a></figcaption>
    <div class="tt-port" style="--w:${w};--h:${h}"><iframe title="${esc(label)} at ${w}×${h}" src="${urlOf(state.p, type)}" width="${w}" height="${h}" loading="lazy" tabindex="-1"></iframe></div></figure>`;
  return `<div class="tt-pair">${one('v4', 'V4 as published', 'Bricolage Grotesque · DM Sans · DM Mono')}${one(v[0], `Variant ${v[1]}`, v[2])}</div>`;
}
function compare() {
  return `<div class="tt-controls">${seg('v', VARIANTS.map(x => [x[0], `${x[1]} · ${x[2]}`]), state.v)}${seg('p', PAGES.map(x => [x[0], x[1]]), state.p)}${seg('s', SIZES.map((x, i) => [i, `${x[0]}×${x[1]}`]), state.s)}</div>
  <p class="ab-note">${esc(VARIANTS.find(x => x[0] === state.v)[3])} Both frames are the live pages of this build at the chosen window size, scaled to fit; they scroll and respond.</p>${frames()}`;
}
const sci = s => `<i class="ab-sci">${esc(s)}</i>`;
function specimen(d) {
  const sp = (d?.species || []).slice().sort((x, y) => y.scientific_name.length - x.scientific_name.length); const names = sp.slice(0, 3).map(x => x.scientific_name); const common = sp[0]?.common_names?.[0] || 'A plant name'; const rec = `${sp[0]?.slug || 'species'}:mature_spread`;
  const titles = ['Imagine your garden.', 'Plants, not records.', 'Knowledge', 'What the engine actually computes.', 'Research & Method', 'Contribute & Future', 'Why this plant here?'];
  return `<div class="tt-spec">
    <div class="tt-row"><span class="tt-k">Wordmark</span><div><p class="tt-wm" style="font-size:17px">Planting Intelligence</p><p class="tt-wm" style="font-size:28px">Planting Intelligence</p><p class="tt-wm" style="font-size:56px">Planting Intelligence</p></div>
      <div class="tt-v4"><p class="tt-wm0" style="font-size:18px">Planting Intelligence</p><p class="tt-wm0" style="font-size:28px">Planting Intelligence</p><p class="tt-wm0" style="font-size:56px">Planting Intelligence</p></div></div>
    <div class="tt-row"><span class="tt-k">Titles</span><div>${titles.map(t => `<p class="tt-t">${esc(t)}</p>`).join('')}</div><div class="tt-v4">${titles.map(t => `<p class="tt-t0">${esc(t)}</p>`).join('')}</div></div>
    <div class="tt-row"><span class="tt-k">Beside names and records</span><div><p class="tt-t">${esc(common)}</p><p>${names.map(sci).join(' · ')}</p><p class="ab-id">${esc(rec)} · 4.39 of 6 m · v-1144d</p></div>
      <div class="tt-v4"><p class="tt-t0">${esc(common)}</p><p>${names.map(sci).join(' · ')}</p><p class="ab-id">${esc(rec)} · 4.39 of 6 m · v-1144d</p></div></div>
    <div class="tt-row"><span class="tt-k">A character it lacks</span><div><p class="tt-t">Value → Function → Evaluation</p><p class="ab-note">The arrow is not in the face; the browser takes it from Bricolage Grotesque, the next family in the stack. No glyph is redrawn or synthesised.</p></div>
      <div class="tt-v4"><p class="tt-t0">Value → Function → Evaluation</p></div></div>
    <div class="tt-row"><span class="tt-k">Character set</span><div class="tt-abc"><p>ABCDEFGHIJKLMNOPQRSTUVWXYZ</p><p>abcdefghijklmnopqrstuvwxyz</p><p>0123456789 &amp; ? ! · — ’ “ ” ( ) / × é ü ñ ø</p></div><div class="tt-v4"></div></div>
  </div>`;
}
function facts(status) {
  const kb = n => `${(n / 1024).toFixed(1)} KB`; const f = FACTS;
  return `<dl class="tt-facts"><dt>Family name in the file</dt><dd><span class="ab-id">${f.family}</span> · ${f.style} · one style, no italic</dd>
    <dt>Weight</dt><dd>usWeightClass ${f.weight}. The face is declared for every weight so that a browser never thickens it artificially.</dd>
    <dt>Coverage</dt><dd>${f.glyphs} glyphs, ${f.chars} characters: ${esc(f.scripts)}. Not in the face, of what the site sets large: ${f.lacks.map(c => `<span class="ab-id">${esc(c)}</span>`).join(' ')}.</dd>
    <dt>Metrics</dt><dd>${f.upm} units per em · cap height ${f.cap} · x-height ${f.xh} · ${esc(f.features)}</dd>
    <dt>Web format</dt><dd><span class="ab-id">${esc(f.file)}</span> · WOFF2, ${kb(f.bytes)} (from a ${kb(f.source_bytes)} TTF) · a lossless re-wrap: outlines, widths and kerning compared glyph by glyph with the original</dd>
    <dt>Loading on this page</dt><dd class="tt-status" data-ok="${status.ok}">${esc(status.text)}</dd>
    <dt>Provenance</dt><dd>${esc(f.meta)}</dd></dl>`;
}
async function fontStatus() {
  try {
    const got = await document.fonts.load(`500 40px "${FACTS.family}"`, 'Planting Intelligence'); const ok = got.length > 0 && document.fonts.check(`500 40px "${FACTS.family}"`);
    return ok ? { ok: true, text: `Loaded from ${FACTS.file} (served by this site, not by the visitor’s computer).` } : { ok: false, text: 'Not loaded: the trial falls back to Bricolage Grotesque. What you see below is not the trial face.' };
  } catch (e) { return { ok: false, text: `Could not check: ${e.message}` }; }
}

function wire() {
  $('#tt-compare').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    if (d.v !== undefined) state.v = d.v; else if (d.p !== undefined) state.p = d.p; else if (d.s !== undefined) state.s = +d.s; else return;
    history.replaceState(null, '', `#v=${state.v}&p=${state.p}&s=${SIZES[state.s][0]}`); $('#tt-compare').innerHTML = compare(); fit();
    $(`#tt-compare [data-${d.v !== undefined ? 'v' : d.p !== undefined ? 'p' : 's'}][aria-pressed="true"]`)?.focus();
  });
  addEventListener('resize', fit); fit();
}
function fit() { for (const p of document.querySelectorAll('.tt-port')) { const w = +p.style.getPropertyValue('--w'), h = +p.style.getPropertyValue('--h'); const k = p.clientWidth / w; p.style.height = `${Math.round(h * k)}px`; p.firstElementChild.style.transform = `scale(${k})`; } }

(async function boot() {
  try {
    const d = await PI.loadSnapshot().catch(() => null); PI.mountTop($('#top'), { active: 'about', section: 'typography', snapshot: d }); if (d) $('#foot').innerHTML = PI.footHtml(d);
    const status = await fontStatus(); const sec = (id, h, sub, body) => `<section class="ab-sec wide" id="${id}"><div class="ab-sec-h"><h2>${h}</h2><p>${sub}</p></div><div class="ab-sec-b">${body}</div></section>`;
    $('#app').innerHTML = `<div class="ab tt">
      <header class="ab-mast"><div><h1>Brand type trial.</h1><p class="ab-lede">Kay’s own typeface, tried in three places against the V4 type system. Text stays DM Sans, records stay DM Mono, scientific names stay italic. Nothing here is the default yet.</p></div>
        <div class="ab-mast-s"><p class="ab-prov">Type comparison<br>default: <b>V4.2 type system</b>; the variants are an internal trial<br>compare on any page: <span class="ab-id">?type=v4 · a · b · c</span></p></div></header>
      ${sec('compare', 'On the real pages', 'The published V4 page beside one variant. Choose the variant, the page and the window size.', `<div id="tt-compare">${compare()}</div>`)}
      ${sec('specimen', 'Spacing, long labels, fallbacks', 'Left: the trial face. Right: the same words in Bricolage Grotesque as V4 sets them.', specimen(d))}
      ${sec('face', 'The typeface file', 'What the file itself says, and how it is served.', facts(status))}
      ${sec('reading', 'Reading of the three', 'An agent’s reading for Kay to accept or overrule. Checked at 1440×900 and 1280×800.', `<div class="tt-read">
        <p><b>A · Wordmark only.</b> The safest change. At 17 px the face holds its angular <span class="tt-t tt-in">g</span>, <span class="tt-t tt-in">y</span> and <span class="tt-t tt-in">n</span> and reads as an identity mark; nothing else on any page moves.</p>
        <p><b>B · Wordmark + Imagine headline.</b> The face is at its best large, and Imagine is the one place with a single large headline and nothing competing with it. The headline is set a little smaller than the Bricolage one because the face is wider; it keeps its two lines at both window sizes.</p>
        <p><b>C · Wordmark + main page titles.</b> Consistent, but the face is one weight and wide: long titles such as “What the engine actually computes.” take more lines, and beside dense tables its character competes with the content. Section and panel headings were left in Bricolage Grotesque on purpose; setting those in the trial face would cost legibility where people work.</p>
        <p class="ab-carry">Proposed: B. The wordmark and the Imagine headline carry the identity; Bricolage Grotesque keeps the editorial and working headings.</p></div>`)}
    </div>`;
    document.title = 'Type trial · Planting Intelligence'; wire();
  } catch (e) { $('#app').innerHTML = `<p class="pi-loading">Could not load this page: ${esc(e.message)}</p>`; console.error(e); }
})();
