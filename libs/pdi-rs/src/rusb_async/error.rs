use std::result;

/// A result of a function that may return a [`Error`].
pub type Result<T> = result::Result<T, Error>;

/// Possible errors that may occur when using the asynchronous libusb API.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("No transfers pending")]
    NoTransfersPending,

    #[error("Poll timed out")]
    PollTimeout,

    #[error("Transfer is stalled")]
    Stall,

    #[error("Device was disconnected")]
    Disconnected,

    #[error("Device sent more data than expected")]
    Overflow,

    #[error("Other error: {0}")]
    Other(&'static str),

    #[error("{0} Error: {1}")]
    Errno(&'static str, i32),

    #[error("Transfer was cancelled")]
    Cancelled,
}
