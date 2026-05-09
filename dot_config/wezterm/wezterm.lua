local wezterm = require 'wezterm'
local config = wezterm.config_builder()

-- Font (Monaspace Neon, matches Zed)
config.font = wezterm.font_with_fallback {
  { family = 'Monaspace Neon',     harfbuzz_features = { 'calt', 'liga', 'ss01', 'ss02', 'ss03' } },
  { family = 'Symbols Nerd Font Mono' },
}
config.font_size = 14.0
config.line_height = 1.3

-- Theme (matches Zed's Monokai Pro (CE))
config.color_scheme = 'Monokai Pro (Gogh)'

-- Window chrome
config.window_decorations = 'RESIZE'
config.window_background_opacity = 0.97
config.macos_window_background_blur = 20
config.window_padding = { left = 12, right = 12, top = 8, bottom = 4 }
config.hide_tab_bar_if_only_one_tab = true
config.use_fancy_tab_bar = false

-- Behavior
config.scrollback_lines = 50000
config.audible_bell = 'Disabled'
config.adjust_window_size_when_changing_font_size = false
config.send_composed_key_when_left_alt_is_pressed = true   -- option-key for chars
config.send_composed_key_when_right_alt_is_pressed = false -- right-option as Meta

-- Keybindings (tmux-style splits, command palette)
local act = wezterm.action
config.keys = {
  { key = 'd', mods = 'CMD',       action = act.SplitHorizontal { domain = 'CurrentPaneDomain' } },
  { key = 'd', mods = 'CMD|SHIFT', action = act.SplitVertical   { domain = 'CurrentPaneDomain' } },
  { key = 'w', mods = 'CMD',       action = act.CloseCurrentPane { confirm = true } },
  { key = 'h', mods = 'CMD|ALT',   action = act.ActivatePaneDirection 'Left' },
  { key = 'l', mods = 'CMD|ALT',   action = act.ActivatePaneDirection 'Right' },
  { key = 'k', mods = 'CMD|ALT',   action = act.ActivatePaneDirection 'Up' },
  { key = 'j', mods = 'CMD|ALT',   action = act.ActivatePaneDirection 'Down' },
  { key = ']', mods = 'CMD',       action = act.ActivatePaneDirection 'Next' },
  { key = '[', mods = 'CMD',       action = act.ActivatePaneDirection 'Prev' },
  { key = 'p', mods = 'CMD|SHIFT', action = act.ActivateCommandPalette },
}

return config
