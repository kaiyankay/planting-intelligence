// Planting Intelligence · Knowledge — cell renderers of the attribute table (V4.3).
// A renderer draws what a cell's record holds and nothing else: no value is averaged, merged or filled in. Each statement of a
// source keeps its own mark, a cell without a record gets the one "not recorded" mark, and every drawing carries the same content
// as text (aria-label / title on the cell, the words beside the mark, the Text mode of the table, the Inspector behind a click).
// The functions are pure: (model, record) → an HTML string. Nothing here reads or writes the page state.

const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const plural = (n, w, ws = w + 's') => `${n} ${n === 1 ? w : ws}`;
const uniq = a => [...new Set(a)];
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const num = v => (Math.round(v * 100) / 100).toString();
const srcShort = (M, id) => (M.source(id).short || M.source(id).label || id).replace(/ ?[:(—–].*$/, '').replace(/^Royal Horticultural Society$/, 'RHS');

/** the one mark of a cell without a record */
export const missing = (word = 'not recorded') => `<span class="cx cx-nr"><svg viewBox="0 0 18 8" width="18" height="8" aria-hidden="true"><path d="M1 4h16"/></svg>${esc(word)}</span>`;

// ------------------------------------------------------------------ growth form
const FORM = {
  'Tree': '<path d="M10 18v-7"/><path d="M10 11.5c-3.6 0-6-2.2-6-5S6.6 1.8 10 1.8s6 2 6 4.7-2.4 5-6 5Z"/>',
  'Shrub': '<path d="M10 18v-5M10 15l-3.4-3M10 14.4l3.2-2.6"/><path d="M3.4 11.6c0-3 2.9-5 6.6-5s6.6 2 6.6 5"/>',
  'Herbaceous perennial': '<path d="M10 18V7.5M10 13.5 6.2 10M10 12l3.6-3.2"/><circle cx="10" cy="5.6" r="1.9"/><circle cx="5.4" cy="8.6" r="1.4"/><circle cx="14.4" cy="7.6" r="1.4"/>',
  'Fern': '<path d="M10 18c0-6-1.6-10-5.6-12.6M10 18c0-6 1.6-10 5.6-12.6M10 18V6"/><path d="M6.2 9.2 4 9.6M7.6 11.6l-2.4.8M13.8 9.2l2.2.4M12.4 11.6l2.4.8M10 8.6l-1.6-1M10 8.6l1.6-1"/>',
};
/** growth form: one glyph per recorded form, the word beside it; a form the set has no glyph for stays a word */
export function growthForm(s) {
  const l = s.growth_form_label; if (!l) return missing();
  const st = s.growth_form_status && s.growth_form_status !== 'supported' ? ` <small class="cx-note">${esc(String(s.growth_form_status).replace(/_/g, ' '))}</small>` : '';
  return `<span class="cx cx-form">${FORM[l] ? `<svg class="gl" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">${FORM[l]}</svg>` : ''}<span class="w">${esc(l)}${st}</span></span>`;
}

// ------------------------------------------------------------------ height · spread: every statement on one shared scale
/** the statements behind a size cell, one per claim, as the source gave them */
export function sizeStatements(M, a) {
  const out = [];
  for (const cid of uniq(a.claims)) {
    const c = M.claim(cid); const v = c?.value; if (!v || typeof v !== 'object') continue;
    const base = { cid, src: c.source_id, cultivar: c.cultivar || null, cond: (c.conditions || []).map(x => x.label), verified: c.status === 'verified' };
    if (v.median != null) out.push({ ...base, kind: 'inventory', p10: v.p10 ?? null, median: v.median, p90: v.p90 ?? null, n: v.n ?? null, subset: v.subset || null });
    else if (v.min != null && v.max != null) out.push({ ...base, kind: 'range', lo: v.min, hi: v.max, occ: v.occasional_max_m ?? null });
    else if (v.max != null) out.push({ ...base, kind: 'upto', hi: v.max });
    else if (v.typical_max_m != null) out.push({ ...base, kind: 'upto', hi: v.typical_max_m, occ: v.occasional_max_m ?? null });
    else if (v.height_m != null || v.spread_m != null) out.push({ ...base, kind: 'point', v: v.height_m ?? v.spread_m });
  }
  return out;
}
const stNums = s => s.kind === 'inventory' ? [s.p10, s.median, s.p90] : s.kind === 'range' ? [s.lo, s.hi, s.occ] : s.kind === 'upto' ? [s.hi, s.occ] : [s.v];
/** one logarithmic scale for a whole column: the smallest and the largest number any plant's statements hold, widened to round ends */
export function sizeScale(M, facet) {
  const all = M.attrs.filter(a => a.facet === facet).flatMap(a => sizeStatements(M, a).flatMap(stNums)).filter(x => x != null && x > 0);
  if (!all.length) return null;
  const lo = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5].filter(x => x <= Math.min(...all)).pop() || 0.01, hi = [0.5, 1, 2, 5, 10, 20, 50, 100].find(x => x >= Math.max(...all)) || 100;
  const W = 80, pad = 3; const x = v => pad + (Math.log10(Math.max(v, lo)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)) * (W - 2 * pad);
  return { lo, hi, W, x, ticks: [0.1, 1, 10].filter(t => t > lo && t < hi) };
}
/** the axis of that scale, set once in the column head */
export function sizeAxis(sc) {
  if (!sc) return '';
  const lab = [[sc.lo, 'start'], ...sc.ticks.filter(t => sc.x(t) - sc.x(sc.lo) > 24 && sc.x(sc.hi) - sc.x(t) > 26).map(t => [t, 'middle']), [sc.hi, 'end']];
  return `<svg class="cx-axis" viewBox="0 0 ${sc.W} 13" width="${sc.W}" height="13" aria-hidden="true"><path d="M${sc.x(sc.lo)} 12.5H${sc.x(sc.hi)}"/>${sc.ticks.map(t => `<path d="M${sc.x(t)} 10.5v2"/>`).join('')}${lab.map(([t, an]) => `<path d="M${sc.x(t)} 9.5v3"/><text x="${sc.x(t)}" y="7.5" text-anchor="${an}">${num(t)}${t === sc.hi ? ' m' : ''}</text>`).join('')}</svg>`;
}
/** what a size cell says in words: the smallest and the largest number the sources state, and how many statements — a span of statements, not a value */
export function sizeWords(M, a) {
  const st = sizeStatements(M, a); const stated = st.filter(s => s.kind !== 'inventory'), inv = st.filter(s => s.kind === 'inventory');
  const ns = stated.flatMap(s => s.kind === 'range' ? [s.lo, s.hi] : s.kind === 'upto' ? [s.hi] : [s.v]); const srcs = uniq(st.map(s => s.src));
  const span = ns.length ? (Math.min(...ns) === Math.max(...ns) ? `${num(ns[0])} m` : `${num(Math.min(...ns))}–${num(Math.max(...ns))} m`) : '';
  const each = st.map(s => `${srcShort(M, s.src)}${s.cultivar ? ` (${s.cultivar})` : ''}: ${s.kind === 'range' ? `${num(s.lo)}–${num(s.hi)} m${s.occ ? `, occasionally ${num(s.occ)} m` : ''}` : s.kind === 'upto' ? `up to ${num(s.hi)} m${s.occ ? `, occasionally ${num(s.occ)} m` : ''}` : s.kind === 'point' ? `${num(s.v)} m` : `inventory of ${s.n ?? '?'} trees${s.subset ? ` (${s.subset})` : ''}, median class ${num(s.median)} m${s.p10 != null && s.p90 != null ? `, 10th–90th ${num(s.p10)}–${num(s.p90)} m` : s.p90 != null ? `, 90th ${num(s.p90)} m` : ''}`}${s.cond.length ? ` when ${s.cond.join(', ')}` : ''}`);
  return { st, stated, inv, span, srcs, each, short: span || (inv.length ? `median ${num(inv[0].median)} m` : ''), say: `${span ? `smallest stated to largest stated ${span}; ` : ''}${plural(st.length, 'statement')} from ${plural(srcs.length, 'source')}, each drawn on its own: ${each.join('; ')}` };
}
/** a size cell: one lane per source, one mark per statement. A stated range is a bar, a single figure a tick, "up to" a tick with an
 *  open tail, a tree inventory a thin 10th–90th line with its median dot. Cultivar statements are lighter, conditional ones dashed. */
export function sizeCell(M, a, sc) {
  const w = sizeWords(M, a); if (!w.st.length || !sc) return `<span class="cx"><span class="w">${esc(a.values.map(v => v.label).join(' · '))}</span></span>`;
  const lanes = w.srcs; const pitch = Math.min(6, 30 / lanes.length), H = Math.max(14, lanes.length * pitch + 4); const y = i => 2 + pitch / 2 + i * pitch; const x = sc.x;
  let g = sc.ticks.map(t => `<path class="grid" d="M${x(t)} 0V${H}"/>`).join('');
  for (const s of w.st) {
    const yy = y(lanes.indexOf(s.src)); const cls = `${s.kind} ${s.cultivar ? 'cv' : ''} ${s.cond.length ? 'cond' : ''}`;
    if (s.kind === 'range') g += `<path class="st ${cls}" d="M${x(s.lo)} ${yy}H${Math.max(x(s.hi), x(s.lo) + 1.5)}"/>${s.occ ? `<path class="st occ" d="M${x(s.hi)} ${yy}H${x(s.occ)}"/>` : ''}`;
    else if (s.kind === 'upto') g += `<path class="st occ" d="M${Math.max(x(sc.lo), x(s.hi) - 14)} ${yy}H${x(s.hi)}"/><path class="st tick ${cls}" d="M${x(s.hi)} ${yy - 2.4}v4.8"/>${s.occ ? `<path class="st occ" d="M${x(s.hi)} ${yy}H${x(s.occ)}"/>` : ''}`;
    else if (s.kind === 'point') g += `<path class="st tick ${cls}" d="M${x(s.v)} ${yy - 2.4}v4.8"/>`;
    else g += `${s.p90 != null ? `<path class="st inv" d="M${x(s.p10 ?? s.median)} ${yy}H${x(s.p90)}"/>` : ''}<circle class="st invdot" cx="${x(s.median)}" cy="${yy}" r="1.7"/>`;
  }
  return `<span class="cx cx-size"><svg viewBox="0 0 ${sc.W} ${H}" width="${sc.W}" height="${H}" aria-hidden="true">${g}</svg><span class="w n">${esc(w.short)}</span></span>`;
}

// ------------------------------------------------------------------ flowers: colour words and months, as each source states them
/** the flower statements of a plant: one per claim that names a flower colour or flowering months */
export function flowerStatements(M, s) {
  if (!M._flower) { M._flower = new Map(); for (const c of Object.values(M.claims)) { const v = c.value; if (c.field !== 'seasonal_interest' || !v || typeof v !== 'object' || c.status === 'retired') continue; const col = Array.isArray(v.flower_colour) ? v.flower_colour : [], mo = Array.isArray(v.flowering_months) ? v.flowering_months.filter(m => m >= 1 && m <= 12) : []; if (!col.length && !mo.length) continue; const k = `plant:${c.plant}`; if (!M._flower.has(k)) M._flower.set(k, []); M._flower.get(k).push({ cid: c.id, src: c.source_id, cultivar: c.cultivar || null, colours: col, months: mo, verified: c.status === 'verified' }); } }
  return M._flower.get(s.id) || [];
}
/** a swatch is drawn only for a colour word in this table; any other word stays a word */
export const SWATCH = { White: '#fbf9f1', Pink: '#e3a3b3', Purple: '#7c5b97', Yellow: '#e0bb3c', Green: '#7d9a5b', Red: '#b3382f', Orange: '#d8802c', Bronze: '#8d6a3d', 'Dark-red': '#771f25' };
const swatch = (w, cv) => SWATCH[w] ? `<i class="sw ${cv ? 'cv' : ''}" style="background:${SWATCH[w]}"></i>` : '';
/** colour words with the number of sources behind each; `cvOnly` marks a word only cultivar claims state */
export function colourWords(list) {   // list: [{ word, src, cultivar }]
  const by = new Map(); for (const x of list) { if (!by.has(x.word)) by.set(x.word, { word: x.word, srcs: new Set(), cvOnly: true }); const b = by.get(x.word); b.srcs.add(x.src); if (!x.cultivar) b.cvOnly = false; }
  return [...by.values()].sort((a, b) => b.srcs.size - a.srcs.size);
}
export function coloursHtml(words, show = 2) {
  const rest = words.length - show;
  return `<span class="cx cx-col">${words.slice(0, show).map(w => `<span class="cw">${swatch(w.word, w.cvOnly)}${esc(w.word)}${w.srcs.size > 1 ? `<small class="cx-note">${w.srcs.size}</small>` : ''}</span>`).join('')}${rest > 0 ? `<small class="cx-more">+${rest}</small>` : ''}</span>`;
}
export function flowerColour(M, s) {
  const st = flowerStatements(M, s).filter(x => x.colours.length); if (!st.length) return { html: missing(), say: 'not recorded', words: [] };
  const words = colourWords(st.flatMap(x => x.colours.map(w => ({ word: w, src: x.src, cultivar: x.cultivar }))));
  return { html: coloursHtml(words), words, say: `${words.map(w => `${w.word} (${plural(w.srcs.size, 'source')}${w.cvOnly ? ', a cultivar only' : ''})`).join(', ')}; the number after a word is how many sources state it` };
}
const monthRuns = ms => { const s = [...new Set(ms)].sort((a, b) => a - b), runs = []; for (const m of s) { const r = runs[runs.length - 1]; if (r && m === r[1] + 1) r[1] = m; else runs.push([m, m]); } return runs.map(([a, b]) => a === b ? MONTH_NAMES[a - 1] : `${MONTH_NAMES[a - 1]}–${MONTH_NAMES[b - 1]}`).join(', '); };
/** the month letters over the strips, set once in the column head */
export const monthAxis = () => `<svg class="cx-axis" viewBox="0 0 96 13" width="96" height="13" aria-hidden="true">${'JFMAMJJASOND'.split('').map((l, i) => `<text x="${i * 8 + 4}" y="9.5" text-anchor="middle">${l}</text>`).join('')}</svg>`;
/** flowering months: twelve cells, one strip per statement. Only the months a source names are filled; a plant whose sources name
 *  a season in words but no month has no strip. */
export function flowering(M, s) {
  const st = flowerStatements(M, s).filter(x => x.months.length); if (!st.length) return { html: missing(), say: 'not recorded', st: [] };
  const pitch = Math.min(6, 30 / st.length), H = st.length * pitch + 2;
  const g = st.map((x, i) => Array.from({ length: 12 }, (_, m) => `<rect class="${x.months.includes(m + 1) ? `on ${x.cultivar ? 'cv' : ''}` : 'off'}" x="${m * 8 + .5}" y="${1 + i * pitch}" width="7" height="${pitch - 1.2}"/>`).join('')).join('');
  const each = st.map(x => `${srcShort(M, x.src)}${x.cultivar ? ` (${x.cultivar})` : ''}: ${monthRuns(x.months)}`);
  return { st, each, html: `<span class="cx cx-months"><svg viewBox="0 0 96 ${H}" width="96" height="${H}" aria-hidden="true">${g}</svg></span>`, say: `${plural(st.length, 'statement')}, one strip each: ${each.join('; ')}` };
}

// ------------------------------------------------------------------ light
const SUN = c => `<circle cx="9" cy="9" r="4.2"/>${c}`;
const RAYS = '<path d="M9 1.2v2M9 14.8v2M1.2 9h2M14.8 9h2M3.5 3.5l1.4 1.4M13.1 13.1l1.4 1.4M3.5 14.5l1.4-1.4M13.1 4.9l1.4-1.4"/>';
const SHELTER = '<path d="M3 12.5V9a6 6 0 0 1 12 0v3.5"/><path d="M7.2 12.5h3.6"/>';
export const LIGHT = [
  ['Full sun', 'full', SUN(RAYS)],
  ['Part sun/part shade', 'part', SUN('<path class="f" d="M9 4.8a4.2 4.2 0 0 1 0 8.4Z"/>')],
  ['Filtered shade', 'filt', SUN('<path d="M6.2 7.4h5.6M5.4 9h7.2M6.2 10.6h5.6"/>')],
  ['Deep shade', 'deep', '<circle class="f" cx="9" cy="9" r="4.2"/>'],
];
/** light: four places from sun to deep shade; a recorded label fills its place, an unrecorded one stays a dot. A label that holds
 *  only under a condition is dashed. Any other recorded label (Sheltered, …) is written out. */
export function exposure(a) {
  const has = l => a.values.find(v => v.label === l); const condFull = a.values.find(v => /^Full sun only/i.test(v.label));
  const known = new Set(LIGHT.map(x => x[0])); const other = a.values.filter(v => !known.has(v.label) && !(v === condFull && !has('Full sun')));
  const shelter = other.find(v => v.label === 'Sheltered'); const also = other.some(v => /^Full sun only/i.test(v.label)); const extra = other.filter(v => v !== shelter && !/^Full sun only/i.test(v.label)).map(v => v.label);
  const slots = LIGHT.map(([l, k, d]) => { const v = has(l) || (l === 'Full sun' ? condFull : null); const cond = !!v && v !== has(l); return v ? `<svg class="lt ${k} ${cond || (v.conditions || []).length ? 'cond' : ''}" viewBox="0 0 18 18" width="17" height="17" aria-hidden="true">${d}${l === 'Full sun' && also ? '<circle class="also" cx="9" cy="9" r="7.6"/>' : ''}</svg>` : `<svg class="lt none" viewBox="0 0 18 18" width="17" height="17" aria-hidden="true"><circle cx="9" cy="9" r="1.1"/></svg>`; }).join('');
  return `<span class="cx cx-light">${slots}${shelter ? `<svg class="lt sh" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">${SHELTER}</svg>` : ''}${extra.length ? `<small class="cx-note">${esc(extra.join(' · ').toLowerCase())}</small>` : ''}</span>`;
}

// ------------------------------------------------------------------ leaf retention
const LEAF = 'M9 16.2C4.6 13 3.4 8.4 9 1.8c5.6 6.6 4.4 11.2 0 14.4Z';
export function leaf(a) {
  const k = v => /^evergreen/i.test(v.label) ? 'ever' : /^deciduous/i.test(v.label) ? 'deci' : /semi/i.test(v.label) ? 'semi' : '';
  return `<span class="cx cx-leaf ${a.values.length > 1 ? 'two' : ''}">${a.values.map(v => `<span class="cw">${k(v) ? `<svg class="lf ${k(v)}" viewBox="0 0 18 18" width="16" height="16" aria-hidden="true"><path d="${LEAF}"/>${k(v) === 'semi' ? `<path class="f" d="M9 1.8c5.6 6.6 4.4 11.2 0 14.4Z"/>` : ''}<path class="mid" d="M9 5v9"/></svg>` : ''}${esc(v.label)}</span>`).join('')}</span>`;
}

// ------------------------------------------------------------------ evidence
const CHECK = '<svg class="ev-v" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="m2.4 6.4 2.4 2.4 4.8-5.4"/></svg>';
const NEQ = '<svg class="ev-d" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.5 4.4h7M2.5 7.6h7M8 2.2 4 9.8"/></svg>';
const VARY = '<svg class="ev-c" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M1.8 7c1.2-2.6 2.6-2.6 4.2 0s3 2.6 4.2 0"/></svg>';
/** the standing of one cell, beside its value: one pip per source, a check when a person verified a claim behind it, a mark when
 *  sources differ and another when the value depends on a condition. An AI source check is not shown here: it is not verification. */
export function cellEvidence(a) {
  const n = a.n_sources; const pips = '';   // the number of sources is in the cell's accessible name and in the Inspector; the lanes of a size or month cell show them
  return `<span class="ev" title="${esc(cellEvidenceSay(a))}">${pips}${a.verification === 'verified' ? CHECK : ''}${a.disagreement.length ? NEQ : ''}${a.variation.length ? VARY : ''}</span>`;
}
export const cellEvidenceSay = a => `${plural(a.n_claims, 'claim')} from ${plural(a.n_sources, 'source')}${a.verification === 'verified' ? ', a claim verified by a person' : a.n_claims ? ', no claim verified by a person' : ''}${a.disagreement.length ? ', sources differ' : ''}${a.variation.length ? ', varies by condition' : ''}`;
/** the standing of a plant's whole record: live claims, how many a person verified (as a bar on the same length for every plant),
 *  the sources read and the cells whose sources differ */
export function evidenceOf(M, s) {
  const at = M.attrs.filter(a => a.species === s.id); const srcs = uniq(at.flatMap(a => a.sources || [])); const dis = at.filter(a => a.disagreement.length).length;
  return { live: s.claims.live, verified: s.claims.verified, srcs: srcs.length, dis, say: `${s.claims.live} live claims, ${s.claims.verified} verified by a person; ${plural(srcs.length, 'source')} read; ${dis ? `sources differ in ${plural(dis, 'cell')}` : 'no cell with a source disagreement'}. An AI source check is an assessment, not a verification.` };
}
export function evidenceCell(M, s) {
  const e = evidenceOf(M, s); const W = 32, w = e.live ? Math.max(e.verified ? 1.5 : 0, W * e.verified / e.live) : 0;
  return `<span class="cx cx-ev"><svg viewBox="0 0 ${W} 8" width="${W}" height="8" aria-hidden="true"><rect class="tr" x="0" y="2" width="${W}" height="4" rx="2"/>${w ? `<rect class="vf" x="0" y="2" width="${w}" height="4" rx="2"/>` : ''}</svg><span class="w n">${e.verified}/${e.live}</span>${e.dis ? `<span class="evd">${NEQ}<small class="cx-note">${e.dis}</small></span>` : ''}</span>`;
}

/** the legend of the marks, drawn with the renderers themselves */
export function legendHtml() {
  const row = (m, t) => `<p><span class="lgm">${m}</span><span>${t}</span></p>`;
  const sizeDemo = `<svg viewBox="0 0 96 22" width="96" height="22" aria-hidden="true"><path class="st range" d="M6 4H44"/><path class="st range cv" d="M20 9H58"/><path class="st occ" d="M50 14H64"/><path class="st tick" d="M64 11.6v4.8"/><path class="st inv" d="M30 19H84"/><circle class="st invdot" cx="52" cy="19" r="1.7"/></svg>`;
  return `<div class="cx-legend">
    ${row(`<span class="cx cx-size">${sizeDemo}</span>`, '<b>Height · Spread</b> every statement is drawn, one lane per source, on a logarithmic scale shared by the column. Bar: a stated range. Lighter bar: stated for a cultivar. Tick with an open tail: “up to”. Thin line and dot: a street-tree inventory, 10th–90th percentile class and median. Dashed: under a stated condition. Nothing is averaged.')}
    ${row(`<span class="cx cx-months"><svg viewBox="0 0 108 8" width="108" height="8" aria-hidden="true">${Array.from({ length: 12 }, (_, m) => `<rect class="${m > 3 && m < 6 ? 'on' : 'off'}" x="${m * 9 + .5}" y="1" width="8" height="5"/>`).join('')}</svg></span>`, '<b>Flowering months</b> January to December, one strip per source statement. Only months a source names are filled.')}
    ${row(`<span class="cx cx-col"><span class="cw"><i class="sw" style="background:${SWATCH.Pink}"></i>Pink<small class="cx-note">2</small></span><span class="cw"><i class="sw cv" style="background:${SWATCH.Purple}"></i>Purple</span></span>`, '<b>Flower colour</b> the colour word a source uses, with a swatch for the word and the number of sources stating it. A dashed swatch: stated for a cultivar only.')}
    ${row(`<span class="cx cx-light">${LIGHT.map(([, k, d]) => `<svg class="lt ${k}" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">${d}</svg>`).join('')}<svg class="lt none" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="1.1"/></svg><svg class="lt sh" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">${SHELTER}</svg></span>`, '<b>Light</b> full sun · part sun/part shade · filtered shade · deep shade, always in that order. A dot: that light is not recorded for the plant. Dashed: only under a condition; a dashed ring round the sun: a second statement gives full sun only under a condition. The arch: a sheltered position is recorded.')}
    ${row(`<span class="cx cx-leaf"><span class="cw"><svg class="lf ever" viewBox="0 0 18 18" width="16" height="16" aria-hidden="true"><path d="${LEAF}"/><path class="mid" d="M9 5v9"/></svg></span><span class="cw"><svg class="lf deci" viewBox="0 0 18 18" width="16" height="16" aria-hidden="true"><path d="${LEAF}"/><path class="mid" d="M9 5v9"/></svg></span></span>`, '<b>Leaf retention</b> filled leaf: evergreen. Outlined leaf: deciduous. Both when the sources record both.')}
    ${row(`<span class="ev">${CHECK}${NEQ}${VARY}</span>`, '<b>Evidence</b> beside a value: a check: a claim verified by a person · crossed equals: sources differ · wave: varies by condition. An AI source check is never counted as verification.')}
    ${row(missing(), '<b>Not recorded</b> no source was read for this cell. It does not mean the plant lacks the trait.')}
  </div>`;
}
