import type { CloudBackupFile } from "@/types";

/**
 * クラウド同期の表示まわりの純粋ロジック。
 * 通信は Rust 側（`src-tauri/src/cloud/`）が行い、ここは表示の判断だけを持つ。
 */

/** 要求しているアクセス範囲。アプリ専用の隠し領域だけ。 */
export const DRIVE_APPDATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

/** Google のデスクトップアプリ用クライアント ID の末尾 */
const CLIENT_ID_SUFFIX = ".apps.googleusercontent.com";

/**
 * クライアント ID らしい形か。
 *
 * **通信の前に気づけるようにする。** 打ち間違いのまま連携すると、
 * ブラウザが開いてから Google 側のエラー画面で止まってしまう。
 */
export function isLikelyClientId(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed.endsWith(CLIENT_ID_SUFFIX)) return false;
  // 末尾を除いた本体（プロジェクト番号 + ランダム部）が残っているか
  return trimmed.slice(0, -CLIENT_ID_SUFFIX.length).length > 0;
}

/** 入力が使えない理由。問題なければ null。 */
export function clientIdError(value: string): string | null {
  if (value.trim().length === 0) return "クライアント ID を入力してください。";
  if (!isLikelyClientId(value)) {
    return `クライアント ID は ${CLIENT_ID_SUFFIX} で終わる形式です。Google Cloud Console で「デスクトップアプリ」として発行してください。`;
  }
  return null;
}

/** バイト数を読める単位にする。 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 最終バックアップの表示。未実施なら催促する。 */
export function formatLastBackup(lastBackupMs: number, nowMs: number): string {
  if (!lastBackupMs || lastBackupMs <= 0) return "まだバックアップしていません";

  const diff = nowMs - lastBackupMs;
  if (diff < 0) return "たった今";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes} 分前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 時間前`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 日前`;
  return new Date(lastBackupMs).toLocaleDateString("ja-JP");
}

/**
 * バックアップが古すぎないか。
 * **古いまま気づかないのがいちばん困る**ので、7 日で注意を出す。
 */
export const STALE_BACKUP_DAYS = 7;

export function isBackupStale(lastBackupMs: number, nowMs: number): boolean {
  if (!lastBackupMs || lastBackupMs <= 0) return false;
  return nowMs - lastBackupMs > STALE_BACKUP_DAYS * 24 * 60 * 60 * 1000;
}

/** ファイル名から作成時刻を読む（`stoq-backup-<ミリ秒>.json`）。 */
export function backupTimestampOf(name: string): number | null {
  const matched = /^stoq-backup-(\d+)\./.exec(name.trim());
  if (!matched) return null;
  const value = Number(matched[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** 一覧を新しい順に並べる。 */
export function sortBackups(files: CloudBackupFile[]): CloudBackupFile[] {
  return [...files].sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime));
}

/** 一覧に出す 1 行の説明。 */
export function describeBackup(file: CloudBackupFile): string {
  const stamp = backupTimestampOf(file.name);
  const when = stamp
    ? new Date(stamp).toLocaleString("ja-JP")
    : file.modifiedTime || "日時不明";
  return `${when}（${formatBytes(file.sizeBytes)}）`;
}

/** 復元結果を日本語で伝える。 */
export function describeRestore(restored: string[]): string {
  if (restored.length === 0) return "復元できるデータがありませんでした";
  return `${restored.length} 件のデータを復元しました（${restored.join(" / ")}）`;
}
