# Setting up Clubhouse

You can try Clubhouse straight away with sample data: open it and choose **Look around with sample data**. Reading real Gmail needs a one-time setup, which takes about 20 minutes:

1. Put the site online, so it has a web address.
2. Create a free Google Cloud project and turn on Gmail access.
3. Allow your stepdad's Gmail address to sign in.
4. Create a Client ID and paste it into `js/config.js`.

You only do this once. It costs nothing.

---

## Try it on this phone first (optional)

```bash
cd ~/clubhouse
npm start
```

Then open **http://localhost:8080** in the phone's browser. Sample data works right away. Google sign-in also works here once you've finished step 4, as long as you add `http://localhost:8080` as an origin.

---

## Step 1: Put the site online

Clubhouse is a set of plain files with no server, so any free static host will do. Pick one option.

### Option A: from a computer (easiest)

1. Copy the `clubhouse` folder to a computer.
2. Go to **https://app.netlify.com/drop** and create a free account.
3. Drag the `clubhouse` folder onto the page.
4. Netlify gives you an address like `https://golden-fairway-123.netlify.app`. You can rename it under **Site configuration → Change site name**.

To update the site later, drag the folder onto **Deploys** for that site again.

### Option B: from this phone with GitHub Pages

You need a free GitHub account. Run:

```bash
pkg install gh
gh auth login                       # follow the prompts and sign in with the browser
git config --global user.name "Your Name"            # first time only
git config --global user.email "you@example.com"     # first time only
cd ~/clubhouse
git init -b main
git add .
git commit -m "Clubhouse"
gh repo create clubhouse --public --source . --push
gh api -X POST "repos/{owner}/{repo}/pages" -f "source[branch]=main" -f "source[path]=/"
```

After a minute the site will be at `https://YOUR-GITHUB-NAME.github.io/clubhouse/`.
To update it later: `git add . && git commit -m "Update" && git push`.

> The code is public on GitHub, but no personal data is. Emails and scores are only ever stored in the browser and (if he chooses) in his own Google Drive. A Client ID isn't a secret.

Write down your site's address. Google calls it an **origin**: just `https://` and the host name, with no path and no slash on the end. For example:

- Netlify: `https://golden-fairway-123.netlify.app`
- GitHub Pages: `https://your-github-name.github.io`

---

## Step 2: Create a Google Cloud project

Use any Google account for this; it can be yours or his.

1. Go to **https://console.cloud.google.com** and accept the terms if asked.
2. Use the project picker at the top to choose **New project**, name it `Clubhouse` and click **Create**. Make sure it's selected afterwards.
3. Open **APIs & Services → Library**.
   - Search for **Gmail API**, open it and click **Enable**.
   - Search for **Google Drive API**, open it and click **Enable**. This powers the backup.

## Step 3: Set up the sign-in screen and allow his account

1. Open **Google Auth Platform** (in the menu, or search for "OAuth consent screen"). Click **Get started**.
2. Fill in:
   - **App name:** `Clubhouse`
   - **User support email:** your email
   - **Audience:** **External**
   - **Contact information:** your email
   Agree to the policy and click **Create**.
3. Go to **Audience**. Under **Test users** click **Add users** and enter **your stepdad's Gmail address**, plus yours if you want to test. Save.
   - Leave the publishing status as **Testing**. Only the people listed here can sign in, which keeps the app private to him. You don't need Google's app verification.
4. Optional but tidy: under **Data access → Add or remove scopes**, add `.../auth/gmail.readonly` and `.../auth/drive.appdata`, then save.

## Step 4: Create the Client ID

1. Go to **Google Auth Platform → Clients → Create client**.
2. **Application type:** **Web application**. **Name:** `Clubhouse website`.
3. Under **Authorised JavaScript origins**, click **Add URI** and add:
   - your site's origin from step 1, e.g. `https://golden-fairway-123.netlify.app`
   - `http://localhost:8080` if you want to test on this phone
4. Leave **Authorised redirect URIs** empty. Click **Create**.
5. Copy the **Client ID**. It looks like `123456789012-abc...xyz.apps.googleusercontent.com`.
6. Open `js/config.js` and paste it between the quotes:

   ```js
   export const CLIENT_ID = '123456789012-abc...xyz.apps.googleusercontent.com';
   ```

7. Upload the site again (step 1) so the live copy has the Client ID.

Google can take a few minutes to recognise a new origin. If sign-in says `origin_mismatch` or `invalid_client`, wait five minutes, then check that the origin matches the address bar exactly.

---

## First sign-in (on his phone or computer)

**On a phone or iPad, add it to the home screen first**, then open it from the new icon and sign in there. On iPhones the home-screen app keeps its own storage, separate from Safari, so this way everything ends up in the right place.

- **iPhone or iPad:** open the site in Safari and tap **Share → Add to Home Screen**.
- **Android:** open it in Chrome and tap **⋮ → Add to Home screen** (or **Install app**).

Then:

1. Press **Continue with Google** and choose his Google account.
2. Google shows **"Google hasn't verified this app"**. That's expected for a private app. Click **Continue**.
3. Tick **both** boxes:
   - *Read your email*: needed to find golf emails. It's read-only, so the app can't send, change or delete anything.
   - *See, create and delete its own configuration data in your Google Drive*: the backup. It only covers a hidden folder for this app and can't see his other files.
4. Clubhouse searches the last 6 months of email for golf. The first check takes about a minute. With a very busy inbox it reads 500 emails at a time and asks him to press **Check email** again to carry on.

> **iPhone:** if the Google window opens from the home-screen icon but doesn't come back to Clubhouse afterwards, use Clubhouse in Safari instead. Turn on **Back up to Google Drive** so the data is the same in both places.

---

## Using it

- **Check email** (top right) looks for new golf emails. It doesn't run in the background, so press it whenever he wants an update. If his sign-in has expired after an hour or so, a Google window appears briefly.
- **Coming up** lists booked tee times and competitions, in date order. Cancelled bookings are taken off automatically. Tap one to add it to Google Calendar.
- **Golf mail** has every golf email, sorted into tee times, competitions, handicap, club news, shop & offers and other. Tap an email to see the details Clubhouse found. From there he can:
  - move it to a different category (**Show under**)
  - hide it, or hide everything from that sender
  - open it in Gmail, or record a score for that round
- **Scores**: add a round with **Add round**. Only date, course and score are needed. If he enters the course rating and slope from the scorecard, Clubhouse estimates his handicap using the World Handicap System method.
- **Settings** controls what appears where:
  - which sections are on the home screen
  - which kinds of golf email are collected
  - which boxes appear on the score form
  - light or dark appearance, and larger text

If some golf emails are missed, add a word they always contain in **Settings → Golf mail → Extra search words**, such as the club's or society's name.

## Privacy and security

- **No server.** Clubhouse runs entirely in his browser. It talks only to Google.
- **Read-only.** The Gmail permission is `gmail.readonly`. The sign-in token stays in memory, lasts about an hour and is never saved.
- **Only what it needs is kept.** Clubhouse saves the golf details it finds and a short preview of each golf email. Non-golf email is never kept.
- **Safe display.** Email content is always shown as plain text, never as web code. The page's security policy blocks it from contacting anything except Google.
- **His backup stays his.** The optional backup lives in a private app folder in his own Google Drive.
- **Taking it back.** **Settings → Disconnect** removes Clubhouse's access from his Google account. He can also remove it at https://myaccount.google.com/connections.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Google sign-in isn't set up yet" | The Client ID in `js/config.js` is missing or mistyped, or the live site hasn't been updated since you added it. |
| `Error 400: origin_mismatch` | The address in the browser isn't listed under **Authorised JavaScript origins** exactly (check `https`, no trailing slash, no path). |
| `Error 403: access_denied` / "has not completed the Google verification process" | His Gmail address isn't in **Audience → Test users**. |
| "The Gmail or Drive API isn't switched on" | Enable both APIs in step 2. |
| The sign-in window doesn't appear | Allow pop-ups for the site in the browser's settings. |
| An email is in the wrong place | Open it and change **Show under**. |
