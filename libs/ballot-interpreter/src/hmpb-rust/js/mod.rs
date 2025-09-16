#![allow(clippy::similar_names)]

use std::borrow::Cow;
use std::ffi::OsStr;
use std::path::PathBuf;

use image::{DynamicImage, GrayImage, RgbaImage};
use neon::prelude::*;
use neon::types::extract::{Error, Json};
use neon::types::JsObject;
use serde::Deserialize;

use crate::ballot_card::{load_ballot_scan_bubble_image, PaperInfo};
use crate::debug::ImageDebugWriter;
use crate::interpret::{
    ballot_card, prepare_ballot_page_image, Options, TimingMarkAlgorithm, SIDE_A_LABEL,
    SIDE_B_LABEL,
};
use crate::scoring::UnitIntervalScore;
use crate::timing_marks::contours::FindTimingMarkGridOptions;
use crate::timing_marks::{self, DefaultForGeometry, TimingMarks};

use self::args::{get_election_definition_from_arg, get_image_data_or_path_from_arg, ImageSource};

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

    // Equivalent to:
    //   let options = typeof arguments[5] === 'object' ? arguments[5] : {};
    let options = match cx.argument_opt(3) {
        Some(arg) => arg.downcast::<JsObject, _>(&mut cx).or_throw(&mut cx)?,
        None => cx.empty_object(),
    };

    // Equivalent to:
    //   let front_normalized_image_output_path =
    //     typeof options.frontNormalizedImageOutputPath === 'string'
    //     ? options.frontNormalizedImageOutputPath
    //     : undefined;
    let front_normalized_image_output_path = options
        .get_value(&mut cx, "frontNormalizedImageOutputPath")?
        .downcast::<JsString, _>(&mut cx)
        .ok()
        .map(|path| PathBuf::from(path.value(&mut cx)));

    // Equivalent to:
    //   let back_normalized_image_output_path =
    //     typeof options.backNormalizedImageOutputPath === 'string'
    //     ? options.backNormalizedImageOutputPath
    //     : undefined;
    let back_normalized_image_output_path = options
        .get_value(&mut cx, "backNormalizedImageOutputPath")?
        .downcast::<JsString, _>(&mut cx)
        .ok()
        .map(|path| PathBuf::from(path.value(&mut cx)));

    // Equivalent to:
    //   let debug_side_a_base =
    //     typeof options.debugBasePathSideA === 'string'
    //     ? options.debugBasePathSideA
    //     : undefined;
    let debug_side_a_base = options
        .get_value(&mut cx, "debugBasePathSideA")?
        .downcast::<JsString, _>(&mut cx)
        .ok()
        .map(|path| PathBuf::from(path.value(&mut cx)));

    // Equivalent to:
    //   let debug_side_b_base =
    //     typeof options.debugBasePathSideB === 'string'
    //     ? options.debugBasePathSideB
    //     : undefined;
    let debug_side_b_base = options
        .get_value(&mut cx, "debugBasePathSideB")?
        .downcast::<JsString, _>(&mut cx)
        .ok()
        .map(|path| PathBuf::from(path.value(&mut cx)));

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

    let maybe_save_normalized_image =
        |path: Option<&PathBuf>, image: &GrayImage| -> Result<(), String> {
            match path {
                None => Ok(()),
                Some(path) => image.save(path).map_err(|err| {
                    format!(
                        "unable to save image to {path}: {err}",
                        path = path.display()
                    )
                }),
            }
        };

    let (front_save_result, back_save_result) = rayon::join(
        || {
            maybe_save_normalized_image(
                front_normalized_image_output_path.as_ref(),
                &card.front.normalized_image,
            )
        },
        || {
            maybe_save_normalized_image(
                back_normalized_image_output_path.as_ref(),
                &card.back.normalized_image,
            )
        },
    );

    front_save_result
        .and(back_save_result)
        .or_else(|err| cx.throw_error(err))?;

    let value = Ok(cx.string(json));
    make_interpret_result(&mut cx, value)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsFindTimingMarkGridOptions {
    timing_mark_algorithm: Option<TimingMarkAlgorithm>,
}

fn find_timing_mark_grid(
    image: GrayImage,
    label: &str,
    debug_path: Option<PathBuf>,
    timing_mark_algorithm: Option<TimingMarkAlgorithm>,
) -> Result<TimingMarks, Error> {
    let mut debug = match debug_path {
        Some(path) => ImageDebugWriter::new(path, image.clone()),
        None => ImageDebugWriter::disabled(),
    };

    let ballot_page = prepare_ballot_page_image(label, image, &PaperInfo::scanned())
        .map_err(|err| Error::new(format!("Unable to prepare ballot page image: {err}")))?;

    let timing_mark_algorithm = timing_mark_algorithm.unwrap_or_default();
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

    let timing_marks = find_timing_marks_result
        .map_err(|err| Error::new(format!("failed to detect timing mark grid: {err:?}")))?;

    Ok(timing_marks)
}

#[neon::export]
fn find_timing_mark_grid_from_path(
    image_path: String,
    debug_path: Option<String>,
    Json(options): Json<Option<JsFindTimingMarkGridOptions>>,
) -> Result<Json<TimingMarks>, Error> {
    let image_path = PathBuf::from(image_path);
    let label = image_path
        .file_name()
        .map(OsStr::to_string_lossy)
        .map_or_else(|| "image".to_owned(), Cow::into_owned);
    let image = image::open(image_path).map(DynamicImage::into_luma8)?;
    Ok(Json(find_timing_mark_grid(
        image,
        &label,
        debug_path.map(Into::into),
        options.and_then(|o| o.timing_mark_algorithm),
    )?))
}

#[neon::export]
fn find_timing_mark_grid_from_image(
    image_width: f64,
    image_height: f64,
    image_data: Vec<u8>,
    debug_path: Option<String>,
    Json(options): Json<Option<JsFindTimingMarkGridOptions>>,
) -> Result<Json<TimingMarks>, Error> {
    let image = gray_image(image_width, image_height, image_data)?;
    Ok(Json(find_timing_mark_grid(
        image,
        "image",
        debug_path.map(Into::into),
        options.and_then(|o| o.timing_mark_algorithm),
    )?))
}

fn load_ballot_image_from_image_or_path(image_or_path: ImageSource) -> Option<GrayImage> {
    let image: Option<DynamicImage> = match image_or_path {
        ImageSource::ImageData(image) => Some(image.into()),
        ImageSource::Path(path) => image::open(path).ok(),
    };
    image.map(DynamicImage::into_luma8)
}

fn gray_image(width: f64, height: f64, data: Vec<u8>) -> Result<GrayImage, Error> {
    let width = as_u32(width)?;
    let height = as_u32(height)?;
    let len = data.len();

    match  len / (width as usize * height as usize) {
        1 => Ok(GrayImage::from_vec(width, height, data).ok_or_else(|| {
            Error::new(format!(
                "Could not construct GrayImage with dimensions: width={width} height={height} buffer length={len}",
            ))
        })?),
        4 => Ok(DynamicImage::ImageRgba8(RgbaImage::from_vec(width, height, data).ok_or_else(|| {
            Error::new(format!(
                "Could not construct RgbaImage with dimensions: width={width} height={height} buffer length={len}",
            ))
        })?).into_luma8()),
        _ => Err(Error::new(format!("Could not construct image dimensions: width={width} height={height} buffer length={len}")))
    }
}

fn as_u32(n: f64) -> Result<u32, Error> {
    if n < 0.0 {
        Err(Error::new("Number is less than zero"))
    } else if n > f64::from(u32::MAX) {
        Err(Error::new("Number is too big (> u32::MAX)"))
    } else {
        Ok(n as u32)
    }
}

#[neon::export]
pub fn run_blank_paper_diagnostic_from_path(
    image_path: String,
    debug_path: Option<String>,
) -> Result<bool, Error> {
    let image = image::open(image_path).map(DynamicImage::into_luma8)?;
    Ok(crate::diagnostic::blank_paper(
        image,
        debug_path.map(PathBuf::from),
    ))
}
