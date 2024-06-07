#![allow(clippy::cast_precision_loss)]
#![allow(clippy::cast_possible_truncation)]
#![allow(clippy::cast_sign_loss)]
#![allow(clippy::cast_possible_wrap)]

use neon::prelude::*;

mod bitmap;
mod custom_paper_handler;
mod js;
mod pdf;

/// Entry point for the Neon module. Exports values to JavaScript.
#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    cx.export_function(
        "pdfToCustomPaperHandlerBitmapSeries",
        js::pdf_to_custom_paper_handler_bitmap_series,
    )?;

    Ok(())
}
