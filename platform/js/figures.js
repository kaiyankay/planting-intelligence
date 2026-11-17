// Planting Intelligence · About figures (V4.3, 2026-11-17). Editorial figures for About / Project and Research & Method, drawn in
// SVG at page load. Nothing is typed in: every mark is read from the published snapshot (brain/data/explorer.json), the engine's own
// tables and the reference garden (designs/demo-a.json). An unverified record is drawn dashed and never ticked; a missing link is
// never drawn as a line. The plant illustration is the project's own AI-generated editorial artwork and carries no fact.
//
//   cover(ctx, W)     Project: specimen → records → network → arrangement → garden, one drawing on one ground line
//   step(i, ctx)      Research & Method: one figure per step (1–7), one system: 640 × 380, ink hairlines, olive = recorded,
//                     caramel dashes = not settled. Returns { svg, cap } — the caption is HTML, the svg has its own aria-label.
//
// ctx = { d, it, end, E, ref, artHref, T }   (snapshot, followed item, reference-garden ending, engine, saved design, illustration URL, trace.js)
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const r1 = n => Math.round(n * 10) / 10;
const cut = (s, n) => { s = String(s || ''); return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s; };
const wrap = (s, n) => { const out = []; let line = ''; for (const w of String(s).split(/\s+/)) { if (line && (line + ' ' + w).length > n) { out.push(line); line = w; } else line = line ? `${line} ${w}` : w; } if (line) out.push(line); return out; };
const t = (x, y, lines, cls, lh = 15, anchor = 'start', extra = '') => `<text class="${cls}" x="${r1(x)}" y="${r1(y)}" text-anchor="${anchor}"${extra}>${[].concat(lines).map((l, i) => `<tspan x="${r1(x)}" dy="${i ? lh : 0}">${esc(l)}</tspan>`).join('')}</text>`;
const srcShort = (d, id) => (d.sources[id]?.label || id).split(/ \(|: | — /)[0];
const nameOf = s => s.common_names?.[0] || s.scientific_name;
const plural = (n, w, ws = w + 's') => `${n} ${n === 1 ? w : ws}`;
const curve = (x1, y1, x2, y2, cls) => `<path class="${cls}" d="M${r1(x1)} ${r1(y1)}C${r1((x1 + x2) / 2)} ${r1(y1)} ${r1((x1 + x2) / 2)} ${r1(y2)} ${r1(x2)} ${r1(y2)}"/>`;
const TONE = ['var(--pi-olive-deep)', 'var(--pi-sage)', 'var(--pi-caramel)', 'var(--pi-rust)', 'var(--pi-ink-3)'];
const svg = (cls, W, H, label, body) => `<svg class="fx ${cls}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${body}</svg>`;
const currentVersion = p => (p?.versions || []).find(v => v.id === p.current_version_id) || null;
// the illustration's own cream ground is keyed out from the image itself (alpha from how far a pixel is from the paper), so the plant sits on the page
const MATTE = '<filter id="fx-matte" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -2.2 -2.2 -2.2 0 6.3"/></filter>';
const fnMark = (x, y, s, cls = '') => `<rect class="fx-fn${cls}" x="${r1(x - s / 2)}" y="${r1(y - s / 2)}" width="${s}" height="${s}" rx="2"/>`;

/** one plant object in elevation, standing on y = 0 at x (pixels), from its claimed height and proxy radius. An illustrative outline. */
function silhouette(x, h, r, form, tone, low) {
  if (low) return `<path d="M${r1(x - r)} 0Q${r1(x)} ${r1(-h * 2)} ${r1(x + r)} 0Z" fill="${tone}" fill-opacity=".55"/>`;
  if (/herb|perennial|forb/i.test(form)) { let s = ''; for (const k of [-0.55, 0, 0.55]) { const tx = x + k * r, ty = -h * (k ? 0.82 : 1); s += `<path d="M${r1(x + k * r * 0.3)} 0Q${r1(x + k * r * 0.5)} ${r1(ty / 2)} ${r1(tx)} ${r1(ty)}" fill="none" stroke="${tone}" stroke-width="1"/><ellipse cx="${r1(tx)}" cy="${r1(ty)}" rx="${r1(Math.max(2.2, r * 0.42))}" ry="1.6" fill="${tone}"/>`; } return s; }
  return `<path d="M${r1(x - r)} 0C${r1(x - r * 1.15)} ${r1(-h * 0.75)} ${r1(x - r * 0.6)} ${r1(-h * 1.04)} ${r1(x)} ${r1(-h)}C${r1(x + r * 0.6)} ${r1(-h * 1.04)} ${r1(x + r * 1.15)} ${r1(-h * 0.75)} ${r1(x + r)} 0Z" fill="${tone}" fill-opacity=".2" stroke="${tone}" stroke-width="1"/>`;
}

// ================================================================ Project cover
export function cover(ctx, W = 1180) {
  const { d, it, E, ref, artHref } = ctx; const sp = it.sp; const H = 540, G = 448; const v = currentVersion(ref); const objs = v?.plant_objects || [];
  const AT = d.attributes.filter(a => a.species === sp.id); const FL = new Map(d.facets.map(f => [f.id, f.label]));
  // records: the fields the followed function link stands on come first, then the first recorded field of each group
  const link = it.link; const need = new Set((link.requirements || []).flatMap(r => (r.evidence || []).map(e => e.target_label)));
  const hits = a => a.values.filter(x => need.has(x.label)).map(x => x.label);
  const first = AT.filter(a => hits(a).length); const rest = []; for (const g of d.groups) { const a = AT.find(x => x.group === g.id && !first.includes(x) && !rest.includes(x)); if (a) rest.push(a); const b = AT.find(x => x.group === g.id && !first.includes(x) && !rest.includes(x)); if (b) rest.push(b); }
  const rows = [...first, ...rest].slice(0, 9).map(a => { const h = hits(a); const labs = h.length ? h : a.values.map(x => x.label); return { a, req: h.length > 0, text: cut(labs.slice(0, 2).join(' · ') + (labs.length > 2 ? ` +${labs.length - 2}` : ''), 30), label: FL.get(a.facet) || a.facet }; });
  /* narrower sheets give the plan its share */ const k = Math.max(0, Math.min(1, (W - 900) / 280)); const cw = 190 + 50 * k; const rx0 = 236 + 56 * k, rx1 = rx0 + cw; const iw = 280 + 60 * k; const pitch = 37, ry0 = 96;
  let recs = ''; rows.forEach((r, i) => { const y = ry0 + i * pitch; recs += `${t(rx0, y - 16, r.label, 'fx-l')}${t(rx0, y, r.text, r.req ? 'fx-b' : 'fx-v')}<path class="fx-rule${r.a.verification === 'verified' ? '' : ' open'}" d="M${rx0} ${y + 8}H${rx1}"/>`; r.y = y + 8; });
  // network: the species, the functions it is linked to (a missing link is not drawn), the plants a practitioner listed with it
  const nx = rx1 + 56 + 22 * k; const S = { x: nx, y: 244 }; const links = d.function_links.filter(l => l.species === sp.id && l.drawn); const FN = new Map(d.functions.map(f => [f.id, f])); const sup = E?.FUNCTION_SUPPORT || {};
  const order = [link.function, ...links.map(l => l.function).filter(f => f !== link.function)]; const fy = i => 132 + i * (order.length > 3 ? 78 : 112); const fx = nx + 100 + 28 * k;
  let net = ''; for (const r of rows) net += curve(rx1, r.y, S.x - 9, S.y, r.req ? 'fx-ln req' : 'fx-ln faint');
  const F = {}; order.forEach((f, i) => { const l = links.find(x => x.function === f); F[f] = { x: fx, y: fy(i) }; net += `<path class="fx-ln${l.status === 'derived' ? ' on' : ' open'}" d="M${S.x + 9} ${S.y}L${fx - 9} ${fy(i)}"/>${fnMark(fx, fy(i), 16, sup[f]?.arranged ? ' on' : '')}${t(fx + 8, fy(i) <= S.y ? fy(i) - 16 : fy(i) + 28, FN.get(f)?.label || f, 'fx-b', 15, 'end')}`; });
  const rel = d.relations.filter(r => r.live && !r.placeholder && (r.a === sp.id || r.b === sp.id)); const others = [...new Set(rel.map(r => r.a === sp.id ? r.b : r.a))];
  others.forEach((id, i) => { const a = Math.PI * (0.3 + 0.4 * (others.length > 1 ? i / (others.length - 1) : 0.5)); const x = S.x + Math.cos(a) * 78, y = S.y + 22 + Math.sin(a) * 104; const o = d.species.find(s => s.id === id); net += `<path class="fx-ln thin" d="M${S.x} ${S.y + 9}L${r1(x)} ${r1(y)}"/><circle class="fx-sp sm" cx="${r1(x)}" cy="${r1(y)}" r="4.5"><title>${esc(o ? nameOf(o) : id)}</title></circle>`; });
  net += `<circle class="fx-sp" cx="${S.x}" cy="${S.y}" r="9"/>${t(S.x + 14, S.y + 24, sp.scientific_name, 'fx-sci')}`;
  // arrangement and garden: the saved reference garden, in plan over its own elevation, at one scale
  const B = ref.site.boundary; const xs = B.map(q => q[0]), ys = B.map(q => q[1]); const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys); const maxH = Math.max(1, ...objs.map(o => o.height_m || 0));
  const px0 = fx + 66 + 30 * k; const s = Math.min((W - px0 - 14) / (x1 - x0), (G - 58 - 30) / ((y1 - y0) + maxH)); const X = x => px0 + (x - x0) * s; const pb = G - maxH * s - 30; const Y = y => pb - (y - y0) * s; const pts = poly => poly.map(q => `${r1(X(q[0]))},${r1(Y(q[1]))}`).join(' ');
  const tone = {}; for (const o of objs) if (!(o.species_id in tone)) tone[o.species_id] = TONE[Object.keys(tone).length % TONE.length]; if (sp.id in tone && tone[sp.id] !== TONE[0]) { const k = Object.keys(tone).find(id => tone[id] === TONE[0]); if (k) tone[k] = tone[sp.id]; tone[sp.id] = TONE[0]; }
  let plan = `<polygon class="fx-site" points="${pts(B)}"/>`; for (const b of (ref.site.beds || []).filter(b => b.status !== 'rejected' && Array.isArray(b.polygon))) plan += `<polygon class="fx-bed" points="${pts(b.polygon)}"/>`;
  for (const f of ref.site.features || []) if (f.kind === 'no-plant-zone' && f.polygon) plan += `<polygon class="fx-open" points="${pts(f.polygon)}"/>`; else if (f.kind === 'existing-tree' && f.position_m) plan += `<circle class="fx-tree" cx="${r1(X(f.position_m[0]))}" cy="${r1(Y(f.position_m[1]))}" r="${r1((f.radius_m ?? 1.5) * s)}"/>`;
  const by = role => objs.filter(o => role.test(o.role)); for (const o of [...by(/^ground/), ...by(/^accent/), ...by(/^screen/)]) plan += `<circle cx="${r1(X(o.position_m[0]))}" cy="${r1(Y(o.position_m[1]))}" r="${r1(Math.max(2, o.proxy_radius_m * s))}" fill="${tone[o.species_id]}" fill-opacity="${/^screen/.test(o.role) ? .5 : .3}" stroke="${tone[o.species_id]}" stroke-width="${/^screen/.test(o.role) ? 1 : .6}"/>`;
  const FORM = new Map(d.species.map(x => [x.id, x.growth_form_label || ''])); let elev = '';
  for (const o of objs.slice().sort((a, b) => b.position_m[1] - a.position_m[1])) elev += `<g transform="translate(0 ${G})">${silhouette(X(o.position_m[0]), (o.height_m || 0.1) * s, Math.max(2, o.proxy_radius_m * s), FORM.get(o.species_id), tone[o.species_id], (o.height_m || 0) < 0.35)}</g>`;
  const centre = role => { const a = objs.filter(o => role.test(o.role) && (role.source.includes('screen') ? o.species_id === sp.id : true)); if (!a.length) return null; return { x: X(a.reduce((q, o) => q + o.position_m[0], 0) / a.length), y: Y(a.reduce((q, o) => q + o.position_m[1], 0) / a.length), n: a.length }; };
  const cS = centre(/^screen/), cG = centre(/^ground/); let to = '';
  if (F['z:screen'] && cS) to += curve(F['z:screen'].x + 9, F['z:screen'].y, X(x0) + 2, cS.y, 'fx-ln on'); if (F['z:ground_cover'] && cG) to += curve(F['z:ground_cover'].x + 9, F['z:ground_cover'].y, X(x0) + 2, cG.y, 'fx-ln on');
  let drop = ''; for (const o of by(/^screen/)) drop += `<path class="fx-drop" d="M${r1(X(o.position_m[0]))} ${r1(Y(o.position_m[1]))}V${r1(G - (o.height_m || 0) * s)}"/>`;
  const scale = `<path class="fx-dim" d="M${r1(X(x0))} ${G + 12}H${r1(X(x0 + 1))}m0 -3v6M${r1(X(x0))} ${G + 9}v6"/>${t(X(x0 + 1) + 6, G + 16, '1 m', 'fx-l')}`;
  const nSal = objs.filter(o => o.species_id === sp.id).length; const stage = (x, a, b, anchor = 'start') => `${t(x, G + 44, a, 'fx-st', 15, anchor)}${t(x, G + 62, b, 'fx-l', 15, anchor)}`;
  const label = `One drawing in five parts, left to right. An illustration of ${sp.scientific_name}. ${rows.length} of its ${AT.length} recorded fields, among them ${rows.filter(r => r.req).map(r => `${r.label}: ${r.text}`).join('; ')}. Its place in the knowledge network: linked to ${order.map(f => FN.get(f)?.label).join(', ')}, and listed by practitioners with ${plural(others.length, 'other plant')}. The plan of the reference garden ${ref.name || ''} with ${objs.length} plant objects, ${nSal} of them ${nameOf(sp)}. The same plants in elevation, drawn from claimed heights and spreads.`;
  return svg('fx-cover', W, H, label, `
    <defs>${MATTE}</defs>
    ${artHref ? `<image href="${esc(artHref)}" x="${r1(-22 * k - 8)}" y="${r1(G - iw * 1.094)}" width="${r1(iw)}" height="${r1(iw * 1.0797)}" filter="url(#fx-matte)" class="fx-art"/>` : ''}
    ${recs}${net}${to}${drop}${plan}<path class="fx-ground" d="M0 ${G}H${W}"/>${elev}${scale}
    ${stage(0, 'Botanical specimen', 'illustration, not evidence')}${stage(rx0, 'Structured records', `${AT.length} fields, ${sp.claims?.live ?? ''} claims`)}${stage(S.x - 9, 'Knowledge network', `${plural(links.length, 'function link')}`)}${stage(X(x0), 'Algorithmic planting', `${objs.length} plant objects`)}${stage(W, 'Garden', 'in elevation', 'end')}`);
}

// ================================================================ Research & Method: one figure per step
const W = 640, H = 380;
function fig1({ d }) {   // local data: the public-tree inventory as data points, and how local each claim is
  const claims = Object.values(d.claims); const inv = claims.filter(c => c.field === 'local_mature_size' && !c.cultivar && !c.value?.subset && c.value?.n).slice(0, 3); const maxM = Math.max(30, ...inv.map(c => c.value.max || 0)); const ax0 = 356, ax1 = 618; const mx = m => ax0 + (m / maxM) * (ax1 - ax0); const per = 25;
  let b = ''; inv.forEach((c, i) => { const y = 52 + i * 84; const sp = d.species.find(s => s.slug === c.plant); const v = c.value; const n = Math.round(v.n / per); let dots = ''; for (let k = 0; k < n; k++) dots += `<circle cx="${22 + Math.floor(k / 5) * 7.2}" cy="${y + 14 + (k % 5) * 7.2}" r="2.1"/>`;
    b += `${t(20, y, sp?.scientific_name || c.plant, 'fx-sci')}${t(336, y, `${v.n.toLocaleString('en')} public trees`, 'fx-l', 15, 'end')}<g class="fx-dots">${dots}</g>
      <path class="fx-track" d="M${ax0} ${y + 30}H${ax1}"/>${v.p10 != null ? `<path class="fx-range" d="M${r1(mx(v.p10))} ${y + 30}H${r1(mx(v.p90))}"/>` : ''}<path class="fx-tick" d="M${r1(mx(v.median))} ${y + 21}v18"/>${v.max ? `<circle class="fx-ring" cx="${r1(mx(v.max))}" cy="${y + 30}" r="3.5"/>` : ''}${t(mx(v.median), y + 54, `${v.median} m`, 'fx-l', 15, 'middle')}`; });
  const ay = 52 + inv.length * 84 - 8; b += `<path class="fx-axis" d="M${ax0} ${ay}H${ax1}"/>${[0, 10, 20, 30].filter(m => m <= maxM).map(m => `<path class="fx-axis" d="M${r1(mx(m))} ${ay}v5"/>${t(mx(m), ay + 18, `${m}${m === 0 ? '' : ' m'}`, 'fx-l', 15, 'middle')}`).join('')}`;
  b += `${t(ax0, 28, 'height class: middle 80 %, median, highest', 'fx-l')}${t(20, 28, `one dot = ${per} trees`, 'fx-l')}`;
  // locality of every claim, by the place its source speaks for
  const grp = [['Vancouver and BC', /Vancouver|British Columbia/, 'near'], ['Pacific Northwest', /Pacific Northwest|Oregon/, 'mid'], ['elsewhere', /./, 'far']]; const n = grp.map(() => 0); for (const c of claims) { const i = grp.findIndex(g => g[1].test(c.place_label || '')); n[i < 0 ? 2 : i]++; }
  const tot = claims.length; let x = 20; const y = 334; grp.forEach((g, i) => { const w = (n[i] / tot) * 600; b += `<rect class="fx-loc ${g[2]}" x="${r1(x)}" y="${y}" width="${r1(Math.max(1, w - 2))}" height="9"/>${t(i === 0 ? x : i === 2 ? 620 : Math.max(x, 190), y + 28, `${g[0]} · ${n[i]}`, 'fx-l', 15, i === 2 ? 'end' : 'start')}`; x += w; });
  b += t(20, y - 10, `where each of the ${tot} claims speaks for`, 'fx-l');
  return { svg: svg('fx-1', W, H, `Local data as stored: ${inv.map(c => `${c.value.n} public ${c.plant.replace(/-/g, ' ')} in the City of Vancouver inventory, median height class ${c.value.median} metres`).join('; ')}. Of ${tot} claims, ${n[0]} speak for Vancouver or British Columbia, ${n[1]} for the Pacific Northwest and ${n[2]} for elsewhere.`, b),
    cap: `The City of Vancouver public-tree inventory, as the claims record it. Heights are banded classes, not measurements. No site coordinates are stored, so no map is drawn.` };
}
function fig2({ d, it, T }) {   // one source statement becomes one structured claim
  const c = it.claim, k = it.check; const src = d.sources[c.source_id]; const fields = [['plant', it.sp.scientific_name, 'sci'], ['field', T.human(c.field)], ['value', T.valueLabels(d, c).join(', '), 'b'], ['source', srcShort(d, c.source_id)], ['place', c.place_label || ''], ['confidence', String(c.confidence)], ['recorded', c.recorded_at], ['status', T.human(c.status), c.status === 'verified' ? '' : 'open']];
  const fx0 = 380, fy = i => 56 + i * 36; let b = `<path class="fx-page" d="M20 36H236l24 24V318H20Z"/><path class="fx-page" d="M236 36v24h24"/>${t(38, 72, wrap(srcShort(d, c.source_id), 24).slice(0, 2), 'fx-b', 16)}${t(38, 116, wrap(cut(k?.locator || src?.publisher || '', 56), 30).slice(0, 2), 'fx-l', 14)}
    ${[0, 1, 2].map(i => `<path class="fx-greek" d="M38 ${152 + i * 12}H${i === 2 ? 150 : 236}"/>`).join('')}${t(38, 222, wrap(`“${cut(k?.excerpt || c.text, 44)}”`, 17).slice(0, 3), 'fx-q', 25)}${[0, 1].map(i => `<path class="fx-greek" d="M38 ${282 + i * 12}H${i ? 170 : 236}"/>`).join('')}`;
  fields.forEach(([l, val, cls], i) => { b += `${t(fx0, fy(i) - 15, l, 'fx-l')}${t(fx0, fy(i), cut(val, 34), cls === 'sci' ? 'fx-sci' : cls === 'b' ? 'fx-b' : 'fx-v')}<path class="fx-rule${cls === 'open' ? ' open' : ''}" d="M${fx0} ${fy(i) + 8}H620"/>`; });
  b += curve(262, 214, fx0 - 8, fy(2) - 4, 'fx-ln on') + curve(262, 68, fx0 - 8, fy(3) - 4, 'fx-ln faint') + `<circle class="fx-sp sm" cx="${fx0 - 8}" cy="${fy(2) - 4}" r="3"/>`;
  b += t(fx0, fy(7) + 32, wrap(c.id.split(':').join(': '), 34), 'fx-l', 13);
  return { svg: svg('fx-2', W, H, `A statement in ${srcShort(d, c.source_id)}, “${k?.excerpt || c.text}”, becomes one claim: plant ${it.sp.scientific_name}, field ${T.human(c.field)}, value ${T.valueLabels(d, c).join(', ')}, place ${c.place_label}, confidence ${c.confidence}, status ${T.human(c.status)}.`, b),
    cap: `Left, the words on the source page. Right, the claim they became. The status line is dashed because no person has verified it yet.` };
}
function fig3({ d, it, T }) {   // sources compared on one field; verification and a recorded disagreement
  const AT = d.attributes.filter(a => a.species === it.sp.id && a.disagreement?.length); const a = AT.find(x => x.facet === 'exposure') || AT[0]; if (!a) return null; const FL = d.facets.find(f => f.id === a.facet)?.label || a.facet;
  const srcs = a.sources.slice(0, 5), vals = a.values.slice(0, 6); const cx = j => 256 + j * ((500 - 256) / Math.max(1, vals.length - 1)); const ry = i => 112 + i * 50; const cl = sid => a.claims.map(id => d.claims[id]).find(c => c && c.source_id === sid);
  let b = vals.map((v, j) => t(cx(j), 44, wrap(v.label.replace('/', '/ '), 9).slice(0, 4), 'fx-l', 12, 'middle')).join('');
  srcs.forEach((sid, i) => { const c = cl(sid); const ck = c && d.evidence_checks[c.id]; b += `<path class="fx-track" d="M240 ${ry(i)}H516"/>${t(20, ry(i) - 2, cut(srcShort(d, sid), 27), 'fx-b')}${ck ? t(20, ry(i) + 14, `AI check: ${T.AI_WORD[ck.result] || T.human(ck.result)}`, 'fx-l') : ''}`;
    vals.forEach((v, j) => { b += v.sources.includes(sid) ? `<circle class="fx-sp" cx="${r1(cx(j))}" cy="${ry(i)}" r="6.5"/>` : `<circle class="fx-none" cx="${r1(cx(j))}" cy="${ry(i)}" r="2"/>`; });
    b += c?.status === 'verified' ? `<circle class="fx-sp" cx="592" cy="${ry(i)}" r="7"/>` : `<circle class="fx-ring open" cx="592" cy="${ry(i)}" r="7"/>`; });
  b += t(592, 44, ['verified by', 'a person'], 'fx-l', 12, 'middle');
  a.disagreement.slice(0, 3).forEach((g, n) => { const ii = g.sources.map(s => srcs.indexOf(s)).filter(i => i >= 0).sort((p, q) => p - q); if (ii.length < 2) return; const x = 534 + n * 12; b += `<path class="fx-ln open" d="M${x - 8} ${ry(ii[0])}H${x}V${ry(ii[ii.length - 1])}H${x - 8}"/>`; });
  const ly = ry(srcs.length - 1) + 62; b += `<circle class="fx-sp" cx="26" cy="${ly - 4}" r="5"/>${t(40, ly, 'the source records this value', 'fx-l')}<circle class="fx-ring open" cx="246" cy="${ly - 4}" r="5"/>${t(260, ly, 'not yet verified', 'fx-l')}<path class="fx-ln open" d="M388 ${ly - 10}h8v12h-8"/>${t(406, ly, 'recorded disagreement, both kept', 'fx-l')}`;
  const nv = srcs.filter(s => cl(s)?.status === 'verified').length;
  return { svg: svg('fx-3', W, H, `${FL} of ${it.sp.scientific_name} in ${srcs.length} sources: ${srcs.map(s => `${srcShort(d, s)} records ${vals.filter(v => v.sources.includes(s)).map(v => v.label).join(', ')}`).join('; ')}. ${plural(a.disagreement.length, 'disagreement')} recorded and kept. ${nv} of ${srcs.length} claims verified by a person.`, b),
    cap: `${esc(FL)} of <i class="ab-sci">${esc(it.sp.scientific_name)}</i>, source by source. Where two sources disagree both values stay; nothing is averaged, and an AI check is never a verification.` };
}
function fig4({ d, T }) {   // the survey as aggregate counts only: kinds of practitioner statement, and the fields marked as must-pass
  const pr = Object.values(d.claims).filter(c => c.source_type === 'practitioner'); const kinds = [['selection_reason', 'reasons for choosing a plant', 'on'], ['observation', 'observations', 'mid'], ['warning', 'warnings', 'warn']]; const FLD = f => (d.facets.find(x => x.id === f)?.label || T.human(f)).toLowerCase();
  let b = '', y = 38; for (const [k, word, cls] of kinds) { const cs = pr.filter(c => c.claim_kind === k); if (!cs.length) continue; const by = {}; for (const c of cs) by[c.field] = (by[c.field] || 0) + 1; b += t(20, y, `${cs.length} ${cs.length === 1 ? word.replace(/s( |$)/, '$1') : word}`, 'fx-b'); let x = 20;
    for (const [f, n] of Object.entries(by).sort((p, q) => q[1] - p[1])) { for (let i = 0; i < n; i++) b += `<rect class="fx-unit ${cls}" x="${x + i * 20}" y="${y + 12}" width="16" height="16" rx="2"/>`; b += t(x, y + 46, wrap(FLD(f), Math.max(9, n * 3)).slice(0, 2), 'fx-l', 12); x += Math.max(n * 20, 74) + 22; } y += 80; }
  const groups = d.groups.map(g => d.facets.filter(f => f.group === g.id)).filter(x => x.length); const gates = d.facets.filter(f => f.gate); let x = 20; const fy = 318; b += `<path class="fx-axis" d="M20 ${fy - 34}H620"/>${t(20, fy - 14, `${gates.length} of ${d.facets.length} fields marked must-pass`, 'fx-b')}`;
  groups.forEach((fs, gi) => { fs.forEach((f, i) => { b += `<rect class="fx-field${f.gate ? ' on' : ''}" x="${x + i * 19}" y="${fy}" width="14" height="14" rx="7"><title>${esc(f.label)}</title></rect>`; }); b += t(x, fy + 32, wrap((d.groups.filter(g => d.facets.some(f => f.group === g.id))[gi]?.label || '').replace(' & ', ' and '), Math.max(12, fs.length * 2.8)).slice(0, 3), 'fx-l', 12); x += fs.length * 19 + 26; });
  return { svg: svg('fx-4', W, H, `${pr.length} practitioner statements in this release, counted by kind: ${kinds.map(([k, w]) => { const n = pr.filter(c => c.claim_kind === k).length; return `${n} ${n === 1 ? w.replace(/s( |$)/, '$1') : w}`; }).join(', ')}. ${gates.length} of ${d.facets.length} fields are marked as must-pass: ${gates.map(f => f.label).join(', ')}.`, b),
    cap: `Counts only: every practitioner statement in the release, by its kind and the field it speaks about. No answer and no respondent is shown. Filled circles are the fields marked must-pass.` };
}
function fig5({ d, it, artHref }) {   // professional sources read one at a time, against the illustration that is not one of them
  const AT = d.attributes.filter(a => a.species === it.sp.id); const dbs = Object.values(d.sources).filter(s => s.type === 'database').map(s => ({ s, n: d.groups.map(g => AT.filter(a => a.group === g.id && a.sources.includes(s.id)).length) })).filter(x => x.n.some(Boolean)).sort((p, q) => q.n.reduce((a, b) => a + b, 0) - p.n.reduce((a, b) => a + b, 0)).slice(0, 6);
  const gx = j => 380 + j * 74; const ry = i => 112 + i * 52; let b = artHref ? `<defs>${MATTE}</defs><image href="${esc(artHref)}" x="-6" y="34" width="214" height="231" filter="url(#fx-matte)" class="fx-art"/>` : ''; b += `${t(20, 296, it.sp.scientific_name, 'fx-sci')}${t(20, 314, ['AI-generated illustration:', 'presentation, not a source'], 'fx-l', 13)}`;
  d.groups.forEach((g, j) => { b += t(gx(j), 40, wrap(g.label.replace(' & ', ' and '), 10).slice(0, 4), 'fx-l', 12, 'middle'); });
  dbs.forEach(({ s, n }, i) => { b += `<path class="fx-track" d="M222 ${ry(i) + 9}H620"/>${t(222, ry(i), cut(srcShort(d, s.id), 17), 'fx-b')}`; n.forEach((k, j) => { for (let q = 0; q < k; q++) b += `<circle class="fx-sp sm" cx="${r1(gx(j) - (Math.min(k, 6) - 1) * 4.5 + (q % 6) * 9)}" cy="${ry(i) - 4 - Math.floor(q / 6) * 9}" r="3.4"/>`; if (!k) b += `<circle class="fx-none" cx="${gx(j)}" cy="${ry(i) - 4}" r="2"/>`; }); });
  const tot = dbs.reduce((a, x) => a + x.n.reduce((p, q) => p + q, 0), 0);
  return { svg: svg('fx-5', W, H, `${dbs.length} published plant databases read for ${it.sp.scientific_name}: ${dbs.map(x => `${srcShort(d, x.s.id)} fills ${x.n.reduce((p, q) => p + q, 0)} fields`).join('; ')}. The illustration beside them is AI-generated artwork and is not a source.`, b),
    cap: `One dot is one field of <i class="ab-sci">${esc(it.sp.scientific_name)}</i> that a published database fills, by attribute group (${tot} in all). The illustration is artwork; no value is read from it.` };
}
function fig6({ d, it, E }) {   // recorded traits ↔ the spatial functions that require them
  const sup = E?.FUNCTION_SUPPORT || {}; const links = d.functions.map(f => ({ f, l: d.function_links.find(x => x.species === it.sp.id && x.function === f.id) })); const traits = []; const pairs = [];
  for (const { f, l } of links) if (l?.drawn) for (const r of l.requirements || []) if (r.result === 'met') for (const lab of [...new Set((r.evidence || []).map(e => e.target_label))]) { if (!traits.includes(lab)) traits.push(lab); pairs.push([lab, f.id, r.strength]); }
  const tr = traits.slice(0, 7); const ty = i => 60 + i * (270 / Math.max(1, tr.length - 1 || 1)); const fy = i => 60 + i * (270 / (links.length - 1)); const tx1 = 214, fx0 = 372; let b = `${t(20, 28, `recorded traits of ${nameOf(it.sp).toLowerCase()}`, 'fx-l')}${t(fx0 + 22, 28, 'spatial functions', 'fx-l')}`;
  for (const [lab, fid, st] of pairs) { const i = tr.indexOf(lab), j = links.findIndex(x => x.f.id === fid); if (i < 0) continue; b += curve(tx1 + 6, ty(i), fx0 - 12, fy(j), st === 'required' ? 'fx-ln on' : 'fx-ln thin'); }
  tr.forEach((lab, i) => { b += `<circle class="fx-sp sm" cx="${tx1}" cy="${r1(ty(i))}" r="4"/>${t(tx1 - 12, ty(i) + 4, wrap(lab.replace(/\s*\(.*\)/, ''), 26).slice(0, 1), 'fx-v', 14, 'end')}`; });
  links.forEach(({ f, l }, j) => { const on = l?.drawn; b += `${fnMark(fx0, fy(j), 18, on ? (l.status === 'derived' ? ' on' : ' cand') : ' gap')}${t(fx0 + 22, fy(j) - 1, f.label, on ? 'fx-b' : 'fx-v dim')}${t(fx0 + 22, fy(j) + 15, on ? [l.status === 'derived' ? `recorded use${l.via_use_labels?.[0] ? `: ${l.via_use_labels[0].toLowerCase()}` : ''}` : 'inferred from traits', sup[f.id]?.arranged ? 'arranged in Design' : 'recorded only, not arranged'] : 'no link: a gap in the records', 'fx-l', 13)}`; });
  b += `<path class="fx-ln on" d="M20 ${H - 10}h26"/>${t(54, H - 6, 'required, met', 'fx-l')}<path class="fx-ln thin" d="M160 ${H - 10}h26"/>${t(194, H - 6, 'preferred, met', 'fx-l')}`;
  const drawn = links.filter(x => x.l?.drawn);
  return { svg: svg('fx-6', W, H, `${nameOf(it.sp)}: ${tr.length} recorded traits meet what ${drawn.length} spatial functions require (${drawn.map(x => x.f.label).join(', ')}). ${links.filter(x => !x.l?.drawn).map(x => x.f.label).join(' and ')} have no link, and no line is drawn to them.`, b),
    cap: `A line is a requirement of the function met by a recorded trait. A function with no line has no link for this plant: a gap in the records, not a verdict on the plant.` };
}
function fig7({ d, E }) {   // the whole graph of the release, what Design reads from it, and what it does not hold yet
  const sup = E?.FUNCTION_SUPPORT || {}; const C = { x: 176, y: 190 }, R = 126, r = 44; const n = d.species.length; const P = {}; d.species.forEach((s, i) => { const a = -Math.PI / 2 + (i / n) * 2 * Math.PI; P[s.id] = { x: C.x + R * Math.cos(a), y: C.y + R * Math.sin(a), a }; });
  d.functions.forEach((f, i) => { const a = -Math.PI / 2 + (i / d.functions.length) * 2 * Math.PI; P[f.id] = { x: C.x + r * Math.cos(a), y: C.y + r * Math.sin(a), a }; });
  let b = ''; const rel = d.relations.filter(x => x.live && !x.placeholder); for (const x of rel) { const p = P[x.a], q = P[x.b]; if (!p || !q) continue; const m = (p.a + q.a) / 2 + (Math.abs(p.a - q.a) > Math.PI ? Math.PI : 0); b += `<path class="fx-ln thin" d="M${r1(p.x)} ${r1(p.y)}Q${r1(C.x + (R + 22) * Math.cos(m))} ${r1(C.y + (R + 22) * Math.sin(m))} ${r1(q.x)} ${r1(q.y)}"/>`; }
  const drawn = d.function_links.filter(l => l.drawn); for (const l of drawn) { const p = P[l.species], q = P[l.function]; if (p && q) b += `<path class="fx-ln${l.status === 'derived' ? ' on' : ' open'}" d="M${r1(p.x)} ${r1(p.y)}L${r1(q.x)} ${r1(q.y)}"/>`; }
  for (const s of d.species) { const p = P[s.id]; const left = Math.cos(p.a) < -0.2, mid = Math.abs(Math.cos(p.a)) <= 0.2; b += `<circle class="fx-sp" cx="${r1(p.x)}" cy="${r1(p.y)}" r="5.5"><title>${esc(s.scientific_name)}</title></circle>`; }
  for (const f of d.functions) { const p = P[f.id]; b += fnMark(p.x, p.y, 13, sup[f.id]?.arranged ? ' on' : ''); }
  const X0 = 380; let y = 52; b += t(X0, 28, 'read by Design', 'fx-l'); for (const f of d.functions) { const on = sup[f.id]?.arranged; b += `${fnMark(X0 + 8, y - 4, 14, on ? ' on' : '')}${t(X0 + 26, y, f.label, on ? 'fx-b' : 'fx-v dim')}${t(620, y, on ? 'arranged' : 'recorded only', 'fx-l', 15, 'end')}`; y += 30; }
  y += 8; b += `<path class="fx-axis" d="M${X0} ${y - 18}H620"/><circle class="fx-sp" cx="${X0 + 8}" cy="${y}" r="5.5"/>${t(X0 + 26, y + 4, plural(n, 'plant'), 'fx-v')}<path class="fx-ln on key" d="M${X0} ${y + 24}h18"/>${t(X0 + 26, y + 28, `${drawn.filter(l => l.status === 'derived').length} links from a recorded use`, 'fx-v')}<path class="fx-ln open key" d="M${X0} ${y + 48}h18"/>${t(X0 + 26, y + 52, `${drawn.filter(l => l.status !== 'derived').length} inferred from traits`, 'fx-v')}<path class="fx-ln thin" d="M${X0} ${y + 72}h18"/>${t(X0 + 26, y + 76, `${rel.length} plant-to-plant relations`, 'fx-v')}`;
  y += 100; b += `<rect class="fx-slot" x="${X0}" y="${y}" width="240" height="${Math.max(40, H - y - 16)}" rx="3"/>${t(X0 + 120, y + (H - y - 16) / 2 - 2, ['images and plans:', 'not in the graph yet'], 'fx-l', 14, 'middle')}`;
  const gaps = d.stats.links_by_status?.unknown ?? (d.function_links.length - drawn.length);
  return { svg: svg('fx-7', W, H, `The knowledge graph of this release: ${n} plants around ${d.functions.length} spatial functions, with ${drawn.filter(l => l.status === 'derived').length} links from a recorded use, ${drawn.filter(l => l.status !== 'derived').length} inferred from traits and ${rel.length} recorded plant-to-plant relations. ${gaps} possible links are missing and are not drawn. Design arranges ${d.functions.filter(f => sup[f.id]?.arranged).map(f => f.label).join(' and ')}; the other functions are recorded only. Images and plans are not in the graph yet.`, b),
    cap: `Circles are the ${n} plants, squares the ${d.functions.length} spatial functions; filled squares are the ones Design can arrange. ${gaps} possible links have no evidence and are left undrawn. The empty frame is the multimodal part still to come.` };
}
const FIGS = [fig1, fig2, fig3, fig4, fig5, fig6, fig7];
export function step(i, ctx) { try { return FIGS[i - 1]?.(ctx) || null; } catch (e) { console.error(`figure ${i}`, e); return null; } }
