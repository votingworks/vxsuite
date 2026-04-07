// dead_code: `cargo test` compiles without the napi runtime, so #[napi] functions appear unused.
#![allow(clippy::similar_names, dead_code)]

use std::borrow::Cow;
use std::ffi::OsStr;
use std::path::PathBuf;

use image::{DynamicImage, GrayImage, RgbaImage};
use napi::bindgen_prelude::Buffer;
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use types_rs::bmd::cvr::CastVoteRecord;
use types_rs::bmd::multi_page::MultiPageCastVoteRecord;
use types_rs::coding;
use types_rs::election::Election;

use crate::ballot_card::{load_ballot_scan_bubble_image, BallotPage, PaperInfo};
use crate::interpret::{
    self, ballot_card, InterpretedBallotCard, Options, VerticalStreakDetection, WriteInScoring,
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
    minimum_detected_scale: Option<f64>,
    score_write_ins: Option<bool>,
    disable_vertical_streak_detection: Option<bool>,
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
) -> Result<JsInterpretResult, napi::Error> {
    let minimum_detected_scale = match options.minimum_detected_scale {
        Some(minimum_detected_scale)
            if minimum_detected_scale > f64::from(f32::MAX)
                || minimum_detected_scale < f64::from(f32::MIN) =>
        {
            return Err(napi::Error::from_reason("Invalid minimum detected scale"));
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
            minimum_detected_scale,
            max_cumulative_streak_width: options.max_cumulative_streak_width,
            retry_streak_width_threshold: options.retry_streak_width_threshold,
        },
    );

    let card = match interpret_result {
        Ok(card) => card,
        Err(err) => {
            // Don't throw `interpret::Error`, for better structured & typed handling.
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
        (Err(err), _) | (_, Err(err)) => {
            return Err(napi::Error::from_reason(err));
        }
        (Ok(()), Ok(())) => {}
    }

    Ok(JsInterpretResult::Ok(Box::new(card)))
}

fn from_json<T: serde::de::DeserializeOwned>(value: serde_json::Value) -> napi::Result<T> {
    serde_json::from_value(value).map_err(|e| napi::Error::from_reason(e.to_string()))
}

fn to_json<T: Serialize>(value: &T) -> napi::Result<serde_json::Value> {
    serde_json::to_value(value).map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi(
    ts_args_type = "election: Election, sideAImagePath: string, sideBImagePath: string, options: BridgeInterpretOptions",
    ts_return_type = "Promise<BridgeInterpretResult>"
)]
pub async fn interpret_paths(
    election: serde_json::Value,
    side_a_image_path: String,
    side_b_image_path: String,
    options: serde_json::Value,
) -> napi::Result<serde_json::Value> {
    let election: Election = from_json(election)?;
    let options: JsInterpretOptions = from_json(options)?;

    let (side_a_bytes, side_b_bytes) = tokio::try_join!(
        tokio::fs::read(&side_a_image_path),
        tokio::fs::read(&side_b_image_path),
    )
    .map_err(|err| napi::Error::from_reason(err.to_string()))?;

    // Decode images in parallel with rayon (CPU-bound)
    let (side_a_image, side_b_image) = match rayon::join(
        || image::load_from_memory(&side_a_bytes).map(DynamicImage::into_luma8),
        || image::load_from_memory(&side_b_bytes).map(DynamicImage::into_luma8),
    ) {
        (Err(err), _) | (_, Err(err)) => {
            return Err(napi::Error::from_reason(err.to_string()));
        }
        (Ok(side_a_image), Ok(side_b_image)) => (side_a_image, side_b_image),
    };

    let result = interpret(election, side_a_image, side_b_image, options)?;
    to_json(&result)
}

// unused_async: napi-rs requires `async fn` to return a Promise in JS.
#[allow(clippy::too_many_arguments, clippy::unused_async)]
#[napi(
    ts_args_type = "election: Election, sideAImageWidth: number, sideAImageHeight: number, sideAImageData: Buffer | Uint8ClampedArray, sideBImageWidth: number, sideBImageHeight: number, sideBImageData: Buffer | Uint8ClampedArray, options: BridgeInterpretOptions",
    ts_return_type = "Promise<BridgeInterpretResult>"
)]
pub async fn interpret_images(
    election: serde_json::Value,
    side_a_image_width: f64,
    side_a_image_height: f64,
    side_a_image_data: Buffer,
    side_b_image_width: f64,
    side_b_image_height: f64,
    side_b_image_data: Buffer,
    options: serde_json::Value,
) -> napi::Result<serde_json::Value> {
    let election: Election = from_json(election)?;
    let options: JsInterpretOptions = from_json(options)?;

    let (side_a_image, side_b_image) = match rayon::join(
        || {
            gray_image(
                side_a_image_width,
                side_a_image_height,
                side_a_image_data.to_vec(),
            )
        },
        || {
            gray_image(
                side_b_image_width,
                side_b_image_height,
                side_b_image_data.to_vec(),
            )
        },
    ) {
        (Err(err), _) | (_, Err(err)) => return Err(err),
        (Ok(side_a_image), Ok(side_b_image)) => (side_a_image, side_b_image),
    };

    let result = interpret(election, side_a_image, side_b_image, options)?;
    to_json(&result)
}

fn find_timing_mark_grid_inner(
    image: GrayImage,
    label: &str,
    debug_path: Option<PathBuf>,
) -> Result<TimingMarks, napi::Error> {
    let ballot_page = BallotPage::from_image(label, image, &PaperInfo::scanned(), debug_path)
        .map_err(|err| {
            napi::Error::from_reason(format!("Unable to prepare ballot page image: {err}"))
        })?;

    let find_timing_marks_result = ballot_page.find_timing_marks();

    find_timing_marks_result.map_err(|err| {
        napi::Error::from_reason(format!("failed to detect timing mark grid: {err:?}"))
    })
}

#[napi(
    ts_args_type = "imagePath: string, debugPath?: string",
    ts_return_type = "Promise<TimingMarks>"
)]
pub async fn find_timing_mark_grid_from_path(
    image_path: String,
    debug_path: Option<String>,
) -> napi::Result<serde_json::Value> {
    let image_path = PathBuf::from(&image_path);
    let label = image_path
        .file_name()
        .map(OsStr::to_string_lossy)
        .map_or_else(|| "image".to_owned(), Cow::into_owned);
    let bytes = tokio::fs::read(&image_path)
        .await
        .map_err(|err| napi::Error::from_reason(err.to_string()))?;
    let image = image::load_from_memory(&bytes)
        .map(DynamicImage::into_luma8)
        .map_err(|err| napi::Error::from_reason(err.to_string()))?;
    let timing_marks = find_timing_mark_grid_inner(image, &label, debug_path.map(Into::into))?;
    to_json(&timing_marks)
}

// unused_async: napi-rs requires `async fn` to return a Promise in JS.
#[allow(clippy::unused_async)]
#[napi(
    ts_args_type = "imageWidth: number, imageHeight: number, imageData: Buffer | Uint8ClampedArray, debugPath?: string",
    ts_return_type = "Promise<TimingMarks>"
)]
pub async fn find_timing_mark_grid_from_image(
    image_width: f64,
    image_height: f64,
    image_data: Buffer,
    debug_path: Option<String>,
) -> napi::Result<serde_json::Value> {
    let image = gray_image(image_width, image_height, image_data.to_vec())?;
    let timing_marks = find_timing_mark_grid_inner(image, "image", debug_path.map(Into::into))?;
    to_json(&timing_marks)
}

fn gray_image(width: f64, height: f64, data: Vec<u8>) -> Result<GrayImage, napi::Error> {
    let width = as_u32(width)?;
    let height = as_u32(height)?;
    let len = data.len();
    let pixel_count = (width as usize)
        .checked_mul(height as usize)
        .ok_or_else(|| {
            napi::Error::from_reason(format!(
                "Image dimensions overflow: width={width} height={height}"
            ))
        })?;

    if len == pixel_count {
        GrayImage::from_vec(width, height, data).ok_or_else(|| {
            napi::Error::from_reason(format!(
                "Could not construct GrayImage: width={width} height={height} buffer length={len}",
            ))
        })
    } else if Some(len) == pixel_count.checked_mul(4) {
        let rgba = RgbaImage::from_vec(width, height, data).ok_or_else(|| {
            napi::Error::from_reason(format!(
                "Could not construct RgbaImage: width={width} height={height} buffer length={len}",
            ))
        })?;
        Ok(DynamicImage::ImageRgba8(rgba).into_luma8())
    } else {
        Err(napi::Error::from_reason(format!(
            "Unexpected buffer length for image: width={width} height={height} buffer length={len}"
        )))
    }
}

fn as_u32(n: f64) -> Result<u32, napi::Error> {
    if n < 0.0 {
        Err(napi::Error::from_reason("Number is less than zero"))
    } else if n > f64::from(u32::MAX) {
        Err(napi::Error::from_reason("Number is too big (> u32::MAX)"))
    } else {
        Ok(n as u32)
    }
}

#[napi(
    ts_args_type = "imagePath: string, debugPath?: string",
    ts_return_type = "Promise<boolean>"
)]
pub async fn run_blank_paper_diagnostic_from_path(
    image_path: String,
    debug_path: Option<String>,
) -> napi::Result<bool> {
    let bytes = tokio::fs::read(&image_path)
        .await
        .map_err(|err| napi::Error::from_reason(err.to_string()))?;
    let image = image::load_from_memory(&bytes)
        .map(DynamicImage::into_luma8)
        .map_err(|err| napi::Error::from_reason(err.to_string()))?;
    Ok(crate::diagnostic::blank_paper(
        image,
        debug_path.map(PathBuf::from),
    ))
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
enum AnyCastVoteRecord {
    SinglePage(CastVoteRecord),
    MultiPage(MultiPageCastVoteRecord),
}

/// Decodes raw QR code bytes as either a single-page `CastVoteRecord` (VX\x02)
/// or a multi-page `MultiPageCastVoteRecord` (VB\x01). Used for cross-language
/// testing to verify the Rust decoder matches the TypeScript encoder.
// unused_async: napi-rs requires `async fn` to return a Promise in JS.
#[allow(clippy::unused_async)]
#[napi(
    ts_args_type = "election: Election, data: Buffer",
    ts_return_type = "Promise<BridgeDecodeBmdResult>"
)]
pub async fn decode_bmd_ballot_data(
    election: serde_json::Value,
    data: Buffer,
) -> napi::Result<serde_json::Value> {
    let election: types_rs::election::Election = from_json(election)?;
    let bytes = data.to_vec();

    // Try single-page first (VX\x02), then multi-page (VB\x01)
    let single_err = match coding::decode_with::<CastVoteRecord>(&bytes, &election) {
        Ok(cvr) => {
            return to_json(&AnyCastVoteRecord::SinglePage(cvr));
        }
        Err(e) => e,
    };

    let multi_err = match coding::decode_with::<MultiPageCastVoteRecord>(&bytes, &election) {
        Ok(mp) => {
            return to_json(&AnyCastVoteRecord::MultiPage(mp));
        }
        Err(e) => e,
    };

    Err(napi::Error::from_reason(format!(
        "Data does not decode as a single-page ({single_err}) or multi-page ({multi_err}) BMD ballot"
    )))
}

/// Encodes a `CastVoteRecord` or `MultiPageCastVoteRecord` to raw bytes
/// using the Rust bitstream encoder. Used for cross-language testing to
/// verify the Rust encoder matches the TypeScript decoder.
// unused_async: napi-rs requires `async fn` to return a Promise in JS.
#[allow(clippy::unused_async)]
#[napi(
    ts_args_type = "election: Election, record: BridgeDecodeBmdResult",
    ts_return_type = "Promise<Buffer>"
)]
pub async fn encode_bmd_ballot_data(
    election: serde_json::Value,
    record: serde_json::Value,
) -> napi::Result<Buffer> {
    let election: types_rs::election::Election = from_json(election)?;
    let record: AnyCastVoteRecord = from_json(record)?;

    let bytes = match record {
        AnyCastVoteRecord::SinglePage(cvr) => coding::encode_with(&cvr, &election),
        AnyCastVoteRecord::MultiPage(mp) => coding::encode_with(&mp, &election),
    }
    .map_err(|e| napi::Error::from_reason(format!("encoding failed: {e}")))?;

    Ok(Buffer::from(bytes))
}

#[cfg(test)]
mod test {
    use super::*;
    use proptest::prelude::*;

    // 200 DPI scan dimensions for 8.5" wide × 11"–22" tall sheets.
    const SCAN_WIDTH: u32 = 1700;
    const SCAN_HEIGHT_LETTER: u32 = 2200;
    const SCAN_HEIGHT_22IN: u32 = 4400;

    proptest! {
        #[test]
        fn gray_image_never_panics(
            width in proptest::num::f64::ANY,
            height in proptest::num::f64::ANY,
            data in proptest::collection::vec(proptest::num::u8::ANY, 0..256),
        ) {
            let _ = gray_image(width, height, data);
        }
    }

    #[test]
    fn gray_image_accepts_valid_gray_data() {
        for (w, h) in [
            (SCAN_WIDTH, SCAN_HEIGHT_LETTER),
            (SCAN_WIDTH, SCAN_HEIGHT_22IN),
        ] {
            let data = vec![128u8; w as usize * h as usize];
            let result = gray_image(f64::from(w), f64::from(h), data);
            assert!(result.is_ok());
            let img = result.unwrap();
            assert_eq!(img.width(), w);
            assert_eq!(img.height(), h);
        }
    }

    #[test]
    fn gray_image_accepts_valid_rgba_data() {
        for (w, h) in [
            (SCAN_WIDTH, SCAN_HEIGHT_LETTER),
            (SCAN_WIDTH, SCAN_HEIGHT_22IN),
        ] {
            let data = vec![128u8; w as usize * h as usize * 4];
            let result = gray_image(f64::from(w), f64::from(h), data);
            assert!(result.is_ok());
            let img = result.unwrap();
            assert_eq!(img.width(), w);
            assert_eq!(img.height(), h);
        }
    }

    #[test]
    fn gray_image_rejects_mismatched_buffer() {
        let pixel_count = SCAN_WIDTH as usize * SCAN_HEIGHT_LETTER as usize;
        // A buffer that is neither 1x nor 4x the pixel count.
        let data = vec![0u8; pixel_count * 2];
        assert!(gray_image(f64::from(SCAN_WIDTH), f64::from(SCAN_HEIGHT_LETTER), data).is_err());
    }

    #[test]
    fn gray_image_does_not_panic_on_pixel_count_times_4_overflow() {
        // u32::MAX × u32::MAX fits in usize on 64-bit, but multiplying by 4
        // overflows. This must return Err, not panic.
        let w = f64::from(u32::MAX);
        let h = f64::from(u32::MAX);
        assert!(gray_image(w, h, vec![]).is_err());
    }
}
