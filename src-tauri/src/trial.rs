//! 無料体験期間（3 週間）の判定。
//!
//! **起点は「初回起動日」であって、初回分析日ではない。**
//! アプリを入れた日から数えることで、いつ何を分析したかに関わらず
//! 期限が一意に決まる。
//!
//! 期限が切れても**既存データの閲覧は止めない**。止めるのは
//! 「新しい銘柄の AI 分析」だけ（判定はフロント側の `freeTier.ts`）。

use serde::Serialize;

/// 体験期間の日数。
pub const TRIAL_DAYS: i64 = 21;

const DAY_MS: i64 = 24 * 60 * 60 * 1000;

/// 体験期間の長さ（ミリ秒）。
pub const TRIAL_MS: i64 = TRIAL_DAYS * DAY_MS;

/// フロントエンドへ返す体験期間の状態。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrialStatus {
    /// 初回起動の時刻（ミリ秒）
    pub started_at_ms: i64,
    /// 期限（ミリ秒）
    pub expires_at_ms: i64,
    /// 残り日数（切り上げ）。切れていれば 0
    pub remaining_days: i64,
    /// 期限切れか
    pub expired: bool,
    /// 体験期間の長さ（日）。画面の文言に使う
    pub trial_days: i64,
}

/// 初回起動の時刻を決める。
///
/// **未記録なら「いま」を起点にする。** また、記録が未来を指している場合
/// （設定ファイルを書き換えた、端末の時計を戻した等）も「いま」に直す。
/// そうしないと、時計を進めるだけで期限を先送りできてしまう。
pub fn ensure_started(recorded_ms: i64, now_ms: i64) -> i64 {
    if recorded_ms <= 0 || recorded_ms > now_ms {
        now_ms
    } else {
        recorded_ms
    }
}

/// 保存値から状態を組み立てる。
pub fn status_of(started_at_ms: i64, now_ms: i64) -> TrialStatus {
    let started = ensure_started(started_at_ms, now_ms);
    let expires = started + TRIAL_MS;
    let remaining_ms = expires - now_ms;

    TrialStatus {
        started_at_ms: started,
        expires_at_ms: expires,
        // 「あと 0 日」と出さないよう切り上げる
        remaining_days: if remaining_ms > 0 {
            (remaining_ms + DAY_MS - 1) / DAY_MS
        } else {
            0
        },
        expired: remaining_ms <= 0,
        trial_days: TRIAL_DAYS,
    }
}

// ---------------------------------------------------------------- テスト

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_700_000_000_000;

    #[test]
    fn 体験期間は三週間() {
        assert_eq!(TRIAL_DAYS, 21);
        assert_eq!(TRIAL_MS, 21 * 24 * 60 * 60 * 1000);
    }

    #[test]
    fn 未記録なら今を起点にする() {
        assert_eq!(ensure_started(0, NOW), NOW);
        assert_eq!(ensure_started(-1, NOW), NOW);
    }

    #[test]
    fn 記録済みならそのまま使う() {
        assert_eq!(ensure_started(NOW - 1000, NOW), NOW - 1000);
    }

    #[test]
    fn 未来の記録は今に直す() {
        // 時計を進めて期限を先送りされないようにする
        assert_eq!(ensure_started(NOW + DAY_MS, NOW), NOW);
    }

    #[test]
    fn 初日は満了していない() {
        let status = status_of(NOW, NOW);
        assert!(!status.expired);
        assert_eq!(status.remaining_days, 21);
        assert_eq!(status.expires_at_ms, NOW + TRIAL_MS);
    }

    #[test]
    fn 残り日数は切り上げる() {
        // 20 日と半日が経過 → 残り 0.5 日を「1 日」と出す
        let status = status_of(NOW - 20 * DAY_MS - DAY_MS / 2, NOW);
        assert_eq!(status.remaining_days, 1);
        assert!(!status.expired);
    }

    #[test]
    fn 二十日目はまだ使える() {
        let status = status_of(NOW - 20 * DAY_MS, NOW);
        assert!(!status.expired);
        assert_eq!(status.remaining_days, 1);
    }

    #[test]
    fn 二十一日で満了する() {
        let status = status_of(NOW - TRIAL_MS, NOW);
        assert!(status.expired);
        assert_eq!(status.remaining_days, 0);
    }

    #[test]
    fn 満了後も日数はマイナスにならない() {
        let status = status_of(NOW - TRIAL_MS - 100 * DAY_MS, NOW);
        assert!(status.expired);
        assert_eq!(status.remaining_days, 0);
    }

    #[test]
    fn 状態に余計な情報を含めない() {
        // 画面に必要な値だけを返す（ライセンスや銘柄の情報は混ぜない）
        let json = serde_json::to_string(&status_of(NOW, NOW)).unwrap();
        assert!(json.contains("startedAtMs"));
        assert!(json.contains("expiresAtMs"));
        assert!(json.contains("remainingDays"));
        assert!(json.contains("trialDays"));
        assert!(!json.contains("license"));
    }
}
