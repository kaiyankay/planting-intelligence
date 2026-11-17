// The Algorithm view: the arrangement of one design version, drawn as a diagram. It is a pure reading of the model — the site
// outline, the beds, the plant objects (position, mature-crown proxy radius, role, group) and the version's own evaluation — and
// never places, moves or invents a plant. One layer is shown at a time:
//   species  — where each species stands (one fixed colour per species)
//   pattern  — how the engine arranged them: screen rows and their stagger, ground-cover drifts / bands / patches
//   crowns   — plantable ground under a mature crown (the engine's sample grid, the same count as the Ground Cover estimate)
//   gaps     — what each function leaves open: uncovered lengths of a screened edge, bare ground of a ground-cover bed
// draw(project, version, opts) → { inner, T, legend, caption, stats }; svg(...) wraps it for a page outside the Studio.
// `project` only needs `.site`; nothing here reads application state.
import * as G from './geom.js';
import { fit2D } from './render.js';
import { freeArea, obstaclesFor, ARRANGEMENT_RULES } from './engine.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const f1 = v => (Math.round(v * 10) / 10).toFixed(1);

/* One colour per species, fixed by id: the colour follows the plant through every design, legend and layer. The ten were found by
   a search in OKLCH for the set whose worst pair is furthest apart for normal, protan and deutan vision (every pair, not only
   neighbours: on a plan any two species can touch); figures are in the V4.3 report. They identify a species — they are not leaf or
   flower colours. A species outside the table gets the neutral, never a borrowed hue. */
export const SPECIES_COLOUR = {
  'plant:acer-palmatum': '#a42805',
  'plant:cercidiphyllum-japonicum': '#f8a80f',
  'plant:cornus-nuttallii': '#eb6879',
  'plant:cornus-sericea': '#762e92',
  'plant:gaultheria-shallon': '#01654c',
  'plant:vaccinium-ovatum': '#0075d0',
  'plant:arctostaphylos-uva-ursi': '#4cdc90',
  'plant:polystichum-munitum': '#9a8013',
  'plant:achillea-millefolium': '#6ec9ff',
  'plant:gaillardia-aristata': '#b483f4',
};
export const UNKNOWN_COLOUR = '#8d8a82';
export const colourOf = id => SPECIES_COLOUR[id] || UNKNOWN_COLOUR;

export const LAYERS = [
  { id: 'species', label: 'Species', title: 'where each species stands', caption: 'Each disc is one plant object at its mature crown. Colour names the species, not its leaf or flower.' },
  { id: 'pattern', label: 'Pattern', title: 'how the engine arranged them: rows, bands, patches, drifts', caption: 'Rows, bands and patches are traced from the plant objects of this version and the parameters the engine recorded for them.' },
  { id: 'crowns', label: 'Crown cover', title: 'plantable ground under a mature crown', caption: 'An estimate on a sample grid from claimed mature spreads. It has no pass mark and is not the cover a planting reaches.' },
  { id: 'gaps', label: 'Gaps', title: 'what each function leaves open', caption: 'Screen: crowns projected on the screened edge, overlaps counted once. Ground Cover: plantable ground under no ground-layer crown. Estimates, not measured performance.' },
];
const INK = '#27241f', INK2 = '#5d584f', INK3 = '#8d877b', PAPER = '#fffdf8', SHEET = '#ffffff', OLIVE = '#3b5538', RUST = '#b04f36';
const C_COVER = '#9db89a', C_SCREEN = '#cfd6c6', C_BARE = '#efd9b4', C_BARE_STRONG = '#e3a35f';

/* same-species plants that stand within `reach` of one another: the visible grain of a drift or a patch, read from the objects */
function clusters(plants, reach) {
  const seen = new Set(), out = [];
  for (const p of plants) { if (seen.has(p.id)) continue; const c = [], q = [p]; seen.add(p.id);
    while (q.length) { const a = q.pop(); c.push(a); for (const b of plants) if (!seen.has(b.id) && b.species_id === a.species_id && G.dist(a.position_m, b.position_m) <= reach(a, b)) { seen.add(b.id); q.push(b); } }
    out.push(c); }
  return out;
}
/* the engine's sample grid for one bed, each point classed: under a ground-layer crown · under a screen crown only · bare */
export function coverGrid(project, bed, version) {
  const P = version.plant_objects.filter(p => p.bed_id === bed.id); const ground = P.filter(p => p.role === 'ground' || p.role === 'accent'); const screen = P.filter(p => /^screen/.test(p.role));
  const free = freeArea(project, bed, obstaclesFor(project), screen); const st = ARRANGEMENT_RULES.area_sample.value; let cov = 0, scr = 0, bare = 0;
  const cells = free.points.map(pt => { const g = ground.some(p => G.dist(pt.q, p.position_m) <= p.proxy_radius_m); const c = g ? 'cover' : pt.taken ? 'screen' : 'bare'; if (g) cov++; else if (pt.taken) scr++; else bare++; return { q: pt.q, c }; });
  const n = cells.length; return { st, cells, n, cover: cov, screen: scr, bare, share: n ? G.round(cov / n) : 0, plantable_m2: free.plantable_m2, ground: ground.length };
}
/* run-length rectangles of one class along each grid row: thousands of sample points become a few hundred marks */
function runs(cells, st, cls) {
  const rows = new Map(); for (const c of cells) if (c.c === cls) { const k = c.q[1].toFixed(3); if (!rows.has(k)) rows.set(k, []); rows.get(k).push(c.q[0]); }
  const out = []; for (const [k, xs] of rows) { xs.sort((a, b) => a - b); let x0 = xs[0], x1 = xs[0]; for (let i = 1; i <= xs.length; i++) { if (i < xs.length && xs[i] - x1 < st * 1.5) { x1 = xs[i]; continue; } out.push([x0 - st / 2, +k - st / 2, x1 - x0 + st, st]); x0 = x1 = xs[i]; } }
  return out;
}

export function draw(project, version, o = {}) {
  const site = project.site; const W = o.W || 800, H = o.H || 520; const layer = LAYERS.some(l => l.id === o.layer) ? o.layer : 'species'; const guides = !!o.guides;
  const base = fit2D(project, W, H, o.inset || { l: 40, r: 40, t: 40, b: 40 }); const pz = o.pz || { x: 0, y: 0, k: 1 }; const k = base.k * pz.k;
  const T = { k, toPx: m => { const [x, y] = base.toPx(m); return [x * pz.k + pz.x, y * pz.k + pz.y]; }, toM: ([px, py]) => base.toM([(px - pz.x) / pz.k, (py - pz.y) / pz.k]), B: base.B };
  const P = T.toPx; const n1 = v => v.toFixed(1); const pt = m => P(m).map(n1).join(' '); const ring = r => 'M' + r.map(pt).join('L') + 'Z'; const shape = (outer, holes = []) => [outer, ...(holes || [])].map(ring).join('');
  const U = o.uid || 'av'; const nameOf = o.nameOf || (id => ({ common: '', sci: String(id).replace(/^plant:/, '') }));
  const plants = version?.plant_objects || []; const beds = site.beds.filter(b => b.status !== 'rejected'); const inVersion = new Set(version?.bed_ids || (version?.bed_id ? [version.bed_id] : beds.map(b => b.id)));
  const ev = version?.evaluation || {}; const zones = version?.zones || []; const groups = version?.groups || [];
  const measured = site.scale?.status !== 'unknown';
  const o0 = P([0, 0]); const step = k >= 26 ? 1 : k >= 12 ? 2 : 5; const gs = step * k;
  let h = `<defs><pattern id="${U}-grid" width="${gs.toFixed(2)}" height="${gs.toFixed(2)}" patternUnits="userSpaceOnUse" x="${o0[0].toFixed(2)}" y="${o0[1].toFixed(2)}"><path d="M${gs.toFixed(2)} 0H0V${gs.toFixed(2)}" fill="none" stroke="${INK}" stroke-opacity=".14" stroke-width="1"/></pattern><pattern id="${U}-bare" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="${C_BARE}"/><line x1="0" y1="0" x2="0" y2="5" stroke="${C_BARE_STRONG}" stroke-width="1.6"/></pattern><clipPath id="${U}-site">${site.boundary ? `<path d="${ring(site.boundary)}"/>` : ''}</clipPath></defs>`;
  h += `<g class="view av av-${layer}" data-algo-layer="${layer}" data-algo-version="${esc(version?.id || '')}" data-algo-guides="${guides ? 1 : 0}">`;
  h += `<rect class="av-ground" x="0" y="0" width="${W}" height="${H}" fill="${PAPER}"/>`;
  if (measured) h += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#${U}-grid)" opacity=".6" pointer-events="none"/>`;
  if (site.boundary) h += `<path class="av-site" d="${ring(site.boundary)}" fill="${SHEET}" stroke="none"/>${measured ? `<path d="${ring(site.boundary)}" fill="url(#${U}-grid)" pointer-events="none"/>` : ''}`;
  // ground that is kept open or cannot be planted, and existing trees: context, drawn quietly
  for (const f of site.features || []) {
    if (f.kind === 'existing-tree') { const c = P(f.position_m); h += `<circle class="av-tree" cx="${n1(c[0])}" cy="${n1(c[1])}" r="${n1((f.radius_m ?? 1.5) * k)}" fill="none" stroke="${INK3}" stroke-width="1" stroke-dasharray="2 4"/><circle cx="${n1(c[0])}" cy="${n1(c[1])}" r="2.5" fill="${INK3}"/>`; }
    else if (f.polygon) h += `<path class="av-open" d="${ring(f.polygon)}" fill="none" stroke="${INK3}" stroke-width="1" stroke-dasharray="1 4" stroke-linecap="round"/>`;
  }
  // ---- beds (a bed is a mark: it opens that bed's results in the inspector)
  const bedMark = b => `<path class="av-bed ${o.selectedBed === b.id ? 'sel' : ''}" d="${shape(b.polygon, b.holes)}" fill-rule="evenodd" fill="${INK}" fill-opacity="${layer === 'species' || layer === 'pattern' ? '.028' : '0'}" stroke="${INK}" stroke-width="${o.selectedBed === b.id ? 2 : 1}" data-growbed="${esc(b.id)}" tabindex="0" role="button" aria-label="${esc(b.name)}: show this bed's results"><title>${esc(b.name)}</title></path>`;
  const order = plants.slice().sort((a, b) => (b.proxy_radius_m - a.proxy_radius_m) || (a.position_m[1] - b.position_m[1]));
  const hl = o.hlSpecies || null; const dimmed = p => hl && p.species_id !== hl;
  const plantMark = (p, body, extra = '') => { const c = P(p.position_m); const nm = nameOf(p.species_id); const tip = `<i>${esc(nm.sci)}</i><div class=m>${esc(nm.common || '')}${nm.common ? ' · ' : ''}${esc(p.role.replace('screen-layer', 'screen, second row'))} · crown ${f1(2 * p.proxy_radius_m)} m · click for its record</div>`;
    return `<g class="plant av-plant ${o.selectedPlant === p.id ? 'sel' : ''} ${dimmed(p) ? 'dim' : ''}" data-plant="${esc(p.id)}" data-species="${esc(p.species_id)}" data-role="${esc(p.role)}" data-x="${p.position_m[0]}" data-y="${p.position_m[1]}" data-tip="${esc(tip)}" transform="translate(${n1(c[0])} ${n1(c[1])})" tabindex="${o.selectedBed === p.bed_id || o.selectedPlant === p.id ? 0 : -1}" role="button" aria-label="${esc(nm.common || nm.sci)}, ${esc(p.role)}">${body}<circle class="hit" r="${Math.max(7, p.proxy_radius_m * k).toFixed(1)}" fill="transparent"/>${o.selectedPlant === p.id ? `<circle class="ring" r="${(p.proxy_radius_m * k + 3.5).toFixed(1)}" fill="none" stroke="${INK}" stroke-width="2"/>` : ''}${extra}</g>`; };
  const stats = { layer, version: version?.id || null, plants: plants.length, marks: 0, beds: {}, screens: [] };
  const top = [];   // marks and words that stay readable above the plants

  if (layer === 'species') {
    for (const b of beds) h += bedMark(b);
    for (const p of order) { const r = p.proxy_radius_m * k; h += plantMark(p, `<circle class="crown" r="${r.toFixed(1)}" fill="${colourOf(p.species_id)}" fill-opacity=".9" stroke="${INK}" stroke-opacity=".42" stroke-width="1"/><circle r="${Math.min(2.2, Math.max(1.2, r * .16)).toFixed(1)}" fill="${INK}" fill-opacity=".7"/>`); stats.marks++; }
  }

  if (layer === 'pattern') {
    for (const b of beds) h += bedMark(b);
    // ground cover: bands (rhythm), patches, drifts — the grouping is read from the objects, the dimensions from the group's parameters
    for (const g of groups.filter(x => x.role === 'ground')) {
      const bed = beds.find(b => b.id === g.bed_id); if (!bed) continue; const mine = plants.filter(p => p.bed_id === bed.id && (p.role === 'ground' || p.role === 'accent')); const pr = g.params || {}; const pat = pr.pattern || 'drifts';
      const sp = id => pr.spacing_by_species?.[id] ?? pr.spacing_m ?? 0.4; const bs = { pattern: pat, label: pr.pattern_label || pat, plants: mine.length };
      if (pat === 'rhythm' && pr.bands) { const B = G.bbox(bed.polygon); const ax = B.w >= B.h ? 0 : 1; const u0 = ax ? B.miny : B.minx, uL = ax ? B.h : B.w, bl = uL / pr.bands; bs.bands = pr.bands;
        h += `<g clip-path="url(#${U}-bed-${esc(bed.id)})"><clipPath id="${U}-bed-${esc(bed.id)}"><path d="${shape(bed.polygon, bed.holes)}" clip-rule="evenodd"/></clipPath>`;
        for (let i = 0; i < pr.bands; i++) { const a = u0 + i * bl, z = a + bl; const inBand = mine.filter(p => p.position_m[ax] >= a && p.position_m[ax] < z); const cnt = {}; for (const p of inBand) cnt[p.species_id] = (cnt[p.species_id] || 0) + 1; const lead = Object.entries(cnt).sort((x, y) => y[1] - x[1])[0]?.[0];
          const q = ax ? [[B.minx, a], [B.maxx, a], [B.maxx, z], [B.minx, z]] : [[a, B.miny], [z, B.miny], [z, B.maxy], [a, B.maxy]];
          h += `<path class="av-band" d="${ring(q)}" fill="${lead ? colourOf(lead) : 'none'}" fill-opacity=".2" stroke="${INK}" stroke-opacity=".35" stroke-width="1" stroke-dasharray="3 3" data-band="${i}" data-band-species="${esc(lead || '')}"/>`; }
        h += '</g>';
        if (guides) { const inner = site.boundary ? G.centroid(bed.polygon)[0] > G.bbox(site.boundary).minx + G.bbox(site.boundary).w / 2 : false;   /* the note stands on the side of the bed that faces the middle of the site */
          const c = P(ax ? [inner ? B.minx : B.maxx, u0 + bl / 2] : [u0 + bl / 2, B.maxy]); top.push(`<text class="av-note" x="${n1(c[0] + (ax ? (inner ? -8 : 8) : 0))}" y="${n1(c[1] - (ax ? -3 : 7))}" text-anchor="${ax ? (inner ? 'end' : 'start') : 'middle'}">band ${f1(pr.band_m ?? bl)} m</text>`); }
      } else {
        const cl = clusters(mine, (a, b) => 1.35 * Math.max(sp(a.species_id), sp(b.species_id))); bs.clusters = cl.length; if (pat === 'patches') bs.patches = pr.patches ?? null;
        for (const c of cl) { const col = colourOf(c[0].species_id); const pad = sp(c[0].species_id) * 0.62;
          h += `<g class="av-drift" opacity=".26" data-cluster-species="${esc(c[0].species_id)}" data-cluster-size="${c.length}">${c.map(p => { const q = P(p.position_m); return `<circle cx="${n1(q[0])}" cy="${n1(q[1])}" r="${(Math.max(pad, p.proxy_radius_m) * k).toFixed(1)}" fill="${col}"/>`; }).join('')}</g>`;
          if (pat === 'patches' && c.length > 1) { const ce = [c.reduce((s, p) => s + p.position_m[0], 0) / c.length, c.reduce((s, p) => s + p.position_m[1], 0) / c.length]; const R = Math.max(...c.map(p => G.dist(p.position_m, ce) + p.proxy_radius_m)); const q = P(ce); h += `<circle class="av-patch" cx="${n1(q[0])}" cy="${n1(q[1])}" r="${(R * k + 2).toFixed(1)}" fill="none" stroke="${col}" stroke-width="1.5"/>`; } }
      }
      stats.beds[bed.id] = { ...(stats.beds[bed.id] || {}), ground: bs };
      if (guides) { const B = G.bbox(bed.polygon); const right = site.boundary ? G.centroid(bed.polygon)[0] > G.bbox(site.boundary).minx + G.bbox(site.boundary).w / 2 : false; const q = P([right ? B.maxx : B.minx, B.miny]);   /* under the bed, below the metre figures, aligned to the bed's outer side */
        top.push(`<text class="av-note" x="${n1(q[0])}" y="${n1(q[1] + 30)}" text-anchor="${right ? 'end' : 'start'}">${esc(bs.label)} · ${(pr.spacing_m ?? 0).toFixed(2)} m lattice</text>`); }
    }
    // screen: the screened edge, each row as a line through its plants, and the stagger between the rows
    for (const z of zones.filter(z => z.kind === 'edge')) {
      const mine = plants.filter(p => p.zone_id === z.id && /^screen/.test(p.role)); const zs = { zone: z.id, bed: z.bed_id, rows: [] };
      (z.edges || []).forEach((e, ei) => { const len = G.dist(e.a, e.b) || 1; const u = [(e.b[0] - e.a[0]) / len, (e.b[1] - e.a[1]) / len]; const tOf = p => (p.position_m[0] - e.a[0]) * u[0] + (p.position_m[1] - e.a[1]) * u[1]; const dOf = p => Math.abs((p.position_m[0] - e.a[0]) * -u[1] + (p.position_m[1] - e.a[1]) * u[0]);
        const plan = z.row_plans?.[ei]; const near = z.edges.length > 1 ? mine.filter(p => dOf(p) <= (plan?.depth_m ?? 1e9) + p.proxy_radius_m) : mine;
        const a = P(e.a), b = P(e.b); h += `<line class="av-edge" x1="${n1(a[0])}" y1="${n1(a[1])}" x2="${n1(b[0])}" y2="${n1(b[1])}" stroke="${INK}" stroke-width="4" data-growbed="${esc(z.bed_id)}"/>`;
        const rows = [near.filter(p => p.role === 'screen'), near.filter(p => p.role === 'screen-layer')].map(r => r.sort((x, y) => tOf(x) - tOf(y)));
        rows.forEach((r, ri) => { if (!r.length) return; zs.rows.push(r.length); h += `<polyline class="av-row" data-row="${ri + 1}" data-row-count="${r.length}" data-zone="${esc(z.id)}" points="${r.map(p => P(p.position_m).map(n1).join(',')).join(' ')}" fill="none" stroke="${INK}" stroke-width="${ri ? 1.2 : 1.6}" ${ri ? 'stroke-dasharray="5 3"' : ''}/>`;
          if (guides) { const a0 = P(r[0].position_m), a1 = P((r[1] || r[0]).position_m);   /* on the row's own line, between its first two plants */
            top.push(`<text class="av-note" x="${n1((a0[0] + a1[0]) / 2)}" y="${n1((a0[1] + a1[1]) / 2 + (ri ? 15 : -7))}" text-anchor="middle">row ${ri + 1} · ${r.length}</text>`); } });
        if (rows[0].length && rows[1].length) { let d = ''; for (const p of rows[1]) { const nb = rows[0].slice().sort((x, y) => G.dist(x.position_m, p.position_m) - G.dist(y.position_m, p.position_m)).slice(0, 2); for (const q of nb) d += `M${pt(p.position_m)}L${pt(q.position_m)}`; } h += `<path class="av-stagger" d="${d}" fill="none" stroke="${INK}" stroke-opacity=".4" stroke-width="1"/>`; }
        if (guides && rows[0].length > 1) { const r0 = rows[0]; const n = e.n || [0, 1]; const t0 = tOf(r0[0]), t1 = tOf(r0[1]); const on = (t, px) => P([e.a[0] + u[0] * t + n[0] * px / k, e.a[1] + u[1] * t + n[1] * px / k]); const p0 = on(t0, 14), p1 = on(t1, 14), lab = on((t0 + t1) / 2, 26);   /* the step between the first two plants of the row, measured along the edge, drawn just outside it */
          top.push(`<path class="av-dim" d="M${n1(p0[0])} ${n1(p0[1])}L${n1(p1[0])} ${n1(p1[1])}" fill="none" stroke="${INK2}" stroke-width="1"/><circle cx="${n1(p0[0])}" cy="${n1(p0[1])}" r="2" fill="${INK2}"/><circle cx="${n1(p1[0])}" cy="${n1(p1[1])}" r="2" fill="${INK2}"/><text class="av-note" x="${n1(lab[0])}" y="${n1(lab[1] + 3.5)}" text-anchor="middle">${Math.abs(t1 - t0).toFixed(2)} m</text>`); }
      });
      stats.screens.push(zs);
    }
    for (const p of order) { const r = p.proxy_radius_m * k; const scr = /^screen/.test(p.role); h += plantMark(p, `<circle class="crown" r="${r.toFixed(1)}" fill="none" stroke="${colourOf(p.species_id)}" stroke-opacity="${scr ? .55 : 0}" stroke-width="1"/><circle class="stem" r="${scr ? 4.5 : 3.2}" fill="${colourOf(p.species_id)}" stroke="${INK}" stroke-width="${scr ? 1.2 : .7}"/>`); stats.marks++; }
  }

  if (layer === 'crowns' || layer === 'gaps') {
    for (const b of beds) { if (!inVersion.has(b.id)) { h += bedMark(b); continue; }
      const g = coverGrid(project, b, version); const fnGround = (b.functions || []).some(f => f.function === 'z:ground_cover') || g.ground > 0; const s = g.st * k + .6;
      const rect = (r, fill) => { const q = P([r[0], r[1] + r[3]]); return `<rect x="${n1(q[0])}" y="${n1(q[1])}" width="${(r[2] * k + .6).toFixed(1)}" height="${s.toFixed(1)}" fill="${fill}"/>`; };
      let cells = '';
      if (layer === 'crowns') { cells += runs(g.cells, g.st, 'cover').map(r => rect(r, C_COVER)).join('') + runs(g.cells, g.st, 'screen').map(r => rect(r, C_SCREEN)).join('') + runs(g.cells, g.st, 'bare').map(r => rect(r, `url(#${U}-bare)`)).join(''); }
      else if (fnGround) cells += runs(g.cells, g.st, 'bare').map(r => rect(r, `url(#${U}-bare)`)).join('');
      const eg = (ev.ground_cover || []).find(x => x.bed_id === b.id);
      h += `<g class="av-cover" data-growbed="${esc(b.id)}" data-cover-bed="${esc(b.id)}" data-cover-share="${g.share}" data-cover-eval="${eg ? eg.ground_cover_share : ''}" data-cover-cells="${g.n}" data-cover-bare="${g.bare}" shape-rendering="crispEdges">${cells}</g>`; h += bedMark(b);
      stats.beds[b.id] = { ...(stats.beds[b.id] || {}), cover: { share: g.share, eval_share: eg ? eg.ground_cover_share : null, plantable_m2: g.plantable_m2, bare_m2: G.round(g.bare * g.st * g.st), ground_function: fnGround } };
      if (guides && (layer === 'crowns' || fnGround) && (eg || g.ground)) { const c = P(G.centroid(b.polygon)); top.push(`<g class="av-fig" transform="translate(${n1(c[0])} ${n1(c[1])})"><rect x="-26" y="-11" width="52" height="22" rx="3" fill="${SHEET}" stroke="${INK}" stroke-width="1"/><text class="av-num" x="0" y="4.5" text-anchor="middle">${Math.round((eg ? eg.ground_cover_share : g.share) * 100)} %</text></g>`); }
    }
    for (const p of order) { const r = p.proxy_radius_m * k; h += plantMark(p, `<circle class="crown" r="${r.toFixed(1)}" fill="none" stroke="${INK}" stroke-opacity="${layer === 'crowns' ? .32 : .2}" stroke-width="1"/><circle r="1.6" fill="${INK}" fill-opacity=".55"/>`); stats.marks++; }
  }

  if (layer === 'gaps') {
    // screen: the covered length and the gaps of each screened edge, drawn just outside the edge as the engine reports them
    for (const z of zones.filter(z => z.kind === 'edge')) { const ez = (ev.edge_zones || []).find(x => x.zone === z.id); if (!ez) continue; const zs = { zone: z.id, bed: z.bed_id, covered_m: ez.covered_m, edge_length_m: ez.edge_length_m, gaps: (ez.gaps || []).length, status: ez.status };
      (z.edges || []).forEach((e, ei) => { const len = G.dist(e.a, e.b) || 1; const u = [(e.b[0] - e.a[0]) / len, (e.b[1] - e.a[1]) / len]; const n = e.n || [0, 0]; const off = 9 / k; const at = t => P([e.a[0] + u[0] * t + n[0] * off, e.a[1] + u[1] * t + n[1] * off]);
        const a = at(0), b = at(len); const gaps = (ez.gaps || []).filter(g => g.edge === ei);
        h += `<line class="av-covered" x1="${n1(a[0])}" y1="${n1(a[1])}" x2="${n1(b[0])}" y2="${n1(b[1])}" stroke="${OLIVE}" stroke-width="7" data-growbed="${esc(z.bed_id)}" data-covered-m="${ez.covered_m}" data-edge-m="${ez.edge_length_m}"><title>${esc(ez.label || 'Screen')}: crowns cover ${ez.covered_m} of ${ez.edge_length_m} m</title></line>`;
        for (const g of gaps) { const p0 = at(g.from_m), p1 = at(g.to_m); const mid = at((g.from_m + g.to_m) / 2); const lab = P([e.a[0] + u[0] * (g.from_m + g.to_m) / 2 + n[0] * (off + 15 / k), e.a[1] + u[1] * (g.from_m + g.to_m) / 2 + n[1] * (off + 15 / k)]);
          h += `<line class="av-gap" x1="${n1(p0[0])}" y1="${n1(p0[1])}" x2="${n1(p1[0])}" y2="${n1(p1[1])}" stroke="${SHEET}" stroke-width="9"/><line class="av-gap-mark" x1="${n1(p0[0])}" y1="${n1(p0[1])}" x2="${n1(p1[0])}" y2="${n1(p1[1])}" stroke="${RUST}" stroke-width="3" stroke-dasharray="2 4" data-gap-from="${g.from_m}" data-gap-to="${g.to_m}" data-growbed="${esc(z.bed_id)}"><title>gap ${g.from_m}–${g.to_m} m</title></line>`;
          void mid; top.push(`<text class="av-gaplabel" x="${n1(lab[0])}" y="${n1(lab[1] + 3.5)}" text-anchor="middle" fill="${RUST}">${g.length_m} m open</text>`); }
        if (guides) { for (const p of plants.filter(p => p.zone_id === z.id && /^screen/.test(p.role))) { const t = (p.position_m[0] - e.a[0]) * u[0] + (p.position_m[1] - e.a[1]) * u[1]; if (t < -p.proxy_radius_m || t > len + p.proxy_radius_m) continue; const q0 = P(p.position_m), q1 = P([e.a[0] + u[0] * t, e.a[1] + u[1] * t]); h += `<line class="av-proj" x1="${n1(q0[0])}" y1="${n1(q0[1])}" x2="${n1(q1[0])}" y2="${n1(q1[1])}" stroke="${INK}" stroke-opacity=".3" stroke-width="1" stroke-dasharray="1 3"/>`; } }
      });
      stats.screens.push(zs);
    }
  }
  if (!plants.length) top.push(`<text class="av-note" x="${W / 2}" y="${H / 2}" text-anchor="middle">No plant objects in this version.</text>`);
  if (site.boundary) h += `<path class="av-outline" d="${ring(site.boundary)}" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="miter" pointer-events="none"/>`;
  if (guides) {   // what a reader asks for only on request: metre figures, bed names, the words "kept open"
    if (measured && site.boundary) { const B = G.bbox(site.boundary); for (let x = Math.ceil(B.minx / step) * step; x <= B.maxx + 1e-6; x += step) { const q = P([x, B.miny]); top.push(`<text class="av-tick" x="${n1(q[0])}" y="${n1(q[1] + 15)}" text-anchor="middle">${G.round(x - B.minx, 1)}</text>`); } for (let y = Math.ceil(B.miny / step) * step; y <= B.maxy + 1e-6; y += step) { const q = P([B.minx, y]); top.push(`<text class="av-tick" x="${n1(q[0] - 8)}" y="${n1(q[1] + 3.5)}" text-anchor="end">${G.round(y - B.miny, 1)}</text>`); } const q = P([B.maxx, B.miny]); top.push(`<text class="av-tick" x="${n1(q[0] + 8)}" y="${n1(q[1] + 15)}">m</text>`); }
    for (const b of beds) { const B = G.bbox(b.polygon); const q = P([B.minx, B.maxy]); top.push(`<text class="av-bedname" x="${n1(q[0] + 5)}" y="${n1(q[1] + 13)}">${esc(b.name)}</text>`); }
    for (const f of site.features || []) if (f.polygon) { const c = P(G.centroid(f.polygon)); top.push(`<text class="av-note" x="${n1(c[0])}" y="${n1(c[1] + 3)}" text-anchor="middle">${f.kind === 'no-plant-zone' ? 'kept open' : esc(f.label || f.kind)}</text>`); }
  }
  h += top.join('');
  h += '</g>';
  if (measured) { const L = k >= 60 ? 1 : k >= 25 ? 2 : 5; h += `<g class="av-scale" transform="translate(18 ${H - 22})"><path d="M0 0H${(L * k).toFixed(1)}M0 -4V4M${(L * k).toFixed(1)} -4V4" fill="none" stroke="${INK}" stroke-width="1.2"/><text class="av-tick" x="${(L * k + 7).toFixed(1)}" y="3.5">${L} m</text></g>`; }
  { const ang = site.orientation?.north_angle_degrees || 0; h += `<g class="av-north" transform="translate(${(o.northAt || [W - 34, 34]).join(' ')}) rotate(${ang})"><path d="M0 -12L4.5 5L0 1.5L-4.5 5Z" fill="${INK}"/><text class="av-tick" x="0" y="-16" text-anchor="middle">N</text></g>`; }
  // ---- legend: the species present (species / pattern), or the keys of the estimate layers
  const count = {}; for (const p of plants) count[p.species_id] = (count[p.species_id] || 0) + 1;
  const species = Object.entries(count).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ species_id: id, count: n, colour: colourOf(id), ...nameOf(id) }));
  const keys = layer === 'crowns' ? [{ key: 'cover', colour: C_COVER, label: 'under a ground-layer crown' }, { key: 'screen', colour: C_SCREEN, label: 'under a screen crown only' }, { key: 'bare', colour: C_BARE, hatch: true, label: 'plantable, under no crown' }]
    : layer === 'gaps' ? [{ key: 'covered', colour: OLIVE, line: true, label: 'screened edge under a crown' }, { key: 'gap', colour: RUST, line: true, dash: true, label: 'gap in the screen' }, { key: 'bare', colour: C_BARE, hatch: true, label: 'ground cover: no crown' }] : [];
  const figures = [];
  if (layer === 'crowns' || layer === 'gaps') { for (const z of (ev.edge_zones || [])) if (layer === 'gaps') { const b = beds.find(x => x.id === z.bed_id); figures.push({ bed_id: z.bed_id, kind: 'screen', text: `${b?.name || 'Screen'} · crowns cover ${z.covered_m} of ${z.edge_length_m} m${(z.gaps || []).length ? ` · ${(z.gaps || []).length} gap${z.gaps.length === 1 ? '' : 's'}` : ''}`, status: z.status }); }
    for (const g of (ev.ground_cover || [])) figures.push({ bed_id: g.bed_id, kind: 'ground', text: `${g.name} · ${Math.round(g.ground_cover_share * 100)} % of ${g.plantable_m2} m² under ground-layer crowns`, status: 'estimate' }); }
  return { inner: h, T, layer, legend: { species, keys, figures }, caption: LAYERS.find(l => l.id === layer).caption, stats };
}

/** the legend as HTML: species are buttons (data-algo-species) so a page can single one out; figures open their bed (data-growbed) */
export function legendHtml(res, o = {}) {
  const L = res.legend; let h = '';
  if (res.layer === 'species' || res.layer === 'pattern') h += `<ul class="avl-species">${L.species.map(s => `<li><button type="button" class="${o.hlSpecies === s.species_id ? 'on' : ''}" data-algo-species="${esc(s.species_id)}" aria-pressed="${o.hlSpecies === s.species_id}" title="show only ${esc(s.common || s.sci)}"><i class="sw" style="background:${s.colour}"></i><span class="nm">${esc(s.common || s.sci)}</span><span class="ct">${s.count}</span></button></li>`).join('')}</ul>`;
  if (L.keys.length) h += `<ul class="avl-keys">${L.keys.map(x => `<li><i class="sw ${x.line ? 'line' : ''} ${x.dash ? 'dash' : ''} ${x.hatch ? 'hatch' : ''}" style="--c:${x.colour}"></i>${esc(x.label)}</li>`).join('')}</ul>`;
  if (L.figures.length) h += `<ul class="avl-figs">${L.figures.map(f => `<li><button type="button" data-growbed="${esc(f.bed_id)}">${esc(f.text)}<span class="st st-${esc(f.status || '')}">${esc(f.status || '')}</span></button></li>`).join('')}</ul>`;
  return h + `<p class="avl-cap">${esc(res.caption)}</p>`;
}

/** a complete <svg> for a page outside the Studio (same marks, no interaction state) */
export function svg(project, version, o = {}) {
  const W = o.W || 720, H = o.H || 480; const r = draw(project, version, { ...o, W, H, uid: o.uid || 'avx' });
  return `<svg class="algoview" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.label || 'Algorithm view of the planting')}" font-family="'DM Mono', ui-monospace, monospace" font-size="10">${r.inner}</svg>`;
}
