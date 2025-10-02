#![allow(clippy::similar_names)]

use std::fmt::Display;
use std::io::Cursor;
use std::path::PathBuf;
use std::str::FromStr;

use bitstream_io::BigEndian;
use bitstream_io::BitReader;
use bitstream_io::FromBitStreamWith;
use image::GenericImageView;
use image::GrayImage;
use imageproc::contrast::otsu_level;
use rayon::iter::IntoParallelRefIterator;
use rayon::iter::ParallelIterator;
use serde::Serialize;
use serde_with::DeserializeFromStr;
use types_rs::ballot_card::BallotSide;
use types_rs::election::{BallotStyleId, Election, MetadataEncoding, PrecinctId};
use types_rs::geometry::PixelPosition;
use types_rs::geometry::{PixelUnit, Size};
use types_rs::hmpb;

use crate::ballot_card::get_matching_paper_info_for_image_size;
use crate::ballot_card::load_ballot_scan_bubble_image;
use crate::ballot_card::BallotCard;
use crate::ballot_card::BallotImage;
use crate::ballot_card::BallotPage;
use crate::ballot_card::Geometry;
use crate::ballot_card::PaperInfo;
use crate::ballot_card::RawBallotCard;
use crate::debug::ImageDebugWriter;
use crate::image_utils::detect_vertical_streaks;
use crate::image_utils::find_scanned_document_inset;
use crate::image_utils::Inset;
use crate::layout::build_interpreted_page_layout;
use crate::layout::InterpretedContestLayout;
use crate::qr_code;
use crate::scoring::score_bubble_marks_from_grid_layout;
use crate::scoring::score_write_in_areas;
use crate::scoring::ScoredBubbleMarks;
use crate::scoring::ScoredPositionAreas;
use crate::scoring::UnitIntervalScore;
use crate::timing_marks::contours;
use crate::timing_marks::corners;
use crate::timing_marks::normalize_orientation;
use crate::timing_marks::BallotPageMetadata;
use crate::timing_marks::BorderAxis;
use crate::timing_marks::DefaultForGeometry;
use crate::timing_marks::TimingMarks;

#[derive(Debug, Clone)]
pub struct Options {
    pub election: Election,
    pub bubble_template: GrayImage,
    pub debug_side_a_base: Option<PathBuf>,
    pub debug_side_b_base: Option<PathBuf>,
    pub write_in_scoring: WriteInScoring,
    pub vertical_streak_detection: VerticalStreakDetection,
    pub timing_mark_algorithm: TimingMarkAlgorithm,
    pub minimum_detected_scale: Option<UnitIntervalScore>,
}

#[derive(Debug, Clone, Copy, DeserializeFromStr)]
pub enum TimingMarkAlgorithm {
    Contours { inference: Inference },
    Corners,
}

impl Default for TimingMarkAlgorithm {
    fn default() -> Self {
        Self::Corners
    }
}

impl Display for TimingMarkAlgorithm {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Contours { .. } => write!(f, "contours"),
            Self::Corners => write!(f, "corners"),
        }
    }
}

impl FromStr for TimingMarkAlgorithm {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "contours" => Ok(Self::Contours {
                inference: Inference::Enabled,
            }),
            "corners" => Ok(Self::Corners),
            _ => Err(format!("Unexpected algorithm: {s}")),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum Inference {
    Enabled,
    Disabled,
}

impl FromStr for Inference {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "yes" | "enabled" | "infer" => Ok(Self::Enabled),
            "no" | "disabled" | "noinfer" | "no-infer" => Ok(Self::Disabled),
            _ => Err(format!("Unexpected inference: {s}")),
        }
    }
}

impl Default for Inference {
    fn default() -> Self {
        Self::Enabled
    }
}

#[derive(Debug, Clone, Copy, DeserializeFromStr, PartialEq)]
pub enum VerticalStreakDetection {
    Enabled,
    Disabled,
}

impl Default for VerticalStreakDetection {
    fn default() -> Self {
        Self::Enabled
    }
}

impl Display for VerticalStreakDetection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Enabled => write!(f, "enabled"),
            Self::Disabled => write!(f, "disabled"),
        }
    }
}

impl FromStr for VerticalStreakDetection {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "enabled" => Ok(Self::Enabled),
            "disabled" => Ok(Self::Disabled),
            _ => Err(format!("Unexpected vertical streak detection setting: {s}")),
        }
    }
}

#[derive(Debug, Clone, Copy, DeserializeFromStr, PartialEq)]
pub enum WriteInScoring {
    Enabled,
    Disabled,
}

impl Display for WriteInScoring {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Enabled => write!(f, "enabled"),
            Self::Disabled => write!(f, "disabled"),
        }
    }
}

impl FromStr for WriteInScoring {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "enabled" => Ok(Self::Enabled),
            "disabled" => Ok(Self::Disabled),
            _ => Err(format!("Unexpected write-in scoring setting: {s}")),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterpretedBallotPage {
    pub timing_marks: TimingMarks,
    pub metadata: BallotPageMetadata,
    pub marks: ScoredBubbleMarks,
    pub write_ins: ScoredPositionAreas,
    #[serde(skip_serializing)] // `normalized_image` is returned separately.
    pub normalized_image: GrayImage,
    pub contest_layouts: Vec<InterpretedContestLayout>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterpretedBallotCard {
    pub front: InterpretedBallotPage,
    pub back: InterpretedBallotPage,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BallotPageAndGeometry {
    pub label: String,
    pub border_inset: Inset,
    pub geometry: Geometry,
}

#[derive(Debug, Serialize, Clone, thiserror::Error)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Error {
    #[error("could not find border inset for {label}")]
    BorderInsetNotFound { label: String },

    #[error("invalid card metadata: {SIDE_A_LABEL}: {side_a:?}, {SIDE_B_LABEL}: {side_b:?}")]
    #[serde(rename_all = "camelCase")]
    InvalidCardMetadata {
        side_a: BallotPageMetadata,
        side_b: BallotPageMetadata,
    },

    #[error("invalid QR code metadata for {label}: {message}")]
    InvalidQrCodeMetadata { label: String, message: String },

    #[error("mismatched precincts: {SIDE_A_LABEL}: {side_a:?}, {SIDE_B_LABEL}: {side_b:?}")]
    #[serde(rename_all = "camelCase")]
    MismatchedPrecincts {
        side_a: PrecinctId,
        side_b: PrecinctId,
    },

    #[error("mismatched ballot styles: {SIDE_A_LABEL}: {side_a:?}, {SIDE_B_LABEL}: {side_b:?}")]
    #[serde(rename_all = "camelCase")]
    MismatchedBallotStyles {
        side_a: BallotStyleId,
        side_b: BallotStyleId,
    },

    #[error(
        "non-consecutive page numbers: {SIDE_A_LABEL}: {side_a:?}, {SIDE_B_LABEL}: {side_b:?}"
    )]
    #[serde(rename_all = "camelCase")]
    NonConsecutivePageNumbers { side_a: u8, side_b: u8 },

    #[error(
        "mismatched ballot card geometries: {SIDE_A_LABEL}: {side_a:?}, {SIDE_B_LABEL}: {side_b:?}"
    )]
    #[serde(rename_all = "camelCase")]
    MismatchedBallotCardGeometries {
        side_a: BallotPageAndGeometry,
        side_b: BallotPageAndGeometry,
    },

    #[error("missing grid layout: front: {front:?}, back: {back:?}")]
    MissingGridLayout {
        front: BallotPageMetadata,
        back: BallotPageMetadata,
    },

    #[error("missing timing marks: {reason}")]
    MissingTimingMarks { reason: String },

    #[error("unexpected dimensions for {label}: {dimensions:?}")]
    UnexpectedDimensions {
        label: String,
        dimensions: Size<PixelUnit>,
    },

    #[error("invalid detected ballot scale: {scale}")]
    InvalidScale {
        label: String,
        scale: UnitIntervalScore,
    },

    #[error("could not compute layout for {side:?}")]
    CouldNotComputeLayout { side: BallotSide },

    #[error("vertical streaks detected on {label:?}")]
    #[serde(rename_all = "camelCase")]
    VerticalStreaksDetected {
        label: String,
        x_coordinates: Vec<PixelPosition>,
    },

    #[error("invalid election: {message}")]
    InvalidElection { message: String },
}

pub type Result<T, E = Error> = std::result::Result<T, E>;

pub const SIDE_A_LABEL: &str = "side A";
pub const SIDE_B_LABEL: &str = "side B";

pub struct ScanInterpreter {
    election: Election,
    write_in_scoring: WriteInScoring,
    vertical_streak_detection: VerticalStreakDetection,
    bubble_template_image: GrayImage,
    timing_mark_algorithm: TimingMarkAlgorithm,
    minimum_detected_scale: Option<f32>,
}

impl ScanInterpreter {
    /// Creates a new `ScanInterpreter` with the given configuration.
    ///
    /// # Errors
    ///
    /// Returns an error if the bubble template image could not be loaded.
    pub fn new(
        election: Election,
        write_in_scoring: WriteInScoring,
        vertical_streak_detection: VerticalStreakDetection,
        timing_mark_algorithm: TimingMarkAlgorithm,
        minimum_detected_scale: Option<f32>,
    ) -> Result<Self, image::ImageError> {
        let bubble_template_image = load_ballot_scan_bubble_image()?;
        Ok(Self {
            election,
            write_in_scoring,
            vertical_streak_detection,
            bubble_template_image,
            timing_mark_algorithm,
            minimum_detected_scale,
        })
    }

    /// Interprets a pair of ballot card images.
    ///
    /// # Errors
    ///
    /// Returns an error if the images could not be interpreted.
    #[allow(clippy::result_large_err)]
    pub fn interpret<P: Into<Option<PathBuf>>>(
        &self,
        side_a_image: GrayImage,
        side_b_image: GrayImage,
        debug_side_a_base: P,
        debug_side_b_base: P,
    ) -> Result<InterpretedBallotCard> {
        let options = Options {
            election: self.election.clone(),
            bubble_template: self.bubble_template_image.clone(),
            debug_side_a_base: debug_side_a_base.into(),
            debug_side_b_base: debug_side_b_base.into(),
            write_in_scoring: self.write_in_scoring,
            vertical_streak_detection: self.vertical_streak_detection,
            timing_mark_algorithm: self.timing_mark_algorithm,
            minimum_detected_scale: self.minimum_detected_scale.map(UnitIntervalScore),
        };
        ballot_card(side_a_image, side_b_image, &options)
    }
}

/// Interpret a ballot card image.
///
/// # Errors
///
/// Returns an error if the ballot card could not be interpreted.
#[allow(clippy::too_many_lines, clippy::result_large_err)]
pub fn ballot_card(
    side_a_image: GrayImage,
    side_b_image: GrayImage,
    options: &Options,
) -> Result<InterpretedBallotCard> {
    let Some(ref grid_layouts) = options.election.grid_layouts else {
        return Err(Error::InvalidElection {
            message: "required field `gridLayouts` is missing".to_owned(),
        });
    };
    let ballot_card = RawBallotCard::new(side_a_image, side_b_image).into_ballot_card(
        &PaperInfo::scanned(),
        (
            options.debug_side_a_base.clone(),
            options.debug_side_b_base.clone(),
        ),
    )?;
    let geometry = ballot_card.geometry();

    if options.vertical_streak_detection == VerticalStreakDetection::Enabled {
        ballot_card.detect_vertical_streaks()?;
    }

    let timing_marks = ballot_card.find_timing_marks(options.timing_mark_algorithm)?;

    if let Some(minimum_scale) = options.minimum_detected_scale {
        ballot_card.enforce_minimum_scale(minimum_scale, &timing_marks)?;
    }

    let qr_code_detection_results = ballot_card.detect_qr_codes();

    // We'll find the appropriate metadata, use it to normalize the image and
    // grid orientation, and extract the ballot style from it.
    let (
        (front_timing_marks, front_image, front_threshold, front_metadata, front_debug),
        (back_timing_marks, back_image, back_threshold, back_metadata, back_debug),
        ballot_style_id,
    ) = match options.election.ballot_layout.metadata_encoding {
        MetadataEncoding::QrCode => {
            let (qr_code_result_a, qr_code_result_b) = qr_code_detection_results.into();
            let (side_a_qr_code_result, side_b_qr_code_result) = par_map_pair(
                (qr_code_result_a, SIDE_A_LABEL),
                (qr_code_result_b, SIDE_B_LABEL),
                |(qr_code_result, label)| {
                    let qr_code = qr_code_result?;
                    let metadata = hmpb::Metadata::from_reader(
                        &mut BitReader::endian(Cursor::new(qr_code.bytes()), BigEndian),
                        &options.election,
                    )
                    .map_err(|e| Error::InvalidQrCodeMetadata {
                        label: label.to_string(),
                        message: format!(
                            "Unable to decode QR code bytes: {e} (bytes={bytes:?})",
                            bytes = qr_code.bytes()
                        ),
                    })?;
                    Ok((metadata, qr_code.orientation()))
                },
            );

            // If one side has a detected QR code and the other doesn't, we can
            // infer the missing metadata from the detected metadata.
            let (side_a_qr_code_result, side_b_qr_code_result) =
                match (side_a_qr_code_result, side_b_qr_code_result) {
                    (
                        Err(Error::InvalidQrCodeMetadata { .. }),
                        Ok((side_b_metadata, side_b_orientation)),
                    ) => {
                        let side_a_metadata = hmpb::infer_missing_page_metadata(&side_b_metadata);
                        let side_a_orientation = side_b_orientation;

                        (
                            Ok((side_a_metadata, side_a_orientation)),
                            Ok((side_b_metadata, side_b_orientation)),
                        )
                    }
                    (
                        Ok((side_a_metadata, side_a_orientation)),
                        Err(Error::InvalidQrCodeMetadata { .. }),
                    ) => {
                        let side_b_metadata = hmpb::infer_missing_page_metadata(&side_a_metadata);
                        let side_b_orientation = side_a_orientation;

                        (
                            Ok((side_a_metadata, side_a_orientation)),
                            Ok((side_b_metadata, side_b_orientation)),
                        )
                    }
                    (side_a_qr_code_result, side_b_qr_code_result) => {
                        (side_a_qr_code_result, side_b_qr_code_result)
                    }
                };

            let (side_a_metadata, side_a_orientation) = side_a_qr_code_result?;
            let (side_b_metadata, side_b_orientation) = side_b_qr_code_result?;

            let (
                (side_a_normalized_grid, side_a_normalized_image),
                (side_b_normalized_grid, side_b_normalized_image),
            ) = par_map_pair(
                (
                    side_a_timing_marks,
                    &side_a.image,
                    side_a_orientation,
                    &mut side_a_debug,
                ),
                (
                    side_b_timing_marks,
                    &side_b.image,
                    side_b_orientation,
                    &mut side_b_debug,
                ),
                |(grid, image, orientation, debug)| {
                    normalize_orientation(&geometry, grid, image, orientation, debug)
                },
            );

            if side_a_metadata.precinct_id != side_b_metadata.precinct_id {
                return Err(Error::MismatchedPrecincts {
                    side_a: side_a_metadata.precinct_id,
                    side_b: side_b_metadata.precinct_id,
                });
            }
            if side_a_metadata.ballot_style_id != side_b_metadata.ballot_style_id {
                return Err(Error::MismatchedBallotStyles {
                    side_a: side_a_metadata.ballot_style_id,
                    side_b: side_b_metadata.ballot_style_id,
                });
            }
            if side_a_metadata.page_number.opposite() != side_b_metadata.page_number {
                return Err(Error::NonConsecutivePageNumbers {
                    side_a: side_a_metadata.page_number.get(),
                    side_b: side_b_metadata.page_number.get(),
                });
            }

            let (side_a, side_b) = (
                (
                    side_a_normalized_grid,
                    side_a_normalized_image,
                    side_a.threshold,
                    BallotPageMetadata::QrCode(side_a_metadata.clone()),
                    side_a_debug,
                ),
                (
                    side_b_normalized_grid,
                    side_b_normalized_image,
                    side_b.threshold,
                    BallotPageMetadata::QrCode(side_b_metadata),
                    side_b_debug,
                ),
            );

            let ballot_style_id = side_a_metadata.ballot_style_id.clone();

            if side_a_metadata.page_number.is_front() {
                (side_a, side_b, ballot_style_id)
            } else {
                (side_b, side_a, ballot_style_id)
            }
        }
    };

    let Some(grid_layout) = grid_layouts
        .iter()
        .find(|layout| layout.ballot_style_id == ballot_style_id)
    else {
        return Err(Error::MissingGridLayout {
            front: front_metadata,
            back: back_metadata,
        });
    };

    let sheet_number = match &front_metadata {
        BallotPageMetadata::QrCode(metadata) => {
            u32::from(metadata.page_number.sheet_number().get())
        }
    };

    let (front_scored_bubble_marks, back_scored_bubble_marks) = par_map_pair(
        (
            &front_image,
            front_threshold,
            &front_timing_marks,
            BallotSide::Front,
            &front_debug,
        ),
        (
            &back_image,
            back_threshold,
            &back_timing_marks,
            BallotSide::Back,
            &back_debug,
        ),
        |(image, threshold, timing_marks, side, debug)| {
            score_bubble_marks_from_grid_layout(
                image,
                threshold,
                &options.bubble_template,
                timing_marks,
                grid_layout,
                sheet_number,
                side,
                debug,
            )
        },
    );

    let (front_contest_layouts, back_contest_layouts) = map_pair(
        (&front_timing_marks, BallotSide::Front, &front_debug),
        (&back_timing_marks, BallotSide::Back, &back_debug),
        |(grid, side, debug)| {
            build_interpreted_page_layout(grid, grid_layout, sheet_number, side, debug)
                .ok_or(Error::CouldNotComputeLayout { side })
        },
    );
    let front_contest_layouts = front_contest_layouts?;
    let back_contest_layouts = back_contest_layouts?;

    let (front_write_in_area_scores, back_write_in_area_scores) = match options.write_in_scoring {
        WriteInScoring::Enabled => par_map_pair(
            (
                &front_image,
                front_threshold,
                &front_timing_marks,
                BallotSide::Front,
                &front_debug,
            ),
            (
                &back_image,
                back_threshold,
                &back_timing_marks,
                BallotSide::Back,
                &back_debug,
            ),
            |(image, threshold, grid, side, debug)| {
                score_write_in_areas(
                    image,
                    threshold,
                    grid,
                    grid_layout,
                    sheet_number,
                    side,
                    debug,
                )
            },
        ),
        WriteInScoring::Disabled => Default::default(),
    };

    let normalized_front_image = imageproc::contrast::threshold(&front_image, front_threshold);
    let normalized_back_image = imageproc::contrast::threshold(&back_image, back_threshold);

    Ok(InterpretedBallotCard {
        front: InterpretedBallotPage {
            timing_marks: front_timing_marks,
            metadata: front_metadata,
            marks: front_scored_bubble_marks,
            write_ins: front_write_in_area_scores,
            normalized_image: normalized_front_image,
            contest_layouts: front_contest_layouts,
        },
        back: InterpretedBallotPage {
            timing_marks: back_timing_marks,
            metadata: back_metadata,
            marks: back_scored_bubble_marks,
            write_ins: back_write_in_area_scores,
            normalized_image: normalized_back_image,
            contest_layouts: back_contest_layouts,
        },
    })
}

pub fn par_map_pair<T, F, R>(left: T, right: T, mapper: F) -> (R, R)
where
    F: Fn(T) -> R + Send + Sync,
    R: Send,
    T: Send,
{
    rayon::join(|| mapper(left), || mapper(right))
}

pub fn map_pair<T, F, R>(left: T, right: T, mapper: F) -> (R, R)
where
    F: Fn(T) -> R,
{
    (mapper(left), mapper(right))
}

#[cfg(test)]
#[allow(clippy::similar_names, clippy::unwrap_used)]
mod test {
    use std::{
        fs::File,
        io::BufReader,
        path::{Path, PathBuf},
    };

    use image::{imageops::FilterType, GenericImage, Luma};
    use imageproc::geometric_transformations::{self, Interpolation, Projection};
    use itertools::Itertools;
    use types_rs::{
        election::{ContestId, OptionId},
        geometry::{Degrees, PixelPosition, Radians, Rect},
    };

    use crate::{
        ballot_card::load_ballot_scan_bubble_image, scoring::UnitIntervalScore,
        timing_marks::TimingMarks,
    };

    use super::*;

    /// Loads a ballot page image from disk as grayscale.
    fn load_ballot_page_image(image_path: &Path) -> GrayImage {
        image::open(image_path).unwrap().into_luma8()
    }

    /// Loads images for both sides of a ballot card and returns them.
    fn load_ballot_card_images(side_a_path: &Path, side_b_path: &Path) -> (GrayImage, GrayImage) {
        par_map_pair(side_a_path, side_b_path, load_ballot_page_image)
    }

    fn load_ballot_card_fixture(
        fixture_name: &str,
        (side_a_name, side_b_name): (&str, &str),
    ) -> (GrayImage, GrayImage, Options) {
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test/fixtures");
        let election_path = fixture_path.join(fixture_name).join("election.json");
        let election: Election =
            serde_json::from_reader(BufReader::new(File::open(election_path).unwrap())).unwrap();
        let bubble_template = load_ballot_scan_bubble_image().unwrap();
        let side_a_path = fixture_path.join(fixture_name).join(side_a_name);
        let side_b_path = fixture_path.join(fixture_name).join(side_b_name);
        let (side_a_image, side_b_image) = load_ballot_card_images(&side_a_path, &side_b_path);
        let options = Options {
            debug_side_a_base: None,
            debug_side_b_base: None,
            bubble_template,
            election,
            write_in_scoring: WriteInScoring::Enabled,
            vertical_streak_detection: VerticalStreakDetection::Enabled,
            timing_mark_algorithm: TimingMarkAlgorithm::default(),
            minimum_detected_scale: None,
        };
        (side_a_image, side_b_image, options)
    }

    fn load_hmpb_fixture(
        fixture_name: &str,
        starting_page_number: usize,
    ) -> (GrayImage, GrayImage, Options) {
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../hmpb/fixtures/")
            .join(fixture_name);
        let election_path = fixture_path.join("election.json");
        let election =
            serde_json::from_reader(BufReader::new(File::open(election_path).unwrap())).unwrap();

        let bubble_template = load_ballot_scan_bubble_image().unwrap();
        let side_a_path = fixture_path.join(format!("blank-ballot-p{starting_page_number}.jpg"));
        let side_b_path =
            fixture_path.join(format!("blank-ballot-p{}.jpg", starting_page_number + 1));
        let (side_a_image, side_b_image) = load_ballot_card_images(&side_a_path, &side_b_path);
        let options = Options {
            debug_side_a_base: None,
            debug_side_b_base: None,
            bubble_template,
            election,
            write_in_scoring: WriteInScoring::Enabled,
            vertical_streak_detection: VerticalStreakDetection::Enabled,
            timing_mark_algorithm: TimingMarkAlgorithm::default(),
            minimum_detected_scale: None,
        };
        (side_a_image, side_b_image, options)
    }

    fn deface_ballot_by_removing_side_timing_marks(image: &mut GrayImage, marks: &TimingMarks) {
        const PADDING: u32 = 10;
        let image_rect = Rect::new(0, 0, image.width(), image.height());
        let left_side_mark_to_deface = marks.left_marks[marks.left_marks.len() / 2];
        let right_side_mark_to_deface = marks.right_marks[marks.right_marks.len() / 2];

        for mark_to_deface in [left_side_mark_to_deface, right_side_mark_to_deface] {
            let rect = mark_to_deface.rect();
            let rect = Rect::new(
                rect.left() - PADDING as i32,
                rect.top() - PADDING as i32,
                rect.width() + 20,
                rect.height() + PADDING * 2,
            )
            .intersect(&image_rect)
            .unwrap();
            for x in rect.left()..rect.right() {
                for y in rect.top()..rect.bottom() {
                    image.put_pixel(x as u32, y as u32, Luma([255]));
                }
            }
        }
    }

    fn is_binary_image(image: &GrayImage) -> bool {
        image
            .as_raw()
            .iter()
            .all(|&pixel| pixel == 0 || pixel == 255)
    }

    #[test]
    fn test_par_map_pair() {
        assert_eq!(par_map_pair(1, 2, |n| n * 2), (2, 4));
    }

    #[test]
    fn test_interpret_returns_binarized_images() {
        let (side_a_image, side_b_image, options) =
            load_hmpb_fixture("vx-general-election/letter", 1);
        let card = ballot_card(side_a_image, side_b_image, &options).unwrap();
        assert!(is_binary_image(&card.front.normalized_image));
        assert!(is_binary_image(&card.back.normalized_image));
    }

    #[test]
    fn test_inferred_missing_metadata_from_one_side() {
        let (mut side_a_image, side_b_image, options) =
            load_hmpb_fixture("vx-general-election/letter", 1);
        let detected = qr_code::detect(&side_a_image, &ImageDebugWriter::disabled()).unwrap();
        let qr_code_bounds = detected.bounds();

        // white out the QR code on side A
        for y in qr_code_bounds.top()..qr_code_bounds.bottom() {
            for x in qr_code_bounds.left()..qr_code_bounds.right() {
                side_a_image.put_pixel(x as u32, y as u32, image::Luma([255]));
            }
        }

        ballot_card(side_a_image, side_b_image, &options).unwrap();
    }

    #[test]
    fn test_vertical_streaks() {
        let (mut side_a_image, mut side_b_image, options) =
            load_hmpb_fixture("vx-general-election/letter", 1);
        let thin_complete_streak_x = side_a_image.width() / 5;
        let thick_complete_streak_x = side_a_image.width() * 2 / 5;
        let fuzzy_streak_x = side_a_image.width() * 3 / 5;
        let incomplete_streak_x = side_a_image.width() * 4 / 5;
        let cropped_streak_x = side_a_image.width() - 2;
        let black_pixel = Luma([0]);
        for y in 0..side_a_image.height() {
            side_a_image.put_pixel(thin_complete_streak_x, y, black_pixel);
            side_a_image.put_pixel(thick_complete_streak_x, y, black_pixel);
            side_a_image.put_pixel(thick_complete_streak_x + 1, y, black_pixel);
            side_a_image.put_pixel(thick_complete_streak_x + 2, y, black_pixel);
            if (y % 2) == 0 {
                side_a_image.put_pixel(fuzzy_streak_x, y, black_pixel);
            }
            if (y % 3) != 0 {
                side_a_image.put_pixel(fuzzy_streak_x + 1, y, black_pixel);
            }
            // Draw an incomplete streak on side B
            if y > 20 {
                side_b_image.put_pixel(incomplete_streak_x, y, black_pixel);
            }
            side_a_image.put_pixel(cropped_streak_x, y, black_pixel);
        }
        let Error::VerticalStreaksDetected {
            label,
            x_coordinates,
        } = ballot_card(side_a_image.clone(), side_b_image.clone(), &options).unwrap_err()
        else {
            panic!("wrong error type");
        };
        assert_eq!(label, "side A");
        assert_eq!(
            x_coordinates,
            vec![
                thin_complete_streak_x as PixelPosition,
                (thick_complete_streak_x + 2) as PixelPosition,
                fuzzy_streak_x as PixelPosition
            ]
        );

        // ensure that we do NOT detect streaks when the option is disabled
        ballot_card(
            side_a_image,
            side_b_image,
            &Options {
                vertical_streak_detection: VerticalStreakDetection::Disabled,
                ..options
            },
        )
        .unwrap();
    }

    #[test]
    fn test_vertical_streak_through_left_timing_mark() {
        let (mut side_a_image, side_b_image, options) =
            load_hmpb_fixture("vx-general-election/letter", 1);
        let timing_mark_x = 60;
        let black_pixel = Luma([0]);
        for y in 0..side_a_image.height() {
            side_a_image.put_pixel(timing_mark_x, y, black_pixel);
        }
        let Error::VerticalStreaksDetected {
            label,
            x_coordinates,
        } = ballot_card(side_a_image, side_b_image, &options).unwrap_err()
        else {
            panic!("wrong error type");
        };
        assert_eq!(label, "side A");
        assert_eq!(x_coordinates, vec![timing_mark_x as PixelPosition]);
    }

    #[test]
    fn test_vertical_streak_through_right_timing_mark() {
        let (mut side_a_image, side_b_image, options) =
            load_hmpb_fixture("vx-general-election/letter", 1);
        let timing_mark_x = side_a_image.width() - 60;
        let black_pixel = Luma([0]);
        for y in 0..side_a_image.height() {
            side_a_image.put_pixel(timing_mark_x, y, black_pixel);
        }
        let Error::VerticalStreaksDetected {
            label,
            x_coordinates,
        } = ballot_card(side_a_image, side_b_image, &options).unwrap_err()
        else {
            panic!("wrong error type");
        };
        assert_eq!(label, "side A");
        assert_eq!(x_coordinates, vec![timing_mark_x as PixelPosition]);
    }

    #[test]
    fn test_rotated_ballot_scoring_write_in_areas_no_write_ins() {
        let (side_a_image, side_b_image, options) =
            load_hmpb_fixture("vx-general-election/letter", 3);
        let (side_a_image_rotated, side_b_image_rotated) = [side_a_image, side_b_image]
            .map(|image| {
                geometric_transformations::warp(
                    &image,
                    &Projection::rotate(Radians::from(Degrees::new(1.0)).get()),
                    Interpolation::Bilinear,
                    Luma([0]),
                )
            })
            .into();

        let interpretation =
            ballot_card(side_a_image_rotated, side_b_image_rotated, &options).unwrap();

        let front = interpretation.front;
        let back = interpretation.back;

        // front has write-in contests, back doesn't
        assert!(!front.write_ins.is_empty());
        assert!(back.write_ins.is_empty());

        for write_in in front.write_ins {
            // no write-ins are written in, so the scores should be low
            assert!(write_in.score < UnitIntervalScore(0.01));
        }
    }

    #[test]
    fn test_high_rotation_is_rejected() {
        let (mut side_a_image, side_b_image, options) =
            load_ballot_card_fixture("vxqa-2024-10", ("rotation-front.png", "rotation-back.png"));
        let interpretation =
            ballot_card(side_a_image.clone(), side_b_image.clone(), &options).unwrap();

        // remove timing marks to trigger rotation limiting
        deface_ballot_by_removing_side_timing_marks(
            &mut side_a_image,
            &interpretation.front.timing_marks,
        );

        let _debug_image =
            DebugImage::write("debug__test_high_rotation_is_rejected.png", &side_a_image);

        match ballot_card(side_a_image.clone(), side_b_image, &options) {
            Err(Error::MissingTimingMarks { reason, .. }) => assert_eq!(
                reason,
                "Unable to find mark along Left border at index 20; no marks close enough?"
            ),
            Err(err) => {
                panic!("unexpected error: {err:?}");
            }
            Ok(_) => {
                panic!("interpretation unexpectedly succeeded");
            }
        }
    }

    #[test]
    fn test_high_skew_is_rejected() {
        let (mut side_a_image, side_b_image, options) =
            load_ballot_card_fixture("vxqa-2024-10", ("skew-front.png", "skew-back.png"));
        let interpretation =
            ballot_card(side_a_image.clone(), side_b_image.clone(), &options).unwrap();

        deface_ballot_by_removing_side_timing_marks(
            &mut side_a_image,
            &interpretation.front.timing_marks,
        );

        let _debug_image =
            DebugImage::write("debug__test_high_skew_is_rejected.png", &side_a_image);

        match ballot_card(side_a_image, side_b_image, &options) {
            Err(Error::MissingTimingMarks { reason, .. }) => assert_eq!(
                reason,
                "Unable to find mark along Left border at index 20; no marks close enough?"
            ),
            Err(err) => panic!("unexpected error: {err:?}"),
            Ok(_) => panic!("interpretation unexpectedly succeeded"),
        }
    }

    #[test]
    fn test_imprinting_over_timing_marks() {
        let (side_a_image, side_b_image, options) = load_ballot_card_fixture(
            "104h-2025-04",
            ("imprinter-front.png", "imprinter-back.png"),
        );
        let interpretation = ballot_card(
            side_a_image.clone(),
            side_b_image.clone(),
            &Options {
                timing_mark_algorithm: TimingMarkAlgorithm::Corners,
                ..options
            },
        )
        .unwrap();

        let marked_grid_positions = interpretation
            .front
            .marks
            .iter()
            .filter_map(|(grid_position, scored_bubble)| {
                if let Some(scored_bubble) = scored_bubble {
                    if scored_bubble.fill_score > UnitIntervalScore(0.1) {
                        return Some(grid_position);
                    }
                }
                None
            })
            .collect_vec();

        assert_eq!(
            marked_grid_positions
                .iter()
                .map(|position| { (position.contest_id(), position.option_id()) })
                .collect_vec(),
            vec![
                (
                    ContestId::from("2z8wwfkv1pqe".to_owned()),
                    OptionId::from("sh6brr6z1qnl".to_owned())
                ),
                (
                    ContestId::from("fgim6l2uk3nb".to_owned()),
                    OptionId::from("5g7phaxg7hp1".to_owned())
                ),
                (
                    ContestId::from("autxsj0cdzod".to_owned()),
                    OptionId::from("11a0rk2efv1l".to_owned())
                ),
                (
                    ContestId::from("klhpdgrdszt0".to_owned()),
                    OptionId::from("wkogyhxjb778".to_owned())
                )
            ]
        );
    }

    #[test]
    /// The ballot used in this test has high skew and we previously failed to
    /// find all the back side's right edge timing marks. The previous best fit
    /// line algorithm looked at all pairs of candidate timing marks and selected
    /// all the marks _between_ them, which meant that we had to pick the two
    /// corners if we were going to get all the marks on that edge. Sometimes we
    /// would be unable to use the line segment that connected the two true
    /// corners because it was too skewed and would therefore be rejected.
    ///
    /// The new algorithm extends the segment to encompass essentially the
    /// whole image, so as long as the segment intersects with all the timing
    /// marks along the edge we're looking for, it doesn't have to pass
    /// through exactly the corner's centers like the previous one did.
    fn test_best_fit_line_regression() {
        let (side_a_image, side_b_image, options) = load_ballot_card_fixture(
            "vxqa-2024-10",
            (
                "best-fit-line-regression-test-front.png",
                "best-fit-line-regression-test-back.png",
            ),
        );
        ballot_card(side_a_image, side_b_image, &options).unwrap();
    }

    #[test]
    fn test_reject_scaled_down_ballots() {
        let (side_a_image, side_b_image, options) =
            load_hmpb_fixture("vx-general-election/letter", 3);
        // Set a minimum scale of 98.5%.
        let minimum_detected_scale = UnitIntervalScore(0.985);
        let options = Options {
            minimum_detected_scale: Some(minimum_detected_scale),
            ..options
        };

        // Ensure it's not rejected before we scale it.
        ballot_card(side_a_image.clone(), side_b_image.clone(), &options).unwrap();

        // Scale side A down and ensure it gets rejected.
        let artificial_scale = minimum_detected_scale.0 - 0.01;
        let (width, height) = side_a_image.dimensions();
        let scaled_down_side_a_image = image::imageops::resize(
            &side_a_image,
            (width as f32 * artificial_scale) as u32,
            (height as f32 * artificial_scale) as u32,
            FilterType::Nearest,
        );

        // Create an image of the original size with a white background,
        // then draw the scaled image in its center.
        let mut side_a_image = GrayImage::from_pixel(width, height, Luma([0xff]));
        let _debug_side_a_image = DebugImage::write(
            "test_reject_scaled_down_ballots__side_a_image.png",
            &side_a_image,
        );
        let x = (width - scaled_down_side_a_image.width()) / 2;
        let y = (height - scaled_down_side_a_image.height()) / 2;
        side_a_image
            .copy_from(&scaled_down_side_a_image, x, y)
            .unwrap();

        // Interpret the scaled down side A and normal side B.
        let error = ballot_card(side_a_image, side_b_image, &options).unwrap_err();
        let Error::InvalidScale {
            scale: detected_scale,
            ..
        } = error
        else {
            panic!("Unexpected error variant: {error:?}");
        };

        assert!((detected_scale.0 - artificial_scale).abs() < 0.01, "Detected scale was not close to artificial scale: detected={detected_scale}, artificial={artificial_scale}");
    }

    /// Wraps a debug image file that is automatically deleted when the struct
    /// is dropped, which will not happen if the test fails. This allows the
    /// developer to inspect the debug image in case of a test failure.
    struct DebugImage {
        path: PathBuf,
    }

    impl DebugImage {
        /// Write the image to the given path and return a `DebugImage` that
        /// will delete the file when dropped.
        fn write<P: Into<PathBuf>>(path: P, image: &GrayImage) -> Self {
            let path: PathBuf = path.into();
            println!("saving debug image to {path}", path = path.display());
            image.save(&path).unwrap();
            Self { path }
        }
    }

    impl Drop for DebugImage {
        fn drop(&mut self) {
            std::fs::remove_file(&self.path).unwrap();
        }
    }
}
