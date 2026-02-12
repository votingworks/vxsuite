#![allow(clippy::similar_names)]

use std::fmt::Display;
use std::path::PathBuf;
use std::str::FromStr;

use image::GrayImage;
use serde::Serialize;
use serde_with::DeserializeFromStr;
use types_rs::ballot_card::BallotSide;
use types_rs::election::{BallotStyleId, Election, PrecinctId};
use types_rs::geometry::PixelPosition;
use types_rs::geometry::{PixelUnit, Size};
use types_rs::pair::Pair;

use crate::ballot_card::load_ballot_scan_bubble_image;
use crate::ballot_card::BallotCard;
use crate::ballot_card::BallotPage;
use crate::ballot_card::Geometry;
use crate::ballot_card::Orientation;
use crate::ballot_card::PaperInfo;
use crate::debug::draw_timing_mark_debug_image_mut;
use crate::image_utils::Inset;
use crate::layout::InterpretedContestLayout;
use crate::scoring::ScoredBubbleMarks;
use crate::scoring::ScoredPositionAreas;
use crate::scoring::UnitIntervalScore;
use crate::timing_marks::BallotPageMetadata;
use crate::timing_marks::TimingMarks;

/// Default maximum cumulative width of vertical streaks in pixels.
/// This value must match `DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH` in `libs/types/src/system_settings.ts`
pub const DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH: PixelUnit = 5;

/// Default retry streak detection threshold in pixels when timing marks fail.
/// This value must match `DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD` in `libs/types/src/system_settings.ts`
pub const DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD: PixelUnit = 1;

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
    pub max_cumulative_streak_width: PixelUnit,
    pub retry_streak_width_threshold: PixelUnit,
}

#[derive(Debug, Clone, Copy, DeserializeFromStr, Default)]
pub enum TimingMarkAlgorithm {
    Contours {
        inference: Inference,
    },
    #[default]
    Corners,
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

#[derive(Debug, Clone, Copy, Default)]
pub enum Inference {
    #[default]
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
            Self::Enabled => write!(f, "enabled",),
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

    #[error("invalid detected ballot scale for {label}: {scale}")]
    InvalidScale {
        label: String,
        scale: UnitIntervalScore,
    },

    #[error("could not compute layout for {side:?}")]
    CouldNotComputeLayout { side: BallotSide },

    #[error("vertical streaks detected on {label}")]
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
    max_cumulative_streak_width: PixelUnit,
    retry_streak_width_threshold: PixelUnit,
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
        max_cumulative_streak_width: PixelUnit,
        retry_streak_width_threshold: PixelUnit,
    ) -> Result<Self, image::ImageError> {
        let bubble_template_image = load_ballot_scan_bubble_image()?;
        Ok(Self {
            election,
            write_in_scoring,
            vertical_streak_detection,
            bubble_template_image,
            timing_mark_algorithm,
            minimum_detected_scale,
            max_cumulative_streak_width,
            retry_streak_width_threshold,
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
            max_cumulative_streak_width: self.max_cumulative_streak_width,
            retry_streak_width_threshold: self.retry_streak_width_threshold,
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
    let mut ballot_card = Pair::new(
        (
            SIDE_A_LABEL,
            side_a_image,
            options.debug_side_a_base.clone(),
        ),
        (
            SIDE_B_LABEL,
            side_b_image,
            options.debug_side_b_base.clone(),
        ),
    )
    .par_map(|(label, image, debug_base)| {
        BallotPage::from_image(label, image, &PaperInfo::scanned(), debug_base)
    })
    .into_result()?
    .join(BallotCard::from_pages)?;

    let mut detected_vertical_streaks = match options.vertical_streak_detection {
        VerticalStreakDetection::Enabled => {
            let streaks = ballot_card.detect_vertical_streaks();
            ballot_card.reject_disallowed_vertical_streaks(
                &streaks,
                options.max_cumulative_streak_width,
            )?;
            streaks
        }
        VerticalStreakDetection::Disabled => Pair::default(),
    };

    let mut timing_marks = match ballot_card.find_timing_marks(options.timing_mark_algorithm) {
        Ok(marks) => marks,
        Err(Error::MissingTimingMarks { reason }) => {
            // If timing marks couldn't be found, retry streak detection with a lower threshold
            // to differentiate between truly unreadable ballots and ballots with minor streaks.
            if matches!(
                options.vertical_streak_detection,
                VerticalStreakDetection::Enabled
            ) {
                // Check if streaks are detected with the retry threshold
                ballot_card.reject_disallowed_vertical_streaks(
                    &detected_vertical_streaks,
                    options.retry_streak_width_threshold,
                )?;
            }
            // If no streaks detected with retry threshold, return the original error
            return Err(Error::MissingTimingMarks { reason });
        }
        Err(e) => return Err(e),
    };

    if let Some(minimum_detected_scale) = options.minimum_detected_scale {
        ballot_card.check_minimum_scale(&timing_marks, minimum_detected_scale)?;
    }

    // Find the metadata and validate it.
    let mut decoded_qr_codes = ballot_card.decode_ballot_barcodes(&options.election)?;

    // If the pages are reversed, i.e. fed in bottom-first, we need to rotate
    // them so they're right-side up.
    ballot_card
        .as_pair_mut()
        .zip(&mut timing_marks)
        .zip(&mut detected_vertical_streaks)
        .zip(&decoded_qr_codes)
        .map(
            |(((ballot_page, timing_marks), detected_vertical_streaks), (_, orientation))| {
                // Handle rotating the image and our timing marks if necessary.
                if matches!(orientation, Orientation::PortraitReversed) {
                    timing_marks.rotate180(ballot_page.dimensions().into());
                    ballot_page.rotate180();
                    // TODO: add a test that fails if this is removed
                    for streak in detected_vertical_streaks.iter_mut() {
                        streak.rotate180(ballot_page.width());
                    }
                }

                ballot_page.debug().write(
                    "complete_timing_marks_after_orientation_correction",
                    |canvas| {
                        draw_timing_mark_debug_image_mut(
                            canvas,
                            ballot_page.geometry(),
                            &timing_marks.clone().into(),
                        );
                    },
                );
            },
        );

    // If what we've been calling the front is actually the back, swap them.
    if decoded_qr_codes.first().0.page_number.is_back() {
        ballot_card.swap_pages();
        decoded_qr_codes.swap();
        timing_marks.swap();
        detected_vertical_streaks.swap();
    }

    let ballot_style_id = decoded_qr_codes.first().0.ballot_style_id.clone();
    let Some(grid_layout) = grid_layouts
        .iter()
        .find(|layout| layout.ballot_style_id == ballot_style_id)
    else {
        return Err(Error::MissingGridLayout {
            front: BallotPageMetadata::QrCode(decoded_qr_codes.first().0.clone()),
            back: BallotPageMetadata::QrCode(decoded_qr_codes.second().0.clone()),
        });
    };

    let sheet_number = u32::from(decoded_qr_codes.first().0.page_number.sheet_number().get());

    let scored_bubble_marks = ballot_card.score_bubble_marks(
        &timing_marks,
        &options.bubble_template,
        grid_layout,
        &detected_vertical_streaks,
        sheet_number,
    )?;

    let contest_layouts =
        ballot_card.build_page_layout(&timing_marks, grid_layout, sheet_number)?;

    let write_in_area_scores = match options.write_in_scoring {
        WriteInScoring::Enabled => {
            ballot_card.score_write_in_areas(&timing_marks, grid_layout, sheet_number)
        }
        WriteInScoring::Disabled => Pair::default(),
    };

    let normalized_images = ballot_card.as_pair().par_map(|ballot_page| {
        imageproc::contrast::threshold(
            ballot_page.ballot_image().image(),
            ballot_page.ballot_image().threshold(),
        )
    });

    Pair::from((
        timing_marks,
        decoded_qr_codes,
        scored_bubble_marks,
        write_in_area_scores,
        normalized_images,
        contest_layouts,
    ))
    .map(
        |(timing_marks, (metadata, _), marks, write_ins, normalized_image, contest_layouts)| {
            InterpretedBallotPage {
                timing_marks,
                metadata: BallotPageMetadata::QrCode(metadata),
                marks,
                write_ins,
                normalized_image,
                contest_layouts,
            }
        },
    )
    .join(|front, back| Ok(InterpretedBallotCard { front, back }))
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
        ballot_card::load_ballot_scan_bubble_image, debug::ImageDebugWriter, qr_code,
        scoring::UnitIntervalScore, timing_marks::TimingMarks,
    };

    use super::*;

    /// Loads a ballot page image from disk as grayscale.
    fn load_ballot_page_image(image_path: &Path) -> GrayImage {
        image::open(image_path).unwrap().into_luma8()
    }

    /// Loads images for both sides of a ballot card and returns them.
    fn load_ballot_card_images(side_a_path: &Path, side_b_path: &Path) -> (GrayImage, GrayImage) {
        Pair::new(side_a_path, side_b_path)
            .par_map(load_ballot_page_image)
            .into()
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
            vertical_streak_detection: VerticalStreakDetection::default(),
            timing_mark_algorithm: TimingMarkAlgorithm::default(),
            minimum_detected_scale: None,
            max_cumulative_streak_width: 5,
            retry_streak_width_threshold: 1,
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
            vertical_streak_detection: VerticalStreakDetection::default(),
            timing_mark_algorithm: TimingMarkAlgorithm::default(),
            minimum_detected_scale: None,
            max_cumulative_streak_width: 5,
            retry_streak_width_threshold: 1,
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
    fn test_interpret_returns_binarized_images() {
        let (side_a_image, side_b_image, options) =
            load_hmpb_fixture("vx-general-election/letter", 1);
        let card = ballot_card(side_a_image, side_b_image, &options).unwrap();
        assert!(is_binary_image(&card.front.normalized_image));
        assert!(is_binary_image(&card.back.normalized_image));
    }

    #[test]
    fn test_debug_images_with_cropping() {
        let (side_a_image, _, _) = load_hmpb_fixture("vx-general-election/letter", 1);
        let side_a_image_original_dimensions = side_a_image.dimensions();
        let side_a_image = {
            let inset = Inset {
                left: 50,
                top: 170,
                bottom: 30,
                right: 30,
            };
            let mut expanded = GrayImage::new(
                side_a_image.width() + inset.left + inset.right,
                side_a_image.height() + inset.top + inset.bottom,
            );
            for (x, y, luma) in side_a_image.enumerate_pixels() {
                expanded.put_pixel(x, y, *luma);
            }
            expanded
        };
        let ballot_page = BallotPage::from_image(
            "test",
            side_a_image,
            &PaperInfo::scanned(),
            Some(PathBuf::from("/tmp/unused")),
        )
        .unwrap();
        // Ensure that the black area we added around the image is cropped off in the debug image.
        assert_eq!(
            ballot_page.debug().input_image().unwrap().dimensions(),
            side_a_image_original_dimensions
        );
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
    fn test_vertical_streaks_not_through_bubbles() {
        let (mut side_a_image, mut side_b_image, options) =
            load_hmpb_fixture("vx-general-election/letter", 1);
        let thin_complete_streak_x = side_a_image.width() / 5;
        let thick_complete_streak_x: PixelPosition = side_a_image.width() as PixelPosition * 2 / 5;
        let thick_complete_streak_x_range =
            (thick_complete_streak_x..(thick_complete_streak_x + 20)).collect_vec();
        let fuzzy_streak_x = side_a_image.width() * 3 / 5;
        let incomplete_streak_x = side_a_image.width() * 4 / 5;
        let cropped_streak_x = side_a_image.width() - 2;
        let black_pixel = Luma([0]);
        for y in 0..side_a_image.height() {
            side_a_image.put_pixel(thin_complete_streak_x, y, black_pixel);
            for x in thick_complete_streak_x_range.clone() {
                side_a_image.put_pixel(x as u32, y, black_pixel);
            }
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
        let _debug_image = DebugImage::write(
            "test_vertical_streaks_not_through_bubbles.png",
            &side_a_image,
        );
        match ballot_card(side_a_image.clone(), side_b_image.clone(), &options) {
            Ok(_) => panic!("expected vertical streak error, not success"),
            Err(Error::VerticalStreaksDetected {
                label,
                x_coordinates,
            }) => {
                assert_eq!(label, "side A");
                assert_eq!(
                    x_coordinates,
                    [
                        vec![thin_complete_streak_x as PixelPosition],
                        thick_complete_streak_x_range,
                        vec![
                            fuzzy_streak_x as PixelPosition,
                            fuzzy_streak_x as PixelPosition + 1
                        ],
                    ]
                    .concat()
                );
            }
            Err(e) => panic!("wrong error type: {e:?}"),
        }
    }

    #[test]
    fn test_vertical_streaks_through_bubbles() {
        let (mut side_a_image, mut side_b_image, options) =
            load_hmpb_fixture("vx-general-election/letter", 1);
        let thin_complete_streak_x = side_a_image.width() / 5;
        let thick_complete_streak_x_through_bubbles = side_a_image.width() * 2 / 5 - 20;
        let fuzzy_streak_x = side_a_image.width() * 3 / 5;
        let incomplete_streak_x = side_a_image.width() * 4 / 5;
        let cropped_streak_x = side_a_image.width() - 2;
        let black_pixel = Luma([0]);
        for y in 0..side_a_image.height() {
            side_a_image.put_pixel(thin_complete_streak_x, y, black_pixel);
            side_a_image.put_pixel(thick_complete_streak_x_through_bubbles, y, black_pixel);
            side_a_image.put_pixel(thick_complete_streak_x_through_bubbles + 1, y, black_pixel);
            side_a_image.put_pixel(thick_complete_streak_x_through_bubbles + 2, y, black_pixel);
            if (y % 2) == 0 {
                side_a_image.put_pixel(fuzzy_streak_x, y, black_pixel);
            }
            if ((y + 1) % 2) == 0 {
                side_a_image.put_pixel(fuzzy_streak_x + 1, y, black_pixel);
            }
            // Draw an incomplete streak on side B
            if y > 20 {
                side_b_image.put_pixel(incomplete_streak_x, y, black_pixel);
            }
            side_a_image.put_pixel(cropped_streak_x, y, black_pixel);
        }
        let _debug_image =
            DebugImage::write("test_vertical_streaks_through_bubbles.png", &side_a_image);
        match ballot_card(side_a_image.clone(), side_b_image.clone(), &options) {
            Ok(_) => panic!("expected vertical streak error, not success"),
            Err(Error::VerticalStreaksDetected {
                label,
                x_coordinates,
            }) => {
                assert_eq!(label, "side A");
                assert_eq!(
                    x_coordinates,
                    vec![
                        thin_complete_streak_x as PixelPosition,
                        thick_complete_streak_x_through_bubbles as PixelPosition,
                        thick_complete_streak_x_through_bubbles as PixelPosition + 1,
                        thick_complete_streak_x_through_bubbles as PixelPosition + 2,
                        fuzzy_streak_x as PixelPosition,
                        fuzzy_streak_x as PixelPosition + 1,
                    ]
                );
            }
            Err(e) => panic!("wrong error type: {e:?}"),
        }

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
        match ballot_card(side_a_image, side_b_image, &options) {
            Ok(_) => panic!("expected vertical streak error, not success"),
            Err(Error::VerticalStreaksDetected {
                label,
                x_coordinates,
            }) => {
                assert_eq!(label, "side A");
                assert_eq!(x_coordinates, vec![timing_mark_x as PixelPosition]);
            }
            Err(e) => panic!("wrong error type: {e:?}"),
        }
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
        match ballot_card(side_a_image, side_b_image, &options) {
            Ok(_) => panic!("expected vertical streak error, not success"),
            Err(Error::VerticalStreaksDetected {
                label,
                x_coordinates,
            }) => {
                assert_eq!(label, "side A");
                assert_eq!(x_coordinates, vec![timing_mark_x as PixelPosition]);
            }
            Err(e) => panic!("wrong error type: {e:?}"),
        }
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
    fn test_fold_through_timing_mark() {
        let (side_a_image, side_b_image, options) = load_ballot_card_fixture(
            "104h-2025-04",
            (
                "fold-through-timing-mark-front.png",
                "fold-through-timing-mark-back.png",
            ),
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

        // All bubbles should be unmarked
        assert_eq!(
            interpretation
                .front
                .marks
                .iter()
                .filter(|(_, scored_bubble)| {
                    if let Some(scored_bubble) = scored_bubble {
                        scored_bubble.fill_score > UnitIntervalScore(0.05)
                    } else {
                        false
                    }
                })
                .count(),
            0
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
    /// Regression test: drawing a vertical line through most right-side timing marks
    /// should not cause empty bubbles to receive non-trivial scores.
    fn test_partial_streak_through_timing_marks() {
        // Load a blank HMPB fixture (no marks expected on bubbles).
        let (mut side_a_image, side_b_image, options) =
            load_hmpb_fixture("vx-general-election/letter", 1);
        // First, interpret the clean image to get timing marks.
        let clean_interpretation =
            ballot_card(side_a_image.clone(), side_b_image.clone(), &options)
                .expect("clean interpretation should succeed");

        // Draw a continuous vertical bar across the right border intersecting
        // all but the top two and bottom two right timing marks. This preserves
        // some marks so timing detection still succeeds but simulates a streak
        // that breaks bubble scoring in the buggy behavior.
        let right_marks = &clean_interpretation.front.timing_marks.right_marks;
        let black = Luma([0u8]);
        if right_marks.len() > 4 {
            let first_mark = &right_marks[2];
            let last_mark = &right_marks[right_marks.len() - 4];
            let line_x = first_mark.rect().left()
                + (last_mark.rect().right() - first_mark.rect().left()) / 3;
            for y in first_mark.rect().top()..last_mark.rect().bottom() {
                side_a_image.put_pixel(line_x as u32, y as u32, black);
            }
        }

        let interpretation = ballot_card(side_a_image, side_b_image, &options).unwrap();

        // On a blank ballot, every bubble should have an extremely low fill score.
        // The bug causes many empty bubbles to have elevated scores.
        for (_grid_position, maybe_bubble) in &interpretation.front.marks {
            if let Some(bubble) = maybe_bubble {
                assert!(
                    bubble.fill_score.0 < 0.02,
                    "Unexpected non-zero bubble score on blank ballot: {}",
                    bubble.fill_score.0
                );
            }
        }
    }

    #[test]
    fn test_wide_streak_through_timing_marks() {
        // Load a blank HMPB fixture (no marks expected on bubbles).
        let (mut side_a_image, side_b_image, options) =
            load_hmpb_fixture("vx-general-election/letter", 1);
        // First, interpret the clean image to get timing marks.
        let clean_interpretation =
            ballot_card(side_a_image.clone(), side_b_image.clone(), &options)
                .expect("clean interpretation should succeed");

        // Draw a continuous vertical bar across the right border intersecting
        // all but the top two and bottom two right timing marks. This preserves
        // some marks so timing detection can find the corners, but fails because
        // the streak is too wide.
        let right_marks = &clean_interpretation.front.timing_marks.right_marks;
        let black = Luma([0u8]);
        if right_marks.len() > 4 {
            let first_mark = &right_marks[2];
            let last_mark = &right_marks[right_marks.len() - 4];
            let line_x = first_mark.rect().left()
                + (last_mark.rect().right() - first_mark.rect().left()) / 3;
            for y in first_mark.rect().top()..last_mark.rect().bottom() {
                for dx in 0..5 {
                    side_a_image.put_pixel((line_x + dx) as u32, y as u32, black);
                }
            }
        }

        let error = ballot_card(side_a_image, side_b_image, &options).unwrap_err();
        assert!(matches!(error, Error::MissingTimingMarks { .. }));
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
        let x = (width - scaled_down_side_a_image.width()) / 2;
        let y = (height - scaled_down_side_a_image.height()) / 2;
        side_a_image
            .copy_from(&scaled_down_side_a_image, x, y)
            .unwrap();
        let _debug_side_a_image = DebugImage::write(
            "test_reject_scaled_down_ballots__side_a_image.png",
            &side_a_image,
        );

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

    /// Tests that when timing marks cannot be found and streaks are detected
    /// with the retry threshold, a `VerticalStreaksDetected` error is returned.
    ///
    /// This test uses a real ballot image with actual streaks to verify the retry logic.
    #[test]
    fn test_retry_streak_detection_finds_streaks() {
        // Load a real streaked ballot image
        let side_a_image = image::open(
            "./test/fixtures/diagnostic/streaked/f82222c0-1fda-4f02-9746-fdf111886ce4-front.jpg",
        )
        .expect("Failed to load streaked image")
        .into_luma8();

        // Create a clean second side (use any valid ballot image)
        let (_, side_b_image, mut options) = load_hmpb_fixture("vx-general-election/letter", 1);

        // Set thresholds so that the streaks are narrow enough to pass normal threshold
        // but fail the retry threshold. Looking at the actual fixture, it has thin streaks
        // that are around 2-3px wide. We'll set normal threshold high enough to let it pass
        // initially, but retry threshold low enough to catch it.
        options.max_cumulative_streak_width = 10; // Allow streaks up to 10px during normal check
        options.retry_streak_width_threshold = 1; // But catch anything >1px during retry

        // The streaked image doesn't have valid timing marks, so timing mark detection
        // will fail, triggering the retry logic with the lower threshold.
        let error = super::ballot_card(side_a_image, side_b_image, &options).unwrap_err();

        // Should get VerticalStreaksDetected from retry logic
        match error {
            Error::VerticalStreaksDetected { label, .. } => {
                assert_eq!(label, SIDE_A_LABEL, "Expected streak error on side A");
            }
            _ => panic!("Expected VerticalStreaksDetected error, got: {error:?}"),
        }
    }

    /// Tests that when timing marks cannot be found and no streaks are detected
    /// with the retry threshold, the original `MissingTimingMarks` error is returned.
    #[test]
    fn test_retry_streak_detection_no_streaks() {
        let (mut side_a_image, side_b_image, mut options) =
            load_hmpb_fixture("vx-general-election/letter", 1);

        // First, find the timing marks so we can remove them
        let card = Pair::new(
            BallotPage::from_image(
                SIDE_A_LABEL,
                side_a_image.clone(),
                &PaperInfo::scanned(),
                None,
            )
            .unwrap(),
            BallotPage::from_image(
                SIDE_B_LABEL,
                side_b_image.clone(),
                &PaperInfo::scanned(),
                None,
            )
            .unwrap(),
        )
        .join(BallotCard::from_pages)
        .unwrap();
        let timing_marks: (TimingMarks, TimingMarks) = card
            .as_pair()
            .par_map(|page| {
                page.find_timing_marks(TimingMarkAlgorithm::Corners)
                    .unwrap()
            })
            .into();
        let side_a_timing_marks = &timing_marks.0;

        // Remove timing marks to force timing mark detection to fail
        deface_ballot_by_removing_side_timing_marks(&mut side_a_image, side_a_timing_marks);

        // Don't add any streaks - the ballot should be truly unreadable

        // Set thresholds: normal=5px, retry=1px
        options.max_cumulative_streak_width = 5;
        options.retry_streak_width_threshold = 1;

        // Interpret should fail with MissingTimingMarks (no streaks found)
        let error = super::ballot_card(side_a_image, side_b_image, &options).unwrap_err();
        match error {
            Error::MissingTimingMarks { .. } => {
                // Expected - truly unreadable ballot
            }
            _ => panic!("Expected MissingTimingMarks error, got: {error:?}"),
        }
    }

    /// Tests that streaks exceeding the normal threshold are caught immediately
    /// without retry logic being triggered. Uses a real streaked image.
    #[test]
    fn test_normal_streak_threshold_catches_wide_streaks() {
        // Load a real streaked ballot image
        let side_a_image = image::open(
            "./test/fixtures/diagnostic/streaked/f82222c0-1fda-4f02-9746-fdf111886ce4-front.jpg",
        )
        .expect("Failed to load streaked image")
        .into_luma8();

        // Create a clean second side
        let (_, side_b_image, mut options) = load_hmpb_fixture("vx-general-election/letter", 1);

        // Set thresholds so that streaks are caught by the normal threshold
        options.max_cumulative_streak_width = 1; // Very strict - catch any streaks immediately
        options.retry_streak_width_threshold = 1;

        // Interpret should fail with VerticalStreaksDetected immediately
        // (before timing mark detection even runs)
        let error = super::ballot_card(side_a_image, side_b_image, &options).unwrap_err();
        match error {
            Error::VerticalStreaksDetected { label, .. } => {
                assert_eq!(label, SIDE_A_LABEL, "Expected streak error on side A");
            }
            _ => panic!("Expected VerticalStreaksDetected error, got: {error:?}"),
        }
    }

    /// Tests retry logic with different threshold values using a real streaked image.
    /// Verifies that the retry threshold correctly determines whether streaks are detected.
    #[test]
    fn test_retry_threshold_with_different_values() {
        // Load a real streaked ballot image
        let side_a_image = image::open(
            "./test/fixtures/diagnostic/streaked/f82222c0-1fda-4f02-9746-fdf111886ce4-front.jpg",
        )
        .expect("Failed to load streaked image")
        .into_luma8();

        // Create a clean second side
        let (_, side_b_image, mut options) = load_hmpb_fixture("vx-general-election/letter", 1);

        // Test with retry threshold = 2px (should detect streaks during retry)
        // Set normal threshold high enough to not catch initially
        options.max_cumulative_streak_width = 100; // High enough to not trigger initially
        options.retry_streak_width_threshold = 2;

        let error =
            super::ballot_card(side_a_image.clone(), side_b_image.clone(), &options).unwrap_err();
        match error {
            Error::VerticalStreaksDetected { .. } => {
                // Expected - streak detected by retry
            }
            _ => panic!("Expected VerticalStreaksDetected error with threshold=2, got: {error:?}"),
        }

        // Test with retry threshold = 200px (should NOT detect streaks)
        // The actual streaks in the image are around 23px cumulative, so 200px should pass
        options.max_cumulative_streak_width = 200;
        options.retry_streak_width_threshold = 200;
        let error = super::ballot_card(side_a_image, side_b_image, &options).unwrap_err();
        match error {
            Error::MissingTimingMarks { .. } => {
                // Expected - streak not detected with high threshold, truly unreadable
            }
            _ => panic!("Expected MissingTimingMarks error with threshold=200, got: {error:?}"),
        }
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
            if !std::thread::panicking() {
                std::fs::remove_file(&self.path).unwrap();
            }
        }
    }
}
