#![allow(clippy::similar_names)]

use std::fmt::Display;
use std::path::PathBuf;
use std::str::FromStr;

use image::GrayImage;
use serde::Serialize;
use serde_with::DeserializeFromStr;
use types_rs::ballot_card::BallotSide;
use types_rs::bmd::cvr::CastVoteRecord;
use types_rs::election::{BallotStyleId, Election, PrecinctId};
use types_rs::geometry::PixelPosition;
use types_rs::geometry::{PixelUnit, Size};
use types_rs::pair::Pair;

use crate::ballot_card::BallotCard;
use crate::ballot_card::Orientation;
use crate::ballot_card::PaperInfo;
use crate::ballot_card::{load_ballot_scan_bubble_image, BallotCardData};
use crate::ballot_card::{BallotPage, BubbleBallotCardData};
use crate::ballot_card::{Geometry, SummaryBallotCardData};
use crate::debug::draw_timing_mark_debug_image_mut;
use crate::image_utils::Inset;
use crate::layout::InterpretedContestLayout;
use crate::scoring::ScoredBubbleMarks;
use crate::scoring::ScoredPositionAreas;
use crate::scoring::UnitIntervalScore;
use crate::timing_marks::BallotPageMetadata;
use crate::timing_marks::TimingMarks;

#[derive(Debug, Clone)]
pub struct Options {
    pub election: Election,
    pub debug_side_a_base: Option<PathBuf>,
    pub debug_side_b_base: Option<PathBuf>,
    pub vertical_streak_detection: VerticalStreakDetection,
    pub interpreters: BallotInterpreters,
}

#[derive(Debug, Clone)]
#[must_use]
pub enum BallotInterpreters {
    All {
        bubble_ballot_config: BubbleBallotConfig,
        summary_ballot_config: SummaryBallotConfig,
    },
    BubbleBallotOnly(BubbleBallotConfig),
    SummaryBallotOnly(SummaryBallotConfig),
}

impl BallotInterpreters {
    #[must_use]
    pub fn bubble_ballot_config(&self) -> Option<&BubbleBallotConfig> {
        match self {
            Self::All {
                ref bubble_ballot_config,
                ..
            }
            | Self::BubbleBallotOnly(ref bubble_ballot_config) => Some(bubble_ballot_config),
            Self::SummaryBallotOnly(_) => None,
        }
    }

    #[must_use]
    pub fn summary_ballot_config(&self) -> Option<&SummaryBallotConfig> {
        match self {
            Self::All {
                ref summary_ballot_config,
                ..
            }
            | Self::SummaryBallotOnly(ref summary_ballot_config) => Some(summary_ballot_config),
            Self::BubbleBallotOnly(_) => None,
        }
    }
}

#[derive(Debug, Clone)]
#[must_use]
pub struct BubbleBallotConfig {
    timing_mark_algorithm: TimingMarkAlgorithm,
    bubble_template: GrayImage,
    write_in_scoring: WriteInScoring,
    minimum_detected_scale: Option<UnitIntervalScore>,
}

impl Default for BubbleBallotConfig {
    fn default() -> Self {
        Self {
            timing_mark_algorithm: TimingMarkAlgorithm::default(),
            bubble_template: load_ballot_scan_bubble_image().expect("can load image from memory"),
            write_in_scoring: WriteInScoring::default(),
            minimum_detected_scale: None,
        }
    }
}

#[derive(Debug, Clone, Default)]
#[must_use]
pub struct BubbleBallotConfigBuilder {
    config: BubbleBallotConfig,
}

impl BubbleBallotConfigBuilder {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn timing_mark_algorithm(self, timing_mark_algorithm: TimingMarkAlgorithm) -> Self {
        Self {
            config: BubbleBallotConfig {
                timing_mark_algorithm,
                ..self.config
            },
        }
    }

    pub fn bubble_template(self, bubble_template: GrayImage) -> Self {
        Self {
            config: BubbleBallotConfig {
                bubble_template,
                ..self.config
            },
        }
    }

    pub fn write_in_scoring(self, write_in_scoring: WriteInScoring) -> Self {
        Self {
            config: BubbleBallotConfig {
                write_in_scoring,
                ..self.config
            },
        }
    }

    pub fn minimum_detected_scale(self, minimum_detected_scale: Option<UnitIntervalScore>) -> Self {
        Self {
            config: BubbleBallotConfig {
                minimum_detected_scale,
                ..self.config
            },
        }
    }

    pub fn build(self) -> BubbleBallotConfig {
        self.config
    }
}

#[derive(Debug, Clone, Copy, Default)]
#[must_use]
pub struct SummaryBallotConfig;

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

#[derive(Debug, Clone, Copy, Default, DeserializeFromStr, PartialEq)]
pub enum WriteInScoring {
    Enabled,

    #[default]
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
#[serde(tag = "type", rename_all = "camelCase")]
pub enum InterpretedBallotCard {
    #[serde(rename = "bubble")]
    BubbleBallot {
        front: Box<InterpretedBallotPage>,
        back: Box<InterpretedBallotPage>,
    },
    #[serde(rename = "summary")]
    SummaryBallot {
        cvr: CastVoteRecord,
        #[serde(skip_serializing)]
        front_normalized_image: GrayImage,
        #[serde(skip_serializing)]
        back_normalized_image: GrayImage,
    },
}

impl InterpretedBallotCard {
    #[must_use]
    pub fn normalized_images(&self) -> Pair<&GrayImage> {
        match self {
            Self::BubbleBallot { front, back } => {
                Pair::new(&front.normalized_image, &back.normalized_image)
            }
            Self::SummaryBallot {
                front_normalized_image,
                back_normalized_image,
                ..
            } => Pair::new(front_normalized_image, back_normalized_image),
        }
    }
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

    #[error("invalid barcode: {message}")]
    InvalidBarcode { message: String },

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

    #[error("missing grid layout for ballot style: {ballot_style_id}")]
    MissingGridLayout { ballot_style_id: BallotStyleId },

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

#[must_use]
pub struct ScanInterpreter {
    options: Options,
}

impl ScanInterpreter {
    /// Creates a new `ScanInterpreter` with the given configuration.
    pub const fn new(options: Options) -> Self {
        Self { options }
    }

    /// Interprets a pair of ballot card images.
    ///
    /// # Errors
    ///
    /// Returns an error if the images could not be interpreted.
    #[allow(clippy::result_large_err)]
    pub fn interpret(
        &self,
        side_a_image: GrayImage,
        side_b_image: GrayImage,
    ) -> Result<InterpretedBallotCard> {
        ballot_card(side_a_image, side_b_image, &self.options)
    }
}

/// Interpret a ballot card image.
///
/// # Errors
///
/// Returns an error if the ballot card could not be interpreted.
#[allow(
    clippy::too_many_lines,
    clippy::result_large_err,
    clippy::missing_panics_doc
)]
pub fn ballot_card(
    side_a_image: GrayImage,
    side_b_image: GrayImage,
    options: &Options,
) -> Result<InterpretedBallotCard> {
    let ballot_card = Pair::new(
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

    // Bail early if we're looking for and find vertical streaks.
    if matches!(
        options.vertical_streak_detection,
        VerticalStreakDetection::Enabled
    ) {
        ballot_card.detect_vertical_streaks()?;
    }

    // Find ballot barcodes and decode them.
    let ballot_card_data = ballot_card.find_barcodes(&options.election, &options.interpreters)?;

    // Now we should know what interpreter to use based on the barcode found.
    // Only try to use an interpreter that we have a configuration for.
    match (
        ballot_card_data,
        options.interpreters.bubble_ballot_config(),
        options.interpreters.summary_ballot_config(),
    ) {
        (BallotCardData::BubbleBallot(ballot_card_data), Some(config), _) => {
            interpret_as_bubble_ballot(ballot_card, ballot_card_data, &options.election, config)
        }
        (BallotCardData::SummaryBallot(ballot_card_data), _, Some(config)) => Ok(
            interpret_as_summary_ballot(ballot_card, ballot_card_data, *config),
        ),
        _ => Err(Error::InvalidBarcode {
            message: "No barcode could be found matching the configured ballot interpreters"
                .to_owned(),
        }),
    }
}

#[allow(clippy::result_large_err)]
fn interpret_as_bubble_ballot(
    mut ballot_card: BallotCard,
    mut ballot_card_data: BubbleBallotCardData,
    election: &Election,
    config: &BubbleBallotConfig,
) -> Result<InterpretedBallotCard> {
    let Some(ref grid_layouts) = election.grid_layouts else {
        return Err(Error::InvalidElection {
            message: "required field `gridLayouts` is missing".to_owned(),
        });
    };

    let mut timing_marks = ballot_card.find_timing_marks(config.timing_mark_algorithm)?;

    if let Some(minimum_detected_scale) = config.minimum_detected_scale {
        ballot_card.check_minimum_scale(&timing_marks, minimum_detected_scale)?;
    }

    // If the pages are reversed, i.e. fed in bottom-first, we need to rotate
    // them so they're right-side up.
    ballot_card
        .as_pair_mut()
        .zip(&mut timing_marks)
        .zip(ballot_card_data.orientations())
        .map(|((ballot_page, timing_marks), orientation)| {
            // Handle rotating the image and our timing marks if necessary.
            if matches!(orientation, Orientation::PortraitReversed) {
                timing_marks.rotate180(ballot_page.dimensions().into());
                ballot_page.rotate180();
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
        });

    // If what we've been calling the front is actually the back, swap them.
    if !ballot_card_data.pages_in_expected_order() {
        ballot_card.swap_pages();
        ballot_card_data.swap();
        timing_marks.swap();
    }

    let ballot_style_id = ballot_card_data.ballot_style_id().clone();
    let Some(grid_layout) = grid_layouts
        .iter()
        .find(|layout| layout.ballot_style_id == ballot_style_id)
    else {
        return Err(Error::MissingGridLayout { ballot_style_id });
    };

    let sheet_number = ballot_card_data.sheet_number();
    let scored_bubble_marks = ballot_card.score_bubble_marks(
        &timing_marks,
        &config.bubble_template,
        grid_layout,
        sheet_number,
    );

    let contest_layouts =
        ballot_card.build_page_layout(&timing_marks, grid_layout, sheet_number)?;

    let write_in_area_scores = match config.write_in_scoring {
        WriteInScoring::Enabled => {
            ballot_card.score_write_in_areas(&timing_marks, grid_layout, sheet_number)
        }
        WriteInScoring::Disabled => Pair::default(),
    };

    // Binarize the images for storage.
    let normalized_images = ballot_card.as_pair().par_map(|ballot_page| {
        imageproc::contrast::threshold(
            ballot_page.ballot_image().image(),
            ballot_page.ballot_image().threshold(),
        )
    });

    Pair::from((
        timing_marks,
        ballot_card_data.metadatas(),
        scored_bubble_marks,
        write_in_area_scores,
        normalized_images,
        contest_layouts,
    ))
    .map(
        |(timing_marks, metadata, marks, write_ins, normalized_image, contest_layouts)| {
            InterpretedBallotPage {
                timing_marks,
                metadata: BallotPageMetadata::QrCode(metadata.clone()),
                marks,
                write_ins,
                normalized_image,
                contest_layouts,
            }
        },
    )
    .join(|front, back| {
        Ok(InterpretedBallotCard::BubbleBallot {
            front: Box::new(front),
            back: Box::new(back),
        })
    })
}

fn interpret_as_summary_ballot(
    mut ballot_card: BallotCard,
    mut ballot_card_data: SummaryBallotCardData,
    _config: SummaryBallotConfig,
) -> InterpretedBallotCard {
    // If the pages are reversed, i.e. fed in bottom-first, we need to rotate
    // them so they're right-side up.
    ballot_card
        .as_pair_mut()
        .zip(ballot_card_data.orientations())
        .map(|(ballot_page, orientation)| {
            // Handle rotating the image if necessary.
            if matches!(orientation, Orientation::PortraitReversed) {
                ballot_page.rotate180();
            }
        });

    // If what we've been calling the front is actually the back, swap them.
    if !ballot_card_data.pages_in_expected_order() {
        ballot_card.swap_pages();
        ballot_card_data.swap();
    }

    // Binarize the images for storage.
    let (front_normalized_image, back_normalized_image) = ballot_card
        .as_pair()
        .par_map(|ballot_page| {
            imageproc::contrast::threshold(
                ballot_page.ballot_image().image(),
                ballot_page.ballot_image().threshold(),
            )
        })
        .into();

    InterpretedBallotCard::SummaryBallot {
        cvr: ballot_card_data.into_cvr(),
        front_normalized_image,
        back_normalized_image,
    }
}

#[cfg(test)]
#[allow(clippy::similar_names, clippy::unwrap_used)]
mod test {
    use std::{
        collections::HashMap,
        fs::File,
        io::BufReader,
        path::{Path, PathBuf},
    };

    use image::{imageops::FilterType, GenericImage, Luma};
    use imageproc::geometric_transformations::{self, Interpolation, Projection};
    use itertools::Itertools;
    use types_rs::{
        ballot_card::BallotType,
        bmd::votes::{CandidateVote, ContestVote},
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
            election,
            vertical_streak_detection: VerticalStreakDetection::Enabled,
            interpreters: BallotInterpreters::All {
                bubble_ballot_config: BubbleBallotConfig {
                    bubble_template,
                    write_in_scoring: WriteInScoring::Enabled,
                    timing_mark_algorithm: TimingMarkAlgorithm::default(),
                    minimum_detected_scale: None,
                },
                summary_ballot_config: SummaryBallotConfig,
            },
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
            election,
            vertical_streak_detection: VerticalStreakDetection::Enabled,
            interpreters: BallotInterpreters::BubbleBallotOnly(BubbleBallotConfig {
                bubble_template,
                write_in_scoring: WriteInScoring::Enabled,
                timing_mark_algorithm: TimingMarkAlgorithm::default(),
                minimum_detected_scale: None,
            }),
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
        let InterpretedBallotCard::BubbleBallot { front, back } =
            ballot_card(side_a_image, side_b_image, &options).unwrap()
        else {
            panic!("wrong interpretation type");
        };
        assert!(is_binary_image(&front.normalized_image));
        assert!(is_binary_image(&back.normalized_image));
    }

    #[test]
    fn test_interpret_summary_ballot() {
        let (side_a_image, side_b_image, options) = load_ballot_card_fixture(
            "famous-names-summary-ballot",
            ("summary-page.png", "blank-page.png"),
        );
        let InterpretedBallotCard::SummaryBallot {
            cvr,
            front_normalized_image,
            back_normalized_image,
        } = ballot_card(side_a_image, side_b_image, &options).unwrap()
        else {
            panic!("wrong interpretation type");
        };
        assert!(is_binary_image(&front_normalized_image));
        assert!(is_binary_image(&back_normalized_image));

        assert_eq!(
            cvr.ballot_hash,
            [0x72, 0x87, 0x05, 0x90, 0x0a, 0xc9, 0xaf, 0x39, 0xa8, 0x3b]
        );
        assert_eq!(cvr.ballot_style_id, BallotStyleId::from("1"),);
        assert_eq!(cvr.precinct_id, PrecinctId::from("23"));
        assert!(cvr.is_test_mode);
        assert_eq!(cvr.ballot_type, BallotType::Precinct);
        assert_eq!(
            cvr.votes,
            HashMap::from([
                (
                    ContestId::from("mayor"),
                    ContestVote::Candidate(vec![CandidateVote::NamedCandidate {
                        candidate_id: OptionId::from("sherlock-holmes")
                    }])
                ),
                (
                    ContestId::from("city-council"),
                    ContestVote::Candidate(vec![
                        CandidateVote::NamedCandidate {
                            candidate_id: OptionId::from("marie-curie")
                        },
                        CandidateVote::NamedCandidate {
                            candidate_id: OptionId::from("indiana-jones")
                        },
                        CandidateVote::NamedCandidate {
                            candidate_id: OptionId::from("mona-lisa")
                        },
                        CandidateVote::NamedCandidate {
                            candidate_id: OptionId::from("jackie-chan")
                        },
                    ])
                ),
                (
                    ContestId::from("chief-of-police"),
                    ContestVote::Candidate(vec![CandidateVote::NamedCandidate {
                        candidate_id: OptionId::from("natalie-portman")
                    }])
                ),
                (
                    ContestId::from("attorney"),
                    ContestVote::Candidate(vec![CandidateVote::NamedCandidate {
                        candidate_id: OptionId::from("john-snow")
                    }])
                ),
                (
                    ContestId::from("public-works-director"),
                    ContestVote::Candidate(vec![CandidateVote::NamedCandidate {
                        candidate_id: OptionId::from("benjamin-franklin")
                    }])
                ),
                (
                    ContestId::from("controller"),
                    ContestVote::Candidate(vec![CandidateVote::NamedCandidate {
                        candidate_id: OptionId::from("winston-churchill")
                    }])
                ),
                (
                    ContestId::from("parks-and-recreation-director"),
                    ContestVote::Candidate(vec![CandidateVote::NamedCandidate {
                        candidate_id: OptionId::from("charles-darwin")
                    }])
                ),
                (
                    ContestId::from("board-of-alderman"),
                    ContestVote::Candidate(vec![
                        CandidateVote::NamedCandidate {
                            candidate_id: OptionId::from("helen-keller")
                        },
                        CandidateVote::NamedCandidate {
                            candidate_id: OptionId::from("steve-jobs")
                        },
                        CandidateVote::NamedCandidate {
                            candidate_id: OptionId::from("nikola-tesla")
                        },
                        CandidateVote::NamedCandidate {
                            candidate_id: OptionId::from("vincent-van-gogh")
                        },
                    ])
                )
            ])
        );
        assert_eq!(cvr.ballot_audit_id, None);
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

        let InterpretedBallotCard::BubbleBallot { front, back } =
            ballot_card(side_a_image_rotated, side_b_image_rotated, &options).unwrap()
        else {
            panic!("wrong interpretation type");
        };

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
        let InterpretedBallotCard::BubbleBallot { front, .. } =
            ballot_card(side_a_image.clone(), side_b_image.clone(), &options).unwrap()
        else {
            panic!("wrong interpretation type");
        };

        // remove timing marks to trigger rotation limiting
        deface_ballot_by_removing_side_timing_marks(&mut side_a_image, &front.timing_marks);

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
        let InterpretedBallotCard::BubbleBallot { front, .. } =
            ballot_card(side_a_image.clone(), side_b_image.clone(), &options).unwrap()
        else {
            panic!("wrong interpretation type");
        };

        deface_ballot_by_removing_side_timing_marks(&mut side_a_image, &front.timing_marks);

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
        let InterpretedBallotCard::BubbleBallot { front, .. } = ballot_card(
            side_a_image.clone(),
            side_b_image.clone(),
            &Options {
                interpreters: BallotInterpreters::BubbleBallotOnly(BubbleBallotConfig {
                    timing_mark_algorithm: TimingMarkAlgorithm::Corners,
                    ..options.interpreters.bubble_ballot_config().unwrap().clone()
                }),
                ..options
            },
        )
        .unwrap() else {
            panic!("wrong interpretation type");
        };

        let marked_grid_positions = front
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
            interpreters: BallotInterpreters::BubbleBallotOnly(match options.interpreters {
                BallotInterpreters::BubbleBallotOnly(bubble_ballot_config) => BubbleBallotConfig {
                    minimum_detected_scale: Some(minimum_detected_scale),
                    ..bubble_ballot_config
                },
                _ => panic!("unexpected interpreters"),
            }),
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
