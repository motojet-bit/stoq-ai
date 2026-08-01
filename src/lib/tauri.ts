/**
 * Tauri API の薄いラッパ。
 *
 * `npm run dev`（ブラウザ）でも画面が壊れないよう、Tauri 環境かどうかを判定できるようにする。
 */
export { Channel, invoke } from "@tauri-apps/api/core";

/** Tauri のウィンドウ内で動作しているか。ブラウザ単体なら false。 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
