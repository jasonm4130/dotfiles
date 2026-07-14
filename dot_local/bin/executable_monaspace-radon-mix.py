#!/usr/bin/env -S uv run --quiet --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["fonttools>=4.50"]
# ///
"""Build the "Monaspace Neon Radon" family: Neon (Nerd Font) uprights with
Radon (Nerd Font) italics occupying the italic slots. Editors that only
support per-scope font_style — Zed — then render italic scopes (comments in
Monokai Pro CE) in Radon handwriting while code stays Neon.

The Monaspice sources already carry correct style bits (fsSelection/macStyle),
so this is a pure name-table rewrite: no glyph or metric changes.

Usage: monaspace-radon-mix.py <output-dir>
Regenerate after the font-monaspice-nerd-font cask updates, then chezmoi apply.
"""
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

SRC = Path.home() / "Library" / "Fonts"
FAMILY = "Monaspace Neon Radon"
PS_FAMILY = "MonaspaceNeonRadon"

#          subfamily      source (installed by font-monaspice-nerd-font cask)
MEMBERS = {
    "Regular": "MonaspiceNeNerdFont-Regular.otf",
    "Bold": "MonaspiceNeNerdFont-Bold.otf",
    "Italic": "MonaspiceRnNerdFont-Italic.otf",
    "Bold Italic": "MonaspiceRnNerdFont-BoldItalic.otf",
}


def rename(font: TTFont, subfamily: str) -> None:
    ps_style = subfamily.replace(" ", "")
    full = f"{FAMILY} {subfamily}"
    values = {
        1: FAMILY,
        2: subfamily,
        3: f"{full};chezmoi-mixed",
        4: full,
        6: f"{PS_FAMILY}-{ps_style}",
    }
    name = font["name"]
    for name_id, value in values.items():
        name.setName(value, name_id, 3, 1, 0x409)  # Windows/Unicode
        name.setName(value, name_id, 1, 0, 0)  # Macintosh/Roman
    # Drop typographic family/subfamily so the four RIBBI members above are
    # the whole family — leftovers would keep grouping under "MonaspiceNe".
    for name_id in (16, 17):
        name.removeNames(nameID=name_id)
    # The CFF table carries its own PostScript identity; left untouched it
    # still claims the original Monaspice name, and macOS dedupes fonts by
    # PostScript name — the member loses to the original and never matches.
    if "CFF " in font:
        cff = font["CFF "].cff
        top_dict = cff[cff.fontNames[0]]
        cff.fontNames[0] = values[6]
        top_dict.FamilyName = FAMILY
        top_dict.FullName = values[4]


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    out_dir = Path(sys.argv[1])
    out_dir.mkdir(parents=True, exist_ok=True)
    for subfamily, src_name in MEMBERS.items():
        src = SRC / src_name
        if not src.exists():
            print(f"missing source font: {src} — is font-monaspice-nerd-font installed?")
            return 1
        font = TTFont(str(src))
        rename(font, subfamily)
        dest = out_dir / f"{PS_FAMILY}-{subfamily.replace(' ', '')}.otf"
        font.save(str(dest))
        fs = font["OS/2"].fsSelection
        print(f"{dest.name}: italic-bit={'on' if fs & 0x01 else 'off'} bold-bit={'on' if fs & 0x20 else 'off'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
