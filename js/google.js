// Google sign-in, Gmail (read-only) and the Drive backup.
// Uses Google Identity Services in the browser: the access token lives only in
// memory for up to an hour and is never stored or sent anywhere except Google.

import { CLIENT_ID } from './config.js';

export const SCOPES = {
  base: 'openid email profile',
  gmail: 'https://www.googleapis.com/auth/gmail.readonly',
  drive: 'https://www.googleapis.com/auth/drive.appdata',
};

export class AuthError extends Error {
  constructor(message, { silent = false } = {}) {
    super(message);
    this.silent = silent; // nothing for the user to see, e.g. a sign-in that was simply restarted
  }
}

let gisPromise = null;
let client = null;
let pending = null;
let token = null;
let expiresAt = 0;
let granted = new Set();

export const isConfigured = () => typeof CLIENT_ID === 'string' && /^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(CLIENT_ID.trim());
export const hasToken = () => !!token && Date.now() < expiresAt - 60000;
export const canBackup = () => granted.has(SCOPES.drive);

function loadGis() {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        gisPromise = null;
        reject(new Error("Couldn't reach Google. Check your internet connection and try again."));
      };
      document.head.append(s);
    });
  }
  return gisPromise;
}

function settle(fn) {
  const p = pending;
  pending = null;
  if (p) fn(p);
}

function ensureClient() {
  if (client) return;
  client = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID.trim(),
    scope: `${SCOPES.base} ${SCOPES.gmail} ${SCOPES.drive}`,
    include_granted_scopes: true,
    callback: (resp) => settle(({ resolve, reject }) => {
      if (resp.error) return reject(new AuthError(resp.error_description || 'Google sign-in was not completed.'));
      const scopes = new Set((resp.scope || '').split(/\s+/));
      if (!scopes.has(SCOPES.gmail)) {
        return reject(new AuthError('Clubhouse needs permission to read your email to find golf messages. Please try again and tick the Gmail box.'));
      }
      token = resp.access_token;
      expiresAt = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
      granted = scopes;
      resolve(token);
    }),
    error_callback: (err) => settle(({ reject }) => {
      const messages = {
        popup_closed: 'The Google window was closed before sign-in finished.',
        popup_failed_to_open: 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
      };
      reject(new AuthError(messages[err && err.type] || 'Google sign-in failed. Please try again.'));
    }),
  });
}

/** Loads Google's sign-in library early so the pop-up can open straight from a click. */
export async function prepare() {
  if (!isConfigured()) return;
  try {
    await loadGis();
    ensureClient();
  } catch { /* retried on click */ }
}

/** Call directly from a click handler, otherwise browsers may block the pop-up. */
export async function signIn({ hint } = {}) {
  if (hasToken()) return token;
  if (!isConfigured()) throw new AuthError('Google sign-in isn’t set up yet. Follow SETUP.md to add your Client ID.');
  if (!client) {
    await loadGis();
    ensureClient();
  }
  return new Promise((resolve, reject) => {
    if (pending) pending.reject(new AuthError('Sign-in restarted.', { silent: true }));
    pending = { resolve, reject };
    client.requestAccessToken({ prompt: '', login_hint: hint || undefined });
  });
}

/** Forgets the token on this device without touching Google's records. */
export function clearToken() {
  token = null;
  expiresAt = 0;
  granted = new Set();
}

/**
 * Removes Clubhouse's access from his Google account. Resolves true if Google
 * confirmed it; false if there was no token to revoke or the request failed.
 */
export function signOut() {
  const current = hasToken() ? token : null;
  clearToken();
  if (!current || !(window.google && window.google.accounts && window.google.accounts.oauth2)) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      window.google.accounts.oauth2.revoke(current, (r) => resolve(!r || r.successful !== false));
    } catch {
      resolve(false);
    }
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(url, { method = 'GET', headers = {}, body } = {}, attempt = 0) {
  if (!hasToken()) throw new AuthError('Please sign in to Google again.');
  let res;
  try {
    res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, ...headers }, body });
  } catch {
    throw new Error("Couldn't reach Google. Check your internet connection.");
  }
  if (res.status === 401) {
    token = null;
    throw new AuthError('Your Google sign-in has expired. Press “Check email” to sign in again.');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const limited = res.status === 429 || res.status >= 500 || (res.status === 403 && /rate ?limit/i.test(text));
    if (limited && attempt < 4) {
      await sleep(600 * 2 ** attempt + Math.random() * 300);
      return api(url, { method, headers, body }, attempt + 1);
    }
    if (res.status === 403 && /has not been used|is disabled/i.test(text)) {
      throw new Error('The Gmail or Drive API isn’t switched on in Google Cloud. See step 2 of SETUP.md.');
    }
    if (/mail service not enabled/i.test(text)) {
      throw new Error('This Google account has no Gmail inbox, so there’s no email to read. In Settings, disconnect and sign in with a Gmail account.');
    }
    let reason = '';
    try { reason = JSON.parse(text).error.message || ''; } catch { /* not JSON */ }
    const err = new Error(`Google returned an error (${res.status}${reason ? `: ${reason.slice(0, 160)}` : ''}). Please try again later.`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

/* ---------- profile & Gmail ---------- */

export async function getProfile() {
  const p = await api('https://www.googleapis.com/oauth2/v3/userinfo');
  return { name: p.given_name || p.name || '', fullName: p.name || '', email: p.email || '', picture: p.picture || '' };
}

/** Newest first. `more` is true when Gmail had further matches beyond `max`. */
export async function listMessageIds(q, max = 1500) {
  const ids = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ q, maxResults: '500' });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await api(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`);
    for (const m of res.messages || []) ids.push(m.id);
    pageToken = res.nextPageToken || '';
  } while (pageToken && ids.length < max);
  return { ids: ids.slice(0, max), more: !!pageToken || ids.length > max };
}

function decodePart(part) {
  const b64 = part.body.data.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const type = ((part.headers || []).find((h) => h.name.toLowerCase() === 'content-type') || {}).value || '';
  const charset = (/charset="?([\w-]+)/i.exec(type) || [])[1] || 'utf-8';
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function collectBodies(part, out) {
  if (!part || part.filename) return out;
  const mime = (part.mimeType || '').toLowerCase();
  if (part.body && part.body.data) {
    if (mime === 'text/plain' && !out.text) out.text = decodePart(part);
    else if (mime === 'text/html' && !out.html) out.html = decodePart(part);
  }
  for (const p of part.parts || []) collectBodies(p, out);
  return out;
}

export async function getMessage(id) {
  const m = await api(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`);
  const headers = {};
  for (const h of (m.payload && m.payload.headers) || []) headers[h.name.toLowerCase()] = h.value;
  const bodies = collectBodies(m.payload, { text: '', html: '' });
  return {
    id: m.id,
    threadId: m.threadId,
    date: Number(m.internalDate) || Date.parse(headers.date) || Date.now(),
    from: headers.from || '',
    subject: headers.subject || '',
    snippet: m.snippet || '',
    labels: m.labelIds || [],
    unsubscribe: !!headers['list-unsubscribe'],
    text: bodies.text,
    html: bodies.html,
  };
}

/** Runs fn over items, a few at a time, to stay within Gmail's rate limits. */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        if (err instanceof AuthError) throw err;
        results[i] = null;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/* ---------- Drive backup (a private app folder only Clubhouse can see) ---------- */

const BACKUP_NAME = 'clubhouse-backup.json';

export async function findBackup() {
  // Oldest first, so every device settles on the same file.
  const params = new URLSearchParams({ spaces: 'appDataFolder', q: `name='${BACKUP_NAME}' and trashed=false`, fields: 'files(id,modifiedTime)', orderBy: 'createdTime', pageSize: '10' });
  const res = await api(`https://www.googleapis.com/drive/v3/files?${params}`);
  return (res.files || [])[0] || null;
}

export function readBackup(id) {
  return api(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`);
}

export async function writeBackup(id, data) {
  const json = JSON.stringify(data);
  if (id) {
    await api(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(id)}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    });
    return id;
  }
  const boundary = `clubhouse${Math.random().toString(36).slice(2)}`;
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({ name: BACKUP_NAME, parents: ['appDataFolder'] }),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    json,
    `--${boundary}--`,
  ].join('\r\n');
  const res = await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return res.id;
}
