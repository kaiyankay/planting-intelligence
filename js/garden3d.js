// V4.3: plants are the stylised forms of botanical.js (one merged mesh each); ?proxy=v42 draws the earlier primitives for comparison.
// 3D garden: three r186 (MIT, vendored in brain/vendor/three) + OrbitControls (three examples, MIT). Every object is built
// from the same DesignVersion the 2D plan draws — plant ids, positions (x east, y north → z = −north), crown radius and
// height proxies from the claims — through the form recipes of plantforms.js. Geometry is a stylised botanical proxy
// (flat-shaded primitives), never a rendering of a real plant; unknown heights are drawn at a nominal height and dashed-looking
// (translucent). Click → the plant id goes back to the app (evidence); preview removals show as red wire, additions glow.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { form, mixHex } from './render.js';
import { buildPlant as buildForm, buildTree as buildTreeForm, scaleFigure } from './botanical.js';
import { buildPlantV42, buildTreeV42 } from './proxies-v42.js';
import * as G from './geom.js';

const toV = (p, z = 0) => new THREE.Vector3(p[0], z, -p[1]);
const col = h => new THREE.Color(h);
const OLD = typeof location !== 'undefined' && new URLSearchParams(location.search).get('proxy') === 'v42';
const CAM = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('cam') : null;   // ?cam=close: a near view, for screenshots
const buildPlant = OLD ? buildPlantV42 : buildForm, buildTree = OLD ? buildTreeV42 : buildTreeForm;
const flat = (hex, extra = {}) => new THREE.MeshStandardMaterial({ color: col(hex), flatShading: true, roughness: .85, metalness: 0, ...extra });

export class Garden {
  constructor(container, { K, onSelect, onHover }) {
    this.el = container; this.K = K; this.onSelect = onSelect; this.onHover = onHover; this.key = null; this.plantMeshes = new Map(); this.hover = null;
    /* V4.2 · names: the view never draws a name per plant. At most ONE callout (the selected plant) is shown, a DOM element placed from the
       plant's projected position each frame; hover uses the page's single tooltip; Bed and Species scopes emphasise geometry and are named once,
       in the page's legend. */
    this.callout = document.createElement('div'); this.callout.className = 'g3-callout'; this.callout.hidden = true; this.callout.setAttribute('role', 'status'); (container.parentElement || container).appendChild(this.callout); this.calloutFor = null; this.calloutXY = null; this.scope = 'selected'; this.dimmed = 0;
    /* V4.3 · one quiet line: what the forms are */
    this.note = document.createElement('p'); this.note.className = 'g3-note'; this.note.textContent = 'Illustrative forms, sized from the plant records. Not a growth simulation. Figure: 1.7 m.'; (container.parentElement || container).appendChild(this.note);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'default', failIfMajorPerformanceCaveat: false }); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; if (!OLD) { renderer.toneMapping = THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.6; } else { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; } renderer.setClearColor(OLD ? 0xf6f4ee : 0xf7f3ea, 1);
    container.appendChild(renderer.domElement); this.renderer = renderer;
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.Fog(OLD ? 0xf6f4ee : 0xf7f3ea, OLD ? 22 : 30, OLD ? 60 : 90);
    this.camera = new THREE.PerspectiveCamera(OLD ? 42 : 34, 1, .1, 260); this.camera.position.set(9, 7, 11);
    this.controls = new OrbitControls(this.camera, renderer.domElement); this.controls.enableDamping = true; this.controls.dampingFactor = .08; this.controls.maxPolarAngle = Math.PI / 2 - .04; this.controls.minDistance = 2; this.controls.maxDistance = 70; this.controls.target.set(3, 0, -2);
    this.scene.add(new THREE.HemisphereLight(OLD ? 0xfff6e6 : 0xfffaf0, OLD ? 0xcfd8c4 : 0xdcd6c2, OLD ? .95 : 1.45));
    const sun = new THREE.DirectionalLight(0xfff2dc, OLD ? 1.6 : 1.05); sun.position.set(-8, 14, 6); if (!OLD) { sun.shadow.radius = 3; sun.shadow.normalBias = .02; } sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -14; sun.shadow.camera.right = 14; sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14; sun.shadow.camera.near = 1; sun.shadow.camera.far = 50; sun.shadow.bias = -.0008; this.scene.add(sun); this.sun = sun;
    const fill = new THREE.DirectionalLight(0xdfe8f5, OLD ? .35 : .3); fill.position.set(10, 6, -8); this.scene.add(fill);
    this.static = new THREE.Group(); this.plants = new THREE.Group(); this.overlay = new THREE.Group(); this.scene.add(this.static, this.plants, this.overlay);
    this.ray = new THREE.Raycaster(); this.pointer = new THREE.Vector2(); this.down = null;
    renderer.domElement.addEventListener('pointerdown', e => { this.down = [e.clientX, e.clientY]; });
    renderer.domElement.addEventListener('pointerup', e => { if (!this.down || Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]) > 4) return; const id = this.pick(e); this.onSelect?.(id); });
    renderer.domElement.addEventListener('pointermove', e => { const id = this.pick(e); if (id !== this.hover) { this.hover = id; renderer.domElement.style.cursor = id ? 'pointer' : ''; this.onHover?.(id, e); } });
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(container); this.resize();
    this.running = true; const loop = () => { if (!this.running) return; this.controls.update(); if (this.visible) { this.renderer.render(this.scene, this.camera); this.placeCallout(); } requestAnimationFrame(loop); }; loop();
    this.visible = true;
  }
  resize() { const w = this.el.clientWidth || 800, h = this.el.clientHeight || 500; this.renderer.setSize(w, h, false); this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%'; this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  setVisible(v) { this.visible = v; this.el.style.display = v ? 'block' : 'none'; if (v) { this.resize(); this.renderer.render(this.scene, this.camera); this.placeCallout(); } else this.callout.hidden = true; if (this.note) this.note.hidden = !v; }
  /** draw once now and place the callout (the render loop does this every frame; a caller that moved the camera itself may ask for it) */
  refresh() { if (this.visible) { this.renderer.render(this.scene, this.camera); this.placeCallout(); } }
  /** where a plant object's top is on the canvas, in CSS pixels of the canvas box (null when behind the camera) */
  screenOf(id) { const g = this.plantMeshes.get(id); if (!g) return null; const v = g.position.clone(); v.y = (g.userData.top ?? .5) + .12; v.project(this.camera); if (v.z > 1) return null; const w = this.el.clientWidth, h = this.el.clientHeight; return [(v.x + 1) / 2 * w, (1 - v.y) / 2 * h]; }
  /** the one callout follows its plant; it is moved only when the projected position changes by a pixel, so a still camera never repaints it */
  placeCallout() {
    const c = this.callout; if (!this.calloutFor || !this.visible) { if (!c.hidden) c.hidden = true; this.calloutXY = null; return; }
    const xy = this.screenOf(this.calloutFor); if (!xy) { if (!c.hidden) c.hidden = true; return; }
    const x = Math.round(xy[0]), y = Math.round(xy[1]); if (c.hidden) c.hidden = false; if (this.calloutXY && this.calloutXY[0] === x && this.calloutXY[1] === y) return; this.calloutXY = [x, y];
    const w = this.el.clientWidth; const cw = c.offsetWidth, ch = c.offsetHeight; const left = Math.max(6, Math.min(w - cw - 6, x - 19)); c.style.transform = `translate(${left}px, ${Math.max(6, y - ch - 10)}px)`;
  }
  /** what the label scope is drawing now (read by the page's tests): never more than one callout, never a sprite per plant */
  labelState() { return { scope: this.scope, sprites: this.overlay.children.filter(o => o.isSprite).length, callouts: this.callout.hidden ? 0 : 1, callout_for: this.calloutFor, callout_text: this.callout.hidden ? null : this.callout.textContent, dimmed: this.dimmed, plants: this.plantMeshes.size, bed_outline: !!this.overlay.children.find(o => o.userData.bedMark) }; }
  pick(e) { const r = this.renderer.domElement.getBoundingClientRect(); this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); this.ray.setFromCamera(this.pointer, this.camera); const hits = this.ray.intersectObjects(this.plants.children, true); for (const h of hits) { let o = h.object; while (o && !o.userData.plantId) o = o.parent; if (o?.userData.plantId) return o.userData.plantId; } return null; }
  stats() { return { plants: this.plantMeshes.size, meshes: this.scene.children.reduce((n, c) => n + countMeshes(c), 0) }; }
  focus(id) { const g = this.plantMeshes.get(id); if (!g) return; const p = g.position.clone(); this.controls.target.copy(p); }
  /** a low three-quarter view of the whole site; the tallest plant (this.top) stays in the picture */
  frame(project) { const pts = [...(project.site.boundary || []), ...project.site.beds.flatMap(b => b.polygon)]; if (!pts.length) return; const B = G.bbox(pts); const c = [B.minx + B.w / 2, B.miny + B.h / 2]; const top = this.top || 0; if (OLD) { const d = Math.max(B.w, B.h); this.controls.target.set(c[0], 0.3, -c[1]); this.camera.position.set(c[0] + d * .9, d * .95 + 1.5, -c[1] + d * 1.55); this.controls.update(); return; }
    const d = Math.max(B.w, B.h, top * 1.25, 4); const ty = Math.min(top * .36, d * .22) + .2; this.controls.target.set(c[0], ty, -c[1]); this.camera.position.set(c[0] + d * .92, ty + d * .62 + .6, -c[1] + d * 1.42); if (CAM === 'close') { this.controls.target.set(B.maxx - B.w * .22, .5, -(B.miny + B.h * .3)); this.camera.position.set(B.maxx + 1.6, 1.5, -(B.miny - 2.4)); } this.controls.update(); }

  // ---------------------------------------------------------------- scene from the model (static parts rebuilt on site change, plants on version/preview change)
  sync(project, version, S) {
    const siteKey = JSON.stringify([project.site.boundary, project.site.beds.map(b => [b.polygon, b.holes, b.status]), project.site.features]);
    if (this.siteKey !== siteKey) { this.siteKey = siteKey; this.buildStatic(project); }
    const plants = S.preview ? S.preview.version.plant_objects : (version?.plant_objects || []); const removed = S.preview ? S.preview.diff.removed : []; const added = new Set(S.preview?.diff.added || []); const targets = new Set(S.preview?.targets || []);
    const scope = S.labelScope || 'selected'; const selObj = S.selectedPlant ? plants.find(p => p.id === S.selectedPlant) : null; const spFocus = scope === 'species' ? (selObj?.species_id || S.focusSpecies || null) : null; const bedFocus = scope === 'bed' ? (selObj?.bed_id || S.growBed || null) : null;
    const key = JSON.stringify([version?.id, plants.map(p => [p.id, p.species_id, p.position_m]), removed, [...added], [...targets], S.winter, scope, spFocus, bedFocus, S.selectedPlant, project.site.conditions.light?.value]);
    if (key === this.key) return; this.key = key;
    clear(this.plants); clear(this.overlay); this.plantMeshes.clear(); this.dimmed = 0;
    const light = project.site.conditions.light?.value;
    for (const p of plants) { const f = form(this.K, p.species_id, light); const g = buildPlant(f, p, { winter: S.winter }); g.position.copy(toV(p.position_m)); g.userData.plantId = p.id; this.plants.add(g); this.plantMeshes.set(p.id, g); if (added.has(p.id)) ring(this.overlay, p, 0x44604a, .9); else if (targets.has(p.id)) ring(this.overlay, p, 0xc08a2e, .7); g.userData.top = topOf(g); if (S.selectedPlant === p.id) { ring(this.overlay, p, 0x2a2723, 1, .08, .1); ring(this.overlay, p, 0xc08a2e, .95, .085, .05, .12); }
      if (spFocus && p.species_id !== spFocus) { dim(g); this.dimmed++; } else if (spFocus) ring(this.overlay, p, 0x2a2723, .55, .05, .03); }
    this.top = plants.length ? Math.max(...[...this.plantMeshes.values()].map(g => g.userData.top || 0)) : 0; if (!this.framed || this.framedFor !== siteKey) { this.frame(project); this.framed = true; this.framedFor = siteKey; }
    /* Bed scope: the bed's outline is drawn once, raised and doubled; every plant stays as it is */
    if (bedFocus) { const b = project.site.beds.find(x => x.id === bedFocus); if (b) { for (const y of [.11, .125, .14]) { const l = outline(b.polygon, 0x2a2723, y); l.userData.bedMark = true; this.overlay.add(l); } const wash = shapeMesh(b.polygon, new THREE.MeshBasicMaterial({ color: 0xc08a2e, transparent: true, opacity: .16, depthWrite: false }), .1, 0, b.holes); wash.userData.bedMark = true; this.overlay.add(wash); } }
    /* the one callout: the selected plant, in every scope but Off and Hover */
    this.scope = scope; this.calloutFor = selObj && scope !== 'off' && scope !== 'hover' && this.plantMeshes.has(selObj.id) ? selObj.id : null; this.calloutXY = null;
    if (this.calloutFor) { const bd = project.site.beds.find(x => x.id === selObj.bed_id); const common = this.K.common?.(selObj.species_id); this.callout.innerHTML = `<b>${common ? `${escT(common)} · ` : ''}<i>${escT(this.K.name(selObj.species_id))}</i></b><span>${escT(String(selObj.role || '').replace('screen-layer', 'screen, second row'))}${bd ? ` · ${escT(bd.name)}` : ''}</span>`; } else this.callout.hidden = true;
    if (S.preview && version) for (const id of removed) { const p = version.plant_objects.find(q => q.id === id); if (!p) continue; const f = form(this.K, p.species_id, light); const g = buildPlant(f, p, { winter: S.winter, ghost: true }); g.position.copy(toV(p.position_m)); this.overlay.add(g); }
    if (this.visible) { this.renderer.render(this.scene, this.camera); this.placeCallout(); }
  }
  buildStatic(project) {
    clear(this.static); const site = project.site; const pts = [...(site.boundary || []), ...site.beds.flatMap(b => b.polygon)]; const B = pts.length ? G.bbox(pts) : { minx: 0, miny: 0, maxx: 8, maxy: 6, w: 8, h: 6 };
    // graph-paper ground, far beyond the site
    const gw = Math.max(40, B.w * 6), gh = Math.max(40, B.h * 6); const ground = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), new THREE.MeshStandardMaterial({ map: paperTexture(gw, gh, !OLD), roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.set(B.minx + B.w / 2, -.005, -(B.miny + B.h / 2)); ground.receiveShadow = true; this.static.add(ground);
    if (site.boundary) { const lawn = shapeMesh(site.boundary, OLD ? flat('#d9dec6', { roughness: 1 }) : new THREE.MeshStandardMaterial({ map: grainTexture('#d6dcc0', '#c4cfae', 'lawn'), roughness: 1 }), .004); lawn.receiveShadow = true; this.static.add(lawn); this.static.add(outline(site.boundary, 0x5f5a52, .02)); }
    for (const b of site.beds) { if (b.status === 'rejected') continue; const soil = shapeMesh(b.polygon, OLD ? flat('#a98f6f', { roughness: 1 }) : new THREE.MeshStandardMaterial({ map: grainTexture('#9c8263', '#7f6a52', 'soil'), roughness: 1 }), .03, .06, b.holes); soil.receiveShadow = true; soil.castShadow = true; this.static.add(soil); this.static.add(outline(b.polygon, 0x5f7f62, .095)); for (const h of b.holes || []) this.static.add(outline(h, 0x5f7f62, .095)); }
    for (const f of site.features) {
      if (f.kind === 'no-plant-zone' && f.polygon) { const m = shapeMesh(f.polygon, flat('#e6e2d6', { roughness: 1 }), .012); this.static.add(m); this.static.add(outline(f.polygon, 0x9a948a, .02)); }
      if (f.kind === 'existing-tree') { const r = f.radius_m ?? 1.5; const g = buildTree({ foliage: '#4a6a4c', accent: null, density: 1, evergreen: null, id: f.id }, r, Math.max(3, r * 2.6), { nominal: f.radius_m == null }); g.position.copy(toV(f.position_m)); g.userData.feature = f.id; this.static.add(g); this.static.add(label(`${f.label || 'existing tree'} · ${f.radius_m == null ? 'canopy assumed' : 'canopy stated'}`, toV(f.position_m, Math.max(3, r * 2.6) + .5))); }
    }
    if (!OLD && pts.length) { const fig = scaleFigure(1.7); fig.position.set(B.minx + B.w * .18, 0, -(B.miny - .75)); fig.rotation.y = Math.PI * .22; this.static.add(fig); }
    this.sun.target.position.set(B.minx + B.w / 2, 0, -(B.miny + B.h / 2)); this.scene.add(this.sun.target); if (!OLD) { const e = Math.max(14, Math.max(B.w, B.h) * 1.3); const c = this.sun.shadow.camera; c.left = -e; c.right = e; c.top = e; c.bottom = -e; c.far = 80; c.updateProjectionMatrix(); this.sun.position.set(B.minx + B.w / 2 - 8, 17, -(B.miny + B.h / 2) + 8); }
  }
  dispose() { this.running = false; this.ro.disconnect(); this.renderer.dispose(); }
}

// builders: botanical.js (V4.3 forms) and proxies-v42.js (the earlier proxies, on request)
// ---------------------------------------------------------------- helpers
function shapeMesh(polygon, material, y = 0, thickness = 0, holes = []) {
  const sh = new THREE.Shape(polygon.map(p => new THREE.Vector2(p[0], p[1]))); for (const h of holes || []) sh.holes.push(new THREE.Path(h.map(p => new THREE.Vector2(p[0], p[1]))));   // rotated −90° about X: shape (x, y_north) → world (x, 0, −y_north) = toV
  const geo = thickness ? new THREE.ExtrudeGeometry(sh, { depth: thickness, bevelEnabled: false }) : new THREE.ShapeGeometry(sh);
  const m = new THREE.Mesh(geo, material); m.rotation.x = -Math.PI / 2; m.position.y = y; return m;
}
function outline(polygon, color, y) { const pts = polygon.map(p => toV(p, y)); pts.push(pts[0].clone()); return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color })); }
function ring(group, p, color, opacity, y = .03, width = .06, gap = 0) { const r0 = p.proxy_radius_m * 1.05 + gap; const m = new THREE.Mesh(new THREE.RingGeometry(r0, r0 + width, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.copy(toV(p.position_m, y)); group.add(m); }
const escT = t => String(t ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
/* the height of a built plant (its bounding box top), for the callout's anchor */
function topOf(g) { const b = new THREE.Box3().setFromObject(g); return Number.isFinite(b.max.y) ? b.max.y : .5; }
/* a plant that is context in the Species scope: still there, same place and size, drawn faint */
function dim(g) { g.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = .22; o.material.depthWrite = false; o.castShadow = false; } }); }
/* one sprite for a site feature (the existing tree) — never used for plants */
function label(text, pos) {
  const px = 40, pad = 10, dpr = 2; const cv = document.createElement('canvas'); const ctx = cv.getContext('2d'); ctx.font = `italic 500 ${px}px -apple-system, Helvetica Neue, Segoe UI, sans-serif`; const w = Math.ceil(ctx.measureText(text).width) + pad * 2, hh = px + pad * 2; cv.width = w * dpr; cv.height = hh * dpr; ctx.scale(dpr, dpr); ctx.font = `italic 500 ${px}px -apple-system, Helvetica Neue, Segoe UI, sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(253,251,247,.85)'; ctx.beginPath(); ctx.roundRect(0, 0, w, hh, 10); ctx.fill(); ctx.fillStyle = '#2a2723'; ctx.fillText(text, w / 2, hh / 2);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })); const s = .32; sp.scale.set(s * w / hh, s, 1); sp.position.copy(pos); return sp;
}
/* a small repeating grain (deterministic), in metres: one tile = 2 m */
function grainTexture(a, b, key) { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const ctx = cv.getContext('2d'); ctx.fillStyle = a; ctx.fillRect(0, 0, 128, 128); let t = key.length * 7919; const rnd = () => { t = (t * 1664525 + 1013904223) >>> 0; return t / 4294967296; }; ctx.fillStyle = b; for (let i = 0; i < 520; i++) { ctx.globalAlpha = .1 + rnd() * .22; const x = rnd() * 128, y = rnd() * 128, s = 1 + rnd() * 3.2; ctx.fillRect(x, y, s, s * (.6 + rnd())); } const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(.5, .5); return tex; }
function paperTexture(w, h, ruled = false) { const cv = document.createElement('canvas'); const S = 64; cv.width = Math.min(4096, Math.round(w * S)); cv.height = Math.min(4096, Math.round(h * S)); const ctx = cv.getContext('2d'); ctx.fillStyle = ruled ? '#f5f1e6' : '#efece3'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.strokeStyle = ruled ? 'rgba(42,39,35,.24)' : 'rgba(42,39,35,.08)'; ctx.lineWidth = 1; const step = cv.width / w; for (let x = 0; x <= cv.width; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cv.height); ctx.stroke(); } for (let y = 0; y <= cv.height; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cv.width, y); ctx.stroke(); } if (ruled) { ctx.strokeStyle = 'rgba(42,39,35,.36)'; for (let x = 0; x <= cv.width; x += step * 5) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cv.height); ctx.stroke(); } for (let y = 0; y <= cv.height; y += step * 5) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cv.width, y); ctx.stroke(); } } const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function clear(group) { while (group.children.length) { const c = group.children.pop(); c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map) o.material.map.dispose(); }); } }
function countMeshes(o) { let n = o.isMesh ? 1 : 0; for (const c of o.children || []) n += countMeshes(c); return n; }
