// Neural Brain v5 — the planting knowledge store as one living network. The data is unchanged (brain/data/graph.json,
// diagnosis.json, ontology.json, plants/*.json; rules R1–R10; the retriever port): what changes is how it is seen.
//   neurons  = concepts (312, used ones bright, the rest dormant), the three plants, growth forms, sources
//   fibres   = plant → concept claim links, bundled into branches per knowledge cluster; growth-form, parent and source links
//   synapses = one glowing bouton per claim on its fibre (verified white · unverified in the cluster colour · candidate magenta)
//   clusters = Classification (centre) · Conditions · Traits · Uses · Evidence & place · Time · Status · Resistance
//   activation = a click or a question lights the seed neurons and the signal travels hop by hop along real links
//   growth   = an observation grows a candidate fibre from the plant, synapse by synapse, and fires it
// Writes nothing; candidates live in this browser only.
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { loadDb } from './data.js';
import { loadGraph, classesFor, conceptsInText, candidateEdges } from './graph.js';
import { diagnose, srcLabel, fmtNum, interval } from './diagnosis.js';
import { makeRetriever } from './retrieve.js';
import { TYPE_COLOUR } from './model.js';
import * as PI from '../../../platform/js/platform.js';   // platform bar, cross-module links
import * as PC from '../../../platform/js/plantcard.js';   // the shared plant card

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const LS_KEY = 'brain.candidates.v5';
const CL = {
  classification: { label: 'Classification', colour: '#f6d365', anchor: [0, 0, 0] },
  condition: { label: 'Conditions', colour: '#7cc4ff' }, trait: { label: 'Traits', colour: '#c9b8ff' }, use: { label: 'Uses', colour: '#6ff2b0' },
  evidence: { label: 'Evidence & place', colour: '#ff9e6b' }, time: { label: 'Time', colour: '#ffd27a' }, status: { label: 'Status', colour: '#b8ffea' }, resistance: { label: 'Resistance', colour: '#ff8ca8' },
};
const OUTER = ['condition', 'trait', 'use', 'evidence', 'time', 'status', 'resistance'];
OUTER.forEach((c, i) => { const th = i / OUTER.length * Math.PI * 2 + 0.6; const ph = i % 2 ? 0.46 : -0.34; const R = 255; CL[c].anchor = [R * Math.cos(ph) * Math.cos(th), R * Math.sin(ph), R * Math.cos(ph) * Math.sin(th)]; });
const DIMCL = { place: 'evidence' };
const clusterOfDim = d => DIMCL[d] || (CL[d] ? d : 'trait');
const STEP = 520;   // ms per hop of the signal

const S = { db: null, G: null, Graph: null, retr: null, candidates: [], candEdges: [], diag: null, nodes: [], links: [], labels: [], act: new Map(), actL: new Map(), alive: false, dirty: 2, centroid: {}, selected: null, lastAsk: null };

// ------------------------------------------------------------------ deterministic randomness (so the network looks the same every visit)
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
const rnd = (s, i) => hash(`${s}#${i}`);
function dir3(s) { const u = rnd(s, 1) * 2 - 1, t = rnd(s, 2) * Math.PI * 2; const r = Math.sqrt(Math.max(0, 1 - u * u)); return [r * Math.cos(t), u, r * Math.sin(t)]; }

// ------------------------------------------------------------------ boot
(async function boot() {
  try {
    [S.db, S.G] = await Promise.all([loadDb(), loadGraph()]);
    S.candidates = loadCandidates(); S.candEdges = S.candidates.flatMap(c => candidateEdges(S.G, c));
    S.retr = makeRetriever(S.db, () => S.candidates.map(candToClaim));
    S.diag = S.candEdges.length ? runDiag() : S.G.diagnosis;
    initHost(); buildGraph(); initUi();
    $('#loading').classList.add('gone');
    // platform: the bar, the shared plant card (read from the same published snapshot), and a species named in the URL (#species=<slug>)
    // the bar's switch (Table · Matrix · Network · 3D) leads back into the Explorer with the species this page was opened on
    const inFocus = () => new URLSearchParams(location.hash.slice(1)).get('species'); const bar = snapshot => PI.mountTop($('#pitop'), { active: 'knowledge', sub: PI.exploreSwitch('neural', inFocus()), tone: 'dark', snapshot });
    bar(null); addEventListener('hashchange', () => bar(S.snap));
    Promise.all([PI.loadSnapshot(), PI.loadImages()]).then(([d, imgs]) => { S.snap = d; S.imgs = imgs; bar(d); if (S.selected?.kind === 'plant') select(S.selected); }).catch(() => { });
    const focusFromHash = () => { const slug = new URLSearchParams(location.hash.slice(1)).get('species'); const n = slug && S.nodes.find(x => x.kind === 'plant' && x.id === PI.speciesId(slug)); if (n) setTimeout(() => select(n), 1400); };
    focusFromHash(); addEventListener('hashchange', focusFromHash);
  } catch (e) { $('#err').textContent = `could not load: ${e.message}\n\nserve the planting-db root:  python3 -m http.server 8766  → http://localhost:8766/brain/`; console.error(e); }
})();
const allEdges = () => [...S.G.graph.edges, ...S.candEdges];
function runDiag() { return diagnose(S.G.O, allEdges(), id => S.G.plantLabel(id), S.G.gateFacets, S.db.sources); }
const isEvidence = e => (e.type === 'claim' || e.type === 'entity' || e.type === 'candidate') && e.live !== false && e.target;
function descendants(cid) { const out = [cid]; for (let i = 0; i < out.length; i++) for (const c of S.G.concepts) if (c.parent === out[i] && !out.includes(c.id)) out.push(c.id); return out; }
function liveEdgesFor(cid) { const ids = new Set(descendants(cid)); const dim = S.G.O.get(cid)?.dimension; if (dim === 'place') { const seen = new Set(); return allEdges().filter(e => isEvidence(e) && e.place && ids.has(e.place) && !seen.has(e.claim_id || e.id) && seen.add(e.claim_id || e.id)).map(e => ({ ...e, via: e.place !== cid ? e.place : null })); } return allEdges().filter(e => ids.has(e.target) && isEvidence(e)).map(e => e.target === cid ? e : { ...e, via: e.target }); }
const plantEdges = pid => allEdges().filter(e => e.plant === pid && isEvidence(e));
const linkedPlants = cid => new Set(liveEdgesFor(cid).map(e => e.plant));
const growthFormOf = pid => S.G.N.get(pid)?.growth_form || null;
const gfPlants = cid => new Set(allEdges().filter(e => e.type === 'classification' && e.target === cid).map(e => e.plant));
const isVan = pl => pl && descendants('place:vancouver').includes(pl);
const colourOf = n => n.kind === 'plant' || n.kind === 'cultivar' ? TYPE_COLOUR.plant : n.kind === 'gf' ? CL.classification.colour : n.kind === 'source' ? (TYPE_COLOUR[n.n.source_type] || '#8892a8') : CL[n.cluster].colour;

// ------------------------------------------------------------------ graph data: every node has a home (cluster anchor + its own offset), the forces only relax it
function buildGraph() {
  const G = S.G; const prev = new Map(S.nodes.map(n => [n.id, n])); const nodes = []; const links = []; const linkMap = new Map();
  const home = (id, cluster, mag) => { const a = CL[cluster].anchor; const d = dir3(id); return [a[0] + d[0] * mag, a[1] + d[1] * mag, a[2] + d[2] * mag]; };
  const keep = n => { const o = prev.get(n.id); if (o) { n.x = o.x; n.y = o.y; n.z = o.z; n.vx = n.vy = n.vz = 0; } else { n.x = n.tgt[0] + (rnd(n.id, 7) - 0.5) * 20; n.y = n.tgt[1] + (rnd(n.id, 8) - 0.5) * 20; n.z = n.tgt[2] + (rnd(n.id, 9) - 0.5) * 20; } return n; };
  G.plants.forEach((p, i) => { const a = i / G.plants.length * Math.PI * 2 + 0.5; nodes.push(keep({ id: p.id, kind: 'plant', n: p, cluster: 'classification', tgt: [Math.cos(a) * 125, (rnd(p.id, 3) - 0.5) * 60, Math.sin(a) * 125], size: 26, base: 0.92 })); });
  const gfs = G.concepts.filter(c => c.facet === 'growth_form');
  for (const c of gfs) { const k = gfPlants(c.id).size; nodes.push(keep({ id: c.id, kind: 'gf', n: c, cluster: 'classification', used: k > 0, tgt: home(c.id, 'classification', k ? 34 : 80), size: k ? 16 + 3 * k : 8, base: k ? 0.9 : 0.3 })); }
  const linked = new Set(allEdges().filter(isEvidence).flatMap(e => [e.target, e.place].filter(Boolean)));
  for (const c of G.concepts) if (!linked.has(c.id) && descendants(c.id).some(d => d !== c.id && linked.has(d))) linked.add(c.id);
  for (const c of G.concepts) { if (c.facet === 'growth_form') continue; const used = linked.has(c.id); const k = used ? linkedPlants(c.id).size : 0; const cl = clusterOfDim(c.dimension); nodes.push(keep({ id: c.id, kind: 'concept', n: c, cluster: cl, used, k, tgt: home(c.id, cl, used ? (k >= 3 ? 22 : k === 2 ? 44 : 66) + rnd(c.id, 4) * 18 : 85 + rnd(c.id, 4) * 70), size: used ? 7 + 3 * k : 3.2, base: used ? 0.9 : 0.26 })); }
  const srcs = G.graph.nodes.filter(n => (n.type === 'source' || n.type === 'practitioner') && !n.parent);
  for (const s of srcs) { const has = (G.bySource.get(s.id) || []).some(e => e.live !== false); nodes.push(keep({ id: s.id, kind: 'source', n: s, cluster: 'evidence', used: has, tgt: home(s.id, 'evidence', 70 + rnd(s.id, 4) * 50), size: has ? 9 : 5, base: has ? 0.75 : 0.25 })); }
  if (S.candEdges.length) nodes.push(keep({ id: 'source:candidate', kind: 'source', n: { id: 'source:candidate', label: 'you (candidate)', source_type: 'candidate' }, cluster: 'evidence', used: true, tgt: home('source:candidate', 'evidence', 60), size: 9, base: 0.8 }));
  for (const cv of G.graph.nodes.filter(n => n.type === 'cultivar')) { const p = nodes.find(n => n.id === cv.plant); const d = dir3(cv.id); nodes.push(keep({ id: cv.id, kind: 'cultivar', n: cv, cluster: 'classification', tgt: [p.tgt[0] + d[0] * 30, p.tgt[1] + d[1] * 30, p.tgt[2] + d[2] * 30], size: 4, base: 0.5 })); links.push({ id: cv.id, kind: 'cv', source: cv.id, target: cv.plant }); }
  const byId = new Map(nodes.map(n => [n.id, n]));
  for (const e of allEdges()) {
    if (e.type === 'classification') { links.push({ id: e.id, kind: 'gf', source: e.plant, target: e.target, edges: [e] }); continue; }
    if (!isEvidence(e)) continue;
    for (const t of new Set([e.target, e.place].filter(Boolean))) { if (!byId.has(t)) continue; const key = `${e.plant}→${t}`; if (!linkMap.has(key)) { const l = { id: key, kind: 'pc', source: e.plant, target: t, edges: [] }; linkMap.set(key, l); links.push(l); } linkMap.get(key).edges.push(e); }
    const sk = `source:${e.source_id}→${e.plant}`; if (byId.has(`source:${e.source_id}`)) { if (!linkMap.has(sk)) { const l = { id: sk, kind: 'sp', source: `source:${e.source_id}`, target: e.plant, edges: [] }; linkMap.set(sk, l); links.push(l); } linkMap.get(sk).edges.push(e); }
  }
  for (const c of G.concepts) if (c.parent && byId.has(c.id) && byId.has(c.parent)) links.push({ id: `parent:${c.id}`, kind: 'parent', source: c.id, target: c.parent });
  const rel = new Map(); for (const e of G.graph.edges.filter(x => x.type === 'relation' && x.live)) { const key = [e.source, e.target].sort().join('|'); if (!rel.has(key)) { rel.set(key, 1); links.push({ id: `rel:${key}`, kind: 'rel', source: e.source, target: e.target }); } }
  // synapses: one bouton per claim, sitting on its fibre
  const syn = [];
  for (const l of links) if (l.kind === 'pc') for (const e of l.edges) syn.push({ link: l, t: 0.3 + rnd(e.id, 5) * 0.5, off: dir3(e.id).map(v => v * 4), e, colour: new THREE.Color(e.status === 'verified' ? '#ffffff' : e.type === 'candidate' ? TYPE_COLOUR.candidate : e.source_type === 'entity' ? TYPE_COLOUR.plant : CL[byId.get(l.target).cluster].colour) });
  S.nodes = nodes; S.links = links; S.syn = syn;
  S.Graph.graphData({ nodes, links });
  const link = S.Graph.d3Force('link'); link.distance(l => ({ pc: 120, gf: 70, parent: 24, cv: 26, sp: 170, rel: 220 }[l.kind])).strength(l => ({ pc: 0.02, gf: 0.08, parent: 0.3, cv: 0.4, sp: 0.008, rel: 0 }[l.kind]));
  S.Graph.d3Force('charge').strength(n => n.kind === 'plant' ? -600 : n.kind === 'gf' ? -120 : n.kind === 'concept' ? (n.used ? -22 : -7) : n.kind === 'source' ? -30 : -10).distanceMax(260);
  buildSynapses(); rebuildLabels(); renderClusters(); renderStats();
}

// ------------------------------------------------------------------ host: 3D, orbit, bloom, fog, slow drift
function initHost() {
  const Graph = new ForceGraph3D($('#graph'), { controlType: 'orbit' }).backgroundColor('#01020a').showNavInfo(false)
    .nodeThreeObject(nodeObject).nodeThreeObjectExtend(false).nodeLabel(() => '')
    .linkThreeObject(linkObject).linkThreeObjectExtend(false).linkPositionUpdate(linkPositionUpdate)
    .enableNodeDrag(false).warmupTicks(160).cooldownTime(9000).d3AlphaDecay(0.02).d3VelocityDecay(0.3)
    .onNodeClick(n => { S.swallow = true; select(n); })
    .onNodeHover(n => { document.body.style.cursor = n ? 'pointer' : ''; if (n) showTip(n); else hideTip(); })
    .onLinkClick(l => { S.swallow = true; if (l.kind === 'pc' || l.kind === 'gf') select({ kind: 'link', link: l }); })
    .onBackgroundClick(() => { if (S.swallow) { S.swallow = false; return; } clearAll(); });
  Graph.d3Force('home', homeForce());
  const sc = Graph.scene(); sc.fog = new THREE.FogExp2(0x01020a, 0.0011);
  Graph.postProcessingComposer().addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.35, 0.75, 0.12));
  Graph.cameraPosition({ x: 0, y: 70, z: 660 }, { x: 0, y: 0, z: 0 }, 0);
  const ctl = Graph.controls(); ctl.autoRotate = true; ctl.autoRotateSpeed = 0.22; ctl.enableDamping = true; ctl.dampingFactor = 0.08; ctl.minDistance = 120; ctl.maxDistance = 1500;
  ctl.addEventListener('start', () => { ctl.autoRotate = false; });
  S.Graph = Graph; S.tex = glowTexture(); S.texRing = ringTexture();
  buildNeuropil();
  (function loop() { frame(); requestAnimationFrame(loop); })();
}
function homeForce() {   // every node is drawn to its home point; the plants and hubs firmly, the rest loosely
  let nodes = []; const f = alpha => { for (const n of nodes) { if (!n.tgt) continue; const k = alpha * (n.kind === 'plant' || n.kind === 'gf' ? 0.5 : n.kind === 'cultivar' ? 0.4 : 0.28); n.vx += (n.tgt[0] - n.x) * k; n.vy += (n.tgt[1] - n.y) * k; n.vz += (n.tgt[2] - n.z) * k; } }; f.initialize = ns => { nodes = ns; }; return f;
}
function glowTexture() { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.18, 'rgba(255,255,255,0.75)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.16)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); }
function ringTexture() { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 7; g.strokeRect(30, 30, 68, 68); const grd = g.createRadialGradient(64, 64, 10, 64, 64, 64); grd.addColorStop(0, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); }
function neuronMaterial(col, a, tex) { const m = new THREE.SpriteMaterial({ map: tex || S.tex, color: new THREE.Color(col), transparent: true, opacity: a, depthWrite: false, blending: THREE.AdditiveBlending }); m.userData.base = a; return m; }
function nodeObject(n) {
  const g = new THREE.Group(); const col = colourOf(n);
  const halo = new THREE.Sprite(neuronMaterial(col, n.base, n.kind === 'source' ? S.texRing : S.tex)); halo.scale.set(n.size, n.size, 1); g.add(halo);
  if (n.kind === 'plant') { const core = new THREE.Sprite(neuronMaterial('#ffffff', 0.9)); core.scale.set(9, 9, 1); g.add(core); }
  if (n.kind === 'gf' && n.used) { const core = new THREE.Sprite(neuronMaterial('#fff6d6', 0.8)); core.scale.set(5, 5, 1); g.add(core); }
  n.__obj = { group: g, halo, mats: [...g.children].map(c => c.material) }; return g;
}
const CURVE_N = 18;
function linkBase(l) {
  if (l.kind === 'pc') { const t = l.target.n ? l.target : S.nodes.find(n => n.id === (l.target.id || l.target)); const c = new THREE.Color(CL[t.cluster].colour).lerp(new THREE.Color('#ffffff'), 0.25); const ver = l.edges.filter(e => e.status === 'verified').length / l.edges.length; return { col: c, a: 0.2 + 0.3 * ver + 0.04 * Math.min(l.edges.length, 4), cand: l.edges.every(e => e.type === 'candidate') }; }
  if (l.kind === 'gf') return { col: new THREE.Color(CL.classification.colour), a: 0.45 };
  if (l.kind === 'parent') return { col: new THREE.Color('#aab4cc'), a: 0.1 };
  if (l.kind === 'cv') return { col: new THREE.Color(TYPE_COLOUR.plant), a: 0.2 };
  if (l.kind === 'sp') { const st = l.edges[0].source_type; return { col: new THREE.Color(TYPE_COLOUR[st] || '#8892a8'), a: 0.07 }; }
  return { col: new THREE.Color('#8892a8'), a: 0.12 };
}
function linkObject(l) {
  const st = linkBase(l); if (st.cand) { st.col = new THREE.Color(TYPE_COLOUR.candidate); st.a = 0.6; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CURVE_N * 3), 3)); geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(CURVE_N * 3), 3));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: st.a, depthWrite: false, blending: THREE.AdditiveBlending });
  const line = new THREE.Line(geo, mat); l.__obj = { line, mat, base: st.a, col: st.col, pts: geo.attributes.position.array, cols: geo.attributes.color.array, cand: st.cand }; paintLink(l, 1); return line;
}
function paintLink(l, intensityFn) {   // vertex colours carry the signal: a bright window travelling from one end to the other
  const o = l.__obj; if (!o) return; const c = o.col; const cols = o.cols;
  for (let i = 0; i < CURVE_N; i++) { const u = i / (CURVE_N - 1); const k = typeof intensityFn === 'function' ? intensityFn(u) : intensityFn; cols[i * 3] = Math.min(1, c.r * k + Math.max(0, k - 1) * 0.6); cols[i * 3 + 1] = Math.min(1, c.g * k + Math.max(0, k - 1) * 0.6); cols[i * 3 + 2] = Math.min(1, c.b * k + Math.max(0, k - 1) * 0.6); }
  o.line.geometry.attributes.color.needsUpdate = true;
}
function linkPositionUpdate(obj, { start, end }, l) {
  const o = l.__obj; if (!o) return false; const p = o.pts; const src = l.source, tgt = l.target;
  const len = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z) || 1; const w = dir3(l.id);
  let pts;
  if (l.kind === 'pc' && tgt.cluster && S.centroid[tgt.cluster]) {   // a branch: shared stem from the plant toward the cluster, then the twig to the concept
    const C = S.centroid[tgt.cluster]; const G = { x: C.x + (start.x - C.x) * 0.5, y: C.y + (start.y - C.y) * 0.5, z: C.z + (start.z - C.z) * 0.5 };
    const wob = len * 0.1; const M1 = { x: (start.x + G.x) / 2 + w[0] * wob * 0.5, y: (start.y + G.y) / 2 + w[1] * wob * 0.5, z: (start.z + G.z) / 2 + w[2] * wob * 0.5 };
    const M2 = { x: G.x + (G.x - start.x) * 0.25 + w[0] * wob, y: G.y + (G.y - start.y) * 0.25 + w[1] * wob, z: G.z + (G.z - start.z) * 0.25 + w[2] * wob };
    pts = i => { const u = i / (CURVE_N - 1); if (u < 0.45) { const t = u / 0.45, v = 1 - t; return [v * v * start.x + 2 * v * t * M1.x + t * t * G.x, v * v * start.y + 2 * v * t * M1.y + t * t * G.y, v * v * start.z + 2 * v * t * M1.z + t * t * G.z]; } const t = (u - 0.45) / 0.55, v = 1 - t; return [v * v * G.x + 2 * v * t * M2.x + t * t * end.x, v * v * G.y + 2 * v * t * M2.y + t * t * end.y, v * v * G.z + 2 * v * t * M2.z + t * t * end.z]; };
  } else { const wob = len * 0.16; const M = { x: (start.x + end.x) / 2 + w[0] * wob, y: (start.y + end.y) / 2 + w[1] * wob, z: (start.z + end.z) / 2 + w[2] * wob }; pts = i => { const t = i / (CURVE_N - 1), v = 1 - t; return [v * v * start.x + 2 * v * t * M.x + t * t * end.x, v * v * start.y + 2 * v * t * M.y + t * t * end.y, v * v * start.z + 2 * v * t * M.z + t * t * end.z]; }; }
  const grow = l.born ? Math.min(1, (performance.now() - l.born) / 1400) : 1;   // a new fibre grows out from the plant
  let last = null;
  for (let i = 0; i < CURVE_N; i++) { const u = i / (CURVE_N - 1); let q; if (u <= grow || !last) { q = pts(i); last = q; } else q = last; p[i * 3] = q[0]; p[i * 3 + 1] = q[1]; p[i * 3 + 2] = q[2]; }
  o.line.geometry.attributes.position.needsUpdate = true; if (grow >= 1 && l.born && performance.now() - l.born > 1600) delete l.born; return true;
}

// synapses: a Points cloud whose positions ride the fibres
function buildSynapses() {
  if (S.synObj) { S.Graph.scene().remove(S.synObj); S.synObj.geometry.dispose(); }
  const n = S.syn.length; const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const mat = new THREE.PointsMaterial({ size: 8.5, map: S.tex, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  S.synObj = new THREE.Points(geo, mat); S.Graph.scene().add(S.synObj);
}
function updateSynapses(now) {
  if (!S.synObj) return; const pos = S.synObj.geometry.attributes.position.array, col = S.synObj.geometry.attributes.color.array;
  S.syn.forEach((s, i) => {
    const o = s.link.__obj; if (!o) { pos[i * 3 + 1] = 1e5; return; }
    const f = s.t * (CURVE_N - 1); const a = Math.floor(f), b = Math.min(CURVE_N - 1, a + 1), r = f - a; const P = o.pts;
    pos[i * 3] = P[a * 3] * (1 - r) + P[b * 3] * r + s.off[0]; pos[i * 3 + 1] = P[a * 3 + 1] * (1 - r) + P[b * 3 + 1] * r + s.off[1]; pos[i * 3 + 2] = P[a * 3 + 2] * (1 - r) + P[b * 3 + 2] * r + s.off[2];
    let k = 0.55; const A = S.actL.get(s.link.id);
    if (A) { const p = (now - A.t0) / 700; const reached = A.dir > 0 ? p >= s.t : p >= 1 - s.t; k = reached ? 1.6 + 0.3 * Math.sin(now / 160 + i) : 0.12; } else if (S.alive) k = 0.07;
    if (s.e.type === 'candidate') k *= 1.2;
    col[i * 3] = Math.min(1, s.colour.r * k); col[i * 3 + 1] = Math.min(1, s.colour.g * k); col[i * 3 + 2] = Math.min(1, s.colour.b * k);
  });
  S.synObj.geometry.attributes.position.needsUpdate = true; S.synObj.geometry.attributes.color.needsUpdate = true;
}
// neuropil: thousands of faint particles around each cluster and along the paths — the tissue the knowledge sits in
function buildNeuropil() {
  const pts = [], cols = []; const push = (x, y, z, c, k) => { pts.push(x, y, z); cols.push(c.r * k, c.g * k, c.b * k); };
  const gauss = (s, i) => (rnd(s, i) + rnd(s, i + 50) + rnd(s, i + 100) - 1.5) * 2;
  for (const [name, c] of Object.entries(CL)) { const col = new THREE.Color(c.colour); const a = c.anchor; const sig = name === 'classification' ? 95 : 75; for (let i = 0; i < 420; i++) { const s = `${name}:${i}`; push(a[0] + gauss(s, 1) * sig, a[1] + gauss(s, 2) * sig, a[2] + gauss(s, 3) * sig, col, 0.16 + rnd(s, 4) * 0.18); } }
  for (const name of OUTER) { const col = new THREE.Color(CL[name].colour); const a = CL[name].anchor; for (let i = 0; i < 160; i++) { const s = `path:${name}:${i}`; const t = rnd(s, 1); push(a[0] * t + gauss(s, 2) * 22, a[1] * t + gauss(s, 3) * 22, a[2] * t + gauss(s, 4) * 22, col, 0.08 + rnd(s, 5) * 0.1); } }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const mat = new THREE.PointsMaterial({ size: 2.8, map: S.tex, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
  S.neuropil = new THREE.Points(geo, mat); S.Graph.scene().add(S.neuropil);
}

// ------------------------------------------------------------------ activation: the signal walks the real links, one hop per STEP
function actOf(n, now) { const t0 = S.act.get(n.id); if (t0 === undefined) return 0; const p = (now - t0) / 380; return p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p); }
function adjacency() { const adj = new Map(); for (const l of S.links) { const a = l.source.id || l.source, b = l.target.id || l.target; if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []); adj.get(a).push({ l, v: b, dir: 1 }); adj.get(b).push({ l, v: a, dir: -1 }); } return adj; }
function pulse(seeds, hops, allow, keepExisting = false) {
  const now = performance.now(); if (!keepExisting) { S.act.clear(); S.actL.clear(); }
  const adj = adjacency(); const byId = new Map(S.nodes.map(n => [n.id, n])); let frontier = []; const seen = new Map();
  for (const s of seeds) if (byId.has(s)) { S.act.set(s, now); seen.set(s, 0); frontier.push(s); }
  for (let h = 0; h < hops && frontier.length; h++) {
    const next = [];
    for (const u of frontier) for (const { l, v, dir } of adj.get(u) || []) { if (seen.has(v) && seen.get(v) <= h) continue; if (allow && !allow(byId.get(u), l, byId.get(v), h)) continue; const jit = rnd(l.id, 11) * 160; if (!S.actL.has(l.id)) S.actL.set(l.id, { t0: now + h * STEP + jit, dir }); if (!seen.has(v)) { seen.set(v, h + 1); S.act.set(v, now + (h + 1) * STEP + jit); next.push(v); } }
    frontier = next;
  }
  S.alive = S.act.size > 0; S.dirty = 3; const ctl = S.Graph.controls(); ctl.autoRotate = false;
  renderState();
}
function clearAct() { S.act.clear(); S.actL.clear(); S.alive = false; S.dirty = 3; S.Graph.controls().autoRotate = true; renderState(); }
const hasEdgeFrom = (l, sid) => l.edges && l.edges.some(e => e.source_id === sid);
function lightFrom(n) {
  // concept → (its children, for a group) → the plants its claims reach → their growth form and the sources of those claims
  if (n.kind === 'concept') { const fam = new Set(descendants(n.id)); pulse([n.id], 3, (u, l, v, h) => l.kind === 'parent' ? (h === 0 && fam.has(v.id)) : l.kind === 'pc' ? (u.kind === 'concept' && fam.has(u.id)) : (l.kind === 'gf' || l.kind === 'sp') ? u.kind === 'plant' : false); }
  else if (n.kind === 'plant') pulse([n.id], 2, (u, l, v, h) => h === 0 ? (l.kind !== 'rel') : l.kind === 'parent');
  else if (n.kind === 'gf') { const ps = [...gfPlants(n.id)]; const shared = c => ps.length && ps.every(p => linkedPlants(c).has(p)); pulse([n.id], 2, (u, l, v, h) => h === 0 ? l.kind === 'gf' : (l.kind === 'pc' && shared(v.id)) || l.kind === 'sp'); }
  else if (n.kind === 'source') pulse([n.id], 2, (u, l, v, h) => h === 0 ? l.kind === 'sp' : (l.kind === 'pc' && hasEdgeFrom(l, n.id.split(':')[1])));
  else if (n.kind === 'cultivar') pulse([n.id], 1);
}

// ------------------------------------------------------------------ per frame: centroids, neuron glow, fibre signal, synapses, labels
const _v = new THREE.Vector3();
function frame() {
  const now = performance.now(); const cam = S.Graph.camera(); const w = window.innerWidth, h = window.innerHeight;
  for (const c of Object.keys(CL)) { let x = 0, y = 0, z = 0, k = 0; for (const n of S.nodes) if (n.cluster === c && (n.kind === 'concept' || n.kind === 'source' || n.kind === 'gf') && n.used && Number.isFinite(n.x)) { x += n.x; y += n.y; z += n.z; k++; } S.centroid[c] = k ? { x: x / k, y: y / k, z: z / k, n: k } : { x: CL[c].anchor[0], y: CL[c].anchor[1], z: CL[c].anchor[2], n: 0 }; }
  const alive = S.alive;
  for (const n of S.nodes) { const o = n.__obj; if (!o) continue; const a = actOf(n, now); const breathe = 1 + 0.05 * Math.sin(now / 900 + rnd(n.id, 6) * 6.3); const sc = n.size * breathe * (1 + 0.32 * a + (a >= 1 ? 0.06 * Math.sin(now / 220 + rnd(n.id, 6) * 6) : 0)); o.halo.scale.set(sc, sc, 1); const f = alive ? (0.1 + 0.9 * a) : 1; for (const m of o.mats) m.opacity = Math.min(1, m.userData.base * f * (a >= 1 ? 1.25 : 1)); }
  if (alive || S.dirty > 0) {
    for (const l of S.links) { const o = l.__obj; if (!o) continue; const A = S.actL.get(l.id); if (A) { const p = (now - A.t0) / 700; paintLink(l, u => { const d = (A.dir > 0 ? u : 1 - u) - p; if (p < 0) return 0.25; const win = Math.exp(-(d * 7) * (d * 7)); return (p > 1.25 ? 1.15 : (d < 0 ? 0.95 : 0.2)) + 1.3 * win; }); o.mat.opacity = Math.min(1, o.base * 2.4); } else { paintLink(l, alive ? 0.12 : 1); o.mat.opacity = o.base; } }
    if (S.dirty > 0) S.dirty--;
  }
  if (S.neuropil) S.neuropil.material.opacity = alive ? 0.28 : 0.7;
  updateSynapses(now);
  // labels: plants, used growth forms and cluster names always; lit concepts and sources while a signal is on
  const litCount = alive ? [...S.act.keys()].filter(id => { const n = S.nodes.find(x => x.id === id); return n && (n.kind === 'concept' || n.kind === 'source'); }).length : 0;
  for (const L of S.labels) {
    const n = L.n; let show = true; let x, y, z;
    if (L.cluster) { const c = S.centroid[L.cluster]; if (!c || !c.n) { L.el.classList.add('hidden'); continue; } x = c.x; y = c.y + 60; z = c.z; L.el.classList.toggle('muted', alive); }
    else { if (!Number.isFinite(n.x)) { L.el.classList.add('hidden'); continue; } x = n.x; y = n.y; z = n.z; const a = actOf(n, now); if (n.kind === 'concept' || n.kind === 'source') show = a > 0.6 && (litCount <= 28 || n.k >= 2 || S.act.get(n.id) === [...S.act.values()][0] || n.kind === 'source'); else if (n.kind === 'gf') show = n.used || a > 0.6; else if (n.kind === 'cultivar') show = a > 0.6; L.el.classList.toggle('muted', alive && a < 0.6 && (n.kind === 'plant' || n.kind === 'gf')); y -= (n.size || 10) * 0.45 + 2; }
    if (!show) { L.el.classList.add('hidden'); continue; }
    _v.set(x, y, z); _v.project(cam); if (_v.z > 1) { L.el.classList.add('hidden'); continue; }
    L.el.classList.remove('hidden'); L.sx = (_v.x + 1) / 2 * w; L.sy = (1 - _v.y) / 2 * h; L.el.style.left = `${L.sx}px`; L.el.style.top = `${L.sy}px`; L.shown = true;
  }
  // lit labels nudge apart so a wave of concepts stays readable
  const placed = []; for (const L of S.labels.filter(x => x.shown && x.n && (x.n.kind === 'concept' || x.n.kind === 'source' || x.n.kind === 'cultivar')).sort((a, b) => a.sy - b.sy)) { const wpx = L.el.offsetWidth || 60; let y = L.sy; for (const p of placed) if (Math.abs(p.x - L.sx) < (p.w + wpx) / 2 + 4 && y < p.y + 13 && y > p.y - 13) y = p.y + 13; if (y !== L.sy) L.el.style.top = `${y}px`; placed.push({ x: L.sx, y, w: wpx }); }
  for (const L of S.labels) L.shown = false;
}
function rebuildLabels() {
  for (const L of S.labels) L.el.remove(); S.labels = [];
  const add = (n, html, cls, cluster) => { const el = document.createElement('div'); el.className = `lbl ${cls}`; el.innerHTML = html; el.addEventListener('click', e => { e.stopPropagation(); if (cluster) selectCluster(cluster); else select(n); }); $('#labels').appendChild(el); S.labels.push({ n, el, cluster }); };
  for (const n of S.nodes) {
    if (n.kind === 'plant') add(n, `${esc(n.n.label)}<small>${esc((n.n.common || [])[0] || '')}${n.n.growth_form ? ` · ${esc(S.G.label(n.n.growth_form).toLowerCase())}` : ''}</small>`, 'plant');
    else if (n.kind === 'gf') add(n, `${esc(n.n.label)}<small>${gfPlants(n.id).size ? `${gfPlants(n.id).size} plant${gfPlants(n.id).size === 1 ? '' : 's'}` : 'no plant yet'}</small>`, 'gf');
    else if (n.kind === 'concept') add(n, esc(n.n.label), 'lit');
    else if (n.kind === 'source') add(n, esc(n.n.label.length > 24 ? n.n.label.slice(0, 22) + '…' : n.n.label), 'lit source');
    else if (n.kind === 'cultivar') add(n, esc(n.n.label), 'lit');
  }
  for (const c of Object.keys(CL)) { const el = document.createElement('div'); el.className = 'lbl cluster'; el.style.color = CL[c].colour; const used = S.nodes.filter(n => n.cluster === c && n.used && n.kind !== 'gf').length; el.innerHTML = `${esc(CL[c].label)}<small>${c === 'classification' ? `${S.G.plants.length} plants · ${S.nodes.filter(n => n.kind === 'gf' && n.used).length} forms` : `${used} neurons in use`}</small>`; el.addEventListener('click', e => { e.stopPropagation(); selectCluster(c); }); $('#labels').appendChild(el); S.labels.push({ n: null, el, cluster: c }); }
}

// ------------------------------------------------------------------ tooltip, state line, clusters, stats
const tip = $('#tip');
function showTip(n) { let html = ''; const G = S.G;
  if (n.kind === 'concept' || n.kind === 'gf') { const o = G.O.get(n.id); const lp = n.kind === 'gf' ? gfPlants(n.id) : linkedPlants(n.id); html = `<b>${esc(o.label)}</b> <span class="meta">${esc(CL[n.cluster].label)}</span><div class="meta">${lp.size ? `${lp.size} plant${lp.size === 1 ? '' : 's'}${n.kind === 'gf' ? '' : ` · ${liveEdgesFor(n.id).length} claims`}` : 'dormant: in the vocabulary, no claim yet'}</div>`; }
  else if (n.kind === 'plant') html = `<b><em>${esc(n.n.label)}</em></b><div class="meta">${plantEdges(n.id).length} claims · ${new Set(plantEdges(n.id).map(e => e.target)).size} concepts</div>`;
  else if (n.kind === 'source') html = `<b>${esc(n.n.label)}</b><div class="meta">${esc(n.n.source_type || '')}${n.n.geo ? ' · ' + esc(n.n.geo) : ''} · ${(S.G.bySource.get(n.id) || []).filter(e => e.live !== false).length} claims</div>`;
  else if (n.kind === 'cultivar') html = `<b>${esc(n.n.label)}</b>`;
  tip.innerHTML = html; tip.style.display = 'block'; }
function hideTip() { tip.style.display = 'none'; }
document.addEventListener('pointermove', e => { if (tip.style.display !== 'none') { tip.style.left = `${Math.min(window.innerWidth - 320, e.clientX + 14)}px`; tip.style.top = `${e.clientY + 14}px`; } });
function renderState() {
  const el = $('#state'); if (!S.alive) { el.innerHTML = S.candidates.length ? `<span class="cand">${S.candidates.length} candidate observation${S.candidates.length === 1 ? '' : 's'} grown this session</span>` : 'click a neuron, a cluster, or ask — the signal follows the real links'; return; }
  const ids = [...S.act.keys()]; const kinds = {}; for (const id of ids) { const n = S.nodes.find(x => x.id === id); if (n) kinds[n.kind] = (kinds[n.kind] || 0) + 1; }
  const claims = [...S.actL.keys()].reduce((a, id) => { const l = S.links.find(x => x.id === id); return a + (l && l.kind === 'pc' ? l.edges.length : 0); }, 0);
  el.innerHTML = `lit: <b>${kinds.concept || 0}</b> concepts · <b>${kinds.plant || 0}</b> plants · <b>${claims}</b> claims on <b>${[...S.actL.keys()].length}</b> fibres · <b>${kinds.source || 0}</b> sources <span class="faint">· Esc clears</span>`;
}
function renderClusters() { $('#clusters').innerHTML = Object.keys(CL).map(c => `<button data-cluster="${c}"><i class="dot" style="background:${CL[c].colour}"></i>${esc(CL[c].label)}<small>${c === 'classification' ? `${S.nodes.filter(n => n.kind === 'gf' && n.used).length}/${S.nodes.filter(n => n.kind === 'gf').length}` : `${S.nodes.filter(n => n.cluster === c && n.used && n.kind === 'concept').length}/${S.nodes.filter(n => n.cluster === c && n.kind === 'concept').length}`}</small></button>`).join(''); $('#clusters').querySelectorAll('button').forEach(b => b.addEventListener('click', () => selectCluster(b.dataset.cluster))); }
function renderStats() { const c = S.G.graph.counts; $('#stats').textContent = `${c.concepts} concept neurons · ${S.nodes.filter(n => n.kind === 'concept' && n.used).length} in use · ${c.plants} plants · ${c.sources} sources · ${S.syn.length} synapses (claims) · ${S.links.length} fibres`; renderState(); }

// ------------------------------------------------------------------ selection: light the path, then the card
const card = $('#card'), CB = $('#card-body');
function openCard(html) { CB.innerHTML = html; card.classList.add('open'); bind(CB); card.scrollTop = 0; }
function closeCard() { card.classList.remove('open'); CB.innerHTML = ''; S.selected = null; }
function clearAll() { closeCard(); clearAct(); $('#clusters').querySelectorAll('button').forEach(b => b.classList.remove('on')); }
function focusOn(n) { if (!n || !Number.isFinite(n.x)) return; const cam = S.Graph.camera(); const ctl = S.Graph.controls(); const d = new THREE.Vector3().subVectors(cam.position, ctl.target).normalize(); const dist = n.kind === 'plant' || n.kind === 'gf' ? 480 : 440; S.Graph.cameraPosition({ x: n.x + d.x * dist, y: n.y + d.y * dist, z: n.z + d.z * dist }, { x: n.x, y: n.y, z: n.z }, 1400); }
function select(n) {
  $('#clusters').querySelectorAll('button').forEach(b => b.classList.remove('on'));
  if (n.kind === 'link') { const l = n.link; S.act.clear(); S.actL.clear(); const now = performance.now(); S.act.set(l.source.id, now); S.act.set(l.target.id, now + STEP); S.actL.set(l.id, { t0: now, dir: 1 }); S.alive = true; S.dirty = 3; renderState(); openCard(cardLink(l)); return; }
  S.selected = n; lightFrom(n); focusOn(n);
  openCard(n.kind === 'concept' ? cardConcept(n) : n.kind === 'plant' ? cardPlant(n) : n.kind === 'gf' ? cardGf(n) : n.kind === 'source' ? cardSource(n) : cardPlant(S.nodes.find(x => x.id === n.n.plant)));
}
function selectCluster(c) {
  $('#clusters').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.cluster === c));
  const seeds = S.nodes.filter(n => n.cluster === c && n.used && (n.kind === 'concept' || n.kind === 'gf' || n.kind === 'source')).map(n => n.id);
  pulse(seeds, 1, (u, l, v) => v.kind === 'plant');
  const ctr = S.centroid[c]; if (ctr) { const cam = S.Graph.camera(); const ctl = S.Graph.controls(); const d = new THREE.Vector3().subVectors(cam.position, ctl.target).normalize(); S.Graph.cameraPosition({ x: ctr.x + d.x * 480, y: ctr.y + d.y * 480, z: ctr.z + d.z * 480 }, ctr, 1400); }
  openCard(cardCluster(c));
}
function bind(root) {
  root.querySelectorAll('[data-id]').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); const n = S.nodes.find(x => x.id === el.dataset.id); if (n) select(n); }));
  root.querySelectorAll('[data-cluster]').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); selectCluster(el.dataset.cluster); }));
  root.querySelectorAll('[data-claim]').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); const ed = allEdges().find(x => x.claim_id === el.dataset.claim); const l = ed && S.links.find(x => x.kind === 'pc' && x.source.id === ed.plant && x.target.id === ed.target); if (l) select({ kind: 'link', link: l }); }));
}

// ------------------------------------------------------------------ cards (compact: a sentence first, the evidence behind a fold)
const dot = c => `<i class="dot" style="background:${CL[c]?.colour || '#888'}"></i>`;
const stTag = s => `<span class="tag ${esc(s)}">${esc(s)}</span>`;
const edgeVal = e => e.value_label != null ? (Array.isArray(e.value_label) ? e.value_label.join(', ') : e.value_label) : e.numbers ? fmtNum(e.numbers) : S.G.label(e.target);
function evidenceRow(e, withPlant = false) { const G = S.G; const conds = (e.conditions || []).map(c => G.label(c.concept_id)).join(', '); return `<div class="row" ${e.claim_id ? `data-claim="${esc(e.claim_id)}"` : ''}><i class="st ${esc(e.status)}" style="--c:${TYPE_COLOUR[e.source_type] || TYPE_COLOUR.plant}"></i><div>${withPlant ? `<em>${esc(G.label(e.plant))}</em> · ` : ''}<span class="val">${esc(edgeVal(e))}</span>${e.via ? ` <span class="faint">via ${esc(G.label(e.via))}</span>` : ''}${e.spanned ? ' <span class="faint">(range spans this class)</span>' : ''}${e.cultivar ? ` <span class="muted">‘${esc(e.cultivar)}’</span>` : ''}<br><span class="meta">${esc(srcLabel(e.source_id, S.db.sources))} · ${esc(e.status)}${conds ? ' · under ' + esc(conds) : ''}${e.place ? ' · ' + esc(G.label(e.place)) + (isVan(e.place) ? ' ✓ local' : '') : ''}</span></div></div>`; }
const chip = (id, extra = '') => { const n = S.nodes.find(x => x.id === id); if (!n) return ''; const k = n.kind === 'gf' ? gfPlants(id).size : n.kind === 'concept' ? linkedPlants(id).size : 0; return `<span class="chip ${n.used === false ? 'dim' : ''}" data-id="${esc(id)}" style="--c:${colourOf(n)}">${esc(S.G.label(id))}${k ? `<small>${k}</small>` : ''}${extra}</span>`; };
function plantSummary(es) { const G = S.G; const direct = es.filter(e => !e.via).length, inh = es.filter(e => e.via).length; const vias = [...new Set(es.filter(e => e.via).map(e => G.label(e.via)))]; const local = es.filter(e => isVan(e.place)).length; const ver = es.filter(e => e.status === 'verified').length; const places = [...new Set(es.map(e => e.place).filter(Boolean).map(G.label))]; return `${es.length} claim${es.length === 1 ? '' : 's'}${direct && inh ? ` · ${direct} direct, ${inh} inherited from ${esc(vias.join(', '))}` : inh ? ` · inherited from ${esc(vias.join(', '))}` : ''} · ${ver} verified · ${local ? `${local} from the Vancouver scale` : `none from Vancouver (${esc(places.join(', ') || 'no place')})`}`; }
function cardConcept(n) {
  const G = S.G; const o = G.O.get(n.id); const es = liveEdgesFor(n.id); const plants = [...new Set(es.map(e => e.plant))]; const srcs = [...new Set(es.map(e => e.source_id))]; const conds = [...new Set(es.flatMap(e => (e.conditions || []).map(c => c.concept_id)))];
  const sib = (G.facets.get(o.facet) || []).filter(c => c.id !== n.id).slice(0, 10);
  return `<h2>${dot(n.cluster)} ${esc(o.label)}</h2><div class="kicker">${esc(CL[n.cluster].label)} · ${esc(o.facet.replace(/_/g, ' '))}${o.parent ? ` · part of <span class="link" data-id="${esc(o.parent)}">${esc(G.label(o.parent))}</span>` : ''}</div>
  <p class="lead">${esc(o.definition)}</p>${o.aliases?.length ? `<p class="muted small">also: ${esc(o.aliases.join(' · '))}</p>` : ''}
  ${plants.length ? `<h3><span class="step">lit</span> ${plants.length} plant${plants.length === 1 ? '' : 's'} · ${es.length} claims · ${srcs.length} sources</h3>${plants.map(p => `<div class="row" data-id="${p}"><i class="st verified" style="--c:${TYPE_COLOUR.plant}"></i><div><em class="val">${esc(G.label(p))}</em> <span class="muted">${esc(G.label(growthFormOf(p) || '').toLowerCase())}</span><br><span class="meta">${plantSummary(es.filter(e => e.plant === p))}</span></div></div>`).join('')}
  <details><summary>the claims and their sources</summary>${plants.map(p => `<div class="muted small" style="margin-top:6px"><em>${esc(G.label(p))}</em></div>${es.filter(e => e.plant === p).map(e => evidenceRow(e)).join('')}`).join('')}<h3>Sources</h3>${srcs.map(sid => { const s = S.db.sources[sid] || {}; return `<div class="row" data-id="source:${esc(sid)}"><i class="st verified" style="--c:${TYPE_COLOUR[s.type || (sid === 'candidate' ? 'candidate' : 'entity')] || TYPE_COLOUR.plant}"></i><div><span class="val">${esc(srcLabel(sid, S.db.sources))}</span> <span class="meta">${esc(s.type || sid)}${s.geo_specificity ? ' · ' + esc(s.geo_specificity) : ''}${s.licence_tier ? ' · tier ' + esc(s.licence_tier) : ''} · ${es.filter(e => e.source_id === sid).length}</span></div></div>`; }).join('')}${conds.length ? `<p class="muted small">conditions stated: ${conds.map(c => chip(c)).join(' ')}</p>` : ''}</details>` : '<p class="muted">Dormant: in the vocabulary, no claim links it to a plant yet. An observation can wake it.</p>'}
  ${sib.length ? `<h3>Same facet</h3><div class="chips">${sib.map(c => chip(c.id)).join('')}</div>` : ''}`;
}
function cardPlant(n) {
  const G = S.G; const es = plantEdges(n.id); const d = S.diag.plants[n.id]; const gf = allEdges().find(e => e.type === 'classification' && e.plant === n.id); const byC = {};
  for (const e of es) for (const t of [e.target, e.place].filter(Boolean)) { const nn = S.nodes.find(x => x.id === t); if (!nn) continue; (byC[nn.cluster] = byC[nn.cluster] || new Map()); const m = byC[nn.cluster]; m.set(t, (m.get(t) || 0) + 1); }
  const vars = S.diag.variation.filter(x => x.plant === n.id), dis = S.diag.disagreement.filter(x => x.plant === n.id);
  return `<h2><em>${esc(n.n.label)}</em></h2><div class="kicker">${esc((n.n.common || []).join(' · '))} · ${esc((n.n.origin_status || '').replace(/_/g, ' '))}</div>${S.snap ? PC.miniHtml(S.snap, n.id, S.imgs) : ''}
  ${gf ? `<div class="row" data-id="${esc(gf.target)}">${dot('classification')}<div><span class="val">${esc(G.label(gf.target))}</span> ${stTag(gf.status)}<br><span class="meta">${esc(gf.text)}${gf.weak?.length ? ` <span class="warn">(${esc(gf.weak.join(', '))}: a use mention only)</span>` : ''}</span></div></div>` : ''}
  <p class="lead">${esc(d?.text || '')}</p>
  ${vars.length || dis.length ? `<p class="muted small">${vars.map(x => `↔ ${esc(x.text)}`).join('<br>')}${vars.length && dis.length ? '<br>' : ''}${dis.slice(0, 3).map(x => `≠ ${esc(x.text)}`).join('<br>')}${dis.length > 3 ? `<br>… ${dis.length - 3} more disagreements` : ''}</p>` : ''}
  ${Object.keys(CL).filter(c => byC[c]).map(c => `<h3>${dot(c)} ${esc(CL[c].label)} <span class="faint">${byC[c].size}</span></h3><div class="chips">${[...byC[c].entries()].sort((a, b) => b[1] - a[1]).map(([id, k]) => chip(id, `<small>${k}</small>`)).join('')}</div>`).join('')}`;
}
function cardGf(n) { const G = S.G; const ps = [...gfPlants(n.id)]; const o = G.O.get(n.id); return `<h2>${dot('classification')} ${esc(o.label)}</h2><div class="kicker">classification · growth form · ${ps.length} plant${ps.length === 1 ? '' : 's'}</div><p class="lead">${esc(o.definition)}</p>${ps.length ? ps.map(p => { const e = allEdges().find(x => x.type === 'classification' && x.plant === p); return `<div class="row" data-id="${p}"><i class="st verified" style="--c:${TYPE_COLOUR.plant}"></i><div><em class="val">${esc(G.label(p))}</em> ${e ? stTag(e.status) : ''}<br><span class="meta">${e ? esc(e.text) : ''}${e && e.weak?.length ? ` <span class="warn">(${esc(e.weak.join(', '))}: a use mention only)</span>` : ''}</span></div></div>`; }).join('') + '<p class="muted small">Lit: the concepts every plant of this class shares, and the sources behind them.</p>' : '<p class="muted">No plant in the database is read as this form yet.</p>'}`; }
function cardSource(n) { const G = S.G; const es = (n.id === 'source:candidate' ? S.candEdges : (G.bySource.get(n.id) || [])).filter(e => e.live !== false && e.target); const rec = S.db.sources[n.id.split(':')[1]] || {}; const byP = {}; for (const e of es) (byP[e.plant] = byP[e.plant] || []).push(e); return `<h2>${esc(n.n.label)}</h2><div class="kicker">${esc(n.n.source_type || '')}${n.n.geo ? ' · ' + esc(n.n.geo) : ''}${n.n.licence_tier ? ' · licence tier ' + esc(n.n.licence_tier) : ''} · ${es.length} claims</div>${rec.role_in_db ? `<p class="muted small">${esc(rec.role_in_db)}</p>` : ''}${rec.url ? `<p class="small"><a href="${esc(rec.url)}" target="_blank" rel="noopener">${esc(rec.url.replace(/^https?:\/\//, ''))}</a></p>` : ''}${Object.entries(byP).map(([p, ees]) => `<h3><em>${esc(G.label(p))}</em> · ${ees.length}</h3><div class="chips">${[...new Set(ees.map(e => e.target))].map(cid => chip(cid)).join('')}</div>`).join('')}`; }
function cardLink(l) { const G = S.G; const es = l.edges; const o = G.O.get(l.target.id); return `<h2><em>${esc(G.label(l.source.id))}</em> → ${dot(l.target.cluster)} ${esc(o.label)}</h2><div class="kicker">${es.length} ${l.kind === 'gf' ? 'classification edge' : `claim${es.length === 1 ? '' : 's'} make this fibre`}</div><p class="muted small">${esc(o.definition)}</p>${es.map(e => e.type === 'classification' ? `<div class="row"><i class="st ${esc(e.status)}" style="--c:${CL.classification.colour}"></i><div><span class="val">${esc(e.text)}</span><br><span class="meta">${Object.entries(e.evidence || {}).map(([s, ev]) => `${esc(s)}: ${esc(ev)}`).join(' · ')}</span></div></div>` : evidenceRow(e)).join('')}`; }
function cardCluster(c) {
  const G = S.G; const cs = S.nodes.filter(n => n.cluster === c && n.kind === 'concept'); const used = cs.filter(n => n.used).sort((a, b) => b.k - a.k || liveEdgesFor(b.id).length - liveEdgesFor(a.id).length);
  if (c === 'classification') return `<h2>${dot(c)} Classification</h2><div class="kicker">growth form · read from the sources, never from “Broadleaf evergreen”</div>${S.nodes.filter(n => n.kind === 'gf').map(n => `<div class="row ${n.used ? '' : 'dim'}" data-id="${n.id}"><i class="st verified" style="--c:${CL.classification.colour}"></i><div><span class="val">${esc(n.n.label)}</span> <span class="meta">${[...gfPlants(n.id)].map(p => `<em>${esc(G.label(p))}</em>`).join(', ') || 'no plant yet'}</span></div></div>`).join('')}<h3>Plants</h3>${G.plants.map(p => `<div class="row" data-id="${p.id}"><i class="st verified" style="--c:${TYPE_COLOUR.plant}"></i><div><em class="val">${esc(p.label)}</em> <span class="meta">${esc(S.diag.plants[p.id]?.text || '')}</span></div></div>`).join('')}`;
  const facets = [...new Set(cs.map(n => n.n.facet))]; const srcs = c === 'evidence' ? S.nodes.filter(n => n.kind === 'source' && n.used) : [];
  return `<h2>${dot(c)} ${esc(CL[c].label)}</h2><div class="kicker">${used.length} of ${cs.length} neurons in use · ${facets.length} facet${facets.length === 1 ? '' : 's'}${srcs.length ? ` · ${srcs.length} sources` : ''}</div>
  <p class="muted small">Lit: every concept here that a claim reaches, and the plants it reaches. Hubs first.</p>
  <div class="chips">${used.slice(0, 40).map(n => chip(n.id)).join('')}</div>${used.length > 40 ? `<p class="faint small">+ ${used.length - 40} more</p>` : ''}
  ${srcs.length ? `<h3>Sources</h3><div class="chips">${srcs.map(n => chip(n.id)).join('')}</div>` : ''}
  <details><summary>dormant vocabulary · ${cs.length - used.length}</summary><div class="chips">${cs.filter(n => !n.used).slice(0, 60).map(n => chip(n.id)).join('')}</div></details>`;
}

// ------------------------------------------------------------------ Ask: concepts wake first, then the signal reaches the plants that pass the gates, then the evidence the retriever cites
function runQuery(q) {
  if (!q.trim()) return; const G = S.G; const found = conceptsInText(G, q); const concepts = [...found.keys()].filter(id => S.nodes.some(n => n.id === id));
  const byC = {}; for (const c of concepts) { const n = S.nodes.find(x => x.id === c); (byC[n.cluster] = byC[n.cluster] || []).push(c); }
  pulse(concepts, 0); $('#clusters').querySelectorAll('button').forEach(b => b.classList.remove('on'));
  const chips = Object.keys(CL).filter(c => byC[c]).map(c => `<div class="muted small" style="margin-top:6px">${dot(c)} ${esc(CL[c].label)}</div><div class="chips">${byC[c].map(id => chip(id, `<small>${esc(found.get(id))}</small>`)).join('')}</div>`).join('');
  openCard(`<h2>“${esc(q)}”</h2><div class="kicker">retrieval preview · not a full AI trace</div><h3><span class="step">01</span> concepts the words wake</h3>${chips || '<p class="muted">no concept matched by alias</p>'}<p class="muted small">the retriever is running: names → gates (R7) → BM25 recall → order R5 → attribution R6 …</p>`);
  setTimeout(() => {
    const r = S.retr.run(q); S.lastAsk = r; const now = performance.now(); const byId = new Map(S.nodes.map(n => [n.id, n]));
    const plants = r.candidates.map(p => `plant:${p}`); const used = new Map();
    for (const c of [...r.ranked.slice(0, 24), ...r.withheld, ...r.candidateHits]) for (const e of (G.byClaim.get(c.id) || []).concat(S.candEdges.filter(x => x.claim_id === c.id))) { if (!e.target) continue; const key = `${e.plant}→${e.target}`; used.set(key, e); if (e.place) used.set(`${e.plant}→${e.place}`, e); }
    // wave 1: named concepts → plants that pass; wave 2: plants → the evidence the retriever selects; wave 3: its sources
    for (const p of plants) { const n = byId.get(p); if (!n) continue; S.act.set(p, now + STEP); for (const c of concepts) { const l = S.links.find(x => x.kind === 'pc' && x.source.id === p && x.target.id === c); if (l) S.actL.set(l.id, { t0: now, dir: -1 }); } }
    const srcs = new Set();
    for (const [key, e] of used) { const l = S.links.find(x => x.id === key); if (!l || !plants.includes(l.source.id)) continue; const jit = rnd(key, 12) * 240; S.actL.set(key, { t0: now + STEP + jit, dir: 1 }); if (!S.act.has(l.target.id)) S.act.set(l.target.id, now + 2 * STEP + jit); srcs.add(`source:${e.source_id}`); const sl = S.links.find(x => x.kind === 'sp' && x.source.id === `source:${e.source_id}` && x.target.id === l.source.id); if (sl) S.actL.set(sl.id, { t0: now + 2 * STEP + jit, dir: -1 }); }
    for (const s of srcs) if (byId.has(s) && !S.act.has(s)) S.act.set(s, now + 3 * STEP);
    S.alive = true; S.dirty = 3; renderState();
    const sids = [...new Set(r.ranked.slice(0, 20).map(c => c.source_id))];
    openCard(`<h2>“${esc(q)}”</h2><div class="kicker">retrieval preview · not a full AI trace</div>
      <h3><span class="step">01</span> concepts the words wake</h3>${chips || '<p class="muted">none by alias</p>'}
      <h3><span class="step">02</span> plants after the gates (R7)</h3><p class="small">${plants.map(p => `<em class="link" data-id="${esc(p)}">${esc(G.label(p))}</em>`).join(', ') || 'none'}${r.excluded.length ? ` <span class="muted">· excluded: ${esc(r.excluded.join(', '))}</span>` : ''}</p>
      <h3><span class="step">03</span> evidence the retriever selects</h3><p class="small muted">${used.size} fibres from ${r.ranked.length} ranked claims · ${r.withheld.length} L0 withheld (R2)${r.candidateHits.length ? ` · <span class="cand">${r.candidateHits.length} candidate recalled, never cited</span>` : ''}</p>
      <h3><span class="step">04</span> sources</h3><div class="chips">${sids.map(sid => chip(`source:${sid}`, `<small>${r.ranked.filter(c => c.source_id === sid).length}</small>`)).join('')}</div>
      <details><summary>answer order (R5) · attribution (R6) · ${r.ranked.length} claims</summary>${r.ranked.slice(0, 14).map((c, i) => `<div class="r" data-claim="${esc(c.id)}"><span class="rank">${i + 1}.</span> ${esc(S.retr.attribute(c))}<div class="why">${esc(c.field.replace(/_/g, ' '))} · ${esc(S.retr.why(c))}</div></div>`).join('') || '<p class="warn">No sourced claim matches — honest empty answer.</p>'}${r.withheld.length ? `<h3>withheld (L0, not citable)</h3>${r.withheld.map(c => `<div class="r"><span class="muted">${esc(c.text)}</span><div class="why">stored, never cited (R2)</div></div>`).join('')}` : ''}${r.candidateHits.length ? `<h3>candidates recalled</h3>${r.candidateHits.map(c => `<div class="r cand">${esc(c.text)}<div class="why">unverified user input · flagged, not cited</div></div>`).join('')}` : ''}</details>`);
  }, STEP);
}

// ------------------------------------------------------------------ Grow: an observation becomes a candidate fibre that grows out of the plant
const FIELD_WORDS = { mature_height: ['height', 'tall', 'high', ' cm', 'stays under', 'stays below', 'reaches', 'metre', 'meter', ' m ', 'ft'], mature_spread: ['spread', 'wide', 'width', 'across'], exposure: ['full sun', 'part shade', 'shade', 'shady', 'sunny', 'north-facing', 'exposure', 'aspect'], water_drainage: ['wet', 'dry soil', 'drainage', 'drought', 'moist', 'waterlogged', 'soggy', 'irrigat'], hardiness_zone: ['frost', 'hardy', 'winter kill', 'zone', 'cold snap', 'froze'], maintenance_level: ['maintenance', 'pruning', 'prune', 'easy care', 'low care', 'fuss'], growth_rate: ['fast', 'slow', 'growth rate', 'grows quickly', 'vigorous', 'per year'], landscape_use: ['hedge', 'screen', 'ground cover', 'container', 'roof', 'planter'], toxicity: ['toxic', 'poison', 'dog', 'cat ', 'pets', 'ate'], seasonal_interest: ['flower', 'bloom', 'fall colour', 'fall color', 'berries', 'fruit', 'autumn', 'evergreen', 'leaves turn'], ecological_value: ['bees', 'pollinator', 'birds', 'wildlife', 'hummingbird', 'habitat'], resistances: ['tolerates', 'tolerant', 'resistant', 'unbothered', 'deer', 'rabbit'] };
function detect(text) {
  const G = S.G; const t = ` ${text.toLowerCase()} `; const names = S.retr.nameHits(text); const pid = Object.keys(names)[0] || null;
  const scores = Object.entries(FIELD_WORDS).map(([f, ws]) => [f, ws.filter(w => t.includes(w)).length]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]); const field = scores[0]?.[0] || null;
  const num = t.match(/(\d+(?:\.\d+)?)\s*(cm|m|metres?|meters?|ft|feet)\b/); let value = null, value_kind = 'qualitative';
  if (num) { let x = parseFloat(num[1]); const u = num[2]; if (u === 'cm') x /= 100; else if (u === 'ft' || u === 'feet') x *= 0.3048; x = Math.round(x * 100) / 100; const before = t.slice(0, num.index); value = /(under|below|less than|at most|no more than|max)\s*$/.test(before) ? { max: x, unit: 'm' } : /(over|above|more than|at least|min)\s*$/.test(before) ? { min: x, unit: 'm' } : { height_m: x, unit: 'm' }; value_kind = 'quantitative'; }
  const found = conceptsInText(G, text); const byFacet = {}; for (const id of found.keys()) { const f = G.O.get(id).facet; if (f === 'growth_form') continue; (byFacet[f] = byFacet[f] || []).push(id); }
  const facets = (G.facetFields && Object.entries(G.facetFields).filter(([, flds]) => flds.some(x => x.split('.')[0] === field)).map(([f]) => f).filter(f => f !== 'growth_form')) || [];
  let concepts = [], conditions = [];
  if (value && (field === 'mature_height' || field === 'local_mature_size')) { const iv = interval(value); concepts = classesFor(G, 'height_class', iv[0], iv[1]); } else if (value && field === 'mature_spread') { const iv = interval(value); concepts = classesFor(G, 'spread_class', iv[0], iv[1]); }
  for (const [f, ids] of Object.entries(byFacet)) { if (f === 'place' || f === 'season' || f === 'month' || f === 'age') continue; if (facets.includes(f) && !concepts.length) concepts.push(...ids); else if (f === 'exposure' || f === 'soil' || f === 'water') conditions.push(...ids.map(id => ({ facet: f, concept_id: id }))); else if (!facets.length) concepts.push(...ids); }
  if (!value && !concepts.length && field && facets.length && byFacet[facets[0]]) concepts = byFacet[facets[0]];
  const place = (byFacet.place || [])[0] || null; const time = [...(byFacet.season || []), ...(byFacet.month || []), ...(byFacet.age || [])];
  return { pid, field, value, value_kind, concepts: [...new Set(concepts)], conditions, place, time, value_label: value ? null : (concepts.length ? concepts.map(c => G.label(c)) : null) };
}
function loadCandidates() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } }
function saveCandidates() { try { localStorage.setItem(LS_KEY, JSON.stringify(S.candidates)); } catch { /* ignore */ } }
function candToClaim(c) { return { ...c, status: 'candidate', source_id: 'candidate', source_type: 'candidate', confidence: null }; }
function addCandidate(text, pid, field, basis, location) {
  const G = S.G; const d = detect(text); const locHits = location ? conceptsInText(G, location) : new Map(); const place = [...locHits.keys()].find(id => id.startsWith('place:')) || d.place || (location ? 'place:vancouver' : null);
  const n = S.candidates.filter(c => c.plant === pid && c.field === field).length + 1; const before = S.diag;
  const c = { id: `candidate:${pid}:${field}:${String(n).padStart(2, '0')}`, plant: pid, field, value_kind: d.value_kind, value: d.value || { note: text.trim() }, value_label: d.value_label, text: text.trim(), context: ['candidate (this session)', location, d.conditions.map(x => G.label(x.concept_id).toLowerCase()).join(', ')].filter(Boolean).join('; '), concepts: d.concepts, conditions: d.conditions, place, time: d.time, cultivar: null, recorded_at: new Date().toISOString().slice(0, 10), recorded_by: 'user (browser session)', practitioner_meta: { basis: basis || null, location: location || null, site_conditions: d.conditions.map(x => G.label(x.concept_id)).join(', ') || null, observer_background: 'this session (unverified user input)', completeness: basis && location ? 'L2' : basis ? 'L1' : 'L0', citable: false } };
  S.candidates.push(c); saveCandidates(); S.candEdges = S.candidates.flatMap(x => candidateEdges(G, x)); S.diag = runDiag();
  const oldLinks = new Set(S.links.map(l => l.id)); buildGraph(); const P = `plant:${pid}`; const born = performance.now();
  const grown = S.links.filter(l => !oldLinks.has(l.id)); for (const l of grown) l.born = born;   // the new fibres grow out of the plant
  for (const l of S.links) if (l.kind === 'pc' && l.edges.some(e => e.claim_id === c.id)) { if (!oldLinks.has(l.id)) continue; l.born = born; }
  const after = S.diag; const items = []; const facetsOf = [...new Set(d.concepts.map(x => G.O.get(x).facet))];
  items.push(`<em>${esc(G.label(P))}</em> grows ${d.concepts.length ? `${d.concepts.length} candidate synapse${d.concepts.length === 1 ? '' : 's'} to ${d.concepts.map(G.label).join(', ')}` : 'a candidate note with no concept — add a value, a condition or a place to connect it'}${d.conditions.length ? ` under ${d.conditions.map(x => G.label(x.concept_id).toLowerCase()).join(', ')}` : ''}${place ? ` at ${G.label(place)}` : ''}.`);
  const newHubs = after.hubs.filter(h => !before.hubs.some(b => b.concept === h.concept)); if (newHubs.length) items.push(`New hub: ${newHubs.map(h => h.label).join(', ')} now link${newHubs.length === 1 ? 's' : ''} two plants (one synapse is yours, unverified).`);
  for (const x of after.variation.filter(x => x.candidate && !before.variation.some(b => b.plant === x.plant && b.facet === x.facet))) items.push(`A variation appears: ${esc(x.text)}`);
  for (const x of after.variation.filter(x => x.candidate && before.variation.some(b => b.plant === x.plant && b.facet === x.facet))) items.push(`The existing variation on ${esc(x.facet.replace(/_/g, ' '))} gains a ${isVan(place) ? 'Vancouver' : 'new'} data point${isVan(place) ? ' — the first at the scale the database serves' : ''}.`);
  for (const x of after.disagreement.filter(x => x.candidate)) items.push(`Your reading disagrees with ${srcLabel(x.sources.find(s => s !== 'candidate'), S.db.sources)}: ${esc(x.text)}`);
  const gateBefore = before.gaps.filter(g => g.kind === 'gate_facet_missing' && g.plant === P).map(g => g.facet), gateAfter = after.gaps.filter(g => g.kind === 'gate_facet_missing' && g.plant === P).map(g => g.facet);
  for (const f of gateBefore.filter(f => !gateAfter.includes(f))) items.push(`The gate-facet gap ‘${f.replace(/_/g, ' ')}’ is filled by a candidate — the AI still cannot gate on it until a sourced claim arrives.`);
  if (facetsOf.length && items.length === 1) { const sib = plantEdges(P).filter(e => facetsOf.includes(e.facet) && e.type !== 'candidate'); items.push(sib.length ? `It sits beside ${new Set(sib.map(e => e.source_id)).size} sourced reading${new Set(sib.map(e => e.source_id)).size === 1 ? '' : 's'} on ${facetsOf.map(f => f.replace(/_/g, ' ')).join(', ')} without contradicting them.` : `No sourced reading existed on ${facetsOf.map(f => f.replace(/_/g, ' ')).join(', ')} for this plant — your observation is the first voice there, flagged candidate.`); }
  items.push(`Status: candidate (magenta, dashed in the store's terms), completeness ${c.practitioner_meta.completeness}, never citable, this browser only. Verified claims stay white; unverified sourced claims keep their cluster colour.`);
  // fire the new fibres after they have grown
  setTimeout(() => { pulse([P], 1, (u, l) => l.born !== undefined || (l.kind === 'pc' && l.edges.some(e => e.claim_id === c.id)) || l.kind === 'sp' && l.source.id === 'source:candidate'); if (!S.act.has('source:candidate')) { S.act.set('source:candidate', performance.now() + STEP); const sl = S.links.find(x => x.id === `source:candidate→${P}`); if (sl) S.actL.set(sl.id, { t0: performance.now(), dir: -1 }); } }, 1500);
  const pn = S.nodes.find(x => x.id === P); focusOn(pn);
  openCard(`${growForm()}<div class="changed"><h3>What grew</h3><ul>${items.map(i => `<li>${i}</li>`).join('')}</ul><p><button data-id="${P}">show the plant</button> <button id="ask-again">ask with it</button></p></div>`);
  $('#ask-again')?.addEventListener('click', () => { const q = `how tall does ${(G.N.get(P).common || [])[0] || G.label(P)} get in ${d.conditions.length ? G.label(d.conditions[0].concept_id).toLowerCase() : 'full sun'}`; $('#ask-input').value = q; runQuery(q); });
  wireGrow(); renderStats();
}
function resetCandidates() { S.candidates = []; saveCandidates(); S.candEdges = []; S.diag = S.G.diagnosis; buildGraph(); clearAll(); openCard(growForm()); wireGrow(); }
function growForm() { return `<h2>Add an observation</h2><div class="kicker">parsed into plant + concepts + conditions + place · grows a <span class="cand">candidate</span> fibre · this browser only · never verified here</div>
  <textarea id="add-text" placeholder="e.g. salal in my North Van garden stays under 60 cm in full sun"></textarea><div class="meta" id="add-detected" style="margin:4px 0"></div>
  <div class="grid2"><div><label>plant</label><select id="add-plant">${S.G.plants.map(p => `<option value="${p.id.split(':')[1]}">${esc(p.label)}</option>`).join('')}</select></div><div><label>field</label><select id="add-field">${Object.keys(FIELD_WORDS).map(f => `<option value="${f}">${f.replace(/_/g, ' ')}</option>`).join('')}</select></div><div><label>basis</label><select id="add-basis"><option value="">(none given)</option><option value="observed">observed on site</option><option value="project">my own project</option><option value="read">read somewhere</option><option value="mixed">mixed</option></select></div><div><label>location</label><input id="add-location" placeholder="e.g. North Vancouver"></div></div>
  <div style="display:flex;gap:8px"><button id="add-go" class="primary">Grow as candidate</button><button id="add-reset">Reset session</button></div>
  ${S.candidates.length ? `<h3>grown this session</h3>${S.candidates.map(c => `<div class="row" data-id="plant:${esc(c.plant)}"><i class="st candidate" style="--c:${TYPE_COLOUR.candidate}"></i><div><em class="val">${esc(S.G.label(`plant:${c.plant}`))}</em> · ${esc(c.field.replace(/_/g, ' '))} · ${esc(c.value_label ? [].concat(c.value_label).join(', ') : fmtNum(c.value))}</div></div>`).join('')}` : ''}`; }
function wireGrow() {
  const ta = $('#add-text'), ps = $('#add-plant'), fs = $('#add-field'); if (!ta) return;
  ta.addEventListener('input', () => { const d = detect(ta.value); if (d.pid) ps.value = d.pid; if (d.field) fs.value = d.field; $('#add-detected').innerHTML = `plant: ${esc(d.pid || '?')} · field: ${esc(d.field || '?')} · concepts: ${d.concepts.map(c => esc(S.G.label(c))).join(', ') || '—'}${d.conditions.length ? ' · conditions: ' + d.conditions.map(x => esc(S.G.label(x.concept_id))).join(', ') : ''}${d.place ? ' · place: ' + esc(S.G.label(d.place)) : ''}`; });
  $('#add-go').addEventListener('click', () => { const t = ta.value.trim(); if (!t) return; addCandidate(t, ps.value, fs.value, $('#add-basis').value, $('#add-location').value.trim()); });
  $('#add-reset').addEventListener('click', resetCandidates);
}

// ------------------------------------------------------------------ UI
function initUi() {
  $('#ask-run').addEventListener('click', () => runQuery($('#ask-input').value)); $('#ask-input').addEventListener('keydown', e => { if (e.key === 'Enter') runQuery($('#ask-input').value); });
  $('#btn-grow').addEventListener('click', () => { openCard(growForm()); wireGrow(); });
  $('#card-close').addEventListener('click', clearAll);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') clearAll(); });
  $('#legend').innerHTML = `<span><i style="background:${TYPE_COLOUR.plant}"></i>plant</span><span><i style="background:#fff"></i>verified synapse</span><span><i style="background:${CL.condition.colour}"></i>unverified · cluster colour</span><span><i style="background:${TYPE_COLOUR.candidate}"></i>candidate</span><span><i class="ln" style="background:${CL.classification.colour}"></i>classification</span>`;
  const qb = S.db.queries.queries.slice(0, 3); $('#ask-input').placeholder = `ask the store… e.g. ${qb[0]?.query || 'evergreen shade-tolerant hedge'}`;
}
window.brain = { S, select, selectCluster, pulse, clearAll, runQuery, addCandidate, resetCandidates, detect, CL };
