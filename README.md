# Clubhouse

A simple personal golf website. It connects to Gmail, picks out the golf emails and puts the useful details in one place, alongside a record of his scores.

- **Coming up**: booked tee times and competitions, taken from booking emails. Reminders and changes are merged into one entry and cancellations are removed. Each one can be added to Google Calendar in one tap.
- **Golf mail**: golf emails only, sorted into tee times, competitions, handicap, club news, shop & offers and other. Each shows the key facts, such as date, time, players, booking reference, finishing position, points, new handicap index or order status.
- **Scores**: record rounds and see average, best, a trend chart and a handicap estimate (World Handicap System method).
- **Settings**: turn off anything he doesn't use, including home-screen sections, kinds of email and score-form boxes. There's also dark mode and a larger text size.

It works on phones, tablets and computers, can be added to the home screen like an app, and opens without a signal (handy for entering a score on the course).

**To set it up, see [SETUP.md](SETUP.md).** To try it first, run `npm start` and choose *Look around with sample data*.

## How it works

There is no server. Everything runs in the browser:

1. **Signing in** uses Google Identity Services with read-only Gmail access. The access token is kept in memory only.
2. **Checking email:** Gmail is searched for golf terms (plus any extra words he adds). Each match is read and passed through `js/parser.js`, which drops anything that isn't golf (a VW Golf, horse racing, crazy golf), picks a category and pulls out the details.
3. **Storage:** only the extracted details and a short preview are saved, in the browser's IndexedDB. An optional backup goes to a hidden app folder in his Google Drive, which also keeps devices in step.

## Files

```
index.html            page shell and Content Security Policy
css/styles.css        all styling (light and dark)
js/config.js          ← paste the Google Client ID here
js/app.js             state, actions, navigation
js/parser.js          golf email detection and extraction
js/golf.js            handicap, stats, bookings, calendar links
js/google.js          Google sign-in, Gmail, Drive backup
js/store.js           on-device storage and backup merging
js/ui.js, chart.js    small UI helpers and the score chart
js/views/             the screens
js/demo.js            sample data
sw.js                 offline support
server.js             local preview server (npm start)
tests/                npm test
_headers              security headers for Netlify / Cloudflare Pages
```

## Development

Requires Node 20 or newer, with no other dependencies.

```bash
npm start   # http://localhost:8080
npm test    # parser, handicap and storage tests
```
