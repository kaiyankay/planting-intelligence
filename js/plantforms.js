// Plant form recipes: what the 2D symbols and the 3D proxies may draw for a species, and where each trait comes from.
// Data-backed (from the knowledge projection): growth form (M29), size proxies (claimed spread / height), leaf retention,
// habit words, colour words, interest. Illustrative (not a plant fact): the exact silhouette, lobe count, stem count, texture.
// Every recipe lists `basis` so the interface can say which is which. Nothing here is written per species by name.
const PALETTE = {   // foliage tones by growth form (illustrative), accents by colour claim
  tree: ['#4f7a4a', '#5e8a52'], shrub: ['#5a7f58', '#6c8f5b'], fern: ['#3f6f46', '#4d7e52'], herb: ['#6d9a5c', '#7ea463'], ground: ['#6b8f5e', '#7a9a62'],
  accent: { red: '#b8503a', purple: '#7c5aa0', pink: '#c77d9a', white: '#ebe6d6', yellow: '#d6b544', orange: '#d08a3c', blue: '#5d7fb0', bronze: '#a9743a', green: null, cream: '#e4ddb8' },
  winterTwig: '#8a7d6a', deciduousWinter: '#b9ad97',
};
export function hashId(id) { let h = 2166136261; for (const ch of String(id)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0); }
export function seeded(id) { let t = hashId(id); return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

export function formOf(K, speciesId, light = null) {
  const s = K.sp(speciesId); const gf = (s?.growth_form_label || '').toLowerCase();
  const kind = /tree/.test(gf) ? 'tree' : /fern/.test(gf) ? 'fern' : /shrub/.test(gf) ? 'shrub' : /herb|perennial|forb/.test(gf) ? 'herb' : 'shrub';
  const evergreenLabels = K.evergreen(speciesId); const evergreen = evergreenLabels ? evergreenLabels.some(l => /evergreen/i.test(l)) && !evergreenLabels.some(l => /deciduous/i.test(l)) ? true : evergreenLabels.some(l => /deciduous/i.test(l)) && !evergreenLabels.some(l => /evergreen/i.test(l)) ? false : 'mixed' : null;
  const habit = (K.labels(speciesId, 'habit') || []).map(l => l.toLowerCase()); const colours = (K.labels(speciesId, 'colour') || []).map(l => l.toLowerCase()); const interest = K.interest(speciesId) || [];
  const proxy = K.proxy(speciesId, light);
  const dense = habit.some(h => /dense|compact|clump|mound/.test(h)); const open = habit.some(h => /open|arching|spreading|loose|twiggy/.test(h)); const upright = habit.some(h => /upright|erect|columnar/.test(h));
  const accentWord = colours.find(c => c !== 'green' && PALETTE.accent[c] !== undefined && PALETTE.accent[c]) || null;
  /* V4.3 · words the 3D forms read (botanical.js). All from claims; which silhouette a word selects is a drawing convention. */
  const formWords = (K.labels(speciesId, 'form') || []).map(l => l.toLowerCase()); const texture = ((K.labels(speciesId, 'texture') || [])[0] || '').toLowerCase() || null;
  const accents = colours.filter(c => c !== 'green' && PALETTE.accent[c]); const accent2 = accents[1] ? PALETTE.accent[accents[1]] : null;
  const crown = kind !== 'tree' ? null : habit.some(h => /horizontal|tiered|layered/.test(h)) ? 'tiered' : formWords.some(w => /pyramid|conical/.test(w)) ? 'pyramidal' : formWords.some(w => /round|oval|globe/.test(w)) ? 'round' : 'dome';
  const shrub = kind !== 'shrub' ? null : formWords.some(w => /creeping|mat|prostrate/.test(w)) ? 'mat' : dense ? 'mound' : habit.some(h => /spreading|arching|open|loose/.test(h)) ? 'cane' : upright ? 'upright' : 'mound';
  const idx = hashId(speciesId) % 2;
  const foliage = PALETTE[kind][idx]; const accent = accentWord ? PALETTE.accent[accentWord] : null;
  const groundCover = (K.functionSupport(speciesId, 'z:ground_cover')?.drawn) && proxy.height_m != null && proxy.height_m < 0.5;
  return {
    species_id: speciesId, kind: groundCover && kind !== 'fern' ? 'ground' : kind, growth_form: s?.growth_form_label || 'unknown', evergreen, habit, colours, interest, foliage, accent, accent_word: accentWord,
    density: dense ? 1.15 : open ? 0.8 : 1, upright, radius_m: proxy.radius_m, height_m: proxy.height_m, proxy,
    form_words: formWords, texture, crown, shrub, accent2,
    basis: {
      growth_form: `growth form ${s?.growth_form_label || 'unknown'} (M29 reading of the sources, ${s?.growth_form_status || 'unknown'})`,
      size: `crown radius ${proxy.radius_m} m = ${proxy.radius_status}; height ${proxy.height_m != null ? `≈ ${proxy.height_m} m (${proxy.height.note})` : 'unknown — drawn at a nominal height, dashed'}`,
      leaf_retention: evergreenLabels ? `leaf retention from claims: ${evergreenLabels.join(' / ')}` : 'leaf retention not recorded',
      habit: habit.length ? `habit words from claims: ${habit.join(', ')} → ${dense ? 'denser' : open ? 'more open' : 'default'} silhouette` : 'habit not recorded → default silhouette for the growth form',
      colour: colours.length ? `colour words from claims: ${colours.join(', ')} (foliage / flower / fruit not distinguished in the data) → accent ${accentWord || 'none'}` : 'no colour claim → foliage tone only',
      form3d: kind === 'tree' ? `crown ${crown}${formWords.length || habit.length ? ` (from the recorded words ${[...formWords, ...habit].join(', ')})` : ' (no form or habit word recorded: the default)'}` : kind === 'shrub' ? `${shrub === 'cane' ? 'stems fanning from the base' : shrub === 'mat' ? 'a low mat' : shrub === 'upright' ? 'an upright oval' : 'a dense mound'}${formWords.length || habit.length ? ` (from the recorded words ${[...formWords, ...habit].join(', ')})` : ' (no form or habit word recorded: the default)'}` : kind === 'herb' ? `basal leaves and flower stalks; ${accentWord ? (texture === 'fine' ? 'flat clusters of small flowers (texture recorded as fine)' : 'single ray heads') : 'no flower colour recorded, so no flowers drawn'}` : kind === 'fern' ? 'fronds arching from one crown' : 'a low mat',
      illustrative: 'silhouette, lobes, stems, texture and shading are illustrative proxies, not plant features',
    },
  };
}
export const FORM_LABEL = { tree: 'tree', shrub: 'shrub', fern: 'fern', herb: 'herbaceous perennial', ground: 'ground-cover shrub / perennial' };
export { PALETTE };
