import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EulaStatus } from "@/types";

/**
 * 免責同意ストア。
 * Rust 側はモックして、**同意・撤回でアプリのロック状態がどう変わるか**を確かめる。
 */

const invoke = vi.fn();
let tauri = true;
vi.mock("@/lib/tauri", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  isTauri: () => tauri,
}));

const toastError = vi.fn();
vi.mock("@/lib/ui/toastStore", () => ({
  toastError: (...args: unknown[]) => toastError(...args),
  toastSuccess: vi.fn(),
}));

const AGREED: EulaStatus = { agreed: true, agreedAtMs: 1_700_000_000_000 };
const NOT_AGREED: EulaStatus = { agreed: false, agreedAtMs: 0 };

async function freshStore() {
  vi.resetModules();
  return import("@/lib/legal/eulaStore");
}

beforeEach(() => {
  invoke.mockReset();
  toastError.mockReset();
  tauri = true;
});

describe("初期状態", () => {
  it("**確認できるまでは未確認（null）**", async () => {
    const store = await freshStore();
    expect(store.getEulaStatus()).toBeNull();
  });

  it("未確認のうちはアプリを塞ぐ", async () => {
    const store = await freshStore();
    const { isBlocked } = await import("@/lib/legal/eula");
    expect(isBlocked(store.getEulaStatus())).toBe(true);
  });
});

describe("読み込み", () => {
  it("**未同意なら塞いだまま**", async () => {
    const store = await freshStore();
    invoke.mockResolvedValue(NOT_AGREED);

    await store.loadEula();
    expect(invoke).toHaveBeenCalledWith("eula_status");
    expect(store.getEulaStatus()).toEqual(NOT_AGREED);
  });

  it("同意済みなら通す", async () => {
    const store = await freshStore();
    invoke.mockResolvedValue(AGREED);

    await store.loadEula();
    expect(store.getEulaStatus()?.agreed).toBe(true);
  });

  it("設定の読み込み結果からも取り込める", async () => {
    const store = await freshStore();
    store.syncFromSettings(AGREED);
    expect(store.getEulaStatus()?.agreed).toBe(true);
  });

  it("設定が無くても落ちない", async () => {
    const store = await freshStore();
    store.syncFromSettings(null);
    store.syncFromSettings(undefined);
    expect(store.getEulaStatus()).toBeNull();
  });

  it("**確認に失敗したら塞いだままにする**（素通りさせない）", async () => {
    const store = await freshStore();
    invoke.mockRejectedValue(new Error("設定を読めません"));

    await store.loadEula();
    expect(toastError).toHaveBeenCalled();
    expect(store.getEulaStatus()).toBeNull();
  });
});

describe("同意", () => {
  it("Rust へ保存して通す", async () => {
    const store = await freshStore();
    invoke.mockResolvedValue(AGREED);

    expect(await store.agreeEula()).toBe(true);
    expect(invoke).toHaveBeenCalledWith("eula_agree");
    expect(store.getEulaStatus()?.agreed).toBe(true);
    expect(store.getEulaStatus()?.agreedAtMs).toBe(1_700_000_000_000);
  });

  it("**保存に失敗したら同意扱いにしない**", async () => {
    const store = await freshStore();
    invoke.mockRejectedValue(new Error("ディスク満杯"));

    expect(await store.agreeEula()).toBe(false);
    expect(store.getEulaStatus()).toBeNull();
    expect(toastError).toHaveBeenCalled();
  });
});

describe("撤回", () => {
  it("**撤回するとその場でアプリが塞がる**", async () => {
    const store = await freshStore();
    invoke.mockResolvedValueOnce(AGREED);
    await store.loadEula();
    expect(store.getEulaStatus()?.agreed).toBe(true);

    invoke.mockResolvedValueOnce(NOT_AGREED);
    expect(await store.revokeEula()).toBe(true);

    expect(invoke).toHaveBeenLastCalledWith("eula_revoke");
    expect(store.getEulaStatus()?.agreed).toBe(false);
    expect(store.getEulaStatus()?.agreedAtMs).toBe(0);
  });

  it("失敗しても状態は変わらない", async () => {
    const store = await freshStore();
    invoke.mockResolvedValueOnce(AGREED);
    await store.loadEula();

    invoke.mockRejectedValueOnce(new Error("保存できません"));
    expect(await store.revokeEula()).toBe(false);
    expect(store.getEulaStatus()?.agreed).toBe(true);
  });
});

describe("ライセンスとの独立", () => {
  it("**撤回はライセンスに触れない**", async () => {
    const store = await freshStore();
    invoke.mockResolvedValue(NOT_AGREED);
    await store.revokeEula();

    // ライセンス系のコマンドを呼んでいないこと
    for (const [command] of invoke.mock.calls) {
      expect(String(command).startsWith("license_")).toBe(false);
    }
  });

  it("撤回の導線がライセンスを解除していない（呼び出し側）", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/EulaSettings.tsx"),
      "utf-8",
    );
    expect(source).toContain("revokeEula");
    expect(source).not.toContain("clearLicense");
    // 取り返しがつかないので確認を挟む
    expect(source).toContain("ConfirmDialog");
    expect(source).toContain("eula.revokeConfirmBody");
  });

  it("Rust 側もライセンスキーを消していない", () => {
    const source = readFileSync(
      join(process.cwd(), "src-tauri/src/commands.rs"),
      "utf-8",
    );
    const revoke = source.slice(
      source.indexOf("pub fn eula_revoke"),
      source.indexOf("pub fn eula_revoke") + 500,
    );
    expect(revoke).toContain("eula::revoked");
    expect(revoke).not.toContain("license_key");
  });
});

describe("ブラウザで開いたとき", () => {
  it("Tauri 外では素通しする（開発用）", async () => {
    tauri = false;
    const store = await freshStore();

    await store.loadEula();
    expect(invoke).not.toHaveBeenCalled();
    expect(store.getEulaStatus()?.agreed).toBe(true);
  });
});
