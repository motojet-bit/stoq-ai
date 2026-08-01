//! 免責事項（EULA）への同意状態。
//!
//! **同意は「アプリを使える条件」であって、ライセンスとは別物。**
//! 撤回してもライセンスキーは失効させない（買ったものは残る）。
//! 使えなくなるだけで、再度同意すればそのまま元に戻る。

use serde::Serialize;

/// フロントエンドへ返す同意の状態。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EulaStatus {
    /// 同意済みか。false ならアプリを使わせない
    pub agreed: bool,
    /// 同意した時刻（ミリ秒）。未同意なら 0
    pub agreed_at_ms: i64,
}

/// 保存値から状態を組み立てる。
pub fn status_of(agreed: bool, agreed_at_ms: i64) -> EulaStatus {
    EulaStatus {
        // 時刻が入っていなければ同意の記録として扱わない
        agreed: agreed && agreed_at_ms > 0,
        agreed_at_ms: if agreed { agreed_at_ms } else { 0 },
    }
}

/// 同意した状態。
pub fn agreed_now(now_ms: i64) -> (bool, i64) {
    (true, now_ms)
}

/// 撤回した状態。**ライセンスには触れない。**
pub fn revoked() -> (bool, i64) {
    (false, 0)
}

// ---------------------------------------------------------------- テスト

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 初期状態は未同意() {
        let status = status_of(false, 0);
        assert!(!status.agreed);
        assert_eq!(status.agreed_at_ms, 0);
    }

    #[test]
    fn 同意すると時刻が残る() {
        let (agreed, at) = agreed_now(1_700_000_000_000);
        let status = status_of(agreed, at);

        assert!(status.agreed);
        assert_eq!(status.agreed_at_ms, 1_700_000_000_000);
    }

    #[test]
    fn 撤回すると未同意へ戻る() {
        let (agreed, at) = revoked();
        let status = status_of(agreed, at);

        assert!(!status.agreed);
        assert_eq!(status.agreed_at_ms, 0);
    }

    #[test]
    fn 時刻の無い同意フラグは信用しない() {
        // 設定ファイルを手で書き換えて素通りさせられないようにする
        let status = status_of(true, 0);
        assert!(!status.agreed);
    }

    #[test]
    fn 未同意なら時刻を返さない() {
        let status = status_of(false, 1_700_000_000_000);
        assert_eq!(status.agreed_at_ms, 0);
    }
}
