import { t } from "@/lib/i18n/i18n";

/**
 * 免責事項（EULA）への同意。
 *
 * **これはアプリを使える条件であって、ライセンスとは別物。**
 * 撤回してもライセンスキーは失効しない（買ったものは残る）。
 * 使えなくなるだけで、再度同意すればそのまま元に戻る。
 *
 * 文面は辞書（`eula.*`）に置く。ja / en の両方で読めるようにするため。
 */

/** 条項の識別子。**順番がそのまま表示順**になる。 */
export const EULA_CLAUSE_IDS = ["selfResponsibility", "apiBilling", "asIs"] as const;

export type EulaClauseId = (typeof EULA_CLAUSE_IDS)[number];

export interface EulaClause {
  id: EulaClauseId;
  title: string;
  body: string;
}

/** いまの言語での条項一覧。 */
export function eulaClauses(): EulaClause[] {
  return EULA_CLAUSE_IDS.map((id) => ({
    id,
    title: t(`eula.clause.${id}.title`),
    body: t(`eula.clause.${id}.body`),
  }));
}

/**
 * 同意が済むまでアプリを使わせない。
 *
 * **状態が分からないうちも塞ぐ。** 読み込み中に素通りさせると、
 * 未同意のまま一瞬でも操作できてしまう。
 */
export function isBlocked(status: { agreed: boolean } | null): boolean {
  return status === null || !status.agreed;
}

/** 同意日時の表示。未同意なら空。 */
export function agreedAtLabel(agreedAtMs: number): string {
  if (!agreedAtMs || agreedAtMs <= 0) return "";
  return new Date(agreedAtMs).toLocaleString();
}

/** 全文をプレーンテキストにする（あとから確認・コピー用）。 */
export function eulaPlainText(): string {
  const body = eulaClauses()
    .map((clause, i) => `${i + 1}. ${clause.title}\n${clause.body}`)
    .join("\n\n");
  return `【${t("eula.title")}】\n\n${body}`;
}
