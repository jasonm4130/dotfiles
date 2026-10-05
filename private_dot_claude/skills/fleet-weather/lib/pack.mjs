// Packs a frame of `{ ch, fg, bg }` cells as a Claude Code Raster's `cells`: standard
// padded base64 of `columns * rows` little-endian u32 triplets `[codePoint, fg, bg]`
// (RasterProps). Every row is padded to the full width and clipped at it.

import { DEFAULT_COLOR } from "./galleon.mjs";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Standard padded base64, written here because the hooks environment has no Node Buffer. */
export function encodeBase64(bytes) {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const w = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHABET[(w >> 18) & 63] + ALPHABET[(w >> 12) & 63] + ALPHABET[(w >> 6) & 63] + ALPHABET[w & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const w = bytes[i] << 16;
    out += ALPHABET[(w >> 18) & 63] + ALPHABET[(w >> 12) & 63] + "==";
  } else if (rest === 2) {
    const w = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += ALPHABET[(w >> 18) & 63] + ALPHABET[(w >> 12) & 63] + ALPHABET[(w >> 6) & 63] + "=";
  }
  return out;
}

/**
 * @param {{ ch: string, fg: number, bg: number }[][]} frame
 * @param {number} columns
 * @returns {{ rows: number, cells: string }}
 */
export function packCells(frame, columns) {
  const rows = Math.max(1, frame.length);
  // Little-endian on every host the engine runs on; set explicitly rather than trusting a typed-array view.
  const bytes = new Uint8Array(columns * rows * 12);
  const view = new DataView(bytes.buffer);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const cell = frame[r]?.[c];
      const offset = (r * columns + c) * 12;
      view.setUint32(offset, cell ? cell.ch.codePointAt(0) ?? 0x20 : 0x20, true);
      view.setUint32(offset + 4, cell ? cell.fg : DEFAULT_COLOR, true);
      view.setUint32(offset + 8, cell ? cell.bg : DEFAULT_COLOR, true);
    }
  }
  return { rows, cells: encodeBase64(bytes) };
}
