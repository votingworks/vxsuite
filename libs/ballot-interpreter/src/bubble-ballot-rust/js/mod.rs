#![allow(clippy::similar_names)]

use std::borrow::Cow;
use std::ffi::OsStr;
use std::path::PathBuf;

use image::{DynamicImage, GrayImage, RgbaImage};
use neon::types::extract::{Error, Json};
use serde::{Deserialize, Serialize};
use types_rs::election::Election;

use crate::ballot_card::{load_ballot_scan_bubble_image, BallotPage, PaperInfo};
use crate::interpret::{
    self, ballot_card, Inference, InterpretedBallotCard, Options, TimingMarkAlgorithm,
    VerticalStreakDetection, WriteInScoring,
};
use crate::scoring::UnitIntervalScore;
use crate::timing_marks::TimingMarks;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsInterpretOptions {
    front_normalized_image_output_path: Option<String>,
    back_normalized_image_output_path: Option<String>,
    debug_base_path_side_a: Option<String>,
    debug_base_path_side_b: Option<String>,
    timing_mark_algorithm: Option<TimingMarkAlgorithm>,
    minimum_detected_scale: Option<f64>,
    score_write_ins: Option<bool>,
    disable_vertical_streak_detection: Option<bool>,
    infer_timing_marks: Option<bool>,
    max_cumulative_streak_width: u32,
    retry_streak_width_threshold: u32,
}

/// Wraps an interpret error with a pre-computed `is_bubble_ballot` flag so
/// the TypeScript side doesn't have to infer ballot type from error strings.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct JsInterpretErr {
    #[serde(flatten)]
    error: interpret::Error,
    is_bubble_ballot: bool,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", content = "value")]
enum JsInterpretResult {
    #[serde(rename = "ok")]
    Ok(Box<InterpretedBallotCard>),
    #[serde(rename = "err")]
    Err(Box<JsInterpretErr>),
}

fn interpret(
    election: Election,
    side_a_image: GrayImage,
    side_b_image: GrayImage,
    options: JsInterpretOptions,
) -> Result<JsInterpretResult, Error> {
    let minimum_detected_scale = match options.minimum_detected_scale {
        Some(minimum_detected_scale)
            if minimum_detected_scale > f64::from(f32::MAX)
                || minimum_detected_scale < f64::from(f32::MIN) =>
        {
            return Err(Error::new("Invalid minimum detected scale"));
        }
        Some(minimum_detected_scale) => Some(UnitIntervalScore(minimum_detected_scale as f32)),
        None => None,
    };

    let bubble_template = load_ballot_scan_bubble_image().expect("failed to load bubble template");
    let interpret_result = ballot_card(
        side_a_image,
        side_b_image,
        &Options {
            election,
            bubble_template,
            debug_side_a_base: options.debug_base_path_side_a.map(PathBuf::from),
            debug_side_b_base: options.debug_base_path_side_b.map(PathBuf::from),
            write_in_scoring: if options.score_write_ins.unwrap_or(false) {
                WriteInScoring::Enabled
            } else {
                WriteInScoring::Disabled
            },
            vertical_streak_detection: if options.disable_vertical_streak_detection.unwrap_or(false)
            {
                VerticalStreakDetection::Disabled
            } else {
                VerticalStreakDetection::Enabled
            },
            timing_mark_algorithm: match options.timing_mark_algorithm.unwrap_or_default() {
                TimingMarkAlgorithm::Contours { .. } => TimingMarkAlgorithm::Contours {
                    inference: options
                        .infer_timing_marks
                        .map(|infer| {
                            if infer {
                                Inference::Enabled
                            } else {
                                Inference::Disabled
                            }
                        })
                        .unwrap_or_default(),
                },
                TimingMarkAlgorithm::Corners => TimingMarkAlgorithm::Corners,
            },
            minimum_detected_scale,
            max_cumulative_streak_width: options.max_cumulative_streak_width,
            retry_streak_width_threshold: options.retry_streak_width_threshold,
        },
    );

    let card = match interpret_result {
        Ok(card) => card,
        Err(err) => {
            // Don't `throw` `interpret::Error`, for better structured & typed handling.
            let is_bubble_ballot = err.is_bubble_ballot();
            return Ok(JsInterpretResult::Err(Box::new(JsInterpretErr {
                error: err,
                is_bubble_ballot,
            })));
        }
    };

    let maybe_save_normalized_image =
        |path: Option<PathBuf>, image: &GrayImage| -> Result<(), String> {
            match path {
                None => Ok(()),
                Some(ref path) => image.save(path).map_err(|err| {
                    format!(
                        "unable to save image to {path}: {err}",
                        path = path.display()
                    )
                }),
            }
        };

    match rayon::join(
        || {
            maybe_save_normalized_image(
                options
                    .front_normalized_image_output_path
                    .map(PathBuf::from),
                &card.front.normalized_image,
            )
        },
        || {
            maybe_save_normalized_image(
                options.back_normalized_image_output_path.map(PathBuf::from),
                &card.back.normalized_image,
            )
        },
    ) {
        (Err(err), _) | (_, Err(err)) => Err(err)?,
        (Ok(()), Ok(())) => {}
    }

    Ok(JsInterpretResult::Ok(Box::new(card)))
}

#[neon::export]
fn interpret_paths(
    Json(election): Json<Election>,
    side_a_image_path: String,
    side_b_image_path: String,
    Json(options): Json<JsInterpretOptions>,
) -> Result<Json<JsInterpretResult>, Error> {
    let (side_a_image, side_b_image) = match rayon::join(
        || image::open(side_a_image_path).map(DynamicImage::into_luma8),
        || image::open(side_b_image_path).map(DynamicImage::into_luma8),
    ) {
        (Err(err), _) | (_, Err(err)) => Err(err)?,
        (Ok(side_a_image), Ok(side_b_image)) => (side_a_image, side_b_image),
    };

    Ok(Json(interpret(
        election,
        side_a_image,
        side_b_image,
        options,
    )?))
}

#[allow(clippy::too_many_arguments)]
#[neon::export]
fn interpret_images(
    Json(election): Json<Election>,
    side_a_image_width: f64,
    side_a_image_height: f64,
    side_a_image_data: Vec<u8>,
    side_b_image_width: f64,
    side_b_image_height: f64,
    side_b_image_data: Vec<u8>,
    Json(options): Json<JsInterpretOptions>,
) -> Result<Json<JsInterpretResult>, Error> {
    let (side_a_image, side_b_image) = match rayon::join(
        || gray_image(side_a_image_width, side_a_image_height, side_a_image_data),
        || gray_image(side_b_image_width, side_b_image_height, side_b_image_data),
    ) {
        (Err(err), _) | (_, Err(err)) => Err(err)?,
        (Ok(side_a_image), Ok(side_b_image)) => (side_a_image, side_b_image),
    };

    Ok(Json(interpret(
        election,
        side_a_image,
        side_b_image,
        options,
    )?))
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
    let ballot_page = BallotPage::from_image(label, image, &PaperInfo::scanned(), debug_path)
        .map_err(|err| Error::new(format!("Unable to prepare ballot page image: {err}")))?;

    let timing_mark_algorithm = timing_mark_algorithm.unwrap_or_default();
    let find_timing_marks_result = ballot_page.find_timing_marks(timing_mark_algorithm);

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

fn gray_image(width: f64, height: f64, data: Vec<u8>) -> Result<GrayImage, Error> {
    let width = as_u32(width)?;
    let height = as_u32(height)?;
    let len = data.len();

    match len / (width as usize * height as usize) {
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
