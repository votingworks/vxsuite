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
    #[error("usb error: {0}")]
    Usb(#[from] UsbError),

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

impl From<nusb::Error> for Error {
    fn from(err: nusb::Error) -> Self {
        Self::Usb(UsbError::Nusb(err))
    }
}
impl From<nusb::transfer::TransferError> for Error {
    fn from(err: nusb::transfer::TransferError) -> Self {
        Self::Usb(UsbError::NusbTransfer(err))
    }
}

pub type Result<T, E = Error> = std::result::Result<T, E>;
