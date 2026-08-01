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
  /** 日本語での表記 */
  label: string;
  /** AI へ「この言語で答えて」と伝えるときの名前（英語表記） */
  promptName: string;
  dictionary: Dictionary;
}

/** 既定の言語。訳が無いキーはここへフォールバックする。 */
export const DEFAULT_LOCALE = "ja";

export const LOCALES: LocaleDefinition[] = [
  {
    code: "ja",
    nativeLabel: "日本語",
    label: "日本語",
    promptName: "Japanese",
    dictionary: ja as Dictionary,
  },
  {
    code: "en",
    nativeLabel: "English",
    label: "英語",
    promptName: "English",
    dictionary: en as Dictionary,
  },
];

export function localeDefinition(code: string): LocaleDefinition | undefined {
  return LOCALES.find((l) => l.code === code);
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
