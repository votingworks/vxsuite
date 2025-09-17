#![allow(clippy::cast_precision_loss)]
#![allow(clippy::cast_possible_truncation)]
#![allow(clippy::cast_sign_loss)]
#![allow(clippy::cast_possible_wrap)]

pub mod ballot_card;
pub mod debug;
mod diagnostic;
mod image_utils;
pub mod interpret;
mod js;
mod layout;
pub mod metadata;
mod qr_code;
mod scoring;
pub mod timing_marks;

// Anything marked with `#[neon::export]` is exported to JavaScript.
