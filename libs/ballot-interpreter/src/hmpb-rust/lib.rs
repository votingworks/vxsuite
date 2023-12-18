use neon::prelude::*;

mod ballot_card;
mod debug;
mod image_utils;
mod interpret;
mod js;
mod layout;
mod qr_code;
mod qr_code_metadata;
mod scoring;
mod template;
mod timing_mark_metadata;
mod timing_marks;

/// Entry point for the Neon module. Exports values to JavaScript.
#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    cx.export_function("interpret", js::interpret)?;
    cx.export_function(
        "findTemplateGridAndBubbles",
        js::find_template_grid_and_bubbles,
    )?;
    Ok(())
}
