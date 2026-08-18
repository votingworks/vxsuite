use std::backtrace::Backtrace as Trace;
use tokio::sync::mpsc::error::TryRecvError;

#[derive(Debug, thiserror::Error)]
pub enum UsbError {
    #[error("nusb error: {0}")]
    Nusb(nusb::Error),

    #[error("nusb transfer error: {0}")]
    NusbTransfer(nusb::transfer::TransferError),

    #[error("device not found")]
    DeviceNotFound,
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("usb error: {source}\nBacktrace:\n{trace}")]
    Usb { source: UsbError, trace: Trace },

    /// Another process already has the scanner, detected via either the
    /// advisory lock or the USB interface claim.
    #[error("the scanner is in use by another process")]
    ScannerInUse,

    #[error("scanner lock file error: {0}")]
    LockFile(std::io::Error),

    #[error("failed to validate request: {0}")]
    ValidateRequest(String),

    #[error("JSON error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("timed out receiving data")]
    RecvTimeout,

    #[error("tried to receive but could not: {0}")]
    TryRecvError(#[from] TryRecvError),

    #[error("UTF-8 error: {0}")]
    Utf8(#[from] std::str::Utf8Error),
}

impl From<UsbError> for Error {
    fn from(err: UsbError) -> Self {
        Self::Usb {
            source: err,
            trace: Trace::capture(),
        }
    }
}

impl From<nusb::Error> for Error {
    fn from(err: nusb::Error) -> Self {
        UsbError::Nusb(err).into()
    }
}
impl From<nusb::transfer::TransferError> for Error {
    fn from(err: nusb::transfer::TransferError) -> Self {
        UsbError::NusbTransfer(err).into()
    }
}

pub type Result<T, E = Error> = std::result::Result<T, E>;
