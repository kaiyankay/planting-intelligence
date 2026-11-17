// Address lookup for the Imagine page. One public geocoder: OpenStreetMap Nominatim (https://nominatim.org).
// Its usage policy (https://operations.osmfoundation.org/policies/nominatim/) is followed, not worked around:
//   · a search runs only when the user asks for one — never while typing (the policy forbids autocomplete);
//   · at most one request per second from this page; an identical query is answered from a session cache;
//   · the browser's own Referer identifies the application; no bulk or background requests are made;
//   · the attribution "© OpenStreetMap contributors" is shown wherever a result is shown or kept.
// A lookup answers one question only: where on the map is this address. It returns no property boundary, no size, no
// vegetation and no growing conditions, and nothing here derives any of those from the coordinates.
export const PROVIDER = {
  id: 'nominatim', name: 'OpenStreetMap Nominatim', endpoint: 'https://nominatim.openstreetmap.org/search',
  attribution: '© OpenStreetMap contributors', attribution_url: 'https://www.openstreetmap.org/copyright',
  policy_url: 'https://operations.osmfoundation.org/policies/nominatim/',
};
const cache = new Map(); let lastAt = 0;
const wait = ms => new Promise(r => setTimeout(r, ms));
const forcedOff = () => new URLSearchParams(location.search).get('geocode') === 'off';   // ?geocode=off shows the page as it behaves when the service cannot be reached

const KIND = { amenity: 'place', shop: 'place', tourism: 'place', leisure: 'place', office: 'place', house: 'address', building: 'building', residential: 'street', road: 'street', street: 'street', suburb: 'neighbourhood', neighbourhood: 'neighbourhood', quarter: 'neighbourhood', city: 'city', town: 'town', village: 'village', postcode: 'postal code', park: 'park', garden: 'garden', administrative: 'area' };
function shortName(a, display, name) {
  const street = [a.house_number, a.road || a.pedestrian || a.footway].filter(Boolean).join(' ');
  const place = a.city || a.town || a.village || a.municipality || a.suburb || a.county || '';
  const hood = a.neighbourhood || a.suburb || a.quarter || '';
  const head = street ? (a.house_number || !hood ? street : `${street}, ${hood}`) : hood || a.amenity || a.building || '';   // a street without a number is told apart by its neighbourhood
  const named = name && name !== street && name !== hood && name !== place && !/^\d/.test(name) ? name : '';   // a named place (a park, a hall) leads; a plain address has no name
  const s = [named, head, place !== head ? place : '', a.state || a.province || ''].filter(Boolean).join(', ');
  return s || display.split(',').slice(0, 3).join(',').trim();
}
function toResult(r) {
  const a = r.address || {};
  return {
    id: `${r.osm_type || 'x'}-${r.osm_id || r.place_id}`, label: r.display_name, short: shortName(a, r.display_name, r.name),
    kind: a.house_number ? 'address' : r.category === 'highway' ? 'street' : r.category === 'boundary' ? 'area' : KIND[r.addresstype] || KIND[r.type] || KIND[r.category] || 'place',   // a plain word, never a raw map tag
    precise: ['house', 'building'].includes(r.addresstype) || !!a.house_number,
    lat: +(+r.lat).toFixed(6), lon: +(+r.lon).toFixed(6),
    address: { house_number: a.house_number || null, road: a.road || a.pedestrian || null, neighbourhood: a.neighbourhood || a.suburb || null, city: a.city || a.town || a.village || a.municipality || null, county: a.county || a.state_district || null, state: a.state || a.province || null, postcode: a.postcode || null, country: a.country || null, country_code: a.country_code || null },
    osm_type: r.osm_type || null, osm_id: r.osm_id || null,
  };
}
/** → { ok: true, results: [...], cached } or { ok: false, reason: 'unavailable' | 'empty' | 'short', message } */
export async function search(query) {
  const q = String(query || '').trim().replace(/\s+/g, ' ');
  if (q.length < 3) return { ok: false, reason: 'short', message: 'Type a street address, a neighbourhood or a place name.' };
  const key = q.toLowerCase(); if (cache.has(key)) return { ...cache.get(key), cached: true };
  if (forcedOff() || navigator.onLine === false) return { ok: false, reason: 'unavailable', message: navigator.onLine === false ? 'You appear to be offline, so the address could not be looked up.' : 'The address lookup is switched off for this page.' };
  const gap = 1100 - (Date.now() - lastAt); if (gap > 0) await wait(gap); lastAt = Date.now();
  const url = `${PROVIDER.endpoint}?${new URLSearchParams({ q, format: 'jsonv2', addressdetails: '1', limit: '5', 'accept-language': 'en' })}`;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 9000);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) return { ok: false, reason: 'unavailable', message: res.status === 429 ? 'The lookup service is busy (too many requests). Try again in a moment.' : `The lookup service answered with an error (${res.status}).` };
    const rows = await res.json(); if (!Array.isArray(rows)) return { ok: false, reason: 'unavailable', message: 'The lookup service sent an answer this page could not read.' };
    const out = rows.length ? { ok: true, results: rows.map(toResult) } : { ok: false, reason: 'empty', message: 'No place was found for that. Check the spelling, or add the city.' };
    cache.set(key, out); return out;
  } catch (e) {
    return { ok: false, reason: 'unavailable', message: e.name === 'AbortError' ? 'The lookup service did not answer in time.' : 'The lookup service could not be reached.' };
  } finally { clearTimeout(timer); }
}

// The plant knowledge base is a set of Metro Vancouver species. A confirmed location can be compared with that region, and
// that is the one thing the design workflow reads from it. The test is geographic only (the geocoder's own region name, or
// an approximate box around the regional district) and says nothing about the site itself.
const REGION = { name: 'Metro Vancouver', box: { s: 49.0, n: 49.58, w: -123.45, e: -122.4 } };
export function coverage(loc) {
  if (!loc || loc.lat == null) return { region: REGION.name, result: 'unknown', text: `Not compared with ${REGION.name}: the location has no map position.` };
  const named = /metro vancouver|greater vancouver/i.test(`${loc.address?.county || ''} ${loc.label || ''}`);
  const b = REGION.box; const inBox = loc.lat >= b.s && loc.lat <= b.n && loc.lon >= b.w && loc.lon <= b.e;
  return named || inBox
    ? { region: REGION.name, result: 'inside', text: `In ${REGION.name}, the region the plant records describe.`, basis: named ? 'region named by the geocoder' : 'map position inside an approximate box around the region' }
    : { region: REGION.name, result: 'outside', text: `Outside ${REGION.name}. The plant records describe ${REGION.name} species; whether they suit this place is not recorded.`, basis: 'map position outside an approximate box around the region' };
}
export const mapUrl = loc => `https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lon}#map=18/${loc.lat}/${loc.lon}`;
export const coordText = loc => loc && loc.lat != null ? `${Math.abs(loc.lat).toFixed(4)}° ${loc.lat >= 0 ? 'N' : 'S'}, ${Math.abs(loc.lon).toFixed(4)}° ${loc.lon >= 0 ? 'E' : 'W'}` : '';
