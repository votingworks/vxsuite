use neon::prelude::*;

mod ballot_card;
mod debug;
mod election;
mod geometry;
mod image_utils;
mod interpret;
mod js;
mod layout;
mod metadata;
mod scoring;
mod timing_marks;
mod types;

/// Entry point for the Neon module. Exports values to JavaScript.
#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    cx.export_function("interpret", js::interpret)?;
    Ok(())
}
