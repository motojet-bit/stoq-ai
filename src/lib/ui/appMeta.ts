/**
 * アプリの表示名・版・権利表記。
 *
 * **表記は 1 か所にまとめる。** ステータスバー・About・書き出したレポートで
 * 年や名称がずれると、配布物として体裁が悪いため。
 */
export const APP_NAME = "StoQ AI Analyzer";

/** `package.json` / `tauri.conf.json` の version と揃える */
export const APP_VERSION = "0.1.0";

/** 権利表記の起点となる年 */
export const COPYRIGHT_YEAR = 2026;

export const COPYRIGHT = `© ${COPYRIGHT_YEAR} ${APP_NAME}. All Rights Reserved.`;
