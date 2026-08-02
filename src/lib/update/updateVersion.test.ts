import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  downloadPercent,
  formatProgress,
  isNewer,
  MAX_NOTES_LENGTH,
  parseVersion,
  trimNotes,
} from "@/lib/update/updateVersion";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf-8");

describe("バージョンの比較", () => {
  it("数値の並びに直す", () => {
    expect(parseVersion("1.2.3")).toEqual([1, 2, 3]);
    expect(parseVersion("v0.1.0")).toEqual([0, 1, 0]);
    expect(parseVersion("2.0.0-beta.1")).toEqual([2, 0, 0]);
  });

  it("読めない部分は 0 として扱う（落とさない）", () => {
    expect(parseVersion("1.x.3")).toEqual([1, 0, 3]);
    expect(parseVersion("")).toEqual([0]);
  });

  it("新しければ true", () => {
    expect(isNewer("0.2.0", "0.1.0")).toBe(true);
    expect(isNewer("1.0.0", "0.9.9")).toBe(true);
    expect(isNewer("0.1.10", "0.1.9")).toBe(true);
  });

  it("**同じなら false**（押しても何も起きない案内を出さない）", () => {
    expect(isNewer("0.1.0", "0.1.0")).toBe(false);
    expect(isNewer("v0.1.0", "0.1.0")).toBe(false);
  });

  it("**古ければ false**（配信の設定ミスで巻き戻さない）", () => {
    expect(isNewer("0.1.0", "0.2.0")).toBe(false);
    expect(isNewer("0.9.9", "1.0.0")).toBe(false);
  });

  it("桁数が違っても比べられる", () => {
    expect(isNewer("1.1", "1.0.9")).toBe(true);
    expect(isNewer("1.0", "1.0.0")).toBe(false);
  });
});

describe("進捗", () => {
  it("割合を出す", () => {
    expect(downloadPercent(50, 100)).toBe(50);
    expect(downloadPercent(0, 100)).toBe(0);
    expect(downloadPercent(100, 100)).toBe(100);
  });

  it("総量が分からなければ null", () => {
    expect(downloadPercent(50, null)).toBeNull();
    expect(downloadPercent(50, 0)).toBeNull();
  });

  it("100% を超えない（サーバーの申告とずれても壊れない）", () => {
    expect(downloadPercent(200, 100)).toBe(100);
  });

  it("表示は総量の有無で切り替える", () => {
    expect(formatProgress(1024 * 1024, 2 * 1024 * 1024)).toContain("50%");
    expect(formatProgress(1024 * 1024, null)).toBe("1.0 MB");
  });
});

describe("リリースノート", () => {
  it("短ければそのまま", () => {
    expect(trimNotes("修正しました")).toBe("修正しました");
  });

  it("空でも落ちない", () => {
    expect(trimNotes(null)).toBe("");
    expect(trimNotes(undefined)).toBe("");
  });

  it("**長すぎるものは切る**（ダイアログが画面を覆わないように）", () => {
    const long = "あ".repeat(MAX_NOTES_LENGTH + 100);
    expect(trimNotes(long).length).toBe(MAX_NOTES_LENGTH + 1);
    expect(trimNotes(long).endsWith("…")).toBe(true);
  });
});

describe("配信の設定", () => {
  const conf = JSON.parse(read("src-tauri/tauri.conf.json")) as {
    version: string;
    bundle: { createUpdaterArtifacts?: boolean };
    plugins: { updater: { endpoints: string[]; pubkey: string } };
  };

  it("指定のエンドポイントを見ている", () => {
    expect(conf.plugins.updater.endpoints).toEqual([
      "https://github.com/motojet-bit/stoq-releases/releases/latest/download/latest.json",
    ]);
  });

  it("**公開鍵が入っている**（無いと署名を検証できない）", () => {
    expect(conf.plugins.updater.pubkey.length).toBeGreaterThan(50);
  });

  it("署名付きの成果物を作る設定になっている", () => {
    expect(conf.bundle.createUpdaterArtifacts).toBe(true);
  });

  it("**秘密鍵がリポジトリに入っていない**", () => {
    const ignore = read(".gitignore");
    expect(ignore).toContain("*.key");
    expect(ignore).toContain("dist-release/");
  });

  it("更新と再起動の権限を許可している", () => {
    const cap = JSON.parse(read("src-tauri/capabilities/default.json")) as {
      permissions: string[];
    };
    expect(cap.permissions).toContain("updater:default");
    expect(cap.permissions).toContain("process:allow-restart");
    // 既存の機能を壊さないよう、既定の権限も残す
    expect(cap.permissions).toContain("core:default");
  });
});

describe("画面の組み方", () => {
  const modal = read("src/components/UpdateModal.tsx");

  it("**見つかったときだけ出す**（起動のたびに何か出さない）", () => {
    expect(modal).toContain('update.phase === "available"');
    expect(modal).toContain("if (!visible) return null;");
  });

  it("文言を直書きしていない", () => {
    // 文面は辞書側。ここに直書きが戻っていないことは localized.test.ts が見る
    expect(modal).toContain('t("update.title"');
    expect(modal).toContain('t("update.readyTitle")');
  });

  it("設定画面から手動でも確認できる", () => {
    const settings = read("src/components/UpdateSettings.tsx");
    expect(settings).toContain("checkForUpdate(true)");
    expect(settings).toContain('t("update.check")');
  });

  it("起動時に自動で確認する", () => {
    expect(read("src/App.tsx")).toContain("void checkForUpdate();");
  });
});
