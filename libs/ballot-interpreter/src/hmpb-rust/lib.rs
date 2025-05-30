#![allow(clippy::cast_precision_loss)]
#![allow(clippy::cast_possible_truncation)]
#![allow(clippy::cast_sign_loss)]
#![allow(clippy::cast_possible_wrap)]

use neon::prelude::*;

pub mod ballot_card;
pub mod debug;
mod diagnostic;
pub mod image_utils;
pub mod interpret;
mod js;
mod layout;
pub mod metadata;
mod qr_code;
mod scoring;
mod timing_mark_metadata;
pub mod timing_marks;

/// Entry point for the Neon module. Exports values to JavaScript.
#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    cx.export_function("interpret", js::interpret)?;

    cx.export_function("runBlankPaperDiagnostic", js::run_blank_paper_diagnostic)?;

    Ok(())
}
