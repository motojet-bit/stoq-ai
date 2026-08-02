import ja from "@/locales/ja.json";
import en from "@/locales/en.json";

/**
 * 対応言語の登録簿。
 *
 * **言語を増やす手順はここ 1 か所だけ。**
 * 1. `src/locales/<code>.json` を追加する（`ja.json` をコピーして訳す）
 * 2. この配列に 1 行足す
 *
 * それ以外のコードは触らなくてよい。将来の追加候補は
 * 繁体字 `zh-TW` / 簡体字 `zh-CN` / タイ語 `th` / フランス語 `fr` /
 * ドイツ語 `de` / ロシア語 `ru` / ポーランド語 `pl` / チェコ語 `cs`。
 */

export type Dictionary = Record<string, string>;

export interface LocaleDefinition {
  /** BCP 47 の言語タグ */
  code: string;
  /** その言語での表記（設定画面に出す） */
  nativeLabel: string;
  /** 一覧に出すときの表示名（辞書キー） */
  labelKey: string;
  /** AI へ「この言語で答えて」と伝えるときの名前（英語表記） */
  promptName: string;
  dictionary: Dictionary;
}

/**
 * 既定の言語。訳が無いキーはここへフォールバックする。
 *
 * **英語を原文（Source of Truth）とする。**
 * 訳し漏れたキーが日本語で出ると、海外の利用者には読めない文字が
 * 突然現れることになる。英語へ落とせば、少なくとも意味は伝わる。
 */
export const DEFAULT_LOCALE = "en";

export const LOCALES: LocaleDefinition[] = [
  {
    code: "ja",
    nativeLabel: "日本語",
    labelKey: "locale.label.ja",
    promptName: "Japanese",
    dictionary: ja as Dictionary,
  },
  {
    code: "en",
    nativeLabel: "English",
    labelKey: "locale.label.en",
    promptName: "English",
    dictionary: en as Dictionary,
  },
];

export function localeDefinition(code: string): LocaleDefinition | undefined {
  return LOCALES.find((l) => l.code === code);
}

/**
 * まだ一度も選ばれていないときの言語を、OS（WebView）の設定から決める。
 *
 * **`normalizeLocale` とは falls back の向きが逆。** 保存値の正規化では
 * 未知の値を既定（日本語）へ寄せるが、初回の判定では
 * **日本語環境だけを `ja` にし、それ以外は `en`** にする。
 * ドイツ語環境の利用者に日本語の画面を出しても読めないため。
 */
export function detectLocale(value: unknown): string {
  if (typeof value !== "string") return "en";

  const base = value.trim().split("-")[0].toLowerCase();
  if (base === "ja") return "ja";
  return localeDefinition(base) ? base : "en";
}

/** 保存値やブラウザの設定が何であっても、必ず対応済みの言語コードを返す。 */
export function normalizeLocale(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_LOCALE;

  const trimmed = value.trim();
  if (localeDefinition(trimmed)) return trimmed;

  // `en-US` のような地域つきでも、言語部分が一致すれば拾う
  const base = trimmed.split("-")[0].toLowerCase();
  const hit = LOCALES.find((l) => l.code.split("-")[0].toLowerCase() === base);
  return hit?.code ?? DEFAULT_LOCALE;
}
