mod detect;
mod rqrr;
mod zedbar;

pub use detect::{Detected, QrCodeKind, SearchStrategy, classify_qr_payload, detect_with_strategy};
