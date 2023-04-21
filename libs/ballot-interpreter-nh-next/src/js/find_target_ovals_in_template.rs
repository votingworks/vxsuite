use neon::prelude::*;
use neon::types::JsObject;

use crate::election::UnitIntervalValue;
use crate::ovals::find_target_ovals_in_ballot_image;
use crate::scoring::OvalMarkScore;
use crate::timing_marks::TimingMarkGrid;

use super::args::get_image_source_from_arg;

/// Finds all the ovals in a ballot template image. This is useful for
/// automatically generating an election definition from a sample ballot image.
pub fn find_target_ovals_in_template(mut cx: FunctionContext) -> JsResult<JsObject> {
    let ballot_image_source = get_image_source_from_arg(&mut cx, 0)?;
    let target_oval_image_source = get_image_source_from_arg(&mut cx, 1)?;
    let grid_json = cx.argument::<JsString>(2)?.value(&mut cx);
    let oval_match_threshold =
        OvalMarkScore::from(cx.argument::<JsNumber>(3)?.value(&mut cx) as UnitIntervalValue);

    let ballot_image_label = ballot_image_source.as_label_or("ballot image");
    let ballot_image = match ballot_image_source.to_luma8() {
        Some(image) => image,
        None => {
            return cx.throw_error(format!("failed to load ballot image: {ballot_image_label}"));
        }
    };
    let target_oval_image_label = target_oval_image_source.as_label_or("target oval image");
    let target_oval_image = match target_oval_image_source.to_luma8() {
        Some(image) => image,
        None => {
            return cx.throw_error(format!(
                "failed to load target oval image: {target_oval_image_label}"
            ));
        }
    };
    let grid: TimingMarkGrid = serde_json::from_str(&grid_json)
        .or_else(|err| cx.throw_error(format!("failed to deserialize timing mark grid: {err}")))?;

    let matching_target_ovals = find_target_ovals_in_ballot_image(
        &ballot_image,
        &target_oval_image,
        &grid,
        oval_match_threshold,
    );

    let js_result = cx.empty_object();

    let target_ovals_json = cx.string(
        serde_json::to_string(&matching_target_ovals).expect("failed to serialize target ovals"),
    );
    js_result.set(&mut cx, "targetOvalsJson", target_ovals_json)?;

    Ok(js_result)
}
