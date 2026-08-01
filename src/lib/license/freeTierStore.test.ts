import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "@/types";

/**
 * 無料版ストアの動き。
 * ライセンスの状態はモックして、判定と保存だけを確かめる。
 */

const invoke = vi.fn();
vi.mock("@/lib/tauri", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  isTauri: () => true,
}));

const toastError = vi.fn();
vi.mock("@/lib/ui/toastStore", () => ({
  toastError: (...args: unknown[]) => toastError(...args),
  toastSuccess: vi.fn(),
}));

let activated = false;
vi.mock("@/lib/license/licenseStore", () => ({
  getLicense: () => ({ activated, masked: null, message: "" }),
}));

function settings(freeTickers: string[]): AppSettings {
  return {
    provider: "anthropic",
    models: {},
    customProviders: [],
    secUserAgent: "",
    maxPromptTokens: 180_000,
    marketProvider: "yahoo",
    marketProviders: [],
    thresholds: {},
    license: { activated, masked: null, message: "" },
    freeTickers,
    eula: { agreed: true, agreedAtMs: 1_700_000_000_000 },
    cloud: {
      connected: false,
      clientIdConfigured: false,
      clientIdMasked: null,
      autoBackup: false,
      lastBackupMs: 0,
      scope: "https://www.googleapis.com/auth/drive.appdata",
    },
    keys: [],
  };
}

async function freshStore() {
  vi.resetModules();
  return import("@/lib/license/freeTierStore");
}

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
  toastError.mockReset();
  activated = false;
});

describe("無料版ストア", () => {
  it("設定から使用済み銘柄を取り込む", async () => {
    const store = await freshStore();
    store.syncFromSettings(settings(["AAPL", "NVDA"]));
    expect(store.getUsedTickers()).toEqual(["AAPL", "NVDA"]);
  });

  it("設定が無くても落ちない", async () => {
    const store = await freshStore();
    store.syncFromSettings(null);
    expect(store.getUsedTickers()).toEqual([]);
  });

  it("3 銘柄までは通り、4 銘柄目で止まる", async () => {
    const store = await freshStore();

    for (const ticker of ["AAPL", "NVDA", "MSFT"]) {
      expect(store.checkAccess(ticker).allowed).toBe(true);
      await store.useTicker(ticker);
    }

    expect(store.getUsedTickers()).toEqual(["AAPL", "NVDA", "MSFT"]);
    expect(store.checkAccess("GOOGL").allowed).toBe(false);
    expect(store.checkAccess("GOOGL").limitReached).toBe(true);
  });

  it("**既存の銘柄は上限後も通る**", async () => {
    const store = await freshStore();
    store.syncFromSettings(settings(["AAPL", "NVDA", "MSFT"]));

    expect(store.checkAccess("AAPL").allowed).toBe(true);
    expect(store.checkAccess("aapl").allowed).toBe(true);
  });

  it("使用のたびに Rust へ保存する（localStorage の消去で外れない）", async () => {
    const store = await freshStore();
    await store.useTicker("AAPL");

    expect(invoke).toHaveBeenCalledWith("free_tier_set", { tickers: ["AAPL"] });
  });

  it("同じ銘柄を使い直しても保存しない（無駄な書き込みを出さない）", async () => {
    const store = await freshStore();
    await store.useTicker("AAPL");
    invoke.mockClear();

    await store.useTicker("aapl");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("**ライセンスが有効なら数えない**（無制限なので記録する意味がない）", async () => {
    const store = await freshStore();
    activated = true;

    await store.useTicker("AAPL");
    expect(store.getUsedTickers()).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("ライセンス有効化で上限が即座に外れる", async () => {
    const store = await freshStore();
    store.syncFromSettings(settings(["AAPL", "NVDA", "MSFT"]));
    expect(store.checkAccess("GOOGL").allowed).toBe(false);

    activated = true;
    expect(store.checkAccess("GOOGL").allowed).toBe(true);
    expect(store.checkAccess("GOOGL").remaining).toBeNull();
  });

  it("保存に失敗しても判定は進む（画面が固まらない）", async () => {
    const store = await freshStore();
    invoke.mockRejectedValueOnce(new Error("ディスク満杯"));

    await store.useTicker("AAPL");
    expect(toastError).toHaveBeenCalled();
    expect(store.getUsedTickers()).toEqual(["AAPL"]);
  });

  it("内容が同じ同期では通知しない（無駄な再描画を出さない）", async () => {
    const store = await freshStore();
    const notify = vi.fn();
    const unsubscribe = store.subscribeFreeTier(notify);

    store.syncFromSettings(settings(["AAPL"]));
    expect(notify).toHaveBeenCalledTimes(1);

    store.syncFromSettings(settings(["AAPL"]));
    expect(notify).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});
