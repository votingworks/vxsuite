use image::{DynamicImage, GrayImage, Luma};
use imageproc::contrast::{otsu_level, threshold};
use neon::prelude::*;
use neon::types::JsObject;

use crate::ballot_card::{
    load_ballot_scan_bubble_image, load_ballot_template_bubble_image, PaperInfo,
};
use crate::debug::ImageDebugWriter;
use crate::image_utils::bleed;
use crate::interpret::{
    interpret_ballot_card, prepare_ballot_card_images, BallotCard, Options, ResizeStrategy,
    SIDE_A_LABEL, SIDE_B_LABEL,
};
use crate::timing_marks::{find_empty_bubbles_matching_template, find_timing_mark_grid};

use self::args::{
    get_election_definition_from_arg, get_image_data_or_path_from_arg, get_path_from_arg_opt,
    ImageSource,
};
use self::image_data::ImageData;
use self::serialization::to_js;

mod args;
mod image_data;
mod serialization;

fn make_interpret_result<'a>(
    cx: &mut FunctionContext<'a>,
    result: Result<Handle<JsString>, Handle<JsString>>,
) -> JsResult<'a, JsObject> {
    let result_object = cx.empty_object();
    let (success, value) = match result {
        Ok(value) => (cx.boolean(true), value),
        Err(error) => (cx.boolean(false), error),
    };
    result_object.set(cx, "success", success)?;
    result_object.set(cx, "value", value)?;
    Ok(result_object)
}

/// Interpret a ballot card.
///
/// From JavaScript, this function takes the following arguments:
/// 1. The election definition as a JSON string.
/// 2. An `ImageData` or path to load for side A of the ballot card.
/// 3. An `ImageData` or path to load for side B of the ballot card.
/// 4. An optional base path to save interpretation debug images for the side A.
/// 5. An optional base path to save interpretation debug images for the side B.
///
/// Processing the arguments, including reading images from disk, will
/// result in a `Throw` if any of the arguments are invalid. If the return
/// value cannot be serialized to JSON, a `Throw` will result.
///
/// Once interpretation starts, errors are returned as structured data.
pub fn interpret(mut cx: FunctionContext) -> JsResult<JsObject> {
    let election = get_election_definition_from_arg(&mut cx, 0)?;
    let side_a_image_or_path = get_image_data_or_path_from_arg(&mut cx, 1)?;
    let side_b_image_or_path = get_image_data_or_path_from_arg(&mut cx, 2)?;
    let debug_side_a_base = get_path_from_arg_opt(&mut cx, 3);
    let debug_side_b_base = get_path_from_arg_opt(&mut cx, 4);

    let side_a_label = side_a_image_or_path.as_label_or(SIDE_A_LABEL);
    let side_b_label = side_b_image_or_path.as_label_or(SIDE_B_LABEL);
    let (side_a_image, side_b_image) = rayon::join(
        || load_ballot_image_from_image_or_path(side_a_image_or_path),
        || load_ballot_image_from_image_or_path(side_b_image_or_path),
    );

    let (side_a_image, side_b_image) =
        match ((side_a_image, side_a_label), (side_b_image, side_b_label)) {
            ((Some(a), _), (Some(b), _)) => (a, b),
            ((None, label), (Some(_), _)) | ((Some(_), _), (None, label)) => {
                return cx.throw_error(format!("failed to load ballot card image: {label}"));
            }
            ((None, a), (None, b)) => {
                return cx.throw_error(format!("failed to load ballot card images: {a}, {b}"));
            }
        };

    let bubble_template = load_ballot_scan_bubble_image().expect("failed to load bubble template");
    let bubble_template = bleed(
        &threshold(&bubble_template, otsu_level(&bubble_template)),
        Luma([0u8]),
    );
    let interpret_result = interpret_ballot_card(
        side_a_image,
        side_b_image,
        &Options {
            election,
            bubble_template,
            debug_side_a_base,
            debug_side_b_base,
        },
    );

    let card = match interpret_result {
        Ok(interpreted) => interpreted,
        Err(err) => {
            if let Ok(error_json) = serde_json::to_string(&err) {
                let error = Err(cx.string(error_json));
                return make_interpret_result(&mut cx, error);
            }

            return cx.throw_error(format!(
                "failed to interpret ballot card; further, the error could not be serialized: {:?}",
                err
            ));
        }
    };

    let json = serde_json::to_string(&card).or_else(|err| {
        cx.throw_error(format!(
            "ballot card interpretation succeeded, but serialization as JSON failed: {err}"
        ))
    })?;

    let value = Ok(cx.string(json));
    let result_object = make_interpret_result(&mut cx, value)?;

    let front_js_normalized_image_obj =
        ImageData::convert_gray_image_to_js_object(&mut cx, card.front.normalized_image)?;
    let back_js_normalized_image_obj =
        ImageData::convert_gray_image_to_js_object(&mut cx, card.back.normalized_image)?;
    result_object.set(
        &mut cx,
        "frontNormalizedImage",
        front_js_normalized_image_obj,
    )?;
    result_object.set(&mut cx, "backNormalizedImage", back_js_normalized_image_obj)?;

    Ok(result_object)
}

pub fn find_layout(mut cx: FunctionContext) -> JsResult<JsObject> {
    let side_a_image_or_path = get_image_data_or_path_from_arg(&mut cx, 0)?;
    let side_b_image_or_path = get_image_data_or_path_from_arg(&mut cx, 1)?;
    let side_a_label = side_a_image_or_path.as_label_or(SIDE_A_LABEL);
    let side_b_label = side_b_image_or_path.as_label_or(SIDE_B_LABEL);
    let (side_a_image, side_b_image) = rayon::join(
        || load_ballot_image_from_image_or_path(side_a_image_or_path),
        || load_ballot_image_from_image_or_path(side_b_image_or_path),
    );

    let (side_a_image, side_b_image) = match (
        (side_a_image, side_a_label.clone()),
        (side_b_image, side_b_label.clone()),
    ) {
        ((Some(a), _), (Some(b), _)) => (a, b),
        ((None, label), (Some(_), _)) | ((Some(_), _), (None, label)) => {
            return cx.throw_error(format!("failed to load ballot card image: {label}"));
        }
        ((None, a), (None, b)) => {
            return cx.throw_error(format!("failed to load ballot card images: {a}, {b}"));
        }
    };

    let ballot_card = match prepare_ballot_card_images(
        side_a_image,
        side_b_image,
        &PaperInfo::template(),
        ResizeStrategy::NoResize,
    ) {
        Ok(card) => card,
        Err(err) => {
            return cx.throw_error(format!("failed to prepare ballot card images: {:?}", err));
        }
    };

    let BallotCard {
        side_a,
        side_b,
        geometry,
    } = ballot_card;
    let (side_a_result, side_b_result) = rayon::join(
        || {
            find_timing_mark_grid(
                &side_a_label,
                &geometry,
                &side_a.image,
                side_a.border_inset,
                &mut ImageDebugWriter::disabled(),
            )
        },
        || {
            find_timing_mark_grid(
                &side_b_label,
                &geometry,
                &side_b.image,
                side_b.border_inset,
                &mut ImageDebugWriter::disabled(),
            )
        },
    );

    let ((side_a_grid, _), (side_b_grid, _)) = match (side_a_result, side_b_result) {
        (Ok(a), Ok(b)) => (a, b),
        (Err(err), _) | (_, Err(err)) => {
            return cx.throw_error(format!(
                "failed to find timing mark grid for ballot card: {:?}",
                err
            ));
        }
    };

    let bubble_template =
        load_ballot_template_bubble_image().expect("failed to load template bubble image");
    let bubble_match_threshold = 0.95;
    let bubble_match_error_pixels = 2;

    let (side_a_bubbles, side_b_bubbles) = rayon::join(
        || {
            find_empty_bubbles_matching_template(
                &side_a.image,
                &bubble_template,
                &side_a_grid,
                bubble_match_threshold,
                bubble_match_error_pixels,
            )
        },
        || {
            find_empty_bubbles_matching_template(
                &side_b.image,
                &bubble_template,
                &side_b_grid,
                bubble_match_threshold,
                bubble_match_error_pixels,
            )
        },
    );

    let side_a_grid_js_object = to_js(&mut cx, side_a_grid)?;
    let side_b_grid_js_object = to_js(&mut cx, side_b_grid)?;
    let side_a_bubbles_js_object = to_js(&mut cx, side_a_bubbles)?;
    let side_b_bubbles_js_object = to_js(&mut cx, side_b_bubbles)?;

    let side_a_js_object = cx.empty_object();
    side_a_js_object.set(&mut cx, "grid", side_a_grid_js_object)?;
    side_a_js_object.set(&mut cx, "bubbles", side_a_bubbles_js_object)?;
    let side_b_js_object = cx.empty_object();
    side_b_js_object.set(&mut cx, "grid", side_b_grid_js_object)?;
    side_b_js_object.set(&mut cx, "bubbles", side_b_bubbles_js_object)?;

    let js_grids = cx.empty_array();
    js_grids.set(&mut cx, 0, side_a_js_object)?;
    js_grids.set(&mut cx, 1, side_b_js_object)?;

    let js_result = cx.empty_object();
    js_result.set(&mut cx, "layouts", js_grids)?;
    Ok(js_result)
}

fn load_ballot_image_from_image_or_path(image_or_path: ImageSource) -> Option<GrayImage> {
    let image: Option<DynamicImage> = match image_or_path {
        ImageSource::ImageData(image) => Some(image.into()),
        ImageSource::Path(path) => image::open(path).ok(),
    };
    image.map(DynamicImage::into_luma8)
}
