/**
 * 更新まわりの純粋ロジック。
 *
 * **通信もダイアログも持たない。** ここは「そのバージョンは新しいか」
 * 「進捗を何 % と出すか」といった判断だけを持ち、テストで固定する。
 */

/** `v1.2.3` / `1.2.3-beta.1` を数値の並びへ。読めない部分は 0 とみなす。 */
export function parseVersion(value: string): number[] {
  const core = value.trim().replace(/^v/i, "").split(/[-+]/)[0];
  return core.split(".").map((part) => {
    const n = Number(part);
    return Number.isInteger(n) && n >= 0 ? n : 0;
  });
}

/**
 * `candidate` が `current` より新しいか。
 *
 * **同じなら false。** 「新しい版があります」と出しておいて中身が同じだと、
 * 押しても何も起きず不信感だけが残る。
 */
export function isNewer(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  const length = Math.max(a.length, b.length);

  for (let i = 0; i < length; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left > right;
  }
  return false;
}

/** ダウンロードの進捗（0〜100）。総量が分からないときは null。 */
export function downloadPercent(downloaded: number, total: number | null): number | null {
  if (total === null || total <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((downloaded / total) * 100)));
}

/** 進捗の表示。総量が分からなければ受信量だけを出す。 */
export function formatProgress(downloaded: number, total: number | null): string {
  const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  const percent = downloadPercent(downloaded, total);
  if (percent === null) return mb(downloaded);
  return `${percent}%（${mb(downloaded)} / ${mb(total ?? 0)}）`;
}

/**
 * リリースノートを画面に出せる長さへ整える。
 *
 * 長文をそのまま出すとダイアログが画面を覆うので、頭だけ見せる。
 */
export const MAX_NOTES_LENGTH = 600;

export function trimNotes(notes: string | undefined | null): string {
  const text = (notes ?? "").trim();
  if (text.length <= MAX_NOTES_LENGTH) return text;
  return `${text.slice(0, MAX_NOTES_LENGTH)}…`;
}
