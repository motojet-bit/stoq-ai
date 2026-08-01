import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudStatus } from "@/types";

/**
 * クラウド同期ストアの動き。
 * Rust 側はモックして、**フロントが何を送り、何を保持するか**だけを確かめる。
 */

const invoke = vi.fn();
vi.mock("@/lib/tauri", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  isTauri: () => true,
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("@/lib/ui/toastStore", () => ({
  toastError: (...args: unknown[]) => toastError(...args),
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
}));

const SCOPE = "https://www.googleapis.com/auth/drive.appdata";

function status(over: Partial<CloudStatus> = {}): CloudStatus {
  return {
    connected: true,
    clientIdConfigured: true,
    clientIdMasked: "12….com",
    autoBackup: false,
    lastBackupMs: 1_700_000_000_000,
    scope: SCOPE,
    ...over,
  };
}

async function freshStore() {
  vi.resetModules();
  return import("@/lib/cloud/cloudStore");
}

beforeEach(() => {
  invoke.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
});

describe("初期状態", () => {
  it("未連携から始まる（勝手に接続済みに見せない）", async () => {
    const store = await freshStore();
    const initial = store.getCloudStatus();

    expect(initial.connected).toBe(false);
    expect(initial.clientIdConfigured).toBe(false);
    expect(initial.clientIdMasked).toBeNull();
    expect(initial.lastBackupMs).toBe(0);
  });

  it("**アプリ専用領域のスコープを既定に持つ**", async () => {
    const store = await freshStore();
    expect(store.getCloudStatus().scope).toBe(SCOPE);
  });
});

describe("状態の取り込み", () => {
  it("Rust から読み込んで保持する", async () => {
    const store = await freshStore();
    invoke.mockResolvedValue(status());

    await store.loadCloudStatus();
    expect(invoke).toHaveBeenCalledWith("cloud_status");
    expect(store.getCloudStatus().connected).toBe(true);
  });

  it("設定の読み込み結果からも取り込める", async () => {
    const store = await freshStore();
    store.syncFromSettings(status({ autoBackup: true }));
    expect(store.getCloudStatus().autoBackup).toBe(true);
  });

  it("設定が無くても落ちない", async () => {
    const store = await freshStore();
    store.syncFromSettings(null);
    store.syncFromSettings(undefined);
    expect(store.getCloudStatus().connected).toBe(false);
  });

  it("読み込みに失敗しても状態は壊れない", async () => {
    const store = await freshStore();
    invoke.mockRejectedValue(new Error("圏外"));

    await store.loadCloudStatus();
    expect(toastError).toHaveBeenCalled();
    expect(store.getCloudStatus().connected).toBe(false);
  });
});

describe("クライアント ID の保存", () => {
  it("Rust へ渡して結果を保持する", async () => {
    const store = await freshStore();
    invoke.mockResolvedValue(status({ connected: false }));

    expect(await store.setClientId("abc.apps.googleusercontent.com")).toBe(true);
    expect(invoke).toHaveBeenCalledWith("cloud_set_client_id", {
      clientId: "abc.apps.googleusercontent.com",
    });
    expect(store.getCloudStatus().clientIdConfigured).toBe(true);
  });

  it("失敗したら false を返して知らせる", async () => {
    const store = await freshStore();
    invoke.mockRejectedValue(new Error("書き込めません"));

    expect(await store.setClientId("x")).toBe(false);
    expect(toastError).toHaveBeenCalled();
  });
});

describe("連携と解除", () => {
  it("連携すると接続済みになる", async () => {
    const store = await freshStore();
    invoke.mockResolvedValue(status());

    expect(await store.connect()).toBe(true);
    expect(invoke).toHaveBeenCalledWith("cloud_connect");
    expect(store.getCloudStatus().connected).toBe(true);
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("キャンセルされても状態を接続済みにしない", async () => {
    const store = await freshStore();
    invoke.mockRejectedValue(new Error("認証がタイムアウトしました"));

    expect(await store.connect()).toBe(false);
    expect(store.getCloudStatus().connected).toBe(false);
    expect(toastError).toHaveBeenCalled();
  });

  it("解除すると未連携になる", async () => {
    const store = await freshStore();
    invoke.mockResolvedValueOnce(status());
    await store.loadCloudStatus();

    invoke.mockResolvedValueOnce(status({ connected: false }));
    await store.disconnect();

    expect(invoke).toHaveBeenLastCalledWith("cloud_disconnect");
    expect(store.getCloudStatus().connected).toBe(false);
  });
});

describe("バックアップ", () => {
  it("結果を返し、最終バックアップ時刻を取り直す", async () => {
    const store = await freshStore();
    invoke
      .mockResolvedValueOnce({
        fileName: "stoq-backup-1700000000001.json",
        sizeBytes: 2048,
        uploadedAtMs: 1_700_000_000_001,
        included: ["analyses.db", "chats.db"],
      })
      .mockResolvedValueOnce(status({ lastBackupMs: 1_700_000_000_001 }));

    const result = await store.backup();

    expect(result?.included).toEqual(["analyses.db", "chats.db"]);
    expect(invoke).toHaveBeenNthCalledWith(1, "cloud_backup");
    // 直後に状態を読み直すので「最終バックアップ」が古いまま残らない
    expect(invoke).toHaveBeenNthCalledWith(2, "cloud_status");
    expect(store.getCloudStatus().lastBackupMs).toBe(1_700_000_000_001);
  });

  it("失敗しても null を返すだけで落ちない", async () => {
    const store = await freshStore();
    invoke.mockRejectedValue(new Error("Google の認証が切れています"));

    expect(await store.backup()).toBeNull();
    expect(toastError).toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

describe("復元", () => {
  it("**指定が無ければ最新を使う**（null を明示して渡す）", async () => {
    const store = await freshStore();
    invoke.mockResolvedValue({
      fileName: "stoq-backup-1.json",
      createdAtMs: 1,
      restored: ["analyses.db"],
    });

    await store.restore();
    expect(invoke).toHaveBeenCalledWith("cloud_restore", { fileId: null });
  });

  it("世代を選んで復元できる", async () => {
    const store = await freshStore();
    invoke.mockResolvedValue({
      fileName: "stoq-backup-1.json",
      createdAtMs: 1,
      restored: ["analyses.db", "chats.db", "library.db"],
    });

    const result = await store.restore("file-id-9");

    expect(invoke).toHaveBeenCalledWith("cloud_restore", { fileId: "file-id-9" });
    expect(result?.restored).toHaveLength(3);
    // 何を戻したかを具体的に知らせる
    expect(toastSuccess).toHaveBeenCalledWith(
      expect.stringContaining("analyses.db"),
    );
  });

  it("失敗したら知らせて null を返す", async () => {
    const store = await freshStore();
    invoke.mockRejectedValue(new Error("バックアップの形式が違います"));

    expect(await store.restore()).toBeNull();
    expect(toastError).toHaveBeenCalled();
  });
});

describe("自動バックアップの切替", () => {
  it("Rust へ渡して結果を保持する", async () => {
    const store = await freshStore();
    invoke.mockResolvedValue(status({ autoBackup: true }));

    await store.setAutoBackup(true);
    expect(invoke).toHaveBeenCalledWith("cloud_set_auto_backup", { enabled: true });
    expect(store.getCloudStatus().autoBackup).toBe(true);
  });

  it("失敗しても画面が固まらない", async () => {
    const store = await freshStore();
    invoke.mockRejectedValue(new Error("保存できません"));

    await store.setAutoBackup(true);
    expect(toastError).toHaveBeenCalled();
    expect(store.getCloudStatus().autoBackup).toBe(false);
  });
});

describe("一覧", () => {
  it("取得できたらそのまま返す", async () => {
    const store = await freshStore();
    invoke.mockResolvedValue([
      { id: "a", name: "stoq-backup-1.json", modifiedTime: "2026-08-01T00:00:00Z", sizeBytes: 1 },
    ]);

    expect(await store.listBackups()).toHaveLength(1);
  });

  it("**失敗しても空配列を返す**（画面が例外で落ちない）", async () => {
    const store = await freshStore();
    invoke.mockRejectedValue(new Error("圏外"));

    expect(await store.listBackups()).toEqual([]);
    expect(toastError).toHaveBeenCalled();
  });
});
