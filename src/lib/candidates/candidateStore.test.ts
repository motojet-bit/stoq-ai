import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CandidateStock } from "@/types";

/**
 * 削除操作（✕ ボタン / 右クリックメニューの「削除」）は
 * どちらも `removeCandidate` を通る。ここが正しく Rust 側を呼び、
 * 返ってきた一覧に差し替わることを確認する。
 */

const invoke = vi.fn();

vi.mock("@/lib/tauri", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  isTauri: () => true,
}));

const toastError = vi.fn();
vi.mock("@/lib/ui/toastStore", () => ({
  toastError: (...args: unknown[]) => toastError(...args),
}));

function stock(id: string, ticker: string): CandidateStock {
  return { id, ticker, name: "", genre: "", createdAtMs: 0 };
}

async function freshStore() {
  vi.resetModules();
  return import("@/lib/candidates/candidateStore");
}

beforeEach(() => {
  invoke.mockReset();
  toastError.mockReset();
});

describe("検討中銘柄ストア", () => {
  it("読み込むと一覧が入る", async () => {
    const store = await freshStore();
    invoke.mockResolvedValueOnce([stock("c1", "AAPL"), stock("c2", "NVDA")]);

    await store.loadCandidates();

    expect(invoke).toHaveBeenCalledWith("candidates_list");
    expect(store.getCandidates().map((c) => c.ticker)).toEqual(["AAPL", "NVDA"]);
  });

  it("✕ / 右クリックの削除で対象 ID を渡し、返った一覧に差し替える", async () => {
    const store = await freshStore();
    invoke.mockResolvedValueOnce([stock("c1", "AAPL"), stock("c2", "NVDA")]);
    await store.loadCandidates();

    invoke.mockResolvedValueOnce([stock("c2", "NVDA")]);
    await store.removeCandidate("c1");

    expect(invoke).toHaveBeenLastCalledWith("candidates_remove", { id: "c1" });
    expect(store.getCandidates().map((c) => c.ticker)).toEqual(["NVDA"]);
  });

  it("削除に失敗しても例外を投げずに通知だけ出す（画面が固まらない）", async () => {
    const store = await freshStore();
    invoke.mockRejectedValueOnce(new Error("DB ロック"));

    await expect(store.removeCandidate("c1")).resolves.toBeUndefined();
    expect(toastError).toHaveBeenCalled();
    expect(store.getCandidates()).toEqual([]);
  });

  it("空配列の追加では Rust を呼ばない", async () => {
    const store = await freshStore();
    await store.addCandidates([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("追加はパース済みの行をそのまま渡す", async () => {
    const store = await freshStore();
    invoke.mockResolvedValueOnce([stock("c1", "AAPL")]);

    await store.addCandidates([{ ticker: "AAPL", name: "Apple", genre: "Phone" }]);

    expect(invoke).toHaveBeenCalledWith("candidates_add", {
      items: [{ ticker: "AAPL", name: "Apple", genre: "Phone" }],
    });
  });

  it("追加の失敗は呼び出し側へ伝える（モーダルを閉じないため）", async () => {
    const store = await freshStore();
    invoke.mockRejectedValueOnce(new Error("失敗"));

    await expect(
      store.addCandidates([{ ticker: "AAPL", name: "", genre: "" }]),
    ).rejects.toThrow();
    expect(toastError).toHaveBeenCalled();
  });

  it("一括クリアも一覧を差し替える", async () => {
    const store = await freshStore();
    invoke.mockResolvedValueOnce([]);

    await store.clearCandidates();

    expect(invoke).toHaveBeenCalledWith("candidates_clear");
    expect(store.getCandidates()).toEqual([]);
  });
});
