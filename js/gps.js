// Distances to the green on the course. Where each green is comes from
// OpenStreetMap, where many courses are mapped hole by hole, or from him standing
// on it once and saving it. His position is read on the phone and never sent
// anywhere; only the spot to look up on the map goes to OpenStreetMap.

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const EARTH = 6371008.8; // metres
const rad = (d) => (d * Math.PI) / 180;
const round6 = (n) => Math.round(n * 1e6) / 1e6;

/** Metres between two points. */
export function metres(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH * Math.asin(Math.sqrt(h));
}

/** Yards for the UK and US, metres elsewhere, unless he has chosen. */
export function distanceUnit(setting, lang = (globalThis.navigator && navigator.language) || 'en-GB') {
  if (setting === 'yards' || setting === 'metres') return setting;
  return /^en-(GB|US)\b/i.test(lang) ? 'yards' : 'metres';
}

export const inUnit = (m, unit) => Math.round(unit === 'yards' ? m / 0.9144 : m);

// Flat x/y in metres around a point: plenty accurate across a golf hole.
function flat(origin) {
  const k = (Math.PI / 180) * EARTH;
  const c = Math.cos(rad(origin.lat));
  return (p) => ({ x: (p.lon - origin.lon) * k * c, y: (p.lat - origin.lat) * k });
}

/**
 * Distance to the front, middle and back of a green from where he stands. The
 * front and back are where the line from him through the middle crosses the
 * green's edge, so they need its outline; without one there's only the middle.
 */
export function toGreen(here, green) {
  const middle = metres(here, green);
  if (!green.edge || green.edge.length < 3) return { middle };
  const xy = flat(green);
  const p = xy(here);
  const d = { x: -p.x, y: -p.y }; // towards the middle of the green
  const pts = green.edge.map(([lat, lon]) => xy({ lat, lon }));
  const hits = [];
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const e = { x: b.x - a.x, y: b.y - a.y };
    const den = d.x * e.y - d.y * e.x;
    if (Math.abs(den) < 1e-9) return;
    const t = ((a.x - p.x) * e.y - (a.y - p.y) * e.x) / den;
    const u = ((a.x - p.x) * d.y - (a.y - p.y) * d.x) / den;
    if (t >= 0 && u >= 0 && u <= 1) hits.push(t * middle);
  });
  if (hits.length < 2) return { middle }; // standing on the green
  return { front: Math.min(...hits), middle, back: Math.max(...hits) };
}

function centre(points) {
  const ring = points.length > 2 && points[0].lat === points[points.length - 1].lat && points[0].lon === points[points.length - 1].lon ? points.slice(0, -1) : points;
  return { lat: ring.reduce((s, p) => s + p.lat, 0) / ring.length, lon: ring.reduce((s, p) => s + p.lon, 0) / ring.length, ring };
}

function length(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += metres(points[i - 1], points[i]);
  return total;
}

/**
 * Each hole's green from OpenStreetMap. A hole is drawn as a line from the tee to
 * the green, so its green is the one where the line ends. Par and stroke index
 * come along when they're mapped, but only sensible ones: maps have mistakes.
 * Returns { greens: { 1: { lat, lon, edge }, … }, pars: { 1: 4, … }, sis: { 1: 7, … } }.
 */
export function courseFromOsm(elements) {
  const holes = new Map();
  for (const e of elements) {
    const t = e.tags || {};
    if (t.golf !== 'hole' || !/^\d{1,2}$/.test(t.ref || '') || !e.geometry || e.geometry.length < 2) continue;
    const n = Number(t.ref);
    const len = length(e.geometry);
    // A pitch-and-putt next door can use the same numbers; the real hole is the longer one.
    if (n >= 1 && n <= 18 && (!holes.has(n) || len > holes.get(n).len)) holes.set(n, { e, len });
  }
  const greens = elements
    .filter((e) => (e.tags || {}).golf === 'green' && e.geometry && e.geometry.length >= 3)
    .map((e) => centre(e.geometry));
  const out = { greens: {}, pars: {}, sis: {} };
  for (const [n, { e }] of holes) {
    const end = e.geometry[e.geometry.length - 1];
    let best = null;
    let bestD = Infinity;
    for (const g of greens) {
      const d = metres(end, g);
      if (d < bestD) { best = g; bestD = d; }
    }
    if (best && bestD < 60) {
      const step = Math.max(1, Math.ceil(best.ring.length / 32)); // an outline of 32 points is plenty
      out.greens[n] = { lat: round6(best.lat), lon: round6(best.lon), edge: best.ring.filter((_, i) => i % step === 0).map((p) => [round6(p.lat), round6(p.lon)]), from: 'map' };
    } else {
      out.greens[n] = { lat: round6(end.lat), lon: round6(end.lon), from: 'map' };
    }
    const par = Number(e.tags.par);
    if (par >= 3 && par <= 5) out.pars[n] = par;
    const si = Number(e.tags.handicap);
    if (Number.isInteger(si) && si >= 1 && si <= 18) out.sis[n] = si;
  }
  // A stroke index given to two holes is a mistake on one of them; trust neither.
  const seen = new Map();
  for (const si of Object.values(out.sis)) seen.set(si, (seen.get(si) || 0) + 1);
  for (const [n, si] of Object.entries(out.sis)) if (seen.get(si) > 1) delete out.sis[n];
  return out;
}

/** The query for the course whose boundary takes in a spot: its name, holes and greens. */
export function mapQuery({ lat, lon }) {
  const at = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  return `[out:json][timeout:25];is_in(${at})->.a;(way(pivot.a)[leisure=golf_course];rel(pivot.a)[leisure=golf_course];)->.c;` +
    '.c map_to_area->.ca;(way(area.ca)[golf=hole];way(area.ca)[golf=green];);out geom qt;.c out tags;';
}

/**
 * The course at a spot, from OpenStreetMap: { name, greens, pars, sis }, or null
 * when no course with numbered holes is mapped there. The map service is often
 * busy, so it's tried twice.
 */
export async function courseAt(spot) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 4000));
    try {
      const res = await fetch(OVERPASS, { method: 'POST', body: new URLSearchParams({ data: mapQuery(spot) }) });
      if (!res.ok) throw new Error(`map service error (${res.status})`);
      const data = await res.json();
      if (data.remark && !data.elements.length) throw new Error('map service busy');
      const course = data.elements.find((e) => (e.tags || {}).leisure === 'golf_course');
      const found = courseFromOsm(data.elements);
      if (!Object.keys(found.greens).length) return null;
      return { name: (course && course.tags.name) || '', ...found };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/** Follows his position. Calls back with { lat, lon, accuracy } or an error word; returns a stop function. */
export function follow(onFix, onError) {
  if (!globalThis.navigator || !navigator.geolocation) {
    onError('unsupported');
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (p) => onFix({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }),
    (e) => onError(e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable'),
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

/** Keeps the screen on while distances are showing. Returns a function that lets it sleep again. */
export function keepAwake() {
  let lock = null;
  let on = true;
  const take = async () => {
    if (!on || document.visibilityState !== 'visible' || !navigator.wakeLock) return;
    try { lock = await navigator.wakeLock.request('screen'); } catch { /* not allowed, e.g. battery saver */ }
  };
  // The phone lets go of the lock when the app is hidden, so take it again on the way back.
  document.addEventListener('visibilitychange', take);
  take();
  return () => {
    on = false;
    document.removeEventListener('visibilitychange', take);
    if (lock) lock.release().catch(() => {});
  };
}
