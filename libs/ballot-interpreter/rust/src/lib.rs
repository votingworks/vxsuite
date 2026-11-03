#![allow(clippy::cast_precision_loss)]
#![allow(clippy::cast_possible_truncation)]
#![allow(clippy::cast_sign_loss)]
#![allow(clippy::cast_possible_wrap)]

pub mod ballot_card;
pub mod debug;
mod diagnostic;
mod draw_utils;
pub mod election_source;
mod image_utils;
pub mod interpret;
mod js;
mod layout;
pub mod qr_code;
pub mod scoring;
pub mod timing_marks;

// Anything marked with `#[napi]` is exported to JavaScript.
