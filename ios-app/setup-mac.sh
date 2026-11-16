#!/bin/bash
# Big Head GM for iPhone: one-time setup on a Mac.
# Run from this folder:   bash setup-mac.sh
# It installs the app's parts, makes the Xcode project, adds the icon and splash screen, and opens Xcode.
set -e
cd "$(dirname "$0")"

say() { printf "\n\033[1;33m▶ %s\033[0m\n" "$1"; }
fail() { printf "\n\033[1;31m✖ %s\033[0m\n" "$1"; exit 1; }

# Find Homebrew tools (brew, pod) even in a new Terminal window, now and later.
for B in /opt/homebrew/bin/brew /usr/local/bin/brew; do
  if [ -x "$B" ]; then
    eval "$("$B" shellenv)"
    grep -q "brew shellenv" ~/.zprofile 2>/dev/null || echo "eval \"\$($B shellenv)\"" >> ~/.zprofile
  fi
done

say "Checking your Mac"
command -v node >/dev/null || fail "Node isn't installed. Get the LTS version from https://nodejs.org, then run this again."
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 20 ] || fail "Node $NODE_MAJOR is too old. Install the LTS version (20 or newer) from https://nodejs.org."
[ -d /Applications/Xcode.app ] || fail "Xcode isn't installed. Get it from the Mac App Store, open it once, then run this again."
if ! xcode-select -p 2>/dev/null | grep -q "Xcode.app"; then
  say "Pointing your Mac at Xcode (it may ask for your Mac password)"
  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
fi

if ! command -v pod >/dev/null; then
  say "Installing CocoaPods (one-time helper Xcode projects need)"
  if ! command -v brew >/dev/null; then
    say "First installing Homebrew. It may ask for your Mac password (typing won't show; press Return)"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    [ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
    [ -x /usr/local/bin/brew ] && eval "$(/usr/local/bin/brew shellenv)"
  fi
  brew install cocoapods
fi

say "Installing the app's parts (takes a minute)"
npm install
# Newer npm blocks install scripts until approved; the icon maker (sharp) needs its script.
npm install-scripts approve sharp >/dev/null 2>&1 || true
npm rebuild sharp >/dev/null 2>&1 || true

# A half-made project from an earlier failed run: start it over.
if [ -d ios ] && [ ! -f ios/App/Podfile ]; then rm -rf ios; fi

if [ ! -d ios ]; then
  say "Making the Xcode project"
  npx cap add ios
fi

# Newer Xcode won't build for iOS 14 (Capacitor's default). Use iOS 17 for the app and every part.
IOS_MIN=17.0
PODFILE="ios/App/Podfile"
sed -i '' -E "s/platform :ios, '[0-9.]+'/platform :ios, '$IOS_MIN'/" "$PODFILE"
grep -q "BHG_IOS_MIN" "$PODFILE" || perl -0pi -e "s/(post_install do \|installer\|\n)/\$1  installer.pods_project.targets.each { |t| t.build_configurations.each { |c| c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '$IOS_MIN' } } # BHG_IOS_MIN\n/" "$PODFILE"
sed -i '' -E "s/IPHONEOS_DEPLOYMENT_TARGET = [0-9.]+;/IPHONEOS_DEPLOYMENT_TARGET = $IOS_MIN;/g" ios/App/App.xcodeproj/project.pbxproj

say "Adding the app icon and splash screen"
npm run assets

say "Syncing"
npx cap sync ios

PLIST="ios/App/App/Info.plist"
PBX="ios/App/App.xcodeproj/project.pbxproj"
say "Setting iPhone-only, portrait, and the export-compliance answer"
/usr/libexec/PlistBuddy -c "Delete :ITSAppUsesNonExemptEncryption" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :ITSAppUsesNonExemptEncryption bool false" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Big Head GM" "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string Big Head GM" "$PLIST"
/usr/libexec/PlistBuddy -c "Delete :UISupportedInterfaceOrientations" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :UISupportedInterfaceOrientations array" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :UISupportedInterfaceOrientations:0 string UIInterfaceOrientationPortrait" "$PLIST"
/usr/libexec/PlistBuddy -c "Delete :UIStatusBarStyle" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :UIStatusBarStyle string UIStatusBarStyleLightContent" "$PLIST"
# iOS 27 apps must launch through a "scene" (Apple's newer startup). Capacitor's template doesn't yet, so add one.
APPDEL="ios/App/App/AppDelegate.swift"
if ! grep -q "class SceneDelegate" "$APPDEL"; then
  cat >> "$APPDEL" <<'SWIFT'

// Added by setup-mac.sh: iOS 27 requires the scene-based app lifecycle.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        if let url = connectionOptions.urlContexts.first?.url {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:])
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        if let url = URLContexts.first?.url {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:])
        }
    }
}
SWIFT
fi
/usr/libexec/PlistBuddy -c "Delete :UIApplicationSceneManifest" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy \
  -c "Add :UIApplicationSceneManifest dict" \
  -c "Add :UIApplicationSceneManifest:UIApplicationSupportsMultipleScenes bool false" \
  -c "Add :UIApplicationSceneManifest:UISceneConfigurations dict" \
  -c "Add :UIApplicationSceneManifest:UISceneConfigurations:UIWindowSceneSessionRoleApplication array" \
  -c "Add :UIApplicationSceneManifest:UISceneConfigurations:UIWindowSceneSessionRoleApplication:0 dict" \
  -c "Add :UIApplicationSceneManifest:UISceneConfigurations:UIWindowSceneSessionRoleApplication:0:UISceneConfigurationName string Default Configuration" \
  -c "Add :UIApplicationSceneManifest:UISceneConfigurations:UIWindowSceneSessionRoleApplication:0:UISceneDelegateClassName string \$(PRODUCT_MODULE_NAME).SceneDelegate" \
  -c "Add :UIApplicationSceneManifest:UISceneConfigurations:UIWindowSceneSessionRoleApplication:0:UISceneStoryboardFile string Main" \
  "$PLIST"
# iPhone only, so App Store Connect doesn't ask for iPad screenshots
sed -i '' 's/TARGETED_DEVICE_FAMILY = "1,2";/TARGETED_DEVICE_FAMILY = 1;/g' "$PBX"

say "Opening Xcode"
npx cap open ios

printf "\n\033[1;32m✔ Done.\033[0m In Xcode: click App (left) → Signing & Capabilities → pick your Team. Then press ▶ to run it.\n\n"
