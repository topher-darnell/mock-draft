# Big Head GM for iPhone

The App Store app is a native iPhone shell (Capacitor) around bigheadgm.com. It loads the live site, so **every site update shows up in the app right away, with no new App Store review**. You only resubmit when this folder changes (icon, app name, native features).

What the app adds on top of the site:
- A daily reminder for the new Fantasle and Prospectle (switch on the Games page). It's scheduled on the phone, so there's no server.
- The iOS share sheet for game results, and light haptic taps on buttons.
- Its own offline screen, splash screen and icon.
- Inside the app, the site hides its "get the app / add to home screen" bits.

## What's in this folder

| File | What it is |
|---|---|
| `setup-mac.sh` | Run once. Installs everything, makes the Xcode project, adds the icon and splash, opens Xcode. |
| `capacitor.config.json` | App name, bundle ID (`com.bigheadgm.app`), colors, and the site it loads. |
| `www/offline.html` | The screen people see with no internet. |
| `resources/` | 1024 × 1024 icon and the splash screen. To change the icon, replace `icon-only.png` (1024 × 1024, no transparency) and run `npm run assets`. |
| `screenshots/` | The 7 App Store screenshots (1320 × 2868). |
| `STORE.md` | Every word App Store Connect asks for, ready to paste. |

## Step by step

### 1. Join the Apple Developer Program (once, $99 a year)
Go to https://developer.apple.com/programs/enroll/ and sign in with your Apple ID. Enroll as an **Individual**. Approval usually takes a day or two. While you wait, do steps 2–4.

### 2. Install the tools on your Mac (once)
- **Xcode**: free in the Mac App Store. It's big, so give it a while. Open it once and let it finish installing its parts.
- **Node.js**: the LTS version from https://nodejs.org.

### 3. Get this folder on your Mac
In Terminal:
```bash
git clone https://github.com/topher-darnell/mock-draft.git
cd mock-draft/ios-app
```
(Already have it? `cd` into it and run `git pull`.)

### 4. Run the setup
```bash
bash setup-mac.sh
```
When Xcode opens, pick an **iPhone 16 Pro** simulator at the top and press **▶**. The app should open on the simulator showing Big Head GM.

### 5. Sign it (after Apple approves you)
In Xcode: click **App** in the left sidebar → **Signing & Capabilities** → check **Automatically manage signing** → choose your name under **Team**.
To try it on your own iPhone: plug it in, pick it at the top, press **▶**. (The first time, your iPhone asks you to turn on Developer Mode in Settings → Privacy & Security.)

### 6. Create the app in App Store Connect
https://appstoreconnect.apple.com → **Apps** → **+** → **New App**:
- Platform: iOS
- Name: Big Head GM
- Language: English (U.S.)
- Bundle ID: `com.bigheadgm.app`
- SKU: `bigheadgm-ios-1`

Then fill in the pages using **STORE.md**: the listing, screenshots, privacy answers, age rating and review notes.

### 7. Upload the build
In Xcode: at the top, set the device to **Any iOS Device (arm64)** → menu **Product → Archive**. When it finishes, the Organizer window opens: **Distribute App → App Store Connect → Upload**, and click through.
After 10–30 minutes the build appears in App Store Connect under **TestFlight**. Go back to the **1.0** page, scroll to **Build**, click **+** and pick it.

### 8. Submit
Click **Add for Review → Submit**. Reviews usually take 1–2 days. Apple emails you either way.

## Updating the app later
- **Site changes** (scores, pages, games): nothing to do. The app shows them right away.
- **App changes** (icon, native features): in Xcode, raise the **Build** number (App → General), then Archive and upload again (steps 7–8).

## If Apple pushes back
- **"4.2 Minimum Functionality"** (they think it's just a website): reply in Resolution Center pointing to the daily reminders, the share sheet, the offline screen and the haptics, which are in the review notes. If they still say no, the next step is real push notifications (game alerts), which need an Apple push key and a small server. Ask Claude to add them.
- **Anything about the support email**: make sure the support page shows a real email you check.
