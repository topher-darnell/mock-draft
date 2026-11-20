# Breaking-news alerts: setup (one time, about 30 minutes)

When a news item about a player goes on the site, every fan who has that player on My Team gets an
alert on their iPhone. It's free (Google Firebase, no user limit) and runs by itself after this setup.

You'll do 7 steps: Firebase, an Apple key, connect them, the Mac script, Xcode, a GitHub secret, then
send version 1.1 to Apple.

---

## 1. Make a Firebase project (5 min)

1. Go to **console.firebase.google.com** and sign in with any Google account (the support Gmail is fine).
2. **Create a project** → name it `Big Head GM` → turn **Google Analytics off** → Create.
3. On the project page click the **iOS+** button (Add app).
   - Apple bundle ID: `com.bigheadgm.app` (exactly)
   - App nickname: `Big Head GM`
   - App Store ID: `6835944276`
   - Click **Register app**.
4. Click **Download GoogleService-Info.plist**. Keep that file; you need it in step 4.
5. Click **Next** on the remaining screens until you're back at the project. Skip the code steps (the script does them).

## 2. Make an Apple push key (5 min)

1. Go to **developer.apple.com/account** → **Certificates, Identifiers & Profiles** → **Keys** → the blue **+**.
2. Key name: `Big Head GM push`. Tick **Apple Push Notifications service (APNs)**.
   Click **Configure/Edit** next to it and set the environment to **Sandbox & Production**.
   **Not "Sandbox"**: a sandbox-only key works from Xcode but silently fails for TestFlight and App Store users,
   and it can't be changed later (you'd have to make a new key). This happened on Nov 19–20, 2026.
3. **Continue** → **Register** → **Download**. You get a file like `AuthKey_ABC123XYZ.p8`.
   **You can only download it once.** Save it somewhere safe and don't share it.
4. Write down:
   - the **Key ID** (shown on that page, 10 letters/numbers)
   - your **Team ID** (top right of the developer site, or Membership details)

## 3. Connect the Apple key to Firebase (2 min)

1. In Firebase, click the **gear** (top left) → **Project settings** → **Cloud Messaging** tab.
2. Under **Apple app configuration** → **APNs Authentication Key** → **Upload**.
3. Pick the `.p8` file, type the Key ID and Team ID → **Upload**.

## 4. Run the script on your Mac (10 min, mostly waiting)

1. Put `GoogleService-Info.plist` from step 1 into the `ios-app` folder (next to `add-push.sh`).
2. Open **Terminal**, go into the same `mock-draft/ios-app` folder you used for `setup-mac.sh`
   (tip: type `cd ` with a space, then drag the `ios-app` folder from Finder into Terminal and press Return), then run:

   ```
   git pull
   bash add-push.sh
   ```

   It installs the alerts part, sets the version to **1.1**, and opens Xcode.

## 5. Two things in Xcode (3 min)

1. **Add the Firebase file:** menu **File → Add Files to "App"…** → open `ios-app/ios/App/App/` →
   pick **GoogleService-Info.plist** → make sure **Target: App** is ticked → **Add**.
   (If Xcode says it's already there, that's fine.)
2. **Turn on push:** click **App** (blue icon, top left) → **Signing & Capabilities** →
   **+ Capability** → double-click **Push Notifications**.
   Then **+ Capability** again → **Background Modes** → tick **Remote notifications**.
3. **Test on your iPhone:** plug it in, pick it at the top, press **▶**.
   In the app: **My Team** → add a few players → turn on **Breaking news on your players** → **Allow**.

## 6. Let the site send alerts (3 min)

1. In Firebase: **gear → Project settings → Service accounts** → **Generate new private key** → **Generate key**.
   A `.json` file downloads. It's a password: don't email it or paste it in a chat (not even to Claude).
2. Go to **github.com/topher-darnell/mock-draft** → **Settings** → **Secrets and variables** → **Actions**
   → **New repository secret**.
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Secret: open the `.json` file in TextEdit, copy **everything**, and paste it here.
   - **Add secret**.
3. **Send yourself a test:** on GitHub, **Actions** tab → **Phone alerts** (left) → **Run workflow**.
   Title `Test`, message `Alerts work`, then **Run workflow**. Your iPhone (from step 5) should buzz in under a minute.

After this, alerts go out by themselves: every new item on the News page about a player alerts fans who
have him. To send everyone a message (a big trade, a new feature), use **Run workflow** again.

## 7. Send version 1.1 to Apple

1. In Xcode: pick **Any iOS Device (arm64)** at the top → **Product → Archive** → **Distribute App** → **App Store Connect** → **Upload**.
2. In **App Store Connect** → your app → the **+** next to iOS App (left) → **1.1**.
3. **What's New in This Version:** see STORE.md (version 1.1 section). You can also add the App Preview video here.
4. Pick the new **build** (1.1 (10)), then **App Privacy** → update it as STORE.md says.
5. **Add for Review** → **Submit**. In the review notes, paste the 1.1 note from STORE.md.

---

### If something goes wrong

- **The switch doesn't show in the app:** it only appears in version 1.1 (built after step 4), with players on My Team.
- **No test alert:** check the Actions run on GitHub (click it to see the log). "Not sending (… no FIREBASE_SERVICE_ACCOUNT)"
  means step 6 didn't save. A red "FAILED 401/403" means the key was pasted wrong. If it says "sent" but no alert came,
  re-check step 3 (the Apple key in Firebase) and step 5.2 (Push Notifications capability).
- **The app crashes on launch after step 4:** send Claude a screenshot of the error in Xcode.
