use std::sync::mpsc::{RecvTimeoutError, TryRecvError};

use crate::rusb_async;

#[derive(Debug, thiserror::Error)]
pub enum UsbError {
    #[error("rusb error: {0}")]
    Rusb(rusb::Error),

    #[error("rusb_async error: {0}")]
    RusbAsync(rusb_async::Error),
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("usb error: {0}")]
    Usb(#[from] UsbError),

    #[error("failed to validate request: {0}")]
    ValidateRequest(String),

    #[error("failed to receive: {0}")]
    RecvTimeout(#[from] RecvTimeoutError),

    #[error("tried to receive but could not: {0}")]
    TryRecvError(#[from] TryRecvError),

    #[error("UTF-8 error: {0}")]
    Utf8(#[from] std::str::Utf8Error),
}

impl From<rusb::Error> for Error {
    fn from(err: rusb::Error) -> Self {
        Self::Usb(UsbError::Rusb(err))
    }
}

impl From<rusb_async::Error> for Error {
    fn from(err: rusb_async::Error) -> Self {
        Self::Usb(UsbError::RusbAsync(err))
    }
}

pub type Result<T> = std::result::Result<T, Error>;
