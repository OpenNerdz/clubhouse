// Microsoft sign-in, Outlook mail (read-only) and the OneDrive backup.
// Works with Outlook.com, Hotmail and Live addresses, and with work or school
// Microsoft 365 accounts where the organisation allows it.
//
// Sign-in is the standard browser flow for apps without a server (authorisation
// code with PKCE): the page goes to Microsoft and comes back with a one-time code,
// which is swapped for a token. Tokens are kept in memory; the renewal token sits
// in this tab's session storage so a reload doesn't need another sign-in. It is
// cleared when the tab closes and stops working after 24 hours anyway.

import { MICROSOFT_CLIENT_ID } from './config.js';
import { AuthError, sleep } from './util.js';

export const info = {
  id: 'microsoft',
  name: 'Microsoft',
  mail: 'Outlook',
  drive: 'OneDrive',
  concurrency: 4, // Outlook allows 4 requests at a time per mailbox
  accessUrl: 'https://account.live.com/consent/Manage',
};

const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPES = 'openid profile offline_access User.Read Mail.Read Files.ReadWrite.AppFolder';
const PENDING_KEY = 'clubhouse-ms-pending';
const RENEW_KEY = 'clubhouse-ms-renew';
const DAY = 86400000;

let token = null;
let expiresAt = 0;
let granted = new Set();

const clientId = () => String(MICROSOFT_CLIENT_ID || '').trim();
export const isConfigured = () => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId());
export const hasToken = () => !!token && Date.now() < expiresAt - 60000;
export const canBackup = () => granted.has('files.readwrite.appfolder');
export async function prepare() {}

/** This page's address without "index.html"; must match a redirect URI in the app registration. */
const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');

const session = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } },
  remove: (k) => { try { sessionStorage.removeItem(k); } catch { /* ignore */ } },
};

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function pkcePair() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(new Uint8Array(digest)) };
}

async function tokenRequest(fields) {
  let res;
  try {
    res = await fetch(`${AUTHORITY}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId(), scope: SCOPES, ...fields }),
    });
  } catch {
    throw new Error("Couldn't reach Microsoft. Check your internet connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const why = (data.error_description || '').split(/\r?\n/)[0].replace(/^AADSTS\d+:\s*/, '');
    throw new AuthError(why ? `Microsoft sign-in failed: ${why}` : 'Microsoft sign-in failed. Please try again.');
  }
  const scopes = new Set((data.scope || '').toLowerCase().split(/\s+/).map((x) => x.replace(/^https:\/\/graph\.microsoft\.com\//, '')));
  if (!scopes.has('mail.read')) throw new AuthError('Clubhouse needs permission to read your email to find golf messages. Please try again and accept.');
  token = data.access_token;
  expiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
  granted = scopes;
  if (data.refresh_token) session.set(RENEW_KEY, data.refresh_token);
}

async function renew() {
  const rt = session.get(RENEW_KEY);
  if (!rt || !isConfigured()) return false;
  try {
    await tokenRequest({ grant_type: 'refresh_token', refresh_token: rt });
    return true;
  } catch {
    session.remove(RENEW_KEY);
    return false;
  }
}

/** Gets a token without leaving the page, if that's possible. */
export async function quietSignIn() {
  return hasToken() || renew();
}

/**
 * Gets a token, going to Microsoft's sign-in page if needed. In that case the page
 * leaves and `resume` says what to carry on with when it comes back.
 */
export async function signIn({ hint, resume = 'check' } = {}) {
  if (hasToken()) return token;
  if (!isConfigured()) throw new AuthError('Microsoft sign-in isn’t set up yet. Follow SETUP.md to add your Microsoft Client ID.');
  if (await renew()) return token;
  const { verifier, challenge } = await pkcePair();
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  session.set(PENDING_KEY, JSON.stringify({ verifier, state, resume, redirect: redirectUri(), route: location.hash || '#/home' }));
  const params = new URLSearchParams({
    client_id: clientId(),
    response_type: 'code',
    redirect_uri: redirectUri(),
    response_mode: 'fragment',
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  if (hint) params.set('login_hint', hint);
  else params.set('prompt', 'select_account');
  location.assign(`${AUTHORITY}/authorize?${params}`);
  return new Promise(() => {}); // the page is leaving
}

/**
 * Call once on start-up. If Microsoft has just sent the user back, finishes signing
 * in and returns { resume }; otherwise returns null.
 */
export async function handleRedirect() {
  const params = new URLSearchParams(location.hash.slice(1));
  if (!params.has('state') || !(params.has('code') || params.has('error'))) return null;
  const saved = JSON.parse(session.get(PENDING_KEY) || 'null');
  session.remove(PENDING_KEY);
  // Take the one-time code out of the address bar straight away.
  history.replaceState(null, '', `${location.pathname}${location.search}${(saved && saved.route) || '#/home'}`);
  if (!saved || saved.state !== params.get('state')) throw new AuthError('Microsoft sign-in didn’t complete. Please try again.');
  if (params.get('error')) {
    if (params.get('error') === 'access_denied') throw new AuthError('Microsoft sign-in was cancelled.');
    throw new AuthError(`Microsoft sign-in failed: ${(params.get('error_description') || params.get('error')).split(/\r?\n/)[0].replace(/^AADSTS\d+:\s*/, '')}`);
  }
  await tokenRequest({ grant_type: 'authorization_code', code: params.get('code'), redirect_uri: saved.redirect, code_verifier: saved.verifier });
  return { resume: saved.resume };
}

export function clearToken() {
  token = null;
  expiresAt = 0;
  granted = new Set();
  session.remove(RENEW_KEY);
}

/** Microsoft has no way for an app to withdraw its own access, so this only signs out here. */
export async function signOut() {
  clearToken();
  return false;
}

async function api(path, { method = 'GET', headers = {}, body } = {}, attempt = 0) {
  if (!hasToken()) throw new AuthError('Please sign in to Microsoft again.');
  let res;
  try {
    res = await fetch(path.startsWith('https://') ? path : `${GRAPH}${path}`, {
      method,
      // Immutable IDs stay the same when an email is moved to another folder.
      headers: { Authorization: `Bearer ${token}`, Prefer: 'IdType="ImmutableId"', ...headers },
      body,
    });
  } catch {
    throw new Error("Couldn't reach Microsoft. Check your internet connection.");
  }
  if (res.status === 401) {
    token = null;
    throw new AuthError('Your Microsoft sign-in has expired. Press “Check email” to sign in again.');
  }
  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const wait = Number(res.headers.get('Retry-After'));
      await sleep(wait > 0 ? Math.min(wait, 30) * 1000 : 800 * 2 ** attempt + Math.random() * 300);
      return api(path, { method, headers, body }, attempt + 1);
    }
    const text = await res.text().catch(() => '');
    if (/MailboxNotEnabledForRESTAPI|MailboxNotSupportedForRESTAPI|mailbox is either inactive|soft-deleted|hosted on-premise/i.test(text)) {
      throw new Error('This Microsoft account has no Outlook mailbox that Clubhouse can read. In Settings, disconnect and sign in with the account he uses for email.');
    }
    let reason = '';
    try { reason = JSON.parse(text).error.message || ''; } catch { /* not JSON */ }
    const err = new Error(`Microsoft returned an error (${res.status}${reason ? `: ${reason.slice(0, 160)}` : ''}). Please try again later.`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function getProfile() {
  const p = await api('/me?$select=displayName,givenName,mail,userPrincipalName');
  const fullName = p.displayName || '';
  return {
    provider: 'microsoft',
    name: p.givenName || fullName.split(' ')[0] || '',
    fullName,
    email: String(p.mail || p.userPrincipalName || '').toLowerCase(),
    picture: '',
  };
}

/* ---------- Outlook mail ---------- */

const WORDS = ['golf', 'tee', 'teetime', 'stableford', 'handicap', 'fairway', 'fairways', 'fourball', 'foursomes', 'birdie'];

/** Outlook search text: golf words, plus his extra words (each phrase becomes "word AND word"). */
export function buildSearch(extraTerms = []) {
  const extra = extraTerms
    .map((t) => t.replace(/["()\\]/g, ' ').trim().split(/\s+/).filter(Boolean))
    .filter((w) => w.length)
    .map((w) => (w.length > 1 ? `(${w.join(' AND ')})` : w[0]));
  return [...WORDS, ...extra].join(' OR ');
}

async function skippedFolders() {
  const ids = new Set();
  for (const name of ['junkemail', 'deleteditems']) {
    try {
      ids.add((await api(`/me/mailFolders/${name}?$select=id`)).id);
    } catch { /* folder not available */ }
  }
  return ids;
}

/** Outlook IDs of possible golf emails received since the cut-off. */
export async function searchMessages({ months = 6, extraTerms = [], after, max = 1500 }) {
  const cutoff = Math.max(after || 0, Date.now() - months * 30.44 * DAY);
  const skip = await skippedFolders();
  const found = [];
  let url = `/me/messages?$search=${encodeURIComponent(`"${buildSearch(extraTerms)}"`)}&$select=id,receivedDateTime,parentFolderId&$top=100`;
  let more = false;
  while (url) {
    const res = await api(url);
    for (const m of res.value || []) {
      const t = Date.parse(m.receivedDateTime);
      if (t >= cutoff && !skip.has(m.parentFolderId)) found.push({ id: m.id, t });
    }
    url = res['@odata.nextLink'] || '';
    if (found.length >= max) {
      more = !!url;
      break;
    }
  }
  // Newest first, as with Gmail.
  found.sort((a, b) => b.t - a.t);
  return { ids: found.slice(0, max).map((m) => m.id), more };
}

export async function getMessage(id) {
  const m = await api(`/me/messages/${encodeURIComponent(id)}?$select=id,conversationId,subject,from,receivedDateTime,bodyPreview,body,internetMessageHeaders,webLink`, {
    headers: { Prefer: 'IdType="ImmutableId", outlook.body-content-type="text"' },
  });
  const headers = {};
  for (const x of m.internetMessageHeaders || []) headers[x.name.toLowerCase()] = x.value;
  const addr = (m.from && m.from.emailAddress) || {};
  const isHtml = m.body && m.body.contentType === 'html';
  return {
    id: m.id,
    threadId: m.conversationId || m.id,
    date: Date.parse(m.receivedDateTime) || Date.now(),
    from: addr.address ? `${(addr.name || '').replace(/[<>"]/g, '')} <${addr.address}>` : '',
    subject: m.subject || '',
    snippet: m.bodyPreview || '',
    labels: [],
    unsubscribe: !!headers['list-unsubscribe'],
    text: m.body && !isHtml ? m.body.content || '' : '',
    html: isHtml ? m.body.content || '' : '',
    link: m.webLink || '',
  };
}

/** Outlook gives each email its own web link, saved when the email is read. */
export function messageLink(email) {
  return email.link || 'https://outlook.live.com/mail/';
}

/* ---------- OneDrive backup (Apps/Clubhouse, a folder only this app can use) ---------- */

const BACKUP_ITEM = '/me/drive/special/approot:/clubhouse-backup.json';

export async function loadBackup() {
  let item;
  try {
    item = await api(BACKUP_ITEM);
  } catch (err) {
    if (err.status === 404) return { id: null, data: null };
    throw err;
  }
  // The content lives at a pre-signed link that's fetched without the token.
  const url = item['@microsoft.graph.downloadUrl'];
  if (!url) return { id: item.id, data: null };
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("Couldn't download the OneDrive backup. Check your internet connection.");
  }
  if (!res.ok) throw new Error(`OneDrive returned an error (${res.status}). Please try again later.`);
  return { id: item.id, data: await res.json() };
}

export async function saveBackup(id, data) {
  const item = await api(`${BACKUP_ITEM}:/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return item.id;
}
