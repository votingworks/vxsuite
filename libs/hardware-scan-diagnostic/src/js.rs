//! Contains JavaScript-facing functions and types. Everything marked `pub` and
//! annotated with `#[napi]` will automatically be exported and have type
//! declarations generated for it.
//!
//! Any structs that are exported are either `#[napi]` or `#[napi(object)]`. The
//! former stays a Rust object and holds onto its fields, even if they cannot be
//! represented in JavaScript, and are essentially passed across the boundary by
//! reference. The latter are converted between Rust and JavaScript types at
//! the boundary and can therefore be thought of as passing by value, though
//! this is a simplification.
//!
//! See https://napi.rs/docs/introduction/getting-started.

use crate::debug;
use crate::line_fitting::{BestFitLine, LineFit};
use crate::shape;
use image::{io::Reader as ImageReader, DynamicImage};
use napi::bindgen_prelude::*;

#[napi]
/// Load a scanned page image from the file at the given path.
pub async fn load_image(path: String) -> Result<GrayImage> {
    let image_data = tokio::fs::read(&path).await.map_err(|e| {
        Error::new(
            Status::InvalidArg,
            format!("Unable to read image from '{path}': {e}"),
        )
    })?;
    let cursor = std::io::Cursor::new(image_data);
    let loaded = ImageReader::new(cursor)
        .with_guessed_format()
        .map_err(|e| {
            Error::new(
                Status::InvalidArg,
                format!("Unable to guess format for image at '{path}': {e}"),
            )
        })?
        .decode()
        .map_err(|e| {
            Error::new(
                Status::InvalidArg,
                format!("Unable to decode image from '{path}': {e}"),
            )
        })?
        .into_luma8();
    Ok(GrayImage { image: loaded })
}

#[napi]
/// Create a `ScannedPage` from grayscale (1 byte per pixel) image data.
pub fn gray_image_from_gray_image_data(
    width: u32,
    height: u32,
    data: Uint8ClampedArray,
) -> Result<GrayImage> {
    let image = image::GrayImage::from_raw(width, height, data.to_vec()).ok_or_else(|| {
        Error::new(
            Status::InvalidArg,
            "Unable to create GrayImage from provided image data. Is it 1-channel grayscale?",
        )
    })?;
    Ok(GrayImage { image })
}

#[napi]
/// Create a `GrayImage` from RGBA (4 bytes per pixel) image data.
pub fn gray_image_from_rgba_image_data(
    width: u32,
    height: u32,
    data: Uint8ClampedArray,
) -> Result<GrayImage> {
    let image = image::RgbaImage::from_raw(width, height, data.to_vec()).ok_or_else(|| {
        Error::new(
            Status::InvalidArg,
            "Unable to create GrayImage from provided image data. Is it 4-channel RGBA?",
        )
    })?;
    Ok(GrayImage {
        image: DynamicImage::ImageRgba8(image).to_luma8(),
    })
}

#[napi(object, js_name = "Point")]
pub struct JsPoint {
    pub x: i32,
    pub y: i32,
}

/// Converts internal type to external type.
impl From<shape::Point> for JsPoint {
    fn from(value: shape::Point) -> Self {
        Self {
            x: value.x,
            y: value.y,
        }
    }
}

/// Converts external type to internal type.
impl From<JsPoint> for shape::Point {
    fn from(value: JsPoint) -> Self {
        Self {
            x: value.x,
            y: value.y,
        }
    }
}

#[napi(object, js_name = "BestFitLine")]
pub struct JsBestFitLine {
    /// Which orientation this line has.
    #[napi(ts_type = "\"horizontal\" | \"vertical\"")]
    pub orientation: String,

    /// The slope of the line as differs from a straight line with the
    /// orientation of this `BestFitLine`.
    pub slope: f64,

    /// The y-intercept for a horizontal line or the x-intercept for a vertical
    /// line.
    pub intercept: f64,

    /// The average distance each pixel along this edge is from its
    /// corresponding pixel along the line.
    pub error_average: f64,
}

/// Converts internal type to external type.
impl From<BestFitLine> for JsBestFitLine {
    fn from(value: BestFitLine) -> Self {
        Self {
            orientation: match &value {
                BestFitLine::Horizontal(_) => "horizontal".to_owned(),
                BestFitLine::Vertical(_) => "vertical".to_owned(),
            },
            slope: value.slope(),
            intercept: value.intercept(),
            error_average: value.error_average(),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum BestFitLineConvertError {
    #[error("Invalid orientation: {0}")]
    InvalidOrientation(String),
}

impl From<BestFitLineConvertError> for napi::Error {
    fn from(value: BestFitLineConvertError) -> Self {
        napi::Error::new(Status::GenericFailure, value.to_string())
    }
}

/// Converts external type to internal type.
impl TryFrom<JsBestFitLine> for BestFitLine {
    type Error = BestFitLineConvertError;

    fn try_from(value: JsBestFitLine) -> std::result::Result<Self, Self::Error> {
        match value.orientation.as_str() {
            "vertical" => Ok(Self::Vertical(LineFit::new(
                value.slope,
                value.intercept,
                value.error_average,
            ))),
            "horizontal" => Ok(Self::Horizontal(LineFit::new(
                value.slope,
                value.intercept,
                value.error_average,
            ))),
            _ => Err(BestFitLineConvertError::InvalidOrientation(
                value.orientation,
            )),
        }
    }
}

/// Results for skew/stretch/rotation analysis of scanned pages.
#[napi(object, js_name = "PageShapeAnalysis")]
pub struct JsPageShapeAnalysis {
    /// The best fit line for points along the top edge of the page shape.
    pub top_line: JsBestFitLine,

    /// The best fit line for points along the bottom edge of the page shape.
    pub bottom_line: JsBestFitLine,

    /// The best fit line for points along the left edge of the page shape.
    pub left_line: JsBestFitLine,

    /// The best fit line for points along the right edge of the page shape.
    pub right_line: JsBestFitLine,

    /// Intersection point of the top and left best fit lines.
    pub top_left_corner: JsPoint,

    /// Intersection point of the top and right best fit lines.
    pub top_right_corner: JsPoint,

    /// Intersection point of the bottom and left best fit lines.
    pub bottom_left_corner: JsPoint,

    /// Intersection point of the bottom and right best fit lines.
    pub bottom_right_corner: JsPoint,

    /// Average error of the four best fit lines, weighted by the
    /// corner-to-corner distance of each line.
    pub average_line_error: f64,

    /// Absolute angle delta of the horizontal lines (top & bottom) in radians.
    pub horizontal_lines_alignment_diff: f64,

    /// Absolute angle delta of the vertical lines (left & right) in radians.
    pub vertical_lines_alignment_diff: f64,
}

/// Analyze the given scanned page to find details of the page shape within the
/// image. This includes trying to locate the four edges, the four corners, and
/// deriving relevant information about them such as their slope and
/// straightness.
#[napi]
pub async fn analyze_scanned_page(scanned_page: &GrayImage) -> Result<JsPageShapeAnalysis> {
    Ok(shape::analyze_page(&scanned_page.image)?.into())
}

/// Converts internal error to external one.
impl From<shape::Error> for napi::Error {
    fn from(value: shape::Error) -> Self {
        napi::Error::new(Status::GenericFailure, format!("[shape::Error] {value}"))
    }
}

/// Holds a reference to a `image::GrayImage` for analysis purposes.
#[napi]
pub struct GrayImage {
    image: image::GrayImage,
}

/// Converts internal type to external type.
impl From<shape::PageShapeAnalysis> for JsPageShapeAnalysis {
    fn from(value: shape::PageShapeAnalysis) -> Self {
        Self {
            top_line: value.top_line.into(),
            bottom_line: value.bottom_line.into(),
            left_line: value.left_line.into(),
            right_line: value.right_line.into(),
            top_left_corner: value.top_left_corner.into(),
            top_right_corner: value.top_right_corner.into(),
            bottom_left_corner: value.bottom_left_corner.into(),
            bottom_right_corner: value.bottom_right_corner.into(),
            average_line_error: value.average_line_error,
            horizontal_lines_alignment_diff: value.horizontal_lines_alignment_diff,
            vertical_lines_alignment_diff: value.vertical_lines_alignment_diff,
        }
    }
}

/// Converts external type to internal type.
impl TryFrom<JsPageShapeAnalysis> for shape::PageShapeAnalysis {
    type Error = BestFitLineConvertError;

    fn try_from(value: JsPageShapeAnalysis) -> std::result::Result<Self, Self::Error> {
        Ok(Self {
            top_line: value.top_line.try_into()?,
            bottom_line: value.bottom_line.try_into()?,
            left_line: value.left_line.try_into()?,
            right_line: value.right_line.try_into()?,
            top_left_corner: value.top_left_corner.into(),
            top_right_corner: value.top_right_corner.into(),
            bottom_left_corner: value.bottom_left_corner.into(),
            bottom_right_corner: value.bottom_right_corner.into(),
            average_line_error: value.average_line_error,
            horizontal_lines_alignment_diff: value.horizontal_lines_alignment_diff,
            vertical_lines_alignment_diff: value.vertical_lines_alignment_diff,
        })
    }
}

/// Raw RGBA image data. Isomorphic to `ImageData` from e.g. `canvas`.
#[napi(object)]
pub struct RgbaImage {
    pub width: u32,
    pub height: u32,
    pub data: Uint8ClampedArray,
}

impl From<image::RgbaImage> for RgbaImage {
    fn from(value: image::RgbaImage) -> Self {
        let (width, height) = value.dimensions();
        Self {
            width,
            height,
            data: Uint8ClampedArray::new(value.into_vec()),
        }
    }
}

#[napi]
/// Generates a debug image based on the existing analysis of an original image.
pub async fn create_debug_image(
    original_image: &GrayImage,
    analysis: JsPageShapeAnalysis,
) -> Result<RgbaImage> {
    Ok(debug::analysis_image(original_image.image.clone(), &analysis.try_into()?).into())
}
