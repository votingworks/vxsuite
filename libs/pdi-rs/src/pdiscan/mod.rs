mod dib;
mod error;
mod ffi;
pub mod kext;
mod libpdiscan;
mod result;
mod scanner;

pub use error::Error;
pub use result::Result;
pub use scanner::{
    ColorDepth, DuplexMode, EjectDirection, ScanMode, Scanner, ScannerStatus, Settings,
};
