import * as store from './store.js';
import * as google from './google.js';
import * as microsoft from './microsoft.js';
import { mapLimit } from './util.js';
import { parseEmail } from './parser.js';
import { upcomingItems, roundStats, goodRoundIds } from './golf.js';
import { h, icon, toast, openDialog, confirmDialog, download, today, isoLocal } from './ui.js';
import { buildDemoState } from './demo.js';
import { homeView } from './views/home.js';
import { mailView } from './views/mail.js';
import { scoresView } from './views/scores.js';
import { settingsView } from './views/settings.js';
import { welcomeView } from './views/welcome.js';

const DAY = 86400000;
const ROUTES = {
  home: { label: 'Home', icon: 'home', view: homeView },
  mail: { label: 'Golf mail', icon: 'mail', view: mailView },
  scores: { label: 'Scores', icon: 'scores', view: scoresView },
  settings: { label: 'Settings', icon: 'settings', view: settingsView },
};

const app = {
  state: store.emptyState(),
  demo: false,
  busy: null,
  cleanups: [],
  backupTimer: null,
  session: 0,
};

const dayFirst = !/^(en-US|en-PH|fil)\b/i.test(navigator.language || '');
let lastRoute = null;

/* ---------- state ---------- */

function persist() {
  if (app.demo) return;
  store.saveState(app.state).then((ok) => {
    if (!ok) toast('Couldn’t save on this device. Is the browser in private mode?', { tone: 'error' });
  });
}

/** Changes the data, saves it and redraws the screen. */
function mutate(fn, { backup = true } = {}) {
  fn(app.state);
  persist();
  render();
  if (backup) scheduleBackup();
}

const live = (obj) => Object.values(obj || {}).filter((x) => !x.deleted);
const effective = (e) => (e.userCategory ? { ...e, category: e.userCategory } : e);

function visibleEmails() {
  const s = app.state.settings;
  const hiddenSenders = new Set(s.hiddenSenders);
  return live(app.state.emails)
    .filter((e) => !e.hidden && !hiddenSenders.has(e.fromEmail))
    .map(effective)
    .filter((e) => s.categories[e.category] !== false)
    .sort((a, b) => b.date - a.date);
}

/* ---------- busy indicator & errors ---------- */

function setBusy(label) {
  app.busy = label;
  const labels = document.querySelectorAll('[data-busy-label]');
  if ((label && !labels.length) || (!label && document.querySelector('.is-busy'))) render();
  else labels.forEach((el) => { el.textContent = label; });
}

function report(err) {
  setBusy(null);
  if (!(err && err.silent)) toast(err.message, { tone: 'error' });
}

// Bumped whenever the data is reset (disconnect, delete, demo) so that a slow
// request started earlier can't write old data back afterwards.
const stale = (session) => session !== app.session || !app.state.meta.profile;

/* ---------- email account (Google or Microsoft) ---------- */

const PROVIDERS = { google, microsoft };
/** The connected account's provider. Accounts saved before Outlook support are Google. */
const provider = () => PROVIDERS[(app.state.meta.profile && app.state.meta.profile.provider) || 'google'];
const notSetUp = (p) => `${p.info.name} sign-in isn’t set up yet. See SETUP.md.`;

/** After a fresh sign-in, checks it's still his account (the sign-in page lets you pick any). */
async function checkAccount(p) {
  const expected = app.state.meta.profile && app.state.meta.profile.email;
  if (!expected) return;
  const got = await p.getProfile();
  if (got.email.toLowerCase() !== expected.toLowerCase()) {
    p.clearToken();
    throw new Error(`That was ${got.email}. Please choose ${expected}, or disconnect in Settings to switch accounts.`);
  }
}

/** Signs in if needed. With Microsoft the page may go to the sign-in page and carry on with `resume` when it returns. */
async function ensureSignedIn(resume = 'check') {
  const p = provider();
  if (p.hasToken()) return;
  await p.signIn({ hint: app.state.meta.profile && app.state.meta.profile.email, resume });
  await checkAccount(p);
}

async function checkEmail() {
  if (app.demo) return toast('This is sample data. Connect your email to check real messages.');
  const p = provider();
  if (!p.isConfigured()) return toast(notSetUp(p), { tone: 'error' });
  if (app.busy) return;
  try {
    await ensureSignedIn('check');
    await scan();
    await backup();
  } catch (err) {
    report(err);
  }
}

const MAX_READ = 500; // emails read per check; the rest are picked up by the next press

async function scan({ quiet = false } = {}) {
  const session = app.session;
  const startedAt = Date.now();
  const p = provider();
  setBusy(`Searching ${p.info.mail}…`);
  try {
    const s = app.state.settings;
    const since = app.state.meta.lastScan ? app.state.meta.lastScan - 3 * DAY : 0;
    const { ids } = await p.searchMessages({ months: s.months, extraTerms: s.extraTerms, after: since || undefined });
    if (stale(session)) return;
    const skipped = new Set(app.state.meta.skipped);
    const unread = ids.filter((id) => !app.state.emails[id] && !skipped.has(id));
    const batch = unread.slice(0, MAX_READ);
    let done = 0;
    if (batch.length) setBusy(`Reading 0 of ${batch.length}`);
    const results = await mapLimit(batch, p.info.concurrency, async (id) => {
      const msg = await p.getMessage(id);
      done += 1;
      setBusy(`Reading ${done} of ${batch.length}`);
      return parseEmail(msg, { dayFirst, extraTerms: s.extraTerms }) || { id, skip: true };
    });
    if (stale(session)) return;
    // Only move the "checked up to" mark once everything has been read.
    const complete = !results.some((r) => !r) && unread.length <= MAX_READ;
    let added = 0;
    mutate((st) => {
      for (const r of results) {
        if (!r) continue;
        if (r.skip) skipped.add(r.id);
        else {
          st.emails[r.id] = { ...r, updatedAt: Date.now() };
          added += 1;
        }
      }
      st.meta.skipped = [...skipped].slice(-5000);
      if (complete) st.meta.lastScan = startedAt;
    }, { backup: false });
    if (quiet) return;
    const found = `Found ${added} new golf email${added === 1 ? '' : 's'}`;
    if (!complete) toast(`${found}. There’s more to read: press Check email again to carry on.`);
    else toast(added ? found : 'You’re up to date. No new golf email.');
  } finally {
    setBusy(null);
  }
}

async function connect(id = 'google') {
  const p = PROVIDERS[id];
  if (!p.isConfigured()) return toast(notSetUp(p), { tone: 'error' });
  try {
    await p.signIn({ resume: 'connect' });
    await finishConnect(p);
  } catch (err) {
    report(err);
  }
}

async function finishConnect(p) {
  const session = app.session;
  setBusy('Connecting…');
  const profile = await p.getProfile();
  if (session !== app.session) return setBusy(null);
  mutate((st) => {
    st.meta.profile = profile;
    st.meta.onboarded = true;
  }, { backup: false });
  navigate('home');
  await backup(); // a backup from another device comes in first, so emails aren't read twice
  await scan();
  await backup();
}

/** Carries on after Microsoft's sign-in page sends him back here. */
async function resumeAfterRedirect() {
  const returning = /[#&](?:code|error)=/.test(location.hash);
  // handleRedirect takes the code out of the address bar before its first pause.
  const pending = microsoft.handleRedirect();
  if (returning) setBusy('Signing in…');
  let result;
  try {
    result = await pending;
  } catch (err) {
    return report(err);
  }
  if (!result) return setBusy(null);
  try {
    if (result.resume === 'connect') return await finishConnect(microsoft);
    await checkAccount(microsoft);
    if (result.resume === 'backup') return await backup({ interactive: true });
    await scan();
    await backup();
  } catch (err) {
    report(err);
  }
}

function removeAccessDialog(p) {
  openDialog({
    title: 'One more step',
    className: 'sheet-small',
    build: (close) => ({
      body: h('p', { class: 'dialog-text' },
        `Clubhouse is disconnected on this device. To remove its access from your ${p.info.name} account too, open the list of apps you’ve given access to, choose Clubhouse and remove it.`),
      footer: [
        h('button', { class: 'btn', type: 'button', onclick: close }, 'Done'),
        h('a', { class: 'btn btn-primary', href: p.info.accessUrl, target: '_blank', rel: 'noopener noreferrer', onclick: close }, `Open ${p.info.name} account`),
      ],
    }),
  });
}

async function disconnect() {
  const p = provider();
  const ok = await confirmDialog({
    title: `Disconnect ${p.info.name}?`,
    message: 'Clubhouse will stop reading your email and the golf emails it found will be removed from this device. Your scores and tee times stay.',
    confirmLabel: 'Disconnect',
    danger: true,
  });
  if (!ok) return;
  app.session += 1;
  clearTimeout(app.backupTimer);
  const revoked = await p.signOut();
  mutate((st) => {
    st.emails = {};
    Object.assign(st.meta, { profile: null, skipped: [], lastScan: 0, driveFileId: null, lastBackup: 0 });
  }, { backup: false });
  if (revoked) toast(`Disconnected. Clubhouse no longer has access to your ${p.info.name} account.`);
  else removeAccessDialog(p);
}

/* ---------- backup (Google Drive or OneDrive) ---------- */

// One backup at a time, so two can't create duplicate files or overwrite each other.
let backupQueue = Promise.resolve();
function backup(opts) {
  const run = backupQueue.then(() => runBackup(opts));
  backupQueue = run.catch(() => {});
  return run;
}

async function runBackup({ interactive = false } = {}) {
  const p = provider();
  if (app.demo || !app.state.settings.driveBackup || !app.state.meta.profile || !p.hasToken()) return;
  if (!p.canBackup()) {
    if (interactive) toast(`${p.info.drive} backup wasn’t allowed when you signed in. Disconnect, then connect again and allow it.`, { tone: 'error' });
    return;
  }
  const session = app.session;
  const done = (id) => {
    app.state.meta.driveFileId = id;
    app.state.meta.lastBackup = Date.now();
    persist();
    render();
    if (interactive) toast(`Backed up to ${p.info.drive}.`);
  };
  try {
    const { id, data: remote } = await p.loadBackup(app.state.meta.driveFileId);
    if (stale(session)) return;
    if (remote) {
      const merged = store.merge(app.state, remote);
      if (!store.sameData(merged, app.state)) {
        app.state = merged;
        persist();
        render();
      }
      if (store.sameData(merged, remote)) return done(id);
    }
    const newId = await p.saveBackup(id, store.forBackup(app.state));
    if (stale(session)) return;
    done(newId);
  } catch (err) {
    if (interactive) toast(err.message, { tone: 'error' });
  }
}

function scheduleBackup() {
  clearTimeout(app.backupTimer);
  if (!provider().hasToken()) return;
  app.backupTimer = setTimeout(() => backup(), 4000);
}

/** True when scores, tee times or settings have changed since the last backup. */
function backupPending() {
  const st = app.state;
  if (app.demo || !st.meta.profile || !st.settings.driveBackup) return false;
  const last = st.meta.lastBackup || 0;
  return ['rounds', 'teeTimes'].some((k) => Object.values(st[k]).some((x) => (x.updatedAt || 0) > last));
}

/* ---------- actions used by the screens ---------- */

const stamp = (obj) => ({ ...obj, updatedAt: Date.now() });
const courseKey = (name) => name.trim().toLowerCase();

const actions = {
  checkEmail,
  connect,
  disconnect,
  async backupNow() {
    try {
      await ensureSignedIn('backup');
      await backup({ interactive: true });
    } catch (err) {
      report(err);
    }
  },

  saveRound(round) {
    const id = round.id || store.uid('r');
    mutate((st) => {
      st.rounds[id] = stamp({ ...round, id });
      if (round.course) {
        const key = courseKey(round.course);
        const prev = st.courses[key] || {};
        st.courses[key] = stamp({
          ...prev,
          id: key,
          name: round.course.trim(),
          par: round.par || prev.par,
          rating: round.rating || prev.rating,
          slope: round.slope || prev.slope,
        });
      }
    });
    toast(round.id ? 'Round updated.' : 'Round saved.');
  },
  deleteRound(id) {
    mutate((st) => { st.rounds[id] = stamp({ id, deleted: true }); });
    toast('Round deleted.');
  },
  saveTeeTime(t) {
    const id = t.id || store.uid('t');
    mutate((st) => { st.teeTimes[id] = stamp({ ...t, id }); });
    toast(t.id ? 'Tee time updated.' : 'Tee time added.');
  },
  deleteTeeTime(id) {
    mutate((st) => { st.teeTimes[id] = stamp({ id, deleted: true }); });
    toast('Tee time removed.');
  },
  updateEmail(id, patch) {
    mutate((st) => { if (st.emails[id]) st.emails[id] = stamp({ ...st.emails[id], ...patch }); });
  },
  hideSender(email) {
    actions.setSetting('hiddenSenders', [...new Set([...app.state.settings.hiddenSenders, email])]);
  },
  unhideSender(email) {
    actions.setSetting('hiddenSenders', app.state.settings.hiddenSenders.filter((e) => e !== email));
  },
  restoreHidden() {
    mutate((st) => {
      for (const e of Object.values(st.emails)) if (e.hidden) st.emails[e.id] = stamp({ ...e, hidden: false });
    });
    toast('Hidden emails restored.');
  },
  setSetting(path, value) {
    mutate((st) => {
      const keys = path.split('.');
      let target = st.settings;
      for (const k of keys.slice(0, -1)) target = target[k];
      target[keys[keys.length - 1]] = value;
      st.settings.updatedAt = Date.now();
      if (path === 'months' || path === 'extraTerms') {
        // Search again from the start so the new range/words take effect.
        st.meta.lastScan = 0;
        st.meta.skipped = [];
      }
    });
    applyAppearance();
  },
  async startDemo() {
    app.session += 1;
    app.demo = true;
    try { localStorage.setItem('clubhouse-demo', '1'); } catch { /* ignore */ }
    app.state = buildDemoState(dayFirst);
    navigate('home');
    render();
  },
  async exitDemo() {
    app.session += 1;
    app.demo = false;
    try { localStorage.removeItem('clubhouse-demo'); } catch { /* ignore */ }
    app.state = await store.loadState();
    navigate('home');
    render();
  },
  finishOnboarding() {
    mutate((st) => { st.meta.onboarded = true; }, { backup: false });
  },
  exportData() {
    download(`clubhouse-backup-${isoLocal(new Date())}.json`, JSON.stringify(store.forBackup(app.state), null, 2));
  },
  async importData(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data !== 'object' || !('rounds' in data || 'settings' in data)) throw new Error();
      const before = live(app.state.rounds).length;
      app.state = store.merge(app.state, data);
      persist();
      render();
      scheduleBackup();
      const added = live(app.state.rounds).length - before;
      toast(`Backup restored${added > 0 ? `, ${added} round${added === 1 ? '' : 's'} added` : ''}.`);
    } catch {
      toast('That file isn’t a Clubhouse backup.', { tone: 'error' });
    }
  },
  async deleteAll() {
    const ok = await confirmDialog({
      title: 'Delete everything?',
      message: 'This removes all scores, tee times, settings and golf emails from this device. Your mailbox is not touched. A backup in Google Drive or OneDrive, if you have one, is kept.',
      confirmLabel: 'Delete everything',
      danger: true,
    });
    if (!ok) return;
    app.session += 1;
    clearTimeout(app.backupTimer);
    const wasConnected = !!app.state.meta.profile;
    const p = provider();
    const revoked = await p.signOut();
    await store.clearState();
    app.state = store.emptyState();
    navigate('home');
    render();
    if (wasConnected && !revoked) removeAccessDialog(p);
    else toast('All Clubhouse data was removed from this device.');
  },
};

/* ---------- context handed to every screen ---------- */

const ctx = {
  get state() { return app.state; },
  get settings() { return app.state.settings; },
  get demo() { return app.demo; },
  get busy() { return app.busy; },
  get connected() { return !!app.state.meta.profile; },
  get provider() { return provider().info; },
  get configured() { return google.isConfigured() || microsoft.isConfigured(); },
  configuredFor: (id) => PROVIDERS[id].isConfigured(),
  messageLink: (e) => provider().messageLink(e, app.state.meta.profile && app.state.meta.profile.email),
  emails: visibleEmails,
  rounds: () => live(app.state.rounds).sort((a, b) => b.date.localeCompare(a.date)),
  courses: () => live(app.state.courses).sort((a, b) => a.name.localeCompare(b.name)),
  upcoming: () => upcomingItems({ emails: visibleEmails(), teeTimes: app.state.teeTimes }, today()),
  stats: () => roundStats(app.state.rounds),
  goodRounds: () => goodRoundIds(app.state.rounds),
  email: (id) => (app.state.emails[id] ? effective(app.state.emails[id]) : null),
  hiddenCount: () => live(app.state.emails).filter((e) => e.hidden).length,
  backupPending,
  actions,
  navigate,
  onCleanup: (fn) => app.cleanups.push(fn),
};

/* ---------- appearance ---------- */

function applyAppearance() {
  const { theme, textSize } = app.state.settings;
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  root.dataset.size = textSize === 'large' ? 'large' : 'normal';
  try { localStorage.setItem('clubhouse-appearance', JSON.stringify({ theme, textSize })); } catch { /* ignore */ }
}

/* ---------- routing & shell ---------- */

function currentRoute() {
  const r = (location.hash.match(/^#\/(\w+)/) || [])[1];
  return ROUTES[r] ? r : 'home';
}

function navigate(route) {
  if (location.hash !== `#/${route}`) location.hash = `#/${route}`;
  else render();
}

function checkButton() {
  if (!(ctx.connected || app.demo)) return null;
  const busy = !!app.busy;
  return h('button', {
    class: `btn btn-quiet check-btn ${busy ? 'is-busy' : ''}`,
    type: 'button',
    onclick: checkEmail,
    disabled: busy,
    'aria-label': busy ? app.busy : 'Check email for golf messages',
  }, icon('refresh', 18), h('span', { class: 'check-label', 'data-busy-label': busy ? '' : null }, busy ? app.busy : 'Check email'));
}

function shell(route, content) {
  const navLinks = (cls) => Object.entries(ROUTES).map(([key, r]) =>
    h('a', { href: `#/${key}`, class: cls, 'aria-current': key === route ? 'page' : null }, icon(r.icon, 22), h('span', null, r.label)));
  return h('div', { class: 'app' },
    h('a', { class: 'skip', href: '#main', onclick: (e) => { e.preventDefault(); document.getElementById('main').focus(); } }, 'Skip to content'),
    h('header', { class: 'topbar' },
      h('div', { class: 'topbar-inner' },
        h('a', { class: 'brand', href: '#/home', 'aria-label': 'Clubhouse home' }, h('img', { src: 'icons/icon.svg', alt: '', width: 34, height: 34 }), h('span', { class: 'brand-word' }, 'Clubhouse')),
        h('nav', { class: 'topnav', 'aria-label': 'Main' }, navLinks('topnav-link')),
        checkButton())),
    app.demo ? h('div', { class: 'demo-bar' },
      h('span', null, h('strong', null, 'Sample data'), ' · changes aren’t saved'),
      h('button', { class: 'link-btn', type: 'button', onclick: actions.exitDemo }, 'Leave demo')) : null,
    h('main', { id: 'main', class: 'main', tabindex: '-1' }, content),
    h('nav', { class: 'tabbar', 'aria-label': 'Main' }, navLinks('tab')));
}

function render() {
  for (const fn of app.cleanups.splice(0)) fn();
  const root = document.getElementById('app');
  if (!app.state.meta.onboarded && !app.demo) {
    root.replaceChildren(welcomeView(ctx));
    lastRoute = null;
    return;
  }
  const route = currentRoute();
  const activeId = document.activeElement && document.activeElement.id;
  root.replaceChildren(shell(route, ROUTES[route].view(ctx)));
  document.title = route === 'home' ? 'Clubhouse' : `${ROUTES[route].label} · Clubhouse`;
  if (route !== lastRoute) {
    if (lastRoute !== null) window.scrollTo(0, 0);
    lastRoute = route;
  } else if (activeId) {
    const el = document.getElementById(activeId);
    if (el) el.focus({ preventScroll: true });
  }
}

/* ---------- start ---------- */

async function start() {
  let demo = false;
  try { demo = localStorage.getItem('clubhouse-demo') === '1'; } catch { /* ignore */ }
  if (demo) {
    app.demo = true;
    app.state = buildDemoState(dayFirst);
  } else {
    app.state = await store.loadState();
  }
  applyAppearance();
  const resuming = resumeAfterRedirect();
  window.addEventListener('hashchange', render);
  render();
  google.prepare();
  await resuming;
  store.requestPersistence();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

start();
