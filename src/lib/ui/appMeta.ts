import { t } from "@/lib/i18n/i18n";

/**
 * アプリの表示名・版・権利表記。
 *
 * **表示名は言語で変わる。** 日本語では「株究 - StoQ AI Analyzer」、
 * 英語では「StoQ AI Analyzer」。したがって名称は定数ではなく
 * **辞書（`app.name` / `app.copyright`）が唯一の出どころ**で、
 * ここはその読み出し口だけを持つ。
 *
 * 一方で `PRODUCT_NAME` は言語で変わらない。実行ファイル名・
 * インストーラー名・ウィンドウの既定タイトルに使うため、
 * ASCII の基盤名で固定する。
 */

/** 言語によらない基盤名。`tauri.conf.json` の `productName` と一致させる。 */
export const PRODUCT_NAME = "StoQ AI Analyzer";

/** `package.json` / `tauri.conf.json` の version と揃える */
export const APP_VERSION = "0.1.0";

/** 権利表記の起点となる年 */
export const COPYRIGHT_YEAR = 2026;

/** いまの言語での表示名。 */
export function appName(): string {
  return t("app.name");
}

/** いまの言語での権利表記。 */
export function appCopyright(): string {
  return t("app.copyright");
}

/**
 * メニューバーのロゴは冒頭だけ色を変えて出す。
 *
 * **2 つをそのまま連結すると `app.name` になる**こと（区切りの空白も
 * `app.nameRest` 側が持つ）を `appMeta.test.ts` で固定している。
 * 表示側で `"株究"` と直書きすると、名称を変えたときにロゴだけ旧名が残る。
 */
export function appNameAccent(): string {
  return t("app.nameAccent");
}

export function appNameRest(): string {
  return t("app.nameRest");
}
