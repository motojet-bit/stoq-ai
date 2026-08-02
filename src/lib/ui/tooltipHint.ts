import { t } from "@/lib/i18n/i18n";
/**
 * ツールチップの表示回数と、たまに出す「切り方」の案内。
 *
 * 案内を毎回出すと本文が読みづらくなり、一度も出さないと
 * **切り方に気づかないまま煩わしさだけが残る。** 5 回に 1 回だけ添える。
 */

const STORAGE_KEY = "stockanalyzer.tooltipShowCount";

/** 何回に 1 回ヒントを出すか */
export const HINT_INTERVAL = 5;

/**
 * 切り方の案内。
 * **定数にしない**（読み込み時に固めると言語切替に追従しない）。
 */
export function offHint(): string {
  return t("tooltip.disableHint");
}

/** その回数のときヒントを出すか。1 始まりで数える。 */
export function shouldShowHint(count: number): boolean {
  if (!Number.isFinite(count) || count <= 0) return false;
  return Math.floor(count) % HINT_INTERVAL === 0;
}

/** 本文にヒントを添える（出さない回はそのまま返す）。 */
export function withHint(content: string, count: number): string {
  return shouldShowHint(count) ? `${content}\n\n${offHint()}` : content;
}

function read(): number {
  try {
    const raw = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  } catch {
    return 0;
  }
}

let count = read();

/** 表示のたびに 1 つ進め、その回の回数を返す。 */
export function countTooltipShown(): number {
  count += 1;
  try {
    localStorage.setItem(STORAGE_KEY, String(count));
  } catch {
    // 保存できなくても動作は続ける
  }
  return count;
}

export function getTooltipShownCount(): number {
  return count;
}

/** テスト用。カウンタを戻す。 */
export function resetTooltipCount(): void {
  count = 0;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 何もしない
  }
}
