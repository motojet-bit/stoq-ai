//! アプリ共通のエラー型。フロントへは日本語メッセージの文字列として渡す。

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("通信に失敗しました: {0}")]
    Http(#[from] reqwest::Error),

    #[error("ファイル入出力に失敗しました: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON の解析に失敗しました: {0}")]
    Json(#[from] serde_json::Error),

    #[error("{0}")]
    Message(String),
}

impl AppError {
    pub fn msg(text: impl Into<String>) -> Self {
        AppError::Message(text.into())
    }
}

impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
