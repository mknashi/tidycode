#[derive(Debug, thiserror::Error, serde::Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum Error {
    #[error("Print command failed: {0}")]
    PrintCommandFailed(String),
    #[error("Failed to read file: {0}")]
    ReadFailed(String),
    #[error("Failed to write file: {0}")]
    WriteFailed(String),
    #[error("Failed to resolve printer: {0}")]
    PrinterLookupFailed(String),
    #[error("Unsupported platform")]
    UnsupportedPlatform,
}

pub type Result<T> = std::result::Result<T, Error>;
