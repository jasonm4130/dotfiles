#!/usr/bin/env bash
set -euo pipefail

# Set zsh as default shell if not already
CURRENT_SHELL=$(dscl . -read /Users/$USER UserShell 2>/dev/null | awk '{print $2}')
if [ "$CURRENT_SHELL" != "/opt/homebrew/bin/zsh" ]; then
  echo "🐚 Setting default shell to /opt/homebrew/bin/zsh"
  if ! grep -q "^/opt/homebrew/bin/zsh$" /etc/shells 2>/dev/null; then
    echo "/opt/homebrew/bin/zsh" | sudo tee -a /etc/shells
  fi
  chsh -s /opt/homebrew/bin/zsh
fi

# Install Oh My Zsh if missing
if [ ! -d "$HOME/.oh-my-zsh" ]; then
  echo "📥 Installing Oh My Zsh..."
  RUNZSH=no KEEP_ZSHRC=yes sh -c \
    "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
fi

# Install OMZ plugins our .zshrc references
ZSH_CUSTOM="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}"
[ -d "$ZSH_CUSTOM/plugins/zsh-autosuggestions" ] || \
  git clone https://github.com/zsh-users/zsh-autosuggestions "$ZSH_CUSTOM/plugins/zsh-autosuggestions"
[ -d "$ZSH_CUSTOM/plugins/zsh-syntax-highlighting" ] || \
  git clone https://github.com/zsh-users/zsh-syntax-highlighting.git "$ZSH_CUSTOM/plugins/zsh-syntax-highlighting"

echo "✅ shell setup complete"
