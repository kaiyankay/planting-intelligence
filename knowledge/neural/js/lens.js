// Lenses: three.js stages that lay evidence out by what the values are, not by how the records are stored.
//   ruler    — numeric ranges on a shared axis, one lane per stated condition / cultivar
//   spectrum — vocabulary lists as a source × value grid
//   notes    — everything else, as a stack of readings
//   fields   — a domain unfolded into its fields (status glyphs on an arc)
//   source   — one source across plants and domains
// Each builder returns { group, labels, hits, w, h }. Labels are HTML (projected by app.js) so text stays crisp and clickable.
import * as THREE from 'three';
import { TYPE_COLOUR, summariseValue } from './model.js';
import { numeric, fmt, isLive } from './knowledge.js';

const col = (hex) => new THREE.Color(hex);
const STATUS_ALPHA = { verified: 1, unverified: 0.62, candidate: 1, retired: 0.28, disputed: 0.62 };

function claimColour(c) { return TYPE_COLOUR[c.source_type] || '#8892a8'; }
function statusOf(c) { return c.source_type === 'candidate' ? 'candidate' : !isLive(c) ? 'retired' : (c.status || 'unverified'); }

// ---- primitives
function bar(x0, x1, y, h, colour, alpha, hollow, dashed) {
  const g = new THREE.Group();
  const w = Math.max(0.35, x1 - x0);
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshBasicMaterial({ color: col(colour), transparent: true, opacity: hollow ? alpha * 0.28 : alpha, depthWrite: false });
  const m = new THREE.Mesh(geo, mat); m.position.set((x0 + x1) / 2, y, 0); g.add(m);
  if (hollow || dashed) {
    const edges = new THREE.EdgesGeometry(geo);
    const lm = dashed
      ? new THREE.LineDashedMaterial({ color: col(colour), transparent: true, opacity: alpha + 0.2, dashSize: 0.9, gapSize: 0.6 })
      : new THREE.LineBasicMaterial({ color: col(colour), transparent: true, opacity: Math.min(1, alpha + 0.25) });
    const ls = new THREE.LineSegments(edges, lm); ls.position.copy(m.position); if (dashed) ls.computeLineDistances(); g.add(ls);
  }
  g.userData.mats = [mat, ...g.children.filter(o => o.isLineSegments).map(o => o.material)];
  return g;
}
function dot(x, y, r, colour, alpha, hollow) {
  const mat = new THREE.MeshBasicMaterial({ color: col(colour), transparent: true, opacity: alpha, depthWrite: false, wireframe: !!hollow });
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20), mat); m.position.set(x, y, 0.05); m.userData.mats = [mat]; return m;
}
function ring(x, y, r, width, colour, alpha, theta = Math.PI * 2, start = Math.PI / 2) {
  const mat = new THREE.MeshBasicMaterial({ color: col(colour), transparent: true, opacity: alpha, depthWrite: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.RingGeometry(r - width, r, 40, 1, start, theta), mat); m.position.set(x, y, 0.04); m.userData.mats = [mat]; return m;
}
function line(pts, colour, alpha, dashed) {
  const geo = new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(p[0], p[1], p[2] || 0)));
  const mat = dashed ? new THREE.LineDashedMaterial({ color: col(colour), transparent: true, opacity: alpha, dashSize: 1, gapSize: 0.7 }) : new THREE.LineBasicMaterial({ color: col(colour), transparent: true, opacity: alpha });
  const l = new THREE.Line(geo, mat); if (dashed) l.computeLineDistances(); l.userData.mats = [mat]; return l;
}
function tick(x, y0, y1, colour, alpha) { return line([[x, y0], [x, y1]], colour, alpha); }

const niceStep = (max) => { const raw = max / 5; const p = Math.pow(10, Math.floor(Math.log10(raw))); const n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; };

function tag(c, parsed) {
  const st = statusOf(c);
  return `<i class="st ${st}" style="--c:${claimColour(c)}"></i>`;
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// ======================================================================= ruler
export function buildRuler(F, K, opts = {}) {
  const group = new THREE.Group(); const labels = []; const hits = [];
  const unit = F.unit || 'm';
  const claims = [...F.sourced, ...F.candidates].filter(c => numeric(c) && (numeric(c).unit || 'm') === unit);
  const other = [...F.sourced, ...F.candidates].filter(c => !claims.includes(c));
  const retired = opts.showRetired ? F.retired.filter(c => numeric(c) && (numeric(c).unit || 'm') === unit) : [];
  const nums = [...claims, ...retired].map(numeric);
  let vmax = Math.max(0.5, ...nums.map(n => Math.max(n.hi, n.occasional || 0)));
  const step = niceStep(vmax); vmax = Math.ceil(vmax / step) * step;
  const X0 = -8, X1 = 50, LBL = -12;               // axis span in stage units; labels sit left of X0
  const sx = v => X0 + (X1 - X0) * (v / vmax);
  const ROW = 4.6, HEAD = 5.4, GAP = 2.2;
  const rows = []; // [{type:'head', lane} | {type:'claim', c}]
  for (const lane of F.lanes) {
    const cs = lane.claims.filter(c => claims.includes(c)); if (!cs.length) continue;
    rows.push({ type: 'head', lane, n: cs.length });
    for (const c of cs) rows.push({ type: 'claim', c, lane });
  }
  if (retired.length) { rows.push({ type: 'head', lane: { label: 'retired model placeholder', kind: 'retired' }, n: retired.length }); for (const c of retired) rows.push({ type: 'claim', c, lane: null }); }
  const H = rows.reduce((a, r) => a + (r.type === 'head' ? HEAD : ROW), 0) + GAP * F.lanes.length + 12;
  let y = H / 2 - 4;
  // axis
  const axisY = -H / 2 + 5;
  group.add(line([[X0, axisY], [X1, axisY]], '#aeb8d0', 0.55));
  for (let v = 0; v <= vmax + 1e-9; v += step) {
    group.add(tick(sx(v), axisY - 0.8, axisY + 0.8, '#aeb8d0', 0.55));
    group.add(line([[sx(v), axisY + 0.8], [sx(v), H / 2 - 6]], '#aeb8d0', 0.07));
    labels.push({ pos: new THREE.Vector3(sx(v), axisY - 1.4, 0), html: `${fmt(Math.round(v * 100) / 100)}`, cls: 'lbl tick c', key: null });
  }
  labels.push({ pos: new THREE.Vector3(X1 + 4.5, axisY, 0), html: esc(unit), cls: 'lbl tick l', key: null });
  labels.push({ pos: new THREE.Vector3(LBL - 26, H / 2 - 1, 0), html: `${esc(F.label)} <span class="dim">· ${claims.length} reading${claims.length === 1 ? '' : 's'} · ${esc(F.status)}${F.differ && F.conditional ? ' + varies with conditions' : ''}</span>`, cls: 'lbl title l', key: null });

  for (const r of rows) {
    if (r.type === 'head') {
      y -= GAP;
      const kindWord = r.lane.kind === 'cultivar' ? 'cultivar' : r.lane.kind === 'condition' ? 'growing condition' : r.lane.kind === 'retired' ? '' : 'species, no condition stated';
      labels.push({ pos: new THREE.Vector3(LBL - 26, y - 1.2, 0), html: `<b>${esc(r.lane.label)}</b> <span class="dim">${esc(kindWord)}${kindWord ? ' · ' : ''}${r.n}</span>`, cls: `lbl lane l ${r.lane.kind}`, key: null });
      group.add(line([[LBL - 26, y - 3.2], [X1, y - 3.2]], r.lane.kind === 'condition' ? '#e8c37a' : r.lane.kind === 'cultivar' ? '#b48cff' : '#aeb8d0', 0.18));
      y -= HEAD;
      continue;
    }
    const c = r.c; const n = numeric(c); const st = statusOf(c); const colour = claimColour(c); const a = STATUS_ALPHA[st] ?? 0.6;
    const cy = y - ROW / 2; const key = `claim:${c.id}`;
    let obj;
    if (n.kind === 'point') { obj = dot(sx(n.lo), cy, 1.05, colour, a, st === 'retired'); if (st === 'unverified') { obj.material.opacity = a * 0.4; const rg = ring(sx(n.lo), cy, 1.25, 0.28, colour, 0.95); group.add(rg); rg.userData.key = key; hits.push(rg); } }
    else if (n.kind === 'max') { obj = bar(sx(0), sx(n.hi), cy, 1.7, colour, a * 0.75, st !== 'verified' && st !== 'candidate', st === 'retired'); const cap = tick(sx(n.hi), cy - 1.3, cy + 1.3, colour, 1); group.add(cap); }
    else if (n.kind === 'min') { obj = bar(sx(n.lo), sx(vmax), cy, 1.7, colour, a * 0.4, true, st === 'retired'); const cap = tick(sx(n.lo), cy - 1.3, cy + 1.3, colour, 1); group.add(cap); }
    else if (n.kind === 'typical') { obj = bar(sx(0), sx(n.hi), cy, 1.7, colour, a * 0.75, st !== 'verified', st === 'retired'); if (n.occasional) group.add(bar(sx(n.hi), sx(n.occasional), cy, 0.6, colour, a * 0.35, false, false)); }
    else if (n.kind === 'dist') { obj = bar(sx(n.lo), sx(n.hi), cy, 1.7, colour, a, st !== 'verified', false); const md = tick(sx(n.median), cy - 1.6, cy + 1.6, '#ffffff', 0.95); group.add(md); if (n.max && n.max <= vmax) group.add(dot(sx(n.max), cy, 0.35, colour, 0.5)); }
    else { obj = bar(sx(n.lo), sx(n.hi), cy, 1.7, colour, a, st !== 'verified' && st !== 'candidate', st === 'retired'); }
    obj.userData.key = key; obj.traverse(o => { o.userData.key = key; }); group.add(obj); hits.push(obj);
    const p = F.parsed.get(c.id) || {};
    const srcName = K.sources[c.source_id]?.label || c.source_id;
    const region = p.region && !srcName.toLowerCase().includes(p.region.toLowerCase()) ? p.region : null;
    const subset = p.subset ? p.subset.replace(/,?\s*proxy\)?/i, ')').replace(/>=/g, '≥').replace(/\)\)$/, ')') : null;
    const srcLabel = c.source_type === 'candidate' ? 'you · candidate' : `${esc(srcName)}${region ? ` <span class="dim">· ${esc(region)}</span>` : ''}${subset ? ` <span class="dim">· ${esc(subset)}</span>` : ''}`;
    labels.push({ pos: new THREE.Vector3(LBL, cy, 0), html: `${tag(c)}${srcLabel}`, cls: `lbl row r ${st}`, key });
    const valText = valueText(c, n);
    const vx = n.kind === 'typical' && n.occasional ? sx(n.occasional) : n.kind === 'min' ? sx(vmax) : sx(n.hi);
    labels.push({ pos: new THREE.Vector3(vx + 1.2, cy, 0), html: `<span class="val">${esc(valText)}</span>`, cls: `lbl value l ${st}`, key });
    y -= ROW;
  }
  const footer = [];
  if (other.length) footer.push(`${other.length} reading${other.length === 1 ? '' : 's'} in another unit or form: ${other.map(c => `${K.sources[c.source_id]?.label || c.source_id} ${summariseValue(c)}`).join('; ')}`);
  if (F.retired.length && !opts.showRetired) footer.push(`${F.retired.length} retired placeholder hidden`);
  if (footer.length) labels.push({ pos: new THREE.Vector3(LBL - 26, -H / 2 + 0.6, 0), html: `<span class="dim">${esc(footer.join(' · '))}</span>`, cls: 'lbl foot l', key: null });
  return { group, labels, hits, w: (X1 + 30) - (LBL - 46), cx: ((LBL - 46) + (X1 + 30)) / 2, h: H + 4, kind: 'ruler' };
}
function valueText(c, n) {
  const u = n.unit || 'm';
  if (n.kind === 'point') return `${fmt(n.lo)} ${u}`;
  if (n.kind === 'max') return `≤ ${fmt(n.hi)} ${u}`;
  if (n.kind === 'min') return `≥ ${fmt(n.lo)} ${u}`;
  if (n.kind === 'typical') return `to ${fmt(n.hi)} ${u}${n.occasional ? `, occasionally ${fmt(n.occasional)}` : ''}`;
  if (n.kind === 'dist') return `median ${fmt(n.median)} ${u}${n.n ? ` · n=${n.n}` : ''}`;
  return `${fmt(n.lo)}–${fmt(n.hi)} ${u}`;
}

// ======================================================================= spectrum (vocabulary lists)
export function buildSpectrum(F, K, schema, vocabOrder) {
  const group = new THREE.Group(); const labels = []; const hits = [];
  const claims = [...F.sourced, ...F.candidates].filter(c => Array.isArray(c.value));
  const retired = F.retired.filter(c => Array.isArray(c.value));
  const present = new Set(); for (const c of [...claims, ...retired]) for (const v of c.value) present.add(v);
  const cols = vocabOrder(schema, F.field, present);
  const CW = Math.max(9, Math.min(14, 72 / Math.max(cols.length, 1))), RH = 4.4, LBL = -10;
  const X = i => LBL + 6 + CW * (i + 0.5);
  const rows = [...claims, ...retired];
  const H = RH * rows.length + 16; let y = H / 2 - 9;
  labels.push({ pos: new THREE.Vector3(LBL - 26, H / 2 - 1, 0), html: `${esc(F.label)} <span class="dim">· ${claims.length} reading${claims.length === 1 ? '' : 's'} · ${esc(F.status)}</span>`, cls: 'lbl title l', key: null });
  const counts = cols.map(v => claims.filter(c => c.value.includes(v) && c.source_type !== 'candidate').length);
  cols.forEach((v, i) => {
    labels.push({ pos: new THREE.Vector3(X(i), y + 2.6, 0), html: esc(v), cls: 'lbl colhead c', key: null, maxw: CW * 0.95 });
    group.add(line([[X(i), y + 0.6], [X(i), y - RH * rows.length - 0.5]], '#aeb8d0', 0.08));
  });
  for (const c of rows) {
    const st = statusOf(c); const colour = claimColour(c); const a = STATUS_ALPHA[st] ?? 0.6; const key = `claim:${c.id}`;
    const cy = y - RH / 2;
    cols.forEach((v, i) => {
      const has = c.value.includes(v);
      const m = has ? bar(X(i) - CW * 0.36, X(i) + CW * 0.36, cy, 2.3, colour, a, st !== 'verified' && st !== 'candidate', st === 'retired') : dot(X(i), cy, 0.22, '#aeb8d0', 0.18);
      m.userData.key = key; m.traverse(o => { o.userData.key = key; }); group.add(m); if (has) hits.push(m);
    });
    const p = F.parsed.get(c.id) || {};
    const srcLabel = c.source_type === 'candidate' ? 'you · candidate' : `${esc(K.sources[c.source_id]?.label || c.source_id)}${p.region ? ` <span class="dim">· ${esc(p.region)}</span>` : ''}${p.condition ? ` <span class="dim">· ${esc(p.condition)}</span>` : ''}${st === 'retired' ? ' <span class="dim">· retired</span>' : ''}`;
    labels.push({ pos: new THREE.Vector3(LBL, cy, 0), html: `${tag(c)}${srcLabel}`, cls: `lbl row r ${st}`, key });
    y -= RH;
  }
  // column footers: how many sources list this value
  cols.forEach((v, i) => { const n = counts[i]; labels.push({ pos: new THREE.Vector3(X(i), y - 1.6, 0), html: `<span class="dim">${n} of ${claims.filter(c => c.source_type !== 'candidate').length}</span>`, cls: 'lbl tick c', key: null }); });
  if (F.differPairs && F.differPairs.length) {
    const by = new Map(); for (const [a, b] of F.differPairs) { for (const [x, y] of [[a, b], [b, a]]) { if (!by.has(x.source_id)) by.set(x.source_id, new Set()); by.get(x.source_id).add(y.source_id); } }
    const lead = [...by.entries()].sort((p, q) => q[1].size - p[1].size)[0];
    labels.push({ pos: new THREE.Vector3(LBL - 26, -H / 2 + 0.8, 0), html: `<span class="warn">${esc(K.sources[lead[0]]?.label || lead[0])} shares no value with ${[...lead[1]].map(sid => esc(K.sources[sid]?.label || sid)).join(', ')}</span>`, cls: 'lbl foot l', key: null });
  } else if (F.outliers.length) labels.push({ pos: new THREE.Vector3(LBL - 26, -H / 2 + 0.8, 0), html: `<span class="warn">${F.outliers.map(c => esc(K.sources[c.source_id]?.label || c.source_id)).join(', ')} share${F.outliers.length === 1 ? 's' : ''} no value with any other source</span>`, cls: 'lbl foot l', key: null });
  return { group, labels, hits, w: (LBL + 10 + CW * cols.length) - (LBL - 48), cx: ((LBL - 48) + (LBL + 10 + CW * cols.length)) / 2, h: H, kind: 'spectrum' };
}

// ======================================================================= notes (objects, text, booleans)
export function buildNotes(F, K) {
  const group = new THREE.Group(); const labels = []; const hits = [];
  const rows = [...F.sourced, ...F.candidates, ...F.retired];
  const RH = 7.4, LBL = -30;
  const H = RH * rows.length + 14; let y = H / 2 - 8;
  labels.push({ pos: new THREE.Vector3(LBL - 6, H / 2 - 1, 0), html: `${esc(F.label)} <span class="dim">· ${F.sourced.length} reading${F.sourced.length === 1 ? '' : 's'}${F.status !== 'several readings' ? ' · ' + esc(F.status) : ''}</span>`, cls: 'lbl title l', key: null });
  if (!rows.length) {
    labels.push({ pos: new THREE.Vector3(LBL - 6, y - 2, 0), html: `<span class="dim">no claim on this field yet${F.planned.length ? ` · planned sources: ${esc(F.planned.join(', '))}` : ''}</span>`, cls: 'lbl foot l', key: null });
    const g = ring(0, y - 2, 3, 0.25, TYPE_COLOUR.gap, 0.6); group.add(g);
    return { group, labels, hits, w: 80, cx: LBL + 30, h: 24, kind: 'notes' };
  }
  for (const c of rows) {
    const st = statusOf(c); const colour = claimColour(c); const a = STATUS_ALPHA[st] ?? 0.6; const key = `claim:${c.id}`;
    const cy = y - RH / 2;
    const g = st === 'verified' || st === 'candidate' ? dot(LBL - 2.4, cy, 1.1, colour, a) : ring(LBL - 2.4, cy, 1.2, 0.3, colour, a + 0.2);
    g.userData.key = key; group.add(g); hits.push(g);
    group.add(line([[LBL, cy - RH / 2 + 0.6], [LBL + 62, cy - RH / 2 + 0.6]], '#aeb8d0', 0.08));
    const p = F.parsed.get(c.id) || {};
    labels.push({ pos: new THREE.Vector3(LBL, cy, 0), html: `<div class="note"><div class="who">${esc(c.source_type === 'candidate' ? 'you · candidate' : K.sources[c.source_id]?.label || c.source_id)}${p.region ? ` <span class="dim">· ${esc(p.region)}</span>` : ''}${p.cultivar ? ` <span class="dim">· ‘${esc(p.cultivar)}’</span>` : ''}${st === 'retired' ? ' <span class="dim">· retired</span>' : ''}</div><div class="what">${esc(summariseValue(c))}</div><div class="txt">${esc((c.text || '').slice(0, 150))}${(c.text || '').length > 150 ? '…' : ''}</div></div>`, cls: `lbl notecard l ${st}`, key, maxw: 60 });
    y -= RH;
  }
  return { group, labels, hits, w: 80, cx: LBL + 30, h: H, kind: 'notes' };
}

// ======================================================================= fields arc: a domain unfolded
export function buildFieldArc(D, K) {
  const group = new THREE.Group(); const labels = []; const hits = [];
  const fs = D.fields; const n = fs.length;
  const R = 15 + n * 1.1; const span = Math.min(Math.PI * 1.35, 0.55 * n);
  labels.push({ pos: new THREE.Vector3(0, 2.2, 0), html: `<b>${esc(D.label)}</b><br><span class="dim">${D.nCovered} of ${D.nFields} fields sourced · ${D.nSourced} claims · ${Math.round(D.verifiedShare * 100)}% verified</span>`, cls: 'lbl title c', key: null });
  fs.forEach((F, i) => {
    const a = Math.PI / 2 + (n === 1 ? 0 : -span / 2 + span * (i / (n - 1)));
    const x = Math.cos(a) * R, y = Math.sin(a) * R * 0.72 - 2;
    const key = `field:${F.key}`;
    const colour = F.status === 'gap' ? TYPE_COLOUR.gap : (TYPE_COLOUR[F.topType] || '#8892a8');
    const r = F.status === 'gap' ? 1.3 : 1.4 + 0.55 * Math.sqrt(F.sourced.length);
    const g = new THREE.Group();
    if (F.status === 'gap') g.add(ring(0, 0, r, 0.22, colour, 0.7));
    else {
      g.add(dot(0, 0, r, colour, 0.22 + 0.78 * F.verifiedShare));
      g.add(ring(0, 0, r + 0.15, 0.3, colour, 0.9));
      // amber arc (right) = varies with stated conditions; red arc (left) = non-overlapping values under the same stated condition
      if (F.conditional) g.add(ring(0, 0, r + 1.3, 0.3, '#e8c37a', 0.95, Math.PI * 0.75, -Math.PI * 0.375));
      if (F.differ) g.add(ring(0, 0, r + 1.3, 0.3, '#ff8c6b', 0.95, Math.PI * 0.75, Math.PI * 0.625));
      if (F.candidates.length) g.add(dot(r * 0.75, -r * 0.75, 0.55, TYPE_COLOUR.candidate, 1));
    }
    g.position.set(x, y, 0); g.traverse(o => { o.userData.key = key; }); g.userData.key = key; group.add(g); hits.push(g);
    group.add(line([[0, 0], [x * 0.93, y * 0.93]], colour, F.status === 'gap' ? 0.07 : 0.16));
    const side = Math.cos(a) < -0.15 ? 'r' : Math.cos(a) > 0.15 ? 'l' : 'c';
    const off = side === 'c' ? 0 : (side === 'l' ? r + 1.2 : -(r + 1.2));
    const status = F.status === 'gap' ? (F.planned.length ? 'gap · planned' : 'gap') : F.status === 'several readings' ? `${F.sourced.length} readings` : F.status;
    const both = F.differ && F.conditional ? ` <span class="status varies-with-conditions">+ varies with conditions</span>` : '';
    labels.push({ pos: new THREE.Vector3(x + off, side === 'c' ? y + r + 1.4 : y, 0), html: `${esc(F.label)}<br><span class="status ${esc(F.status.replace(/ /g, '-'))}">${esc(status)}</span>${both}${F.nSources > 1 ? ` <span class="dim">· ${F.nSources} sources</span>` : ''}`, cls: `lbl fieldlbl ${side}`, key });
  });
  return { group, labels, hits, w: R * 2 + 44, h: R * 1.6 + 16, kind: 'fields' };
}

// ======================================================================= source lens: one source across plants and domains
export function buildSourceLens(S, K) {
  const group = new THREE.Group(); const labels = []; const hits = [];
  const pids = Object.keys(K.plants); const CW = 34, X = i => (i - (pids.length - 1) / 2) * CW;
  const doms = K.domains; const RH = 6.2; const H = RH * doms.length + 22;
  const colour = TYPE_COLOUR[S.type] || '#8892a8';
  const rec = S.rec || {};
  labels.push({ pos: new THREE.Vector3(0, H / 2 - 1, 0), html: `<b>${esc(S.label)}</b> <span class="dim">· ${esc(S.type)}${S.geo ? ' · ' + esc(S.geo) : ''}${rec.licence_tier ? ' · licence tier ' + esc(rec.licence_tier) : ''} · ${S.claims.filter(isLive).length} live claims</span>`, cls: 'lbl title c', key: null });
  group.add(dot(0, H / 2 - 5.5, 1.6, colour, 1)); group.add(ring(0, H / 2 - 5.5, 2.3, 0.25, colour, 0.5));
  pids.forEach((pid, i) => {
    const P = K.plants[pid]; const n = S.claims.filter(c => c.plant === pid && isLive(c)).length;
    labels.push({ pos: new THREE.Vector3(X(i), H / 2 - 10, 0), html: `<em>${esc(P.entity.scientific_name)}</em><br><span class="dim">${n ? n + ' claims' : 'nothing from this source'}</span>`, cls: 'lbl colhead c', key: `plant:${pid}` });
    group.add(line([[0, H / 2 - 7], [X(i), H / 2 - 12.5]], colour, n ? 0.25 : 0.06));
  });
  let y = H / 2 - 14;
  doms.forEach(d => {
    labels.push({ pos: new THREE.Vector3(X(0) - CW / 2 - 1, y - RH / 2, 0), html: `<span class="dim">${esc(d.label)}</span>`, cls: 'lbl rowhead r', key: null });
    group.add(line([[X(0) - CW / 2, y - RH + 0.3], [X(pids.length - 1) + CW / 2, y - RH + 0.3]], '#aeb8d0', 0.07));
    pids.forEach((pid, i) => {
      const P = K.plants[pid]; const D = P.domains.find(x => x.id === d.id); if (!D) return;
      const cs = D.fields.flatMap(F => F.claims.filter(c => c.source_id === S.id && isLive(c)).map(c => ({ c, F })));
      if (!cs.length) { group.add(dot(X(i), y - RH / 2, 0.2, '#aeb8d0', 0.12)); return; }
      const byField = new Map(); for (const { c, F } of cs) { if (!byField.has(F.key)) byField.set(F.key, { F, n: 0, ver: 0 }); const e = byField.get(F.key); e.n++; if (c.status === 'verified') e.ver++; }
      const items = [...byField.values()]; const w = Math.min(CW - 4, items.length * 6);
      items.forEach((e, j) => {
        const x = X(i) - w / 2 + (j + 0.5) * (w / items.length); const key = `field:${e.F.key}`;
        const g = new THREE.Group(); g.add(dot(0, 0, 0.9 + 0.35 * Math.sqrt(e.n), colour, e.ver ? 1 : 0.55)); if (!e.ver) g.add(ring(0, 0, 1.1 + 0.35 * Math.sqrt(e.n), 0.25, colour, 0.9));
        g.position.set(x, y - RH / 2 + 0.9, 0); g.traverse(o => { o.userData.key = key; }); g.userData.key = key; group.add(g); hits.push(g);
      });
      labels.push({ pos: new THREE.Vector3(X(i), y - RH / 2 - 1.6, 0), html: items.map(e => `<span class="fchip" data-key="field:${esc(e.F.key)}">${esc(e.F.label)}${e.n > 1 ? ' ×' + e.n : ''}</span>`).join(' '), cls: 'lbl chips c', key: null, maxw: CW - 2 });
    });
    y -= RH;
  });
  return { group, labels, hits, w: CW * pids.length + 40, h: H, kind: 'source' };
}

// ======================================================================= relations lens: this plant's recorded relations
export function buildRelations(P, K) {
  const group = new THREE.Group(); const labels = []; const hits = [];
  const rels = K.relations.filter(r => r.plant_a === P.id || r.plant_b === P.id);
  const RH = 7; const H = RH * rels.length + 14; let y = H / 2 - 8;
  labels.push({ pos: new THREE.Vector3(-36, H / 2 - 1, 0), html: `relations of <em>${esc(P.entity.scientific_name)}</em> <span class="dim">· ${rels.length} recorded · ${rels.filter(r => r.status === 'verified').length} verified</span>`, cls: 'lbl title l', key: null });
  for (const r of rels) {
    const other = r.plant_a === P.id ? r.plant_b : r.plant_a; const st = r.status === 'retired' ? 'retired' : r.status; const colour = TYPE_COLOUR[r.source_type] || '#888'; const key = `relation:${r.id}`;
    const cy = y - RH / 2;
    const l = line([[-30, cy], [30, cy]], colour, st === 'verified' ? 0.9 : st === 'retired' ? 0.25 : 0.55, r.source_type === 'model'); l.userData.key = key; group.add(l); hits.push(l);
    const g = st === 'verified' ? dot(-30, cy, 1, colour, 1) : ring(-30, cy, 1.1, 0.3, colour, 0.9); g.userData.key = key; group.add(g); hits.push(g);
    labels.push({ pos: new THREE.Vector3(-32, cy, 0), html: `<span class="dim">${esc((r.relation_type || '').replace(/_/g, ' '))}</span>`, cls: `lbl row r ${st}`, key });
    labels.push({ pos: new THREE.Vector3(32, cy, 0), html: `<em>${esc(K.plants[other].entity.scientific_name)}</em><br><span class="dim">${esc(K.sources[r.source_id]?.label || r.source_id)} · ${esc(st)}${r.source_type === 'model' ? ' · placeholder' : ''}</span>`, cls: `lbl row l ${st}`, key });
    y -= RH;
  }
  return { group, labels, hits, w: 118, cx: 4, h: H, kind: 'relations' };
}
