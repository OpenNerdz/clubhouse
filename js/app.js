import * as store from './store.js';
import * as google from './google.js';
import * as microsoft from './microsoft.js';
import { mapLimit } from './util.js';
import { parseEmail } from './parser.js';
import { upcomingItems, unscoredRounds, roundStats, goodRoundIds, partnerCounts, latestHandicapEmail, indexValue, courseRecord, courseHandicap, holesPlayed } from './golf.js';
import * as weather from './weather.js';
import { h, icon, toast, openDialog, confirmDialog, download, today, isoLocal } from './ui.js';
import { buildDemoState } from './demo.js';
import { playSheet } from './views/play.js';
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
  backupError: null, // why the last backup failed, until one works
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

/** Changes the data, saves it and redraws the screen. `backup: false` is for changes the backup doesn't need. */
function mutate(fn, { backup = true } = {}) {
  fn(app.state);
  if (backup) app.state.meta.changedAt = Date.now();
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
  if (label === app.busy) return;
  app.busy = label;
  const labels = document.querySelectorAll('[data-busy-label]');
  if (!label || !labels.length) render();
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

const CHUNK = 60; // emails saved at a time, so the screen fills in as it reads and nothing is lost if the app closes

/** Searches the mailbox and reads any golf emails not seen before. `auto` stays quiet unless something new turns up. */
async function scan({ auto = false } = {}) {
  const session = app.session;
  const startedAt = Date.now();
  const p = provider();
  setBusy(`Searching ${p.info.mail}…`);
  try {
    const s = app.state.settings;
    const since = app.state.meta.lastScan ? app.state.meta.lastScan - 3 * DAY : 0;
    const skipped = new Set(app.state.meta.skipped);
    // Emails already read are left out of the search, so each press of Check email
    // carries on further back in a big mailbox instead of finding the same ones.
    const known = (id) => !!app.state.emails[id] || skipped.has(id);
    const { ids, more } = await p.searchMessages({ months: s.months, extraTerms: s.extraTerms, after: since || undefined, known });
    if (stale(session)) return;
    const unread = ids.filter((id) => !known(id));
    let done = 0;
    let added = 0;
    let missed = false;
    if (unread.length) setBusy(`Reading 0 of ${unread.length}`);
    for (let i = 0; i < unread.length; i += CHUNK) {
      const results = await mapLimit(unread.slice(i, i + CHUNK), p.info.concurrency, async (id) => {
        const msg = await p.getMessage(id);
        done += 1;
        setBusy(`Reading ${done} of ${unread.length}`);
        return parseEmail(msg, { dayFirst, extraTerms: s.extraTerms }) || { id, skip: true };
      });
      if (stale(session)) return;
      mutate((st) => {
        for (const r of results) {
          if (!r) missed = true;
          else if (r.skip) skipped.add(r.id);
          else {
            st.emails[r.id] = { ...r, updatedAt: Date.now() };
            added += 1;
          }
        }
        st.meta.skipped = [...skipped].slice(-5000);
      }, { backup: false });
    }
    // Only move the "checked up to" mark once everything has been read.
    if (!missed && !more) mutate((st) => { st.meta.lastScan = startedAt; }, { backup: false });
    const found = `Found ${added} new golf email${added === 1 ? '' : 's'}`;
    if (more) toast(`${found}. There’s more to read: press Check email again to carry on.`);
    else if (added) toast(found);
    else if (!auto) toast(missed ? 'Some emails couldn’t be read. Press Check email to try again.' : 'You’re up to date. No new golf email.');
  } finally {
    setBusy(null);
  }
}

/**
 * Checks for new golf email by itself when the app is opened or brought back,
 * but only when that needs no sign-in window, and not more than every 20 minutes.
 */
async function autoCheck() {
  if (app.demo || app.busy || !app.state.meta.profile || document.visibilityState !== 'visible') return;
  const scanDue = Date.now() - (app.state.meta.lastScan || 0) >= 20 * 60000;
  if (!scanDue && !unsavedChanges()) return;
  const p = provider();
  if (!p.isConfigured() || !(await p.quietSignIn()) || app.busy) return;
  try {
    if (scanDue) await scan({ auto: true });
    await backup();
  } catch {
    // Nothing to show: he can always press Check email.
  }
}

async function connect(id = 'google', { ready = false } = {}) {
  const p = PROVIDERS[id];
  if (!p.isConfigured()) return toast(notSetUp(p), { tone: 'error' });
  if (id === 'google' && !ready) return googleHeadsUp();
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
  // Someone else's golf is on this device: don't put it in this account unasked.
  const { owner } = app.state.meta;
  if (owner && !store.sameAccount(owner, profile.email)) {
    let choice = 'fresh'; // nothing of theirs but settings, so start clean
    if (store.hasOwnData(app.state)) {
      setBusy(null);
      choice = await whoseScores(owner, profile.email);
      if (session !== app.session) return;
      if (!choice) {
        p.clearToken();
        return toast('Not connected. Nothing on this device has changed.');
      }
      setBusy('Connecting…');
    }
    if (choice === 'fresh') app.state = store.freshStart(app.state);
  }
  mutate((st) => {
    st.meta.profile = profile;
    st.meta.owner = profile.email;
    st.meta.onboarded = true;
  }, { backup: false });
  navigate('home');
  await backup(); // a backup from another device comes in first, so emails aren't read twice
  await scan();
  await backup();
}

/** Asks whether the scores already on this device are his. Resolves 'fresh', 'keep', or null to cancel. */
function whoseScores(owner, email) {
  const behind = app.state.meta.changedAt > app.state.meta.lastBackup;
  return new Promise((resolve) => {
    let choice = null;
    openDialog({
      title: 'Whose scores are these?',
      className: 'sheet-small',
      onClose: () => resolve(choice),
      build: (close) => {
        const pick = (c) => () => { choice = c; close(); };
        return {
          body: [
            h('p', { class: 'dialog-text' }, `This device has golf saved by ${owner}. You’ve signed in as ${email}.`),
            h('p', { class: 'dialog-text' }, behind
              ? ['Starting fresh takes it off this device, and some of it isn’t backed up yet. ',
                h('button', { class: 'link-btn', type: 'button', onclick: actions.exportData }, 'Save a backup file'), ' first to keep a copy.']
              : 'Starting fresh takes it off this device. It stays in their backup.'),
          ],
          footer: [
            h('button', { class: 'btn', type: 'button', onclick: pick('keep') }, 'It’s mine, keep it'),
            h('button', { class: 'btn btn-primary', type: 'button', onclick: pick('fresh') }, 'Start fresh'),
          ],
        };
      },
    });
  });
}

/** Google's sign-in has two screens that catch people out, so say what's coming first. */
function googleHeadsUp() {
  openDialog({
    title: 'Before you sign in',
    className: 'sheet-small',
    build: (close) => ({
      body: [
        h('p', { class: 'dialog-text' }, 'Google will open a window. Two things to look out for:'),
        h('ol', { class: 'steps' },
          h('li', null, h('strong', null, 'If Google says it hasn’t verified Clubhouse, '), 'choose Continue. That’s normal for a private app.'),
          h('li', null, h('strong', null, 'Tick every box '), 'when Google lists what Clubhouse can see. It needs them to read your golf email and back up your scores.')),
      ],
      footer: [
        h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'),
        // The Google window has to open straight from this tap, or the browser blocks it.
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { close(); connect('google', { ready: true }); } }, 'Continue to Google'),
      ],
    }),
  });
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
  const stranded = unsavedChanges() && !p.canSaveQuietly();
  const ok = await confirmDialog({
    title: `Disconnect ${p.info.name}?`,
    message: `Clubhouse will stop reading your email and the golf emails it found will be removed from this device. Your scores and tee times stay${
      stranded ? `, but your latest changes aren’t backed up to ${p.info.drive}. To back them up first, choose Cancel, then Back up now.` : '.'}`,
    confirmLabel: 'Disconnect',
    danger: true,
  });
  if (!ok) return;
  // Last changes go up to his backup while he's still signed in.
  if (unsavedChanges() && p.canSaveQuietly()) {
    setBusy('Backing up…');
    await quietBackup();
    setBusy(null);
  }
  app.session += 1;
  clearTimeout(app.backupTimer);
  app.backupError = null;
  const revoked = await p.signOut();
  // `owner`, `lastBackup` and `changedAt` stay, so a different account signing in
  // here later is asked before it takes these scores, and told if they're backed up.
  mutate((st) => {
    st.emails = {};
    Object.assign(st.meta, { profile: null, skipped: [], lastScan: 0, driveFileId: null });
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
    if (interactive) {
      toast(p.info.id === 'google'
        ? 'Google Drive backup wasn’t allowed. Press Back up now again and tick the Google Drive box.'
        : `${p.info.drive} backup wasn’t allowed when you signed in. Disconnect, then connect again and allow it.`, { tone: 'error' });
    }
    return;
  }
  const session = app.session;
  let at = 0; // when the copy was taken; anything changed after it is still to go up
  const done = (id) => {
    app.state.meta.driveFileId = id;
    app.state.meta.lastBackup = at;
    app.backupError = null;
    persist();
    render();
    if (interactive) toast(`Backed up to ${p.info.drive}.`);
  };
  try {
    const { id, data: remote } = await p.loadBackup(app.state.meta.driveFileId);
    if (stale(session)) return;
    at = Date.now();
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
    if (stale(session)) return;
    app.backupError = err.message;
    if (interactive) toast(err.message, { tone: 'error' });
    else render(); // shows that it isn't backed up
  }
}

/** True when he's changed something since the last backup (and backs up). */
function unsavedChanges() {
  const st = app.state;
  return !app.demo && !!st.meta.profile && st.settings.driveBackup && st.meta.changedAt > st.meta.lastBackup;
}

/** Backs up a few seconds after a change, once the changes have settled. */
function scheduleBackup(delay = 4000) {
  clearTimeout(app.backupTimer);
  app.backupTimer = null;
  if (!unsavedChanges()) return;
  app.backupTimer = setTimeout(() => {
    app.backupTimer = null;
    quietBackup();
  }, delay);
}

/** Leaving the app: a backup that's waiting goes now, as the phone may close the app. */
function flushBackup() {
  if (document.visibilityState !== 'hidden' || !app.backupTimer) return;
  clearTimeout(app.backupTimer);
  app.backupTimer = null;
  quietBackup();
}

/** Backs up if that needs no sign-in window. When it does, the notice asks him to. */
async function quietBackup() {
  const p = provider();
  if (!unsavedChanges() || !p.isConfigured()) return;
  const could = p.canSaveQuietly();
  if (!(await p.quietSignIn())) {
    if (could) render(); // Microsoft turned down the renewal, so it's over to him now
    return;
  }
  await backup();
}

/**
 * True when his scores, tee times, partners or courses aren't backed up and won't
 * go up by themselves: Google needs its window, or the last try failed.
 */
function backupPending() {
  const st = app.state;
  return unsavedChanges() && store.ownDataChangedSince(st, st.meta.lastBackup) && (!provider().canSaveQuietly() || !!app.backupError);
}

/* ---------- actions used by the screens ---------- */

const stamp = (obj) => ({ ...obj, updatedAt: Date.now() });
const courseKey = (name) => name.trim().toLowerCase();

const actions = {
  checkEmail,
  connect,
  disconnect,
  async backupNow() {
    const p = provider();
    try {
      if (p.hasToken() && !p.canBackup() && p.info.id === 'google') {
        // He left the Google Drive box unticked: show Google's boxes again.
        await p.signIn({ hint: app.state.meta.profile && app.state.meta.profile.email, consent: true });
        await checkAccount(p);
      } else {
        await ensureSignedIn('backup');
      }
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
        const prev = st.courses[key] || courseRecord(st.courses, round.course) || {};
        // The pars and stroke indexes from a card are kept for next time; a nine only
        // fills in a course that has no card yet.
        const card = round.card && (round.card.length === 18 || !prev.card) ? round.card.map(({ par, si }) => ({ par, si: si || null })) : prev.card;
        st.courses[key] = stamp({
          ...prev,
          id: key,
          name: round.course.trim(),
          par: (round.holes || 18) === 18 ? round.par || prev.par : prev.par,
          rating: (round.holes || 18) === 18 ? round.rating || prev.rating : prev.rating,
          slope: round.slope || prev.slope,
          card,
        });
      }
    });
    toast(round.id ? 'Round updated.' : 'Round saved.');
  },
  deleteRound(id) {
    const before = app.state.rounds[id];
    mutate((st) => { st.rounds[id] = stamp({ id, deleted: true }); });
    toast('Round deleted.', { action: { label: 'Undo', run: () => mutate((st) => { st.rounds[id] = stamp(before); }) } });
  },
  /** Adds or updates a playing partner and returns their id. */
  savePartner(friend) {
    const id = friend.id || store.uid('f');
    const name = friend.name.trim();
    mutate((st) => { st.friends[id] = stamp({ ...friend, id, name }); });
    toast(friend.id ? 'Partner updated.' : `${name} added to your playing partners.`);
    return id;
  },
  deletePartner(id) {
    const before = app.state.friends[id];
    mutate((st) => { st.friends[id] = stamp({ id, deleted: true }); });
    toast(`${before.name} removed.`, { action: { label: 'Undo', run: () => mutate((st) => { st.friends[id] = stamp(before); }) } });
  },
  saveTeeTime(t) {
    const id = t.id || store.uid('t');
    mutate((st) => { st.teeTimes[id] = stamp({ ...t, id }); });
    toast(t.id ? 'Tee time updated.' : 'Tee time added.');
  },
  deleteTeeTime(id) {
    const before = app.state.teeTimes[id];
    mutate((st) => { st.teeTimes[id] = stamp({ id, deleted: true }); });
    toast('Tee time removed.', { action: { label: 'Undo', run: () => mutate((st) => { st.teeTimes[id] = stamp(before); }) } });
  },
  updateEmail(id, patch) {
    mutate((st) => { if (st.emails[id]) st.emails[id] = stamp({ ...st.emails[id], ...patch }); });
  },
  hideEmail(id) {
    actions.updateEmail(id, { hidden: true });
    toast('Email hidden.', { action: { label: 'Undo', run: () => actions.updateEmail(id, { hidden: false }) } });
  },
  hideSender(email, name = email) {
    actions.setSetting('hiddenSenders', [...new Set([...app.state.settings.hiddenSenders, email])]);
    toast(`Emails from ${name} hidden.`, { action: { label: 'Undo', run: () => actions.unhideSender(email) } });
  },
  /** He didn't play that day after all, so stop asking for a score. */
  notPlayed(date) {
    actions.setSetting('notPlayed', [...app.state.settings.notPlayed, date].slice(-60));
    toast('We won’t ask about that one again.', {
      action: { label: 'Undo', run: () => actions.setSetting('notPlayed', app.state.settings.notPlayed.filter((d) => d !== date)) },
    });
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
        // Search again from the start so the new range/words take effect. New words
        // can make a skipped email count; a longer look-back doesn't change what's golf.
        st.meta.lastScan = 0;
        if (path === 'extraTerms') st.meta.skipped = [];
      }
    });
    applyAppearance();
    if ((path === 'months' || path === 'extraTerms') && app.state.meta.profile && !app.demo) {
      toast('Saved. Check your email again to use it.', { action: { label: 'Check now', run: checkEmail } });
    }
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
  /** Starts scoring hole by hole, from a form, a tee time or a saved round's card. */
  async startRound(from = {}) {
    const running = app.state.meta.live;
    if (running && holesPlayed(running.card)) {
      const ok = await confirmDialog({
        title: 'Start a new round?',
        message: `You have a round in progress${running.course ? ` at ${running.course}` : ''}. Starting a new one throws it away.`,
        confirmLabel: 'Start new round',
        danger: true,
      });
      if (!ok) return playSheet(ctx);
    }
    const holes = from.holes === 9 ? 9 : 18;
    const known = courseRecord(app.state.courses, from.course) || {};
    const pattern = from.card || known.card || [];
    const card = Array.from({ length: holes }, (_, i) => {
      const x = pattern[i] || {};
      return from.card ? { par: x.par || 4, si: x.si || null, strokes: x.strokes ?? null, putts: x.putts ?? null, picked: !!x.picked }
        : { par: x.par || 4, si: x.si || null, strokes: null, putts: null, picked: false };
    });
    const first = card.findIndex((x) => x.strokes === null && !x.picked);
    app.state.meta.live = {
      course: (from.course || '').trim(),
      date: from.date || today(),
      holes,
      card,
      hole: first < 0 ? 0 : first,
      rating: from.rating || known.rating, // an 18-hole rating is halved for a nine
      slope: from.slope || known.slope,
      indexAtPlay: from.indexAtPlay ?? currentIndex(),
      roundId: from.id || null,
      startedAt: Date.now(),
    };
    persist();
    render();
    playSheet(ctx);
  },
  /** Saves the round in progress after every tap, without redrawing the screen behind it until asked. */
  saveLive(draft, { redraw = false } = {}) {
    app.state.meta.live = draft;
    persist();
    if (redraw) render();
  },
  clearLive() {
    app.state.meta.live = null;
    persist();
    render();
  },
  /** Holes, greens, pars and stroke indexes found on OpenStreetMap. Greens he saved himself are kept. */
  saveCourseMap(name, found) {
    updateCourse(name, (c) => {
      const mine = Object.fromEntries(Object.entries(c.greens || {}).filter(([, g]) => g.from === 'mine'));
      c.greens = { ...found.greens, ...mine };
      const card = c.card ? c.card.map((x) => ({ ...x })) : null;
      if (card) card.forEach((x, i) => { if (!x.si && found.sis[i + 1]) x.si = found.sis[i + 1]; });
      c.card = card || Array.from({ length: 18 }, (_, i) => ({ par: found.pars[i + 1] || 4, si: found.sis[i + 1] || null }));
      if (!c.par && Object.keys(found.pars).length === 18) c.par = Object.values(found.pars).reduce((a, b) => a + b, 0);
    });
  },
  /** He's standing on a green: remember where it is. */
  saveGreen(name, hole, spot) {
    const before = (courseRecord(app.state.courses, name) || {}).greens || {};
    updateCourse(name, (c) => { c.greens = { ...(c.greens || {}), [hole]: { lat: spot.lat, lon: spot.lon, from: 'mine' } }; });
    toast(`Green ${hole} saved.`, { action: { label: 'Undo', run: () => updateCourse(name, (c) => { c.greens = { ...before }; }) } });
  },
  /** He picked where a course is, for the weather, when its name alone wasn't enough. */
  setPlace(name, place) {
    const key = courseKey(name);
    app.state.meta.places = { ...app.state.meta.places, [key]: { lat: place.lat, lon: place.lon, name: place.name, at: Date.now(), chosen: true } };
    for (const k of forecasts.keys()) if (k.startsWith(`${key}|`)) forecasts.delete(k);
    persist();
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
      app.state.meta.changedAt = Date.now();
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
    if (app.demo) return; // the real data isn't on screen, so don't offer to delete it
    const ok = await confirmDialog({
      title: 'Delete everything?',
      message: 'This removes all scores, tee times, settings and golf emails from this device. Your mailbox is not touched. A backup in Google Drive or OneDrive, if you have one, is kept.',
      confirmLabel: 'Delete everything',
      danger: true,
    });
    if (!ok) return;
    app.session += 1;
    clearTimeout(app.backupTimer);
    app.backupError = null;
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

/** Changes a course's saved details, adding the course if it's new. */
function updateCourse(name, fn) {
  mutate((st) => {
    const found = courseRecord(st.courses, name);
    const key = found ? found.id : courseKey(name);
    const c = { ...(found || { id: key, name: name.trim() }) };
    fn(c);
    st.courses[key] = stamp(c);
  });
}

/* ---------- handicap and weather for the screens ---------- */

/** His index now: the latest from a handicap email, or the estimate if he wants one. */
function currentIndex() {
  const official = latestHandicapEmail(visibleEmails());
  if (official) return indexValue(official.details.index);
  return app.state.settings.handicapEstimate ? roundStats(app.state.rounds).index : null;
}

/** The shots he gets at a course, when its rating and slope are known. */
function shotsAt(name, holes = 18) {
  const c = courseRecord(app.state.courses, name);
  return c ? courseHandicap(currentIndex(), { ...c, holes }) : null;
}

const forecasts = new Map(); // kept in memory for half an hour
const lookups = new Map();
const DEMO_WEATHER = { temp: 14, rain: 20, wind: 11, code: 2 };

/** Where a course is. Remembered on this device so the map is asked once per course. */
function place(name) {
  const key = courseKey(name);
  const known = app.state.meta.places[key];
  if (known && (known.lat !== undefined || Date.now() - known.at < 30 * DAY)) return Promise.resolve(known.lat !== undefined ? known : null);
  if (!lookups.has(key)) {
    lookups.set(key, weather.findCourse(name).then((found) => {
      app.state.meta.places = { ...app.state.meta.places, [key]: { ...(found || {}), at: Date.now() } };
      persist();
      return found;
    }).finally(() => lookups.delete(key)));
  }
  return lookups.get(key);
}

/** The forecast for an upcoming round, or null (too far ahead, turned off, offline, course not on the map). */
function forecast(item) {
  if (!app.state.settings.weather || !item.course || !item.date || !weather.inRange(item.date, today())) return Promise.resolve(null);
  if (app.demo) return Promise.resolve({ ...DEMO_WEATHER, units: weather.units() });
  const key = `${courseKey(item.course)}|${item.date}|${item.time || ''}`;
  const hit = forecasts.get(key);
  if (hit && Date.now() - hit.at < 30 * 60000) return hit.promise;
  const promise = place(item.course)
    .then((p) => (p ? weather.forecastFor(p, item.date, item.time).then((w) => w && { ...w, place: p.name }) : null))
    .catch(() => {
      forecasts.delete(key); // try again next time, e.g. once there's a signal
      return null;
    });
  forecasts.set(key, { at: Date.now(), promise });
  return promise;
}

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
  partnerCounts: () => partnerCounts(app.state.rounds),
  /** Playing partners, the ones he plays with most first. */
  friends: () => {
    const counts = partnerCounts(app.state.rounds);
    return live(app.state.friends).sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0) || a.name.localeCompare(b.name));
  },
  /** The partners on a round or tee time, skipping any since removed. */
  friendsOf: (item) => (item.friendIds || []).map((id) => app.state.friends[id]).filter((f) => f && !f.deleted),
  upcoming: () => upcomingItems({ emails: visibleEmails(), teeTimes: app.state.teeTimes }, today()),
  unscored: () => unscoredRounds({ emails: visibleEmails(), teeTimes: app.state.teeTimes, rounds: app.state.rounds, dismissed: app.state.settings.notPlayed }),
  stats: () => roundStats(app.state.rounds),
  goodRounds: () => goodRoundIds(app.state.rounds),
  email: (id) => (app.state.emails[id] ? effective(app.state.emails[id]) : null),
  hiddenCount: () => live(app.state.emails).filter((e) => e.hidden).length,
  currentIndex,
  shotsAt,
  forecast,
  course: (name) => courseRecord(app.state.courses, name),
  /** Where a course is on the map, if known: { lat, lon, name }; `false` when the map couldn't find it. */
  placeOf: (name) => {
    const p = name && app.state.meta.places[courseKey(name)];
    return p ? (p.lat !== undefined ? p : false) : null;
  },
  get live() { return app.state.meta.live; },
  get unsaved() { return unsavedChanges(); },
  get backupError() { return app.backupError; },
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
    lastRoute = 'welcome'; // so the first screen after it starts at the top
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
  autoCheck();
  document.addEventListener('visibilitychange', autoCheck);
  document.addEventListener('visibilitychange', flushBackup);
  window.addEventListener('online', () => scheduleBackup(1000));
  store.requestPersistence();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

start();
