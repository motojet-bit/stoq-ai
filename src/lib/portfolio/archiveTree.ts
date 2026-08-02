import type { ArchiveEntry } from "@/types";

/**
 * 分析履歴を「四半期本体 ＋ その配下のアドホック分析」の木にする。
 *
 * 決算の合間に出る適時開示やプレスリリースを、
 * どの四半期の期中に起きたことなのかが分かる形で並べる。
 */

export interface ArchiveNode {
  entry: ArchiveEntry;
  /** 配下のアドホック分析。古い順（起きた順に読める） */
  children: ArchiveEntry[];
}

/**
 * 親の期ラベルと枝番から表示名を作る。例: `FY2024-Q2` + 1 → `Q2-01`
 *
 * **親の期が読めないときは枝番だけ返す。** 変に組み立てて
 * 実在しない期のラベルを見せるより、番号だけのほうが誤解が無い。
 */
export function branchLabel(parentPeriod: string | null, branchNo: number | null): string {
  const no = branchNo === null ? "?" : String(branchNo).padStart(2, "0");
  const quarter = parentPeriod?.match(/Q([1-4])/i);
  return quarter ? `Q${quarter[1]}-${no}` : `-${no}`;
}

/**
 * 履歴を木に組み替える。
 *
 * **親が見つからない子は根として扱う。** 親の分析を消しても
 * 期中の記録は残す方針（DB 側も `ON DELETE` を張っていない）なので、
 * 迷子になった子を画面から消してしまうと、消えたように見える。
 */
export function buildArchiveTree(entries: ArchiveEntry[]): ArchiveNode[] {
  const ids = new Set(entries.map((e) => e.id));
  const childrenOf = new Map<string, ArchiveEntry[]>();
  const roots: ArchiveEntry[] = [];

  for (const entry of entries) {
    const parent = entry.parentId;
    if (parent && ids.has(parent)) {
      const list = childrenOf.get(parent) ?? [];
      list.push(entry);
      childrenOf.set(parent, list);
    } else {
      roots.push(entry);
    }
  }

  return roots.map((entry) => ({
    entry,
    children: (childrenOf.get(entry.id) ?? []).sort((a, b) => {
      // 枝番があればその順。無ければ保存時刻の古い順（起きた順に読める）
      if (a.branchNo !== null && b.branchNo !== null) return a.branchNo - b.branchNo;
      return a.savedAtMs - b.savedAtMs;
    }),
  }));
}

/** その銘柄で、いま親にできる四半期の分析（＝子を持たない根ではなく、根そのもの）。 */
export function parentCandidates(entries: ArchiveEntry[]): ArchiveEntry[] {
  // 自身がアドホックのものは親にしない（入れ子は 1 段に留める）
  return entries.filter((e) => e.parentId === null);
}
