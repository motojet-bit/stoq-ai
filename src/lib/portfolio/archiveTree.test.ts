import { describe, expect, it } from "vitest";
import {
  branchLabel,
  buildArchiveTree,
  parentCandidates,
} from "@/lib/portfolio/archiveTree";
import type { ArchiveEntry } from "@/types";

const entry = (patch: Partial<ArchiveEntry> & { id: string }): ArchiveEntry => ({
  ticker: "AAPL",
  provider: null,
  model: null,
  averageScore: null,
  periodLabel: null,
  record: "{}",
  parentId: null,
  branchNo: null,
  savedAtMs: 0,
  ...patch,
});

describe("枝番の表示名", () => {
  it("親の期から Q2-01 を作る", () => {
    expect(branchLabel("FY2024-Q2", 1)).toBe("Q2-01");
    expect(branchLabel("FY2024-Q2", 12)).toBe("Q2-12");
  });

  it("**親の期が読めないときは番号だけ**（実在しない期を見せない）", () => {
    expect(branchLabel(null, 3)).toBe("-03");
    expect(branchLabel("2024年12月期", 3)).toBe("-03");
  });

  it("枝番が無ければ ? を出す", () => {
    expect(branchLabel("FY2024-Q2", null)).toBe("Q2-?");
  });
});

describe("履歴を木にする", () => {
  it("親の下に子をぶら下げる", () => {
    const tree = buildArchiveTree([
      entry({ id: "q2", periodLabel: "FY2024-Q2" }),
      entry({ id: "a", parentId: "q2", branchNo: 1 }),
      entry({ id: "b", parentId: "q2", branchNo: 2 }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].entry.id).toBe("q2");
    expect(tree[0].children.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("**枝番の順に並べる**（起きた順に読める）", () => {
    const tree = buildArchiveTree([
      entry({ id: "q2" }),
      entry({ id: "b", parentId: "q2", branchNo: 2 }),
      entry({ id: "a", parentId: "q2", branchNo: 1 }),
    ]);
    expect(tree[0].children.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("枝番が無ければ保存時刻の古い順", () => {
    const tree = buildArchiveTree([
      entry({ id: "q2" }),
      entry({ id: "late", parentId: "q2", savedAtMs: 200 }),
      entry({ id: "early", parentId: "q2", savedAtMs: 100 }),
    ]);
    expect(tree[0].children.map((c) => c.id)).toEqual(["early", "late"]);
  });

  it("**親が消えた子は根として残す**（画面から消えたように見せない）", () => {
    const tree = buildArchiveTree([entry({ id: "orphan", parentId: "gone", branchNo: 1 })]);
    expect(tree).toHaveLength(1);
    expect(tree[0].entry.id).toBe("orphan");
    expect(tree[0].children).toEqual([]);
  });

  it("親子が無ければ全部が根", () => {
    const tree = buildArchiveTree([entry({ id: "a" }), entry({ id: "b" })]);
    expect(tree.map((n) => n.entry.id)).toEqual(["a", "b"]);
    expect(tree.every((n) => n.children.length === 0)).toBe(true);
  });

  it("空でも落ちない", () => {
    expect(buildArchiveTree([])).toEqual([]);
  });
});

describe("親にできる候補", () => {
  it("**アドホック分析は親にしない**（入れ子は 1 段に留める）", () => {
    const list = parentCandidates([
      entry({ id: "q2" }),
      entry({ id: "adhoc", parentId: "q2", branchNo: 1 }),
    ]);
    expect(list.map((e) => e.id)).toEqual(["q2"]);
  });
});
