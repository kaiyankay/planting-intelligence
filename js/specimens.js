// V4.3 · specimen sheet. The ten species of the knowledge base as the 3D garden draws them, each beside the earlier proxy, built
// from the same record values (crown radius and height proxies, growth form, leaf retention, form / habit / texture / colour words).
// One WebGL renderer draws every plate off screen; the plates on the page are plain canvases. Nothing here is a plant fact.
import * as THREE from 'three';
import { loadKnowledge } from './knowledge.js';
import { form } from './render.js';
import { FORM_LABEL } from './plantforms.js';
import { buildPlant, scaleFigure } from './botanical.js';
import { buildPlantV42 } from './proxies-v42.js';

const $ = s => document.querySelector(s); const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const m = v => v == null ? 'not recorded' : `${Math.round(v * 100) / 100} m`;
let renderer;
function stage() {
  const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xfffaf0, 0xdcd6c2, 1.45));
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.05); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 3; sun.shadow.normalBias = .02; sun.shadow.bias = -.0008; scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xdfe8f5, .3); fill.position.set(10, 6, -8); scene.add(fill);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: .13 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  return { scene, sun };
}
/** draw groups standing on the ground into a 2D canvas; returns pixels per metre and where each group's centre landed (0…1 across) */
function plate(canvas, groups, { elevation = 9, azimuth = 24, pad = .08 } = {}) {
  const W = canvas.width, H = canvas.height; const { scene, sun } = stage(); for (const g of groups) scene.add(g);
  const box = new THREE.Box3(); for (const g of groups) box.expandByObject(g); const c = box.getCenter(new THREE.Vector3()); const size = box.getSize(new THREE.Vector3()); const e = Math.max(size.x, size.y, size.z);
  sun.position.set(c.x - e * .7, e * 1.1 + 2, c.z + e * .8); sun.target.position.copy(c); const sc = sun.shadow.camera; sc.left = -e; sc.right = e; sc.top = e; sc.bottom = -e; sc.near = .1; sc.far = e * 4 + 10; sc.updateProjectionMatrix();
  const el = elevation * Math.PI / 180, az = azimuth * Math.PI / 180; const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 1000); cam.position.copy(c).addScaledVector(dir, 200); cam.lookAt(c); cam.updateMatrixWorld(); const inv = cam.matrixWorldInverse;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const x of [box.min.x, box.max.x]) for (const y of [0, box.max.y]) for (const z of [box.min.z, box.max.z]) { const v = new THREE.Vector3(x, y, z).applyMatrix4(inv); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
  let w = (x1 - x0) * (1 + pad * 2), h = (y1 - y0) * (1 + pad * 2.6); if (w / h < W / H) w = h * W / H; else h = w * H / W; const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 + (y1 - y0) * pad * .5;
  cam.left = cx - w / 2; cam.right = cx + w / 2; cam.top = cy + h / 2; cam.bottom = cy - h / 2; cam.updateProjectionMatrix();
  renderer.setSize(W, H, false); renderer.render(scene, cam); const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, W, H); ctx.drawImage(renderer.domElement, 0, 0, W, H);
  const at = groups.map(g => { const v = g.position.clone(); v.y = 0; v.project(cam); return [(v.x + 1) / 2, (1 - v.y) / 2]; });
  for (const g of groups) g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  return { ppm: W / w, at };
}
/** a scale bar in round metres, lower left */
function bar(canvas, ppm) {
  const ctx = canvas.getContext('2d'); const k = canvas.width / 1400; const L = [.1, .2, .5, 1, 2, 5, 10].find(v => v * ppm >= 90 * k) || 10; const x = 36 * k, y = canvas.height - 30 * k, w = L * ppm;
  ctx.strokeStyle = '#5c5648'; ctx.fillStyle = '#5c5648'; ctx.lineWidth = 1.5 * k; ctx.beginPath(); ctx.moveTo(x, y - 6 * k); ctx.lineTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y - 6 * k); ctx.stroke(); ctx.font = `${Math.round(17 * k)}px "DM Mono", ui-monospace, monospace`; ctx.textBaseline = 'bottom'; ctx.fillText(`${L} m`, x + w + 10 * k, y + 4 * k);
}
const WINTER = new URLSearchParams(location.search).get('winter') === '1';   // ?winter=1: the bare-season forms (for checking)
const obj = (f, tag) => ({ id: `specimen-${tag}-${f.species_id}`, species_id: f.species_id, proxy_radius_m: f.radius_m, height_m: f.height_m });
const hOf = f => f.height_m ?? f.radius_m * 1.2;

async function main() {
  const K = await loadKnowledge(new URLSearchParams(location.search).get('data') || './data/explorer.json'); await (document.fonts?.ready ?? Promise.resolve());
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, failIfMajorPerformanceCaveat: false }); } catch (e) { $('#lineups').innerHTML = ''; $('#sheet').innerHTML = '<p class="sp-fail">The forms could not be drawn: this browser did not start WebGL.</p>'; return; }
  renderer.setPixelRatio(1); renderer.setClearColor(0x000000, 0); renderer.shadowMap.enabled = true; renderer.toneMapping = THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.6;
  const forms = K.species.map(s => form(K, s.id, null)).sort((a, b) => hOf(a) - hOf(b)); const report = { species: forms.length, plates: 0, triangles: {} };
  // line-ups: the lower plants, then the trees, each with the same 1.7 m figure
  const groupsOf = list => { let x = 0; const out = []; const fig = scaleFigure(1.7); fig.position.set(0, 0, 0); out.push(fig); x = .5; for (const f of list) { const g = buildPlant(f, obj(f, 'line'), { winter: WINTER }); x += f.radius_m; g.position.set(x, 0, 0); x += f.radius_m + Math.max(.25, f.radius_m * .25); out.push(g); } return out; };
  const low = forms.filter(f => hOf(f) < 3.5), tall = forms.filter(f => hOf(f) >= 3.5); const L = $('#lineups'); L.innerHTML = '';
  for (const [list, label, Hpx] of [[low, 'Perennials, the fern and the shrubs', 760], [tall, 'Trees', 900]]) {
    if (!list.length) continue; const fig = document.createElement('div'); fig.className = 'sp-lineup-fig'; const cv = document.createElement('canvas'); cv.width = 2400; cv.height = Hpx; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', `${label} at one scale beside a 1.7 m figure: ${list.map(f => K.common(f.species_id) || K.name(f.species_id)).join(', ')}`);
    const ol = document.createElement('ol'); ol.className = 'sp-lineup-names'; fig.append(cv, ol); L.appendChild(fig); const { ppm, at } = plate(cv, groupsOf(list), { elevation: 7, azimuth: 0, pad: .04 }); bar(cv, ppm); report.plates++;
    ol.innerHTML = list.map((f, i) => `<li style="left:${(at[i + 1][0] * 100).toFixed(2)}%">${esc(K.common(f.species_id) || K.name(f.species_id))}<b>${f.height_m != null ? `${Math.round(f.height_m * 100) / 100} m` : 'height unknown'}</b></li>`).join('');
  }
  // one row per species: the earlier proxy and the current form, same values, same scale
  const sheet = $('#sheet'); sheet.innerHTML = '';
  for (const f of forms) {
    const sid = f.species_id; const row = document.createElement('article'); row.className = 'sp-row'; row.dataset.species = sid; const ev = K.evergreen(sid);
    row.innerHTML = `<div><h3>${esc(K.common(sid) || K.name(sid))}</h3><p class="sp-sci">${esc(K.name(sid))}</p><dl class="sp-rec">
<dt>Height</dt><dd>${esc(m(f.height_m))}</dd><dt>Spread</dt><dd>${esc(m(f.radius_m * 2))}</dd><dt>Growth form</dt><dd>${esc(f.growth_form)}</dd><dt>Leaves</dt><dd>${esc(ev ? ev.join(' / ') : 'not recorded')}</dd>
<dt>Recorded words</dt><dd class="sp-words">${esc([...(f.form_words || []), ...f.habit, f.texture ? `${f.texture} texture` : null, ...f.colours].filter(Boolean).join(', ') || 'none')}</dd>
<dt>Drawn as</dt><dd class="sp-words">${esc(f.basis.form3d)}${f.accent_word ? `; accent ${esc(f.accent_word)}` : ''}</dd></dl></div>
<figure class="sp-pair"><canvas width="1400" height="640" role="img" aria-label="${esc(K.name(sid))}: the earlier proxy and the current form at the same scale"></canvas><figcaption><span>Earlier proxy</span><span>Current form · illustrative, sized from the record</span></figcaption></figure>`;
    sheet.appendChild(row); const cv = row.querySelector('canvas'); const r = f.radius_m; const a = buildPlantV42(f, obj(f, 'old'), { winter: WINTER }), b = buildPlant(f, obj(f, 'new'), { winter: WINTER }); const gap = r * .5 + .12; a.position.set(-(r + gap), 0, 0); b.position.set(r + gap, 0, 0); const gs = [a, b];
    if (hOf(f) >= 1.2) { const fig = scaleFigure(1.7); fig.position.set(0, 0, r * .2); gs.push(fig); }
    report.triangles[sid] = { earlier: (n => { a.traverse(o => { if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return n; })(0), current: b.userData.form?.triangles, form: b.userData.form };
    const { ppm } = plate(cv, gs, { elevation: 11, azimuth: 0 }); bar(cv, ppm); report.plates++; await new Promise(r2 => setTimeout(r2, 0));
  }
  renderer.dispose(); window.__specimens = report; document.body.dataset.ready = '1'; document.body.dataset.report = JSON.stringify(report);
}
main().catch(e => { $('#sheet').innerHTML = `<p class="sp-fail">The forms could not be drawn: ${esc(e.message)}</p>`; document.body.dataset.error = e.message; console.error(e); });
