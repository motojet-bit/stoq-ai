import { describe, expect, it } from "vitest";
import {
  backupTimestampOf,
  clientIdError,
  describeBackup,
  describeRestore,
  DRIVE_APPDATA_SCOPE,
  formatBytes,
  formatLastBackup,
  isBackupStale,
  isLikelyClientId,
  sortBackups,
  STALE_BACKUP_DAYS,
} from "@/lib/cloud/cloudBackup";
import type { CloudBackupFile } from "@/types";
import { setLocale } from "@/lib/i18n/i18n";

/*
 * 文面は日本語で検証する（既定は英語なので明示的に切り替える）。
 * **トップレベルで呼ぶ。** モジュール直下で組み立てられる定数が
 * あるため、`beforeAll` では間に合わない。
 */
setLocale("ja");

const VALID_ID = "123456789012-abcdefghijklmnop.apps.googleusercontent.com";

function file(name: string, modifiedTime: string, sizeBytes = 1024): CloudBackupFile {
  return { id: `id-${name}`, name, modifiedTime, sizeBytes };
}

describe("アクセス範囲", () => {
  it("**アプリ専用領域だけを要求する**", () => {
    expect(DRIVE_APPDATA_SCOPE).toBe("https://www.googleapis.com/auth/drive.appdata");
    // ユーザーの写真・書類に触れるスコープではないこと
    expect(DRIVE_APPDATA_SCOPE).not.toContain("drive.file");
    expect(DRIVE_APPDATA_SCOPE).not.toContain("drive.readonly");
    expect(DRIVE_APPDATA_SCOPE.endsWith("drive.appdata")).toBe(true);
  });
});

describe("クライアント ID の確認", () => {
  it("正しい形式を受け付ける", () => {
    expect(isLikelyClientId(VALID_ID)).toBe(true);
    expect(isLikelyClientId(`  ${VALID_ID}  `)).toBe(true);
    expect(clientIdError(VALID_ID)).toBeNull();
  });

  it("**形式が違えば通信の前に止める**", () => {
    expect(isLikelyClientId("")).toBe(false);
    expect(isLikelyClientId("my-client-id")).toBe(false);
    expect(isLikelyClientId("sk-1234567890")).toBe(false);
    // 末尾だけで本体が無いものも通さない
    expect(isLikelyClientId(".apps.googleusercontent.com")).toBe(false);
  });

  it("理由を日本語で返す", () => {
    expect(clientIdError("")).toContain("入力してください");
    expect(clientIdError("  ")).toContain("入力してください");
    expect(clientIdError("wrong")).toContain("デスクトップアプリ");
  });
});

describe("formatBytes", () => {
  it("単位を切り替える", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("おかしな値でも落ちない", () => {
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(Number.NaN)).toBe("—");
  });
});

describe("最終バックアップの表示", () => {
  const now = 1_700_000_000_000;

  it("未実施なら催促する", () => {
    expect(formatLastBackup(0, now)).toBe("まだバックアップしていません");
    expect(formatLastBackup(-1, now)).toBe("まだバックアップしていません");
  });

  it("経過時間で表現を変える", () => {
    expect(formatLastBackup(now - 30_000, now)).toBe("たった今");
    expect(formatLastBackup(now - 5 * 60_000, now)).toBe("5 分前");
    expect(formatLastBackup(now - 3 * 3_600_000, now)).toBe("3 時間前");
    expect(formatLastBackup(now - 2 * 86_400_000, now)).toBe("2 日前");
  });

  it("時計がずれていても壊れない", () => {
    // 端末の時刻が巻き戻っても「-3 分前」のような表示にしない
    expect(formatLastBackup(now + 60_000, now)).toBe("たった今");
  });

  it("**古いバックアップに注意を出す**", () => {
    expect(isBackupStale(now - 3 * 86_400_000, now)).toBe(false);
    expect(isBackupStale(now - (STALE_BACKUP_DAYS + 1) * 86_400_000, now)).toBe(true);
    // 未実施は「古い」ではなく「未実施」として扱う
    expect(isBackupStale(0, now)).toBe(false);
  });
});

describe("バックアップ名", () => {
  it("作成時刻を読める", () => {
    expect(backupTimestampOf("stoq-backup-1700000000000.json")).toBe(1_700_000_000_000);
  });

  it("読めない名前は null", () => {
    expect(backupTimestampOf("other-app.dat")).toBeNull();
    expect(backupTimestampOf("stoq-backup-abc.json")).toBeNull();
    expect(backupTimestampOf("")).toBeNull();
    expect(backupTimestampOf("stoq-backup-0.json")).toBeNull();
  });
});

describe("一覧の並び", () => {
  it("新しい順に並べる", () => {
    const files = [
      file("stoq-backup-1.json", "2026-08-01T00:00:00Z"),
      file("stoq-backup-3.json", "2026-08-03T00:00:00Z"),
      file("stoq-backup-2.json", "2026-08-02T00:00:00Z"),
    ];

    expect(sortBackups(files).map((f) => f.name)).toEqual([
      "stoq-backup-3.json",
      "stoq-backup-2.json",
      "stoq-backup-1.json",
    ]);
  });

  it("元の配列を書き換えない", () => {
    const files = [
      file("stoq-backup-1.json", "2026-08-01T00:00:00Z"),
      file("stoq-backup-2.json", "2026-08-02T00:00:00Z"),
    ];
    sortBackups(files);
    expect(files[0].name).toBe("stoq-backup-1.json");
  });

  it("空でも落ちない", () => {
    expect(sortBackups([])).toEqual([]);
  });
});

describe("説明文", () => {
  it("日時とサイズを出す", () => {
    const text = describeBackup(file("stoq-backup-1700000000000.json", "", 2048));
    expect(text).toContain("2.0 KB");
    expect(text).toContain("2023");
  });

  it("名前から日時が読めなければ更新日時を使う", () => {
    const text = describeBackup(file("legacy.json", "2026-08-01T00:00:00Z", 1024));
    expect(text).toContain("2026-08-01T00:00:00Z");
  });

  it("復元結果を伝える", () => {
    expect(describeRestore(["analyses.db", "chats.db"])).toContain("2 件");
    expect(describeRestore(["analyses.db", "chats.db"])).toContain("analyses.db");
    expect(describeRestore([])).toContain("復元できるデータがありません");
  });
});
