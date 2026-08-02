import { appName } from "@/lib/ui/appMeta";
import { t } from "@/lib/i18n/i18n";

/**
 * 免責事項の文面。
 *
 * **表示箇所ごとに書き分けない。** テロップとモーダルで内容が食い違うと、
 * 「どちらが本当の免責か」が争点になりうるため、文面はここだけに置く。
 */

export interface DisclaimerSection {
  /** 見出し（番号は表示側で振る） */
  title: string;
  body: string;
}

/** 見出し。 */
export function disclaimerTitle(): string {
  return t("legal.title");
}

/** 条項の並び。**辞書キーだけを持つ**ので、言語を切り替えても追従する。 */
const SECTION_IDS = ["s1", "s2", "s3", "s4"] as const;

/**
 * 免責の本文。
 *
 * **定数にしない。** アプリ名と訳を含むので、読み込み時に一度だけ
 * 組み立てると、言語を切り替えても古いままになる。
 */
export function disclaimerSections(): DisclaimerSection[] {
  return SECTION_IDS.map((id) => ({
    title: t(`legal.${id}.title`),
    body: t(`legal.${id}.body`, { app: appName() }),
  }));
}

/** 画面下部を流し続けるテロップの文面。 */
export function disclaimerTickerText(): string {
  return t("legal.ticker");
}

/** 全文をプレーンテキストで組み立てる（コピー用・テスト用）。 */
export function disclaimerPlainText(): string {
  const body = disclaimerSections().map(
    (section, i) => `${i + 1}. ${section.title}\n${section.body}`,
  ).join("\n\n");
  return `【${disclaimerTitle()}】\n\n${body}`;
}
