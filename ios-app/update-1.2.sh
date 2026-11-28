#!/bin/bash
# Big Head GM for iPhone: version 1.2 (new logo + new app icon and splash).
# Run from this folder:   bash update-1.2.sh
set -e
cd "$(dirname "$0")"

say() { printf "\n\033[1;33m▶ %s\033[0m\n" "$1"; }
fail() { printf "\n\033[1;31m✖ %s\033[0m\n" "$1"; exit 1; }
for B in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$B" ] && eval "$("$B" shellenv)"; done

[ -f ios/App/Podfile ] || fail "Run setup-mac.sh first (the Xcode project isn't made yet)."

say "Getting the newest files"
git pull

say "Making the new app icon and splash screen"
npm run assets

say "Making this version 1.2 (build 11)"
PBX="ios/App/App.xcodeproj/project.pbxproj"
sed -i '' -E 's/MARKETING_VERSION = [0-9.]+;/MARKETING_VERSION = 1.2;/g; s/CURRENT_PROJECT_VERSION = [0-9]+;/CURRENT_PROJECT_VERSION = 11;/g' "$PBX"

say "Syncing"
npx cap sync ios

say "Opening Xcode. Next: Product → Archive → Distribute App → App Store Connect → Upload."
npx cap open ios
