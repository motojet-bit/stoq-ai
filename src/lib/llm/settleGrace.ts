/**
 * 応答の到着を「猶予つき」で待つ。
 *
 * **`invoke` の解決とチャネル配信は順序が保証されない。**
 * Rust 側は必ず `Done` か `Error` を送ってからコマンドを返すが、
 * その 2 つは別々の IPC で届くため、コマンドの解決が先に着くことがある。
 * 到着していないだけの状態を「応答が来なかった」と断じると、
 * **成功した分析が失敗として捨てられる。**
 *
 * そこで少しだけ待ち、それでも来なければ本当の異常として扱う。
 */

/** どれだけ待つか。IPC 1 往復には十分で、人が気づくほどは長くない。 */
export const SETTLE_GRACE_MS = 3000;

export type SettleOutcome = "settled" | "pending";

/**
 * `source` が決着するか、`graceMs` が過ぎるまで待つ。
 *
 * **この関数自体は決して throw しない。** 呼び出し側は結果の種別だけを見て、
 * 中身（値・エラー）は元の Promise から受け取る。
 */
export function waitForSettle(
  source: Promise<unknown>,
  graceMs: number = SETTLE_GRACE_MS,
): Promise<SettleOutcome> {
  return new Promise((resolve) => {
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve("pending");
    }, graceMs);

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve("settled");
    };

    // 失敗も「決着」。ここで受けておかないと未処理の拒否として扱われる
    source.then(finish, finish);
  });
}
