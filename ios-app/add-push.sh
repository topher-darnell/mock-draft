#!/bin/bash
# Big Head GM for iPhone: add breaking-news alerts (Firebase) and make version 1.1.
# Before running: put GoogleService-Info.plist (from Firebase) in this ios-app folder. See PUSH.md.
# Run from this folder:   bash add-push.sh
set -e
cd "$(dirname "$0")"

say() { printf "\n\033[1;33m▶ %s\033[0m\n" "$1"; }
fail() { printf "\n\033[1;31m✖ %s\033[0m\n" "$1"; exit 1; }
for B in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$B" ] && eval "$("$B" shellenv)"; done

[ -f ios/App/Podfile ] || fail "Run setup-mac.sh first (the Xcode project isn't made yet)."
[ -f GoogleService-Info.plist ] || fail "GoogleService-Info.plist isn't in the ios-app folder yet. Download it from Firebase (PUSH.md, step 2) and put it here."
grep -q "com.bigheadgm.app" GoogleService-Info.plist || fail "That GoogleService-Info.plist is for a different app. In Firebase, the iOS app's bundle ID must be com.bigheadgm.app."

say "Installing the alerts part (Firebase Messaging)"
npm install @capacitor-firebase/messaging@^7 firebase@^11

say "Copying GoogleService-Info.plist into the app"
cp GoogleService-Info.plist ios/App/App/GoogleService-Info.plist

APPDEL="ios/App/App/AppDelegate.swift"
if ! grep -q "BHG_PUSH" "$APPDEL"; then
  say "Letting the app receive alerts (AppDelegate)"
  perl -0pi -e 's/(class AppDelegate: UIResponder, UIApplicationDelegate \{\n(\s*var window: UIWindow\?\n)?)/$1
    \/\/ BHG_PUSH: hand Apple'"'"'s alert registration to the Firebase plugin
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any], fetchCompletionHandler completionHandler: \@escaping (UIBackgroundFetchResult) -> Void) {
        NotificationCenter.default.post(name: Notification.Name.init("didReceiveRemoteNotification"), object: completionHandler, userInfo: userInfo)
    }
/' "$APPDEL"
  grep -q "BHG_PUSH" "$APPDEL" || fail "Couldn't add the alert code to AppDelegate.swift. Send Claude a screenshot of that file."
fi

PLIST="ios/App/App/Info.plist"
say "Info.plist settings for alerts"
/usr/libexec/PlistBuddy -c "Delete :FirebaseAppDelegateProxyEnabled" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :FirebaseAppDelegateProxyEnabled bool false" "$PLIST"
/usr/libexec/PlistBuddy -c "Delete :UIBackgroundModes" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :UIBackgroundModes array" -c "Add :UIBackgroundModes:0 string remote-notification" "$PLIST"

say "Making this version 1.1 (build 10)"
PBX="ios/App/App.xcodeproj/project.pbxproj"
sed -i '' -E 's/MARKETING_VERSION = [0-9.]+;/MARKETING_VERSION = 1.1;/g; s/CURRENT_PROJECT_VERSION = [0-9]+;/CURRENT_PROJECT_VERSION = 10;/g' "$PBX"

say "Syncing (installs Firebase into the Xcode project, takes a few minutes)"
npx cap sync ios

say "Opening Xcode"
npx cap open ios

printf "\n\033[1;32m✔ Done.\033[0m Now in Xcode, follow PUSH.md step 4: add GoogleService-Info.plist to the project and turn on Push Notifications.\n\n"
