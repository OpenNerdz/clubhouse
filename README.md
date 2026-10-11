# Clubhouse

A simple personal golf website. It connects to Gmail or Outlook, picks out the golf emails and puts the useful details in one place, alongside a record of his scores.

- **Coming up**: booked tee times and competitions, taken from booking emails. Reminders and changes are merged into one entry and cancellations are removed. Each one can be added to Google Calendar in one tap.
- **Golf mail**: golf emails only, sorted into tee times, competitions, handicap, club news, shop & offers and other. Each shows the key facts, such as date, time, players, booking reference, finishing position, points, new handicap index or order status.
- **Scores**: record rounds and see average, best, a trend chart and a handicap estimate (World Handicap System method), with a chart of how the handicap has moved.
- **Scoring hole by hole**: on the course, one hole at a time with big buttons. Shots and Stableford points follow the stroke index, a picked-up hole counts as net double bogey, and everything is saved after each tap so nothing is lost if the phone closes the app. The finished card is kept with the round, birdies ringed and bogeys boxed.
- **Distances (GPS)**: while scoring, the distance to the front, middle and back of the green. Greens come from OpenStreetMap where the course is mapped hole by hole, or he stands on each green once and saves it. The screen stays on while it's showing.
- **Shots and weather**: each tee time shows how many shots he gets there (from his index and the course's rating and slope), and the forecast for the round.
- **Settings**: turn off anything he doesn't use, including home-screen sections, kinds of email, score-form boxes and the weather. There's also dark mode and a larger text size.

It works on phones, tablets and computers, can be added to the home screen like an app, and opens without a signal (handy for entering a score on the course).

**To set it up, see [SETUP.md](SETUP.md).** To try it first, run `npm start` and choose *Look around with sample data*.

## Design

The look borrows from golf's own objects rather than a generic app template:

- **The scorecard:** warm card stock, ruled lines and small-caps printed labels. Good rounds are ringed in red pen, as golfers do on a card: his best round, and any round played to handicap (36+ Stableford points).
- **The honours board:** handicap, average and best score in gold on green, like the boards in a clubhouse bar.
- **The starter's ticket and tee sheet:** the next tee time is a tear-off ticket, and later bookings are set out like the starter's sheet.
- **The yardage book:** contour lines of a green on the welcome screen.
- **Type:** the old sports-page pairing. *Besley*, a Clarendon, for headings and numbers; *Libre Franklin*, a Franklin Gothic revival, for text. Both are self-hosted under the SIL Open Font License (see `fonts/`).

## How it works

There is no server. Everything runs in the browser:

1. **Signing in:**
   - **Gmail** uses Google Identity Services with read-only access.
   - **Outlook, Hotmail and Live** use Microsoft's sign-in for apps without a server (code flow with PKCE), with read-only `Mail.Read` access through Microsoft Graph.

   Access tokens are kept in memory only.
2. **Checking email:** the mailbox is searched for golf terms (plus any extra words he adds). Each match is read and passed through `js/parser.js`, which drops anything that isn't golf (a VW Golf, horse racing, crazy golf), picks a category and pulls out the details.
3. **Storage:** only the extracted details and a short preview are saved, in the browser's IndexedDB. An optional backup goes to a private app folder in his Google Drive or OneDrive, which also keeps devices in step. While he's signed in, each change goes up a few seconds after he makes it. Google's sign-in only lasts an hour, so when there's something new that needs it again, Home and Scores offer **Back up now**. The data on a device belongs to the account that last connected, so a different account signing in there is asked before those scores go into its backup.
4. **Weather:** the course is found by name on OpenStreetMap (Nominatim) and the forecast comes from Open-Meteo. Neither needs a key, and only the course name and position are sent.

## Files

```
index.html            page shell and Content Security Policy
privacy.html          plain-English privacy policy
css/styles.css        all styling (light and dark)
fonts/                Besley and Libre Franklin (SIL Open Font License)
js/config.js          ← paste the Google / Microsoft Client IDs here
js/app.js             state, actions, navigation
js/parser.js          golf email detection and extraction
js/golf.js            handicap, shots, Stableford, stats, bookings, calendar links
js/weather.js         course lookup and forecast for tee times
js/gps.js             distances to the green, course maps from OpenStreetMap
js/google.js          Google sign-in, Gmail, Drive backup
js/microsoft.js       Microsoft sign-in, Outlook mail, OneDrive backup
js/util.js            shared helpers for both
js/store.js           on-device storage and backup merging
js/ui.js, chart.js    small UI helpers and the score chart
js/views/             the screens (play.js: scoring hole by hole)
js/demo.js            sample data
sw.js                 offline support
server.js             local preview server (npm start)
tests/                npm test
_headers              security headers for Netlify / Cloudflare Pages
```

## Development

Requires Node 22 or newer, with no other dependencies.

```bash
npm start   # http://localhost:8080
npm test    # parser, handicap and storage tests
```
