#![allow(clippy::similar_names)]

use image::{DynamicImage, GrayImage};
use neon::prelude::*;
use neon::types::JsObject;

use crate::ballot_card::{load_ballot_scan_bubble_image, PaperInfo};
use crate::debug::ImageDebugWriter;
use crate::interpret::{
    ballot_card, prepare_ballot_page_image, Options, TimingMarkAlgorithm, SIDE_A_LABEL,
    SIDE_B_LABEL,
};
use crate::scoring::UnitIntervalScore;
use crate::timing_marks::contours::FindTimingMarkGridOptions;
use crate::timing_marks::{self, DefaultForGeometry};

use self::args::{
    get_election_definition_from_arg, get_image_data_or_path_from_arg, get_path_from_arg_opt,
    ImageSource,
};
use self::image_data::ImageData;

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
#[allow(clippy::too_many_lines)]
pub fn interpret(mut cx: FunctionContext) -> JsResult<JsObject> {
    let election = get_election_definition_from_arg(&mut cx, 0)?;
    let side_a_image_or_path = get_image_data_or_path_from_arg(&mut cx, 1)?;
    let side_b_image_or_path = get_image_data_or_path_from_arg(&mut cx, 2)?;
    let debug_side_a_base = get_path_from_arg_opt(&mut cx, 3);
    let debug_side_b_base = get_path_from_arg_opt(&mut cx, 4);

    // Equivalent to:
    //   let options = typeof arguments[5] === 'object' ? arguments[5] : {};
    let options = match cx.argument_opt(5) {
        Some(arg) => arg.downcast::<JsObject, _>(&mut cx).or_throw(&mut cx)?,
        None => cx.empty_object(),
    };

    // Equivalent to:
    //   let score_write_ins =
    //     typeof options.scoreWriteIns === 'boolean'
    //     ? options.scoreWriteIns
    //     : false;
    let score_write_ins = options
        .get_value(&mut cx, "scoreWriteIns")?
        .downcast::<JsBoolean, _>(&mut cx)
        .ok()
        .is_some_and(|b| b.value(&mut cx));

    // Equivalent to:
    //   let disable_vertical_streak_detection =
    //     typeof options.disableVerticalStreakDetection === 'boolean'
    //     ? options.disableVerticalStreakDetection
    //     : false;
    let disable_vertical_streak_detection = options
        .get_value(&mut cx, "disableVerticalStreakDetection")?
        .downcast::<JsBoolean, _>(&mut cx)
        .ok()
        .is_some_and(|b| b.value(&mut cx));

    // Equivalent to:
    //   let infer_timing_marks =
    //     typeof options.inferTimingMarks === 'boolean'
    //     ? options.inferTimingMarks
    //     : true;
    let infer_timing_marks = options
        .get_value(&mut cx, "inferTimingMarks")?
        .downcast::<JsBoolean, _>(&mut cx)
        .ok()
        .is_none_or(|b| b.value(&mut cx));

    let timing_mark_algorithm = options.get_value(&mut cx, "timingMarkAlgorithm")?;
    let timing_mark_algorithm: TimingMarkAlgorithm = if let Ok(timing_mark_algorithm) =
        timing_mark_algorithm.downcast::<JsString, _>(&mut cx)
    {
        match timing_mark_algorithm.value(&mut cx).parse() {
            Ok(timing_mark_algorithm) => timing_mark_algorithm,
            Err(e) => return cx.throw_type_error(format!("Invalid timing mark algorithm: {e}")),
        }
    } else if timing_mark_algorithm.is_a::<JsUndefined, _>(&mut cx) {
        TimingMarkAlgorithm::default()
    } else {
        return cx.throw_type_error("Invalid or missing timing mark algorithm");
    };

    let minimum_detected_scale = options.get_value(&mut cx, "minimumDetectedScale")?;
    let minimum_detected_scale = if let Ok(minimum_detected_scale) =
        minimum_detected_scale.downcast::<JsNumber, _>(&mut cx)
    {
        Some(UnitIntervalScore(
            minimum_detected_scale.value(&mut cx) as f32
        ))
    } else if minimum_detected_scale.is_a::<JsUndefined, _>(&mut cx) {
        None
    } else {
        return cx.throw_type_error("Invalid minimum detected scale");
    };

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
    let interpret_result = ballot_card(
        side_a_image,
        side_b_image,
        &Options {
            election,
            bubble_template,
            debug_side_a_base,
            debug_side_b_base,
            score_write_ins,
            disable_vertical_streak_detection,
            infer_timing_marks,
            timing_mark_algorithm,
            minimum_detected_scale,
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
                "failed to interpret ballot card; further, the error could not be serialized: {err:?}"
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

pub fn find_timing_mark_grid(mut cx: FunctionContext) -> JsResult<JsObject> {
    let image_or_path = get_image_data_or_path_from_arg(&mut cx, 0)?;
    let debug_base = get_path_from_arg_opt(&mut cx, 1);

    // Equivalent to:
    //   let options = typeof arguments[2] === 'object' ? arguments[2] : {};
    let options = match cx.argument_opt(2) {
        None => cx.empty_object(),
        Some(arg) if arg.is_a::<JsUndefined, _>(&mut cx) => cx.empty_object(),
        Some(arg) => arg.downcast_or_throw::<JsObject, _>(&mut cx)?,
    };

    let timing_mark_algorithm = options.get_value(&mut cx, "timingMarkAlgorithm")?;
    let timing_mark_algorithm: TimingMarkAlgorithm = if let Ok(timing_mark_algorithm) =
        timing_mark_algorithm.downcast::<JsString, _>(&mut cx)
    {
        match timing_mark_algorithm.value(&mut cx).parse() {
            Ok(timing_mark_algorithm) => timing_mark_algorithm,
            Err(e) => return cx.throw_type_error(format!("Invalid timing mark algorithm: {e}")),
        }
    } else if timing_mark_algorithm.is_a::<JsUndefined, _>(&mut cx) {
        TimingMarkAlgorithm::default()
    } else {
        return cx.throw_type_error("Invalid or missing timing mark algorithm");
    };

    let label = image_or_path.as_label_or("image");
    let Some(image) = load_ballot_image_from_image_or_path(image_or_path) else {
        return cx.throw_error(format!("failed to load ballot card image: {label}"));
    };

    let mut debug = match debug_base {
        Some(base) => ImageDebugWriter::new(base, image.clone()),
        None => ImageDebugWriter::disabled(),
    };

    let ballot_page = match prepare_ballot_page_image("image", image, &PaperInfo::scanned()) {
        Ok(ballot_page) => ballot_page,
        Err(err) => {
            return cx.throw_error(format!("failed to find timing mark grid: {err:?}"));
        }
    };

    let find_timing_marks_result = match timing_mark_algorithm {
        TimingMarkAlgorithm::Corners => timing_marks::corners::find_timing_mark_grid(
            &ballot_page.ballot_image,
            &ballot_page.geometry,
            &debug,
            &timing_marks::corners::Options::default_for_geometry(&ballot_page.geometry),
        ),
        TimingMarkAlgorithm::Contours => timing_marks::contours::find_timing_mark_grid(
            &ballot_page.geometry,
            &ballot_page.ballot_image,
            FindTimingMarkGridOptions {
                allowed_timing_mark_inset_percentage_of_width:
                    timing_marks::contours::ALLOWED_TIMING_MARK_INSET_PERCENTAGE_OF_WIDTH,
                infer_timing_marks: false,
                debug: &mut debug,
            },
        ),
    };

    let timing_marks = match find_timing_marks_result {
        Ok(timing_marks) => timing_marks,
        Err(err) => {
            return cx.throw_error(format!("failed to detect timing mark grid: {err:?}"));
        }
    };

    let timing_marks_json = match serde_json::to_string(&timing_marks) {
        Ok(json) => json,
        Err(err) => return cx.throw_error(format!("failed to serialize JSON: {err:?}")),
    };

    let json = cx.global::<JsObject>("JSON")?;
    let parse = json.get::<JsFunction, _, _>(&mut cx, "parse")?;
    let timing_marks_json = cx.string(timing_marks_json);
    let args = [timing_marks_json.as_value(&mut cx)];
    parse
        .call(&mut cx, json, args)?
        .downcast_or_throw::<JsObject, _>(&mut cx)
}

fn load_ballot_image_from_image_or_path(image_or_path: ImageSource) -> Option<GrayImage> {
    let image: Option<DynamicImage> = match image_or_path {
        ImageSource::ImageData(image) => Some(image.into()),
        ImageSource::Path(path) => image::open(path).ok(),
    };
    image.map(DynamicImage::into_luma8)
}

pub fn run_blank_paper_diagnostic(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let img_source = get_image_data_or_path_from_arg(&mut cx, 0)?;
    let debug_path = get_path_from_arg_opt(&mut cx, 1);

    let Some(img) = load_ballot_image_from_image_or_path(img_source) else {
        return cx.throw_error("failed to load image");
    };

    Ok(cx.boolean(crate::diagnostic::blank_paper(img, debug_path)))
}
