use neon::prelude::*;

mod ballot_card;
mod debug;
mod election;
mod geometry;
mod grid;
mod image_utils;
mod interpret;
mod js;
mod layout;
mod metadata;
mod ovals;
mod scoring;
mod timing_marks;
mod types;

/// Entry point for the Neon module. Exports values to JavaScript.
#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    cx.export_function("interpret", js::interpret)?;
    cx.export_function("findGrid", js::find_grid)?;
    cx.export_function(
        "findTargetOvalsInTemplate",
        js::find_target_ovals_in_template,
    )?;
    Ok(())
}
