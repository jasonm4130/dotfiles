#!/usr/bin/env bash
# macOS system defaults. Idempotent — safe to re-run.
# Discover new defaults via: brew install plistwatch && plistwatch
set -euo pipefail

echo "🛠  Applying macOS defaults..."

# --- Dock ---
defaults write com.apple.dock autohide -bool true
defaults write com.apple.dock autohide-time-modifier -float 0.5
defaults write com.apple.dock show-recents -bool false
defaults write com.apple.dock tilesize -int 48
defaults write com.apple.dock minimize-to-application -bool true

# --- Finder ---
defaults write NSGlobalDomain AppleShowAllExtensions -bool true
defaults write com.apple.finder ShowPathbar -bool true
defaults write com.apple.finder ShowStatusBar -bool true
defaults write com.apple.finder FXPreferredViewStyle -string "Nlsv"  # list view
defaults write com.apple.desktopservices DSDontWriteNetworkStores -bool true
defaults write com.apple.desktopservices DSDontWriteUSBStores -bool true
defaults write com.apple.finder _FXShowPosixPathInTitle -bool true
defaults write com.apple.finder QuitMenuItem -bool true

# --- Keyboard ---
defaults write NSGlobalDomain ApplePressAndHoldEnabled -bool false   # use key-repeat
defaults write NSGlobalDomain KeyRepeat -int 2
defaults write NSGlobalDomain InitialKeyRepeat -int 15

# --- Trackpad ---
defaults write com.apple.driver.AppleBluetoothMultitouch.trackpad Clicking -bool true
defaults write NSGlobalDomain com.apple.mouse.tapBehavior -int 1

# --- Screenshots ---
mkdir -p "$HOME/Pictures/Screenshots"
defaults write com.apple.screencapture location -string "$HOME/Pictures/Screenshots"
defaults write com.apple.screencapture disable-shadow -bool true
defaults write com.apple.screencapture type -string "png"

# --- Global ---
defaults write NSGlobalDomain NSAutomaticQuoteSubstitutionEnabled -bool false
defaults write NSGlobalDomain NSAutomaticDashSubstitutionEnabled -bool false
defaults write NSGlobalDomain NSAutomaticPeriodSubstitutionEnabled -bool false
defaults write NSGlobalDomain NSAutomaticSpellingCorrectionEnabled -bool false

# --- Activity Monitor ---
defaults write com.apple.ActivityMonitor IconType -int 5  # CPU usage
defaults write com.apple.ActivityMonitor ShowCategory -int 0  # all processes

# --- Safari ---
# Requires Full Disk Access for the terminal in System Settings → Privacy & Security.
# Without FDA these writes fail with "Could not write domain" — non-fatal.
if defaults write com.apple.Safari IncludeDevelopMenu -bool true 2>/dev/null; then
  defaults write com.apple.Safari ShowFullURLInSmartSearchField -bool true 2>/dev/null || true
  defaults write com.apple.Safari WebKitDeveloperExtrasEnabledPreferenceKey -bool true 2>/dev/null || true
else
  echo "⚠  Skipped Safari defaults (grant terminal Full Disk Access to enable)"
fi

# Apply changes by killing affected daemons (no logout required)
killall Dock Finder SystemUIServer cfprefsd 2>/dev/null || true

echo "✅ macOS defaults applied. Some settings may require logout to fully take effect."
