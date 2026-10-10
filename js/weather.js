// The forecast for a tee time. The course is found on OpenStreetMap (Nominatim),
// then the forecast comes from Open-Meteo. Neither needs an account, and only the
// course name and its position on the map are sent: nothing about him.

const GEO = 'https://nominatim.openstreetmap.org/search';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const DAY = 86400000;
const FORECAST_DAYS = 14; // further ahead than this the forecast isn't worth showing

// Words that don't tell one course from another, so a match on them alone doesn't
// count. Spanish and Portuguese ones too: "Casa Club" just means the clubhouse.
const COMMON = new Set(('golf club course country the and links resort park centre center hotel spa leisure ' +
  'royal saint new old north south east west hall manor house lodge castle hill hills wood woods lakes ' +
  'valley heath common farm estate municipal public county city town ' +
  'casa clube campo real del los las san santa santo urbanizacion residencial golfe').split(' '));
const plain = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const words = (s = '') => plain(s).replace(/&/g, ' ').split(/[^a-z0-9']+/).filter((w) => w.length > 2 && !COMMON.has(w));

/** True when a map result has a distinctive word in common with the course name ("Hollins Hall" isn't "Bury Golf Club"). */
export function sameCourse(wanted, found) {
  const theirs = new Set(words(found));
  return words(wanted).some((w) => theirs.has(w));
}

/** Where a course is, as { lat, lon, name }, or null when the map doesn't know it. */
export async function findCourse(name) {
  const short = name.replace(/\s+(?:Golf\s*(?:&|and)\s*Country\s+Club|Golf\s+Club|Golf\s+Course|Country\s+Club|G\.?C\.?)$/i, '');
  const queries = [name, short !== name ? `${short} golf` : null].filter(Boolean);
  for (const [i, q] of queries.entries()) {
    if (i) await new Promise((r) => setTimeout(r, 1100)); // OpenStreetMap asks for one search a second at most
    const params = new URLSearchParams({ q, format: 'jsonv2', limit: '5' });
    const res = await fetch(`${GEO}?${params}`);
    if (!res.ok) throw new Error(`map search failed (${res.status})`);
    const hits = (await res.json()).filter((x) => sameCourse(name, x.name || x.display_name));
    const best = hits.find((x) => x.type === 'golf_course') || hits[0];
    if (best) return { lat: Number(best.lat), lon: Number(best.lon), name: best.name || name };
  }
  return null;
}

/** Places matching a search, for him to pick the right course when the name alone is too vague. */
export async function searchPlaces(q) {
  const params = new URLSearchParams({ q, format: 'jsonv2', limit: '8' });
  const res = await fetch(`${GEO}?${params}`);
  if (!res.ok) throw new Error(`map search failed (${res.status})`);
  return (await res.json()).map((x) => ({
    lat: Number(x.lat),
    lon: Number(x.lon),
    name: x.name || x.display_name.split(',')[0],
    where: x.display_name.split(',').slice(1, 4).join(',').trim(),
    golf: x.type === 'golf_course',
  }));
}

/** Fahrenheit for the US; mph for the US and UK, km/h elsewhere. */
export function units(lang = (globalThis.navigator && navigator.language) || 'en-GB') {
  const us = /^en-US\b/i.test(lang);
  return { temp: us ? 'fahrenheit' : 'celsius', wind: us || /^en-GB\b/i.test(lang) ? 'mph' : 'kmh' };
}

/**
 * The weather over his round: the hours from the tee time (or 9 to 1 without one)
 * for about four and a half hours. Temperature is the average, rain chance and
 * wind the highest, and the sky the worst of it.
 */
export function summarise(hourly, date, time, minutes = 270) {
  const [hh, mm] = (time || '09:00').split(':').map(Number);
  const start = hh * 60 + mm;
  const picked = [];
  hourly.time.forEach((t, i) => {
    if (!t.startsWith(date)) return;
    const [h, m] = t.slice(11, 16).split(':').map(Number);
    const at = h * 60 + m;
    if (at >= start - 59 && at <= start + minutes) picked.push(i);
  });
  if (!picked.length) return null;
  const vals = (key) => picked.map((i) => hourly[key][i]).filter((v) => v !== null && v !== undefined);
  const temps = vals('temperature_2m');
  if (!temps.length) return null;
  return {
    temp: Math.round(temps.reduce((a, b) => a + b, 0) / temps.length),
    rain: Math.max(0, ...vals('precipitation_probability')),
    wind: Math.round(Math.max(0, ...vals('wind_speed_10m'))),
    code: Math.max(0, ...vals('weather_code')),
  };
}

/** A word and an icon for a WMO weather code. */
export function describe(code) {
  if (code <= 1) return { icon: 'sun', text: 'Sunny' };
  if (code === 2) return { icon: 'partsun', text: 'Sunny spells' };
  if (code === 3) return { icon: 'cloud', text: 'Cloudy' };
  if (code <= 48) return { icon: 'cloud', text: 'Foggy' };
  if (code <= 57) return { icon: 'rain', text: 'Drizzle' };
  if (code <= 67) return { icon: 'rain', text: 'Rain' };
  if (code <= 77) return { icon: 'snow', text: 'Snow' };
  if (code <= 82) return { icon: 'rain', text: 'Showers' };
  if (code <= 86) return { icon: 'snow', text: 'Snow showers' };
  return { icon: 'storm', text: 'Thunderstorms' };
}

/** True when the date is close enough for a forecast. */
export function inRange(date, today) {
  const days = Math.round((Date.parse(`${date}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / DAY);
  return days >= 0 && days <= FORECAST_DAYS;
}

/** The forecast for a round at a place, or null. */
export async function forecastFor({ lat, lon }, date, time) {
  const u = units();
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    hourly: 'temperature_2m,precipitation_probability,weather_code,wind_speed_10m',
    timezone: 'auto',
    start_date: date,
    end_date: date,
    temperature_unit: u.temp,
    wind_speed_unit: u.wind,
  });
  const res = await fetch(`${FORECAST}?${params}`);
  if (!res.ok) throw new Error(`forecast failed (${res.status})`);
  const data = await res.json();
  const w = data.hourly ? summarise(data.hourly, date, time) : null;
  return w && { ...w, units: u };
}
