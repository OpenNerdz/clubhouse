// Saves the app's data on this device (IndexedDB, with localStorage as a fallback)
// and merges two copies of it, so a Google Drive backup can sync between devices.

export const SCHEMA_VERSION = 1;

export const ROUND_FIELDS = {
  par: 'Par',
  rating: 'Course rating & slope',
  points: 'Stableford points',
  putts: 'Putts',
  fairways: 'Fairways hit',
  greens: 'Greens in regulation',
  partners: 'Playing partners',
  notes: 'Notes',
};

export const HOME_SECTIONS = {
  upcoming: 'Coming up',
  stats: 'Your game',
  rounds: 'Recent scores',
  trend: 'Score trend chart',
  results: 'Competition results',
  mail: 'Latest golf mail',
};

export function defaultSettings() {
  return {
    updatedAt: 0,
    home: { upcoming: true, stats: true, rounds: true, trend: false, results: true, mail: true },
    categories: { teetime: true, competition: true, handicap: true, club: true, shop: true, other: true },
    roundFields: { par: true, rating: true, points: true, putts: false, fairways: false, greens: false, partners: true, notes: true },
    months: 6,
    extraTerms: [],
    hiddenSenders: [],
    notPlayed: [],
    handicapEstimate: true,
    driveBackup: true,
    theme: 'auto',
    textSize: 'normal',
  };
}

export function emptyState() {
  return {
    version: SCHEMA_VERSION,
    settings: defaultSettings(),
    rounds: {},
    teeTimes: {},
    courses: {},
    friends: {},
    emails: {},
    // Local to this device; never synced.
    meta: { onboarded: false, demo: false, profile: null, lastScan: 0, lastBackup: 0, driveFileId: null, skipped: [] },
  };
}

/** Fills in anything missing (e.g. after an update adds a setting). */
export function normalise(data) {
  const base = emptyState();
  const s = data && typeof data === 'object' ? data : {};
  const settings = { ...base.settings, ...(s.settings || {}) };
  for (const k of ['home', 'categories', 'roundFields']) settings[k] = { ...base.settings[k], ...((s.settings || {})[k] || {}) };
  return {
    version: SCHEMA_VERSION,
    settings,
    rounds: s.rounds || {},
    teeTimes: s.teeTimes || {},
    courses: s.courses || {},
    friends: s.friends || {},
    emails: s.emails || {},
    meta: { ...base.meta, ...(s.meta || {}) },
  };
}

const COLLECTIONS = ['rounds', 'teeTimes', 'courses', 'friends', 'emails'];

function mergeCollection(a = {}, b = {}) {
  const out = { ...a };
  for (const [id, item] of Object.entries(b)) {
    const mine = out[id];
    if (!mine || (item.updatedAt || 0) > (mine.updatedAt || 0)) out[id] = item;
  }
  return out;
}

/**
 * Combines this device's data with the backup. For each item the most recently
 * changed copy wins; deletions are kept as tombstones so they sync too.
 */
export function merge(local, remote) {
  const l = normalise(local);
  const r = normalise(remote);
  const merged = { ...l };
  for (const k of COLLECTIONS) merged[k] = mergeCollection(l[k], r[k]);
  merged.settings = (r.settings.updatedAt || 0) > (l.settings.updatedAt || 0) ? r.settings : l.settings;
  merged.meta = l.meta;
  return merged;
}

/** The copy that goes to Google Drive: everything except device-only details. */
export function forBackup(state) {
  const { meta, ...rest } = state;
  return { ...rest, savedAt: Date.now() };
}

// JSON with sorted keys, so the same data always gives the same text.
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v === undefined ? null : v);
}

export function sameData(a, b) {
  const pick = (s) => stable(COLLECTIONS.map((k) => s[k]).concat([s.settings]));
  return pick(normalise(a)) === pick(normalise(b));
}

export function uid(prefix = 'x') {
  const rand = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}-${Date.now().toString(36)}-${rand[0].toString(36)}${rand[1].toString(36)}`;
}

/* ---------- device storage ---------- */

const DB_NAME = 'clubhouse';
const STORE = 'kv';
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Storage is blocked'));
    });
  }
  return dbPromise;
}

async function idb(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function loadState() {
  try {
    const data = await idb('readonly', (s) => s.get('state'));
    if (data) return normalise(data);
  } catch {
    try {
      const raw = localStorage.getItem('clubhouse-state');
      if (raw) return normalise(JSON.parse(raw));
    } catch { /* fall through */ }
  }
  return emptyState();
}

export async function saveState(state) {
  try {
    await idb('readwrite', (s) => s.put(state, 'state'));
    return true;
  } catch {
    try {
      localStorage.setItem('clubhouse-state', JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }
}

export async function clearState() {
  try { await idb('readwrite', (s) => s.clear()); } catch { /* ignore */ }
  try { localStorage.removeItem('clubhouse-state'); } catch { /* ignore */ }
}

/** Asks the browser not to clear this site's storage when space runs low. */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch { /* not supported */ }
}
