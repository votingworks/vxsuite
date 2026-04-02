mod detect;
mod rqrr;
mod zedbar;

pub use detect::{classify_qr_payload, detect_with_strategy, Detected, QrCodeKind, SearchStrategy};
