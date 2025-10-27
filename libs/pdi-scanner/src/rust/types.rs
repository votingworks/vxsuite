use locate_error::Location;
use tokio::sync::mpsc::error::TryRecvError;

#[derive(Debug, thiserror::Error, locate_error::Locate)]
pub enum UsbError {
    #[error("nusb error: {0} ({1})")]
    Nusb(#[locate_from] nusb::Error, Location),

    #[error("nusb transfer error: {0} ({1})")]
    NusbTransfer(#[locate_from] nusb::transfer::TransferError, Location),

    #[error("device not found")]
    DeviceNotFound,
}

#[derive(Debug, thiserror::Error, locate_error::Locate)]
pub enum Error {
    #[error("usb error: {0} ({1})")]
    Usb(#[locate_from] UsbError, Location),

    #[error("failed to validate request: {0}")]
    ValidateRequest(String),

    #[error("failed to serialize JSON: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("timed out receiving data")]
    RecvTimeout,

    #[error("tried to receive but could not: {0}")]
    TryRecvError(#[from] TryRecvError),

    #[error("UTF-8 error: {0}")]
    Utf8(#[from] std::str::Utf8Error),
}

pub type Result<T, E = Error> = std::result::Result<T, E>;
