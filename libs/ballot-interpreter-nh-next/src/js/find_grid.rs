use imageproc::contrast::otsu_level;
use neon::prelude::*;
use neon::types::JsObject;

use crate::ballot_card::get_template_ballot_card_geometry;
use crate::debug::ImageDebugWriter;
use crate::interpret::{prepare_ballot_scan_image, BallotImage, BallotPage};
use crate::timing_marks::find_timing_mark_grid;

use super::args::{get_image_source_from_arg, get_path_from_arg_opt};
use super::image_data::ImageData;

/// Finds the timing mark grid in a ballot card image. This does not detect
/// or score the ovals in the grid.
pub fn find_grid(mut cx: FunctionContext) -> JsResult<JsObject> {
    let image = get_image_source_from_arg(&mut cx, 0)?;
    let is_template = cx.argument::<JsBoolean>(1)?.value(&mut cx);
    let debug_path = get_path_from_arg_opt(&mut cx, 2);

    let label = image.as_label_or("ballot page");
    let Some(image) = image.to_luma8() else {
        return cx.throw_error(format!("failed to load ballot card image: {label}"));
    };
    let ballot_page = if is_template {
        let threshold = otsu_level(&image);
        let geometry = get_template_ballot_card_geometry(image.dimensions())
            .expect("failed to get geometry for ballot template image");
        BallotPage {
            ballot_image: BallotImage {
                image,
                threshold,
                border_inset: Default::default(),
            },
            geometry,
        }
    } else {
        prepare_ballot_scan_image(label.as_str(), image.into())
            .or_else(|_| cx.throw_error(format!("failed to prepare ballot card image: {label}")))?
    };
    let mut debug = match debug_path {
        Some(path) => ImageDebugWriter::new(path, ballot_page.ballot_image.image.clone()),
        None => ImageDebugWriter::disabled(),
    };
    let dimensions = ballot_page.ballot_image.image.dimensions();
    let Some(geometry)  =
        get_template_ballot_card_geometry(dimensions) else {
            return cx.throw_error(format!(
                "failed to get geometry for ballot card image: {label}"
            ));
        };
    let (grid, normalized_image) = find_timing_mark_grid(
        &label,
        &geometry,
        &ballot_page.ballot_image.image,
        ballot_page.ballot_image.border_inset,
        &mut debug,
    )
    .or_else(|_| {
        cx.throw_error(format!(
            "failed to find timing mark grid for ballot card image: {label}"
        ))
    })?;

    let js_result = cx.empty_object();

    let grid_json = cx.string(serde_json::to_string(&grid).expect("failed to serialize grid"));
    js_result.set(&mut cx, "gridJson", grid_json)?;

    let normalized_image: Handle<JsValue> = ImageData::convert_gray_image_to_js_object(
        &mut cx,
        normalized_image.unwrap_or(ballot_page.ballot_image.image),
    )?
    .upcast();
    js_result.set(&mut cx, "normalizedImage", normalized_image)?;

    Ok(js_result)
}
