import type { Portfolio } from "@/types";

/**
 * 「分析結果をどのリストに保存するか」の選択ロジック。
 *
 * UI に依存しない純粋な処理にして、
 * **すでに入っているリストを二重登録しない**などの判断をテストで固定する。
 */

export interface SaveTargetRow {
  id: string;
  name: string;
  /** すでにこの銘柄が入っているか */
  alreadyIn: boolean;
  checked: boolean;
}

/**
 * 保存先の候補を組み立てる。
 * **すでに入っているリストは最初からチェック済み**にして、外す操作もできるようにする。
 */
export function buildTargets(
  portfolios: Portfolio[],
  ticker: string,
  selected: string[] | null,
): SaveTargetRow[] {
  const symbol = ticker.trim().toUpperCase();

  return portfolios.map((portfolio) => {
    const alreadyIn = portfolio.tickers.some((t) => t.toUpperCase() === symbol);
    return {
      id: portfolio.id,
      name: portfolio.name,
      alreadyIn,
      // 初回（selected が null）は現状のまま、以降はユーザーの操作を優先
      checked: selected === null ? alreadyIn : selected.includes(portfolio.id),
    };
  });
}

/** チェックの切り替え。 */
export function toggleTarget(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
}

export interface SavePlan {
  /** 新しく追加するリスト */
  add: string[];
  /** チェックを外したので取り除くリスト */
  remove: string[];
}

/**
 * 現在の状態と選択から、実際に必要な操作だけを取り出す。
 *
 * **変わっていないリストには触らない。** 無駄な書き込みで
 * 追加日時が更新され、並び順が動くのを防ぐ。
 */
export function buildSavePlan(rows: SaveTargetRow[]): SavePlan {
  return {
    add: rows.filter((r) => r.checked && !r.alreadyIn).map((r) => r.id),
    remove: rows.filter((r) => !r.checked && r.alreadyIn).map((r) => r.id),
  };
}

/** 保存ボタンを押せるか（何も変わらないなら押させない）。 */
export function hasChanges(plan: SavePlan): boolean {
  return plan.add.length > 0 || plan.remove.length > 0;
}

/** 保存後に出す一言。 */
export function saveSummary(ticker: string, plan: SavePlan): string {
  const parts: string[] = [];
  if (plan.add.length > 0) parts.push(`${plan.add.length} 件のリストに追加`);
  if (plan.remove.length > 0) parts.push(`${plan.remove.length} 件から削除`);
  if (parts.length === 0) return "変更はありません";
  return `${ticker.toUpperCase()} を${parts.join("・")}しました`;
}
