import { useSyncExternalStore } from "react";
import {
  DEFAULT_LOCALE,
  detectLocale,
  localeDefinition,
  LOCALES,
  normalizeLocale,
  type Dictionary,
} from "@/lib/i18n/locales";
import { invoke, isTauri } from "@/lib/tauri";

/**
 * 画面表示の言語。
 *
 * 外部ライブラリを入れずに自前で持つ。必要なのは
 * **辞書引き・フォールバック・変数の差し込み**の 3 つだけで、
 * i18n フレームワークを足すとバンドルが増えるわりに得るものが少ないため。
 */

const STORAGE_KEY = "stockanalyzer.locale";

export type TranslateVars = Record<string, string | number>;

/**
 * 辞書を引く。
 *
 * **訳が無ければ既定言語（日本語）へ、それも無ければキーをそのまま返す。**
 * 空文字を返すと画面から文字が消えて原因が分からなくなるため。
 */
export function translate(
  dictionary: Dictionary,
  fallback: Dictionary,
  key: string,
  vars?: TranslateVars,
): string {
  const template = dictionary[key] ?? fallback[key] ?? key;
  return interpolate(template, vars);
}

/** `{{name}}` を差し替える。値が無いプレースホルダはそのまま残す。 */
export function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

function read(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return normalizeLocale(stored);
    // 初回は OS（WebView）の設定で決める。日本語環境なら ja、それ以外は en
    return detectLocale(navigator.language);
  } catch {
    return DEFAULT_LOCALE;
  }
}

let locale = read();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 購読を外から張れるようにする（React の外・テスト用）。 */
export const subscribeLocale = subscribe;

export function getLocale(): string {
  return locale;
}

export function setLocale(next: string): void {
  const normalized = normalizeLocale(next);
  // 変わっていないなら再描画を起こさない
  if (normalized === locale) return;

  locale = normalized;
  try {
    localStorage.setItem(STORAGE_KEY, normalized);
  } catch {
    // 保存できなくても動作は続ける
  }
  // <html lang> も合わせる（読み上げ・フォント選択のため）
  try {
    document.documentElement.lang = normalized;
  } catch {
    // 何もしない
  }
  syncWindowTitle();
  emit();
}

/**
 * ウィンドウのタイトルバーを、いまの言語の表示名に合わせる。
 *
 * **Rust 側へ委ねる。** Window API を WebView から直接叩くには
 * capability の設定が要るうえ、このアプリは「OS に触る操作は Rust 側」で
 * 統一している。失敗しても画面は動くので握りつぶす。
 */
export function syncWindowTitle(): void {
  if (!isTauri()) return;
  const title = t("app.name");
  void invoke("window_set_title", { title }).catch(() => {
    // タイトルが変わらないだけなので、利用は続けられる
  });
}

/** 起動時に `<html lang>` とウィンドウタイトルを合わせる。 */
export function initLocale(): void {
  try {
    document.documentElement.lang = locale;
  } catch {
    // 何もしない
  }
  syncWindowTitle();
}

function dictionaryOf(code: string): Dictionary {
  return localeDefinition(code)?.dictionary ?? {};
}

/** React の外から引く（ストアやプロンプト組み立て用）。 */
export function t(key: string, vars?: TranslateVars): string {
  return translate(dictionaryOf(locale), dictionaryOf(DEFAULT_LOCALE), key, vars);
}

export function useLocale(): string {
  return useSyncExternalStore(
    subscribe,
    () => locale,
    () => locale,
  );
}

/** コンポーネントから使う翻訳関数。言語が変わると再描画される。 */
export function useT(): (key: string, vars?: TranslateVars) => string {
  const current = useLocale();
  const dictionary = dictionaryOf(current);
  const fallback = dictionaryOf(DEFAULT_LOCALE);
  return (key, vars) => translate(dictionary, fallback, key, vars);
}

/** 設定画面に出す選択肢。 */
export function localeOptions(): { code: string; label: string }[] {
  return LOCALES.map((l) => ({ code: l.code, label: l.nativeLabel }));
}

/** AI に「この言語で答えて」と伝えるための名前。 */
export function promptLanguageName(code: string = locale): string {
  return localeDefinition(normalizeLocale(code))?.promptName ?? "Japanese";
}
