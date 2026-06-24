#![allow(clippy::similar_names)]

use std::fmt::Display;
use std::path::PathBuf;
use std::str::FromStr;

use image::GrayImage;
use serde::Serialize;
use serde_with::DeserializeFromStr;
use types_rs::ballot_card::BallotSide;
use types_rs::bubble_ballot::{self, Metadata, MetadataMismatch, PartialBallotHash};
use types_rs::election::{ContestId, Election};
use types_rs::geometry::PixelPosition;
use types_rs::geometry::{PixelUnit, Size, SubGridUnit};
use types_rs::pair::Pair;

use crate::ballot_card::ballot_scan_bubble_image;
use crate::ballot_card::BallotCard;
use crate::ballot_card::BallotPage;
use crate::ballot_card::Geometry;
use crate::ballot_card::Orientation;
use crate::ballot_card::PaperInfo;
use crate::debug::draw_timing_mark_debug_image_mut;
use crate::image_utils::threshold_and_encode_png;
use crate::image_utils::Inset;
use crate::layout::InterpretedContestLayout;
use crate::scoring::ScoredBubbleMarks;
use crate::scoring::ScoredPositionAreas;
use crate::scoring::UnitIntervalScore;
use crate::timing_marks::TimingMarks;
use crate::timing_marks::{self, BallotPageMetadata, DefaultForGeometry};

/// Default maximum cumulative width of vertical streaks in pixels.
/// This value must match `DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH` in `libs/types/src/system_settings.ts`
pub const DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH: PixelUnit = 5;

/// Default retry streak detection threshold in pixels when timing marks fail.
/// This value must match `DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD` in `libs/types/src/system_settings.ts`
pub const DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD: PixelUnit = 1;

#[derive(Debug, Clone)]
pub struct Options {
    pub election: Election,
    /// Partial ballot hash to compare against the QR-decoded hash on each
    /// side. Already sliced to [`PARTIAL_BALLOT_HASH_BYTE_LENGTH`] bytes;
    /// callers slice the full 32-byte election hash before constructing
    /// `Options`.
    pub expected_ballot_hash: PartialBallotHash,
    pub bubble_template: &'static GrayImage,
    pub debug_side_a_base: Option<PathBuf>,
    pub debug_side_b_base: Option<PathBuf>,
    pub write_in_scoring: WriteInScoring,
    pub vertical_streak_detection: VerticalStreakDetection,
    pub minimum_detected_scale: Option<UnitIntervalScore>,
    pub max_cumulative_streak_width: PixelUnit,
    pub retry_streak_width_threshold: PixelUnit,
    pub metadata_source: MetadataSource,
}

#[derive(Debug, Clone)]
pub enum MetadataSource {
    /// Detect and decode the QR codes printed on the ballot. This is the only
    /// option available in production.
    QrCode,

    /// Use the provided metadata directly, skipping QR code detection and
    /// decoding entirely. This is only meant for tests that use field-captured
    /// fixtures whose QR codes predate the current metadata encoding and can
    /// no longer be decoded.
    #[cfg(test)]
    Provided(Pair<(Metadata, Orientation)>),
}

#[derive(Debug, Clone, Copy, DeserializeFromStr, PartialEq, Default)]
pub enum VerticalStreakDetection {
    #[default]
    Enabled,
    Disabled,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterpretedBallotPage {
    pub timing_marks: TimingMarks,
    pub metadata: BallotPageMetadata,
    pub marks: ScoredBubbleMarks,
    pub write_ins: ScoredPositionAreas,
    #[serde(skip_serializing)] // `normalized_image` is returned separately.
    pub normalized_image: GrayImage,
    /// Pre-encoded PNG bytes of the normalized image. Produced in parallel with
    /// scoring so that callers can write to disk without re-encoding.
    #[serde(skip_serializing)]
    pub encoded_normalized_image: image::ImageResult<Vec<u8>>,
    pub contest_layouts: Vec<InterpretedContestLayout>,
}

impl std::fmt::Debug for InterpretedBallotPage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("InterpretedBallotPage")
            .field("timing_marks", &self.timing_marks)
            .field("metadata", &self.metadata)
            .field("marks", &self.marks)
            .field("write_ins", &self.write_ins)
            .field("contest_layouts", &self.contest_layouts)
            .finish_non_exhaustive()
    }
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

    #[error("invalid QR code metadata for {label}: {message}")]
    InvalidQrCodeMetadata { label: String, message: String },

    #[error(
        "mismatched ballot card geometries: {SIDE_A_LABEL}: {side_a:?}, {SIDE_B_LABEL}: {side_b:?}"
    )]
    #[serde(rename_all = "camelCase")]
    MismatchedBallotCardGeometries {
        side_a: BallotPageAndGeometry,
        side_b: BallotPageAndGeometry,
    },

    #[error(
        "mismatched ballot card metadata: {SIDE_A_LABEL}: {side_a:?}, {SIDE_B_LABEL}: {side_b:?}, mismatches: {mismatches:?}"
    )]
    #[serde(rename_all = "camelCase")]
    MismatchedBallotMetadata {
        side_a: Metadata,
        side_b: Metadata,
        mismatches: Vec<MetadataMismatch>,
    },

    #[error("invalid ballot hash: expected {expected:02x?}, actual {actual:02x?}")]
    #[serde(rename_all = "camelCase")]
    InvalidBallotHash {
        #[serde(with = "bubble_ballot::ballot_hash_serde")]
        expected: PartialBallotHash,
        #[serde(with = "bubble_ballot::ballot_hash_serde")]
        actual: PartialBallotHash,
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

    #[error(
        "grid position for contest {contest_id} at (column {column}, row {row}) \
         falls outside the detected timing-mark grid for {label}"
    )]
    #[serde(rename_all = "camelCase")]
    GridPositionOutsideTimingMarkGrid {
        label: String,
        contest_id: ContestId,
        column: SubGridUnit,
        row: SubGridUnit,
    },

    #[error("vertical streaks detected on {label} (found {})", x_coordinates.len())]
    #[serde(rename_all = "camelCase")]
    VerticalStreaksDetected {
        label: String,
        x_coordinates: Vec<PixelPosition>,
    },

    #[error("invalid election: {message}")]
    InvalidElection { message: String },
}

impl Error {
    /// Returns true if this error definitively identifies the ballot as a
    /// bubble ballot, not a summary ballot. These are errors that can only be
    /// produced after the bubble ballot QR code was decoded or after
    /// bubble-ballot-specific algorithms ran.
    #[must_use]
    pub fn is_bubble_ballot(&self) -> bool {
        matches!(
            self,
            // These errors occur after both QR codes were successfully decoded
            // as bubble ballot (HMPB) metadata.
            Self::MismatchedBallotMetadata { .. }
                | Self::InvalidBallotHash { .. }
                | Self::MissingGridLayout { .. }
                | Self::CouldNotComputeLayout { .. }
                | Self::GridPositionOutsideTimingMarkGrid { .. }
                // InvalidScale is only reachable after find_timing_marks()
                // succeeds, which requires bubble-ballot-specific timing marks.
                | Self::InvalidScale { .. }
        )
    }
}

pub type Result<T, E = Error> = std::result::Result<T, E>;

pub const SIDE_A_LABEL: &str = "side A";
pub const SIDE_B_LABEL: &str = "side B";

pub struct ScanInterpreter {
    election: Election,
    expected_ballot_hash: PartialBallotHash,
    write_in_scoring: WriteInScoring,
    vertical_streak_detection: VerticalStreakDetection,
    bubble_template_image: &'static GrayImage,
    minimum_detected_scale: Option<UnitIntervalScore>,
    max_cumulative_streak_width: PixelUnit,
    retry_streak_width_threshold: PixelUnit,
}

impl ScanInterpreter {
    /// Creates a new `ScanInterpreter` with the given configuration.
    ///
    /// `expected_ballot_hash` is already sliced to
    /// [`PARTIAL_BALLOT_HASH_BYTE_LENGTH`] bytes (see
    /// [`bubble_ballot::PartialBallotHash`]).
    #[must_use]
    pub fn new(
        election: Election,
        expected_ballot_hash: PartialBallotHash,
        write_in_scoring: WriteInScoring,
        vertical_streak_detection: VerticalStreakDetection,
        minimum_detected_scale: Option<UnitIntervalScore>,
        max_cumulative_streak_width: PixelUnit,
        retry_streak_width_threshold: PixelUnit,
    ) -> Self {
        Self {
            election,
            expected_ballot_hash,
            write_in_scoring,
            vertical_streak_detection,
            bubble_template_image: ballot_scan_bubble_image(),
            minimum_detected_scale,
            max_cumulative_streak_width,
            retry_streak_width_threshold,
        }
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
            expected_ballot_hash: self.expected_ballot_hash,
            bubble_template: self.bubble_template_image,
            debug_side_a_base: debug_side_a_base.into(),
            debug_side_b_base: debug_side_b_base.into(),
            write_in_scoring: self.write_in_scoring,
            vertical_streak_detection: self.vertical_streak_detection,
            minimum_detected_scale: self.minimum_detected_scale,
            max_cumulative_streak_width: self.max_cumulative_streak_width,
            retry_streak_width_threshold: self.retry_streak_width_threshold,
            metadata_source: MetadataSource::QrCode,
        };
        ballot_card(side_a_image, side_b_image, &options)
    }
}

type ScoringPairs = (
    Pair<ScoredBubbleMarks>,
    Pair<Vec<InterpretedContestLayout>>,
    Pair<ScoredPositionAreas>,
);

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
    // v4.1+ stores ballot geometry as `ballotPositions` on each ballot style;
    // flatten it into the per-bubble grid layouts the interpreter scores against.
    let grid_layouts = options.election.grid_layouts();
    if grid_layouts.is_empty() {
        return Err(Error::InvalidElection {
            message: "election has no ballot positions".to_owned(),
        });
    }
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

    // Run timing mark detection and QR code detection in parallel since they
    // are independent operations on the same ballot images.
    let (timing_marks_result, decoded_qr_codes_result) = rayon::join(
        || {
            ballot_card.find_timing_marks(&timing_marks::Options::default_for_geometry(
                ballot_card.geometry(),
            ))
        },
        || match &options.metadata_source {
            MetadataSource::QrCode => {
                ballot_card.decode_ballot_barcodes(&options.election, &options.expected_ballot_hash)
            }
            #[cfg(test)]
            MetadataSource::Provided(metadata) => Ok(metadata.clone()),
        },
    );

    let mut timing_marks = match timing_marks_result {
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

    let mut decoded_qr_codes = decoded_qr_codes_result?;

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
                            timing_marks,
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

    // Run scoring and image normalization+encoding in parallel. The PNG
    // encoding is CPU-heavy and overlaps well with bubble-mark scoring.
    let (scoring_result, normalized_and_encoded) = rayon::join(
        || -> Result<ScoringPairs> {
            let scored_bubble_marks = ballot_card.score_bubble_marks(
                &timing_marks,
                options.bubble_template,
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

            Ok((scored_bubble_marks, contest_layouts, write_in_area_scores))
        },
        || {
            ballot_card.as_pair().par_map(|ballot_page| {
                threshold_and_encode_png(
                    ballot_page.ballot_image().image(),
                    ballot_page.ballot_image().threshold(),
                )
            })
        },
    );

    let (scored_bubble_marks, contest_layouts, write_in_area_scores) = scoring_result?;
    let (normalized_images, encoded_images): (Pair<_>, Pair<_>) = {
        let ((front_norm, front_enc), (back_norm, back_enc)) = normalized_and_encoded.into();
        (
            Pair::new(front_norm, back_norm),
            Pair::new(front_enc, back_enc),
        )
    };

    Pair::from((
        timing_marks,
        decoded_qr_codes,
        scored_bubble_marks,
        write_in_area_scores,
        normalized_images,
        encoded_images,
        contest_layouts,
    ))
    .map(
        |(
            timing_marks,
            (metadata, _),
            marks,
            write_ins,
            normalized_image,
            encoded_normalized_image,
            contest_layouts,
        )| {
            InterpretedBallotPage {
                timing_marks,
                metadata: BallotPageMetadata::QrCode(metadata),
                marks,
                write_ins,
                normalized_image,
                encoded_normalized_image,
                contest_layouts,
            }
        },
    )
    .join(|front, back| Ok(InterpretedBallotCard { front, back }))
}

#[cfg(test)]
#[allow(clippy::similar_names, clippy::unwrap_used)]
mod test {
    use std::path::{Path, PathBuf};

    use image::{imageops::FilterType, DynamicImage, GenericImage, Luma, Rgb};
    use itertools::Itertools;
    use sha2::{Digest, Sha256};
    use types_rs::{
        ballot_card::{BallotType, PageNumber},
        bubble_ballot::PartialBallotHash,
        election::{BallotStyleId, ContestId, OptionId, PrecinctId},
        geometry::{PixelPosition, Rect},
    };

    use crate::{
        ballot_card::ballot_scan_bubble_image,
        debug::{monospace_font, ImageDebugWriter},
        draw_utils::draw_text_mut,
        qr_code,
        scoring::{self, UnitIntervalScore},
        timing_marks::{self, DefaultForGeometry, TimingMarks},
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

    /// Reads an election.json file as bytes, deserializes it, and computes the
    /// partial ballot hash from those same bytes. The hash must come from the
    /// raw bytes (matching the TS `sha256(electionData)` convention) so that
    /// `expected_ballot_hash` agrees with the hash QR-encoded in the ballot.
    fn load_election_and_ballot_hash(election_path: &Path) -> (Election, PartialBallotHash) {
        let bytes = std::fs::read(election_path).unwrap();
        let election: Election = serde_json::from_slice(&bytes).unwrap();
        let digest = Sha256::digest(&bytes);
        let mut hash = PartialBallotHash::default();
        let len = hash.len();
        hash.copy_from_slice(&digest[..len]);
        (election, hash)
    }

    /// Builds a [`MetadataSource::Provided`] from a front page's metadata,
    /// inferring the back page. Used for field-captured fixtures whose QR codes
    /// predate the current metadata encoding and can no longer be decoded. The
    /// supplied values mirror what those QR codes originally encoded.
    fn provided_metadata(front: Metadata) -> MetadataSource {
        let back = bubble_ballot::infer_missing_page_metadata(&front);
        MetadataSource::Provided(Pair::new(
            (front, Orientation::Portrait),
            (back, Orientation::Portrait),
        ))
    }

    fn load_ballot_card_fixture(
        fixture_name: &str,
        (side_a_name, side_b_name): (&str, &str),
        (precinct_id, ballot_style_id): (&str, &str),
        is_test_mode: bool,
    ) -> (GrayImage, GrayImage, Options) {
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test/fixtures");
        let election_path = fixture_path.join(fixture_name).join("election.json");
        let (election, expected_ballot_hash) = load_election_and_ballot_hash(&election_path);
        let bubble_template = ballot_scan_bubble_image();
        let side_a_path = fixture_path.join(fixture_name).join(side_a_name);
        let side_b_path = fixture_path.join(fixture_name).join(side_b_name);
        let (side_a_image, side_b_image) = load_ballot_card_images(&side_a_path, &side_b_path);
        let options = Options {
            debug_side_a_base: None,
            debug_side_b_base: None,
            bubble_template,
            election,
            expected_ballot_hash,
            write_in_scoring: WriteInScoring::Enabled,
            vertical_streak_detection: VerticalStreakDetection::default(),
            minimum_detected_scale: None,
            max_cumulative_streak_width: 5,
            retry_streak_width_threshold: 1,
            metadata_source: provided_metadata(Metadata {
                ballot_hash: expected_ballot_hash,
                precinct_id: PrecinctId::from(precinct_id.to_owned()),
                ballot_style_id: BallotStyleId::from(ballot_style_id.to_owned()),
                page_number: PageNumber::new_unchecked(1),
                is_test_mode,
                ballot_type: BallotType::Precinct,
                ballot_audit_id: None,
            }),
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
        let (election, expected_ballot_hash) = load_election_and_ballot_hash(&election_path);

        let bubble_template = ballot_scan_bubble_image();
        let side_a_path = fixture_path.join(format!("blank-ballot-p{starting_page_number}.jpg"));
        let side_b_path =
            fixture_path.join(format!("blank-ballot-p{}.jpg", starting_page_number + 1));
        let (side_a_image, side_b_image) = load_ballot_card_images(&side_a_path, &side_b_path);
        let options = Options {
            debug_side_a_base: None,
            debug_side_b_base: None,
            bubble_template,
            election,
            expected_ballot_hash,
            write_in_scoring: WriteInScoring::Enabled,
            vertical_streak_detection: VerticalStreakDetection::default(),
            minimum_detected_scale: None,
            max_cumulative_streak_width: 5,
            retry_streak_width_threshold: 1,
            metadata_source: MetadataSource::QrCode,
        };
        (side_a_image, side_b_image, options)
    }

    fn deface_ballot_by_removing_side_timing_marks(image: &mut GrayImage, marks: &TimingMarks) {
        const PADDING: u32 = 10;
        let image_rect = Rect::new(0, 0, image.width(), image.height());
        let left_marks = &marks.border_marks.left;
        let right_marks = &marks.border_marks.right;
        let left_side_mark_to_deface = left_marks[left_marks.len() / 2];
        let right_side_mark_to_deface = right_marks[right_marks.len() / 2];

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
            load_hmpb_fixture("vx-general-election/letter-en", 1);
        let card = ballot_card(side_a_image, side_b_image, &options).unwrap();
        assert!(is_binary_image(&card.front.normalized_image));
        assert!(is_binary_image(&card.back.normalized_image));
    }

    #[test]
    fn test_debug_images_with_cropping() {
        let (side_a_image, _, _) = load_hmpb_fixture("vx-general-election/letter-en", 1);
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
            load_hmpb_fixture("vx-general-election/letter-en", 1);
        let detected = qr_code::detect_with_strategy(
            &side_a_image,
            qr_code::SearchStrategy::BubbleCorners,
            &ImageDebugWriter::disabled(),
        )
        .unwrap();
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
            load_hmpb_fixture("vx-general-election/letter-en", 1);
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
            load_hmpb_fixture("vx-general-election/letter-en", 1);
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

    /// A narrow vertical streak running through the left timing-mark column
    /// is allowed: it doesn't reach the cumulative streak-width threshold
    /// and it doesn't intersect any bubble. (Previously, any streak in the
    /// outer 10% of the page was rejected outright.)
    #[test]
    fn test_vertical_streak_through_left_timing_mark_is_allowed() {
        let (mut side_a_image, side_b_image, options) =
            load_hmpb_fixture("vx-general-election/letter-en", 1);
        let timing_mark_x = 60;
        let black_pixel = Luma([0]);
        for y in 0..side_a_image.height() {
            side_a_image.put_pixel(timing_mark_x, y, black_pixel);
        }
        let interpretation = ballot_card(side_a_image, side_b_image, &options)
            .expect("interpretation should succeed despite narrow streak through left mark");
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

    /// A narrow vertical streak running through the right timing-mark column
    /// is allowed for the same reasons as the left-side case.
    #[test]
    fn test_vertical_streak_through_right_timing_mark_is_allowed() {
        let (mut side_a_image, side_b_image, options) =
            load_hmpb_fixture("vx-general-election/letter-en", 1);
        let timing_mark_x = side_a_image.width() - 60;
        let black_pixel = Luma([0]);
        for y in 0..side_a_image.height() {
            side_a_image.put_pixel(timing_mark_x, y, black_pixel);
        }
        let interpretation = ballot_card(side_a_image, side_b_image, &options)
            .expect("interpretation should succeed despite narrow streak through right mark");
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
    fn test_rotated_ballot_scoring_write_in_areas_no_write_ins() {
        let (_, _, mut options) = load_hmpb_fixture("vx-general-election/letter-en", 3);
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("test/fixtures/vx-general-election-letter");
        let (side_a_image_rotated, side_b_image_rotated) = load_ballot_card_images(
            &fixture_path.join("blank-ballot-p3-rotated-1deg.jpg"),
            &fixture_path.join("blank-ballot-p4-rotated-1deg.jpg"),
        );
        // These rotated ballots were generated against a different bytes
        // version of the election than the one in `hmpb/fixtures/...` and their
        // QR codes predate the current metadata encoding, so we supply the
        // metadata directly instead of decoding it.
        options.metadata_source = provided_metadata(Metadata {
            ballot_hash: options.expected_ballot_hash,
            precinct_id: PrecinctId::from("23".to_owned()),
            ballot_style_id: BallotStyleId::from("12".to_owned()),
            page_number: PageNumber::new_unchecked(3),
            is_test_mode: false,
            ballot_type: BallotType::Absentee,
            ballot_audit_id: None,
        });

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
        let (mut side_a_image, side_b_image, options) = load_ballot_card_fixture(
            "vxqa-2024-10",
            ("rotation-front.png", "rotation-back.png"),
            ("yxrf8bdlu2zz", "1_en"),
            false,
        );
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
        let (mut side_a_image, side_b_image, options) = load_ballot_card_fixture(
            "vxqa-2024-10",
            ("skew-front.png", "skew-back.png"),
            ("yxrf8bdlu2zz", "1_en"),
            false,
        );
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
            ("j6ydtpkgvwyz", "1_en"),
            true,
        );
        let interpretation =
            ballot_card(side_a_image.clone(), side_b_image.clone(), &options).unwrap();

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
            ("j6ydtpkgvwyz", "1_en"),
            true,
        );
        let interpretation =
            ballot_card(side_a_image.clone(), side_b_image.clone(), &options).unwrap();

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
            ("yxrf8bdlu2zz", "1_en"),
            false,
        );
        ballot_card(side_a_image, side_b_image, &options).unwrap();
    }

    #[test]
    fn test_rejects_ballot_with_unexpected_ballot_hash() {
        let (side_a_image, side_b_image, mut options) =
            load_hmpb_fixture("vx-general-election/letter-en", 1);

        // The fixture's default `expected_ballot_hash` matches the QR-encoded
        // hash, so interpretation succeeds.
        let actual_ballot_hash = options.expected_ballot_hash;

        // Override with a hash that definitely does not match: flip every bit.
        let bogus = actual_ballot_hash.map(|b| !b);
        options.expected_ballot_hash = bogus;

        match ballot_card(side_a_image, side_b_image, &options) {
            Err(Error::InvalidBallotHash { expected, actual }) => {
                assert_eq!(expected, bogus);
                assert_eq!(actual, actual_ballot_hash);
            }
            Err(err) => panic!("unexpected error: {err:?}"),
            Ok(_) => panic!("interpretation unexpectedly succeeded"),
        }
    }

    /// Defends against the failure mode from issue #8426 in the layer where it
    /// actually breaks. If a ballot somehow gets past the hash check but its
    /// detected timing-mark grid is shorter than the configured election's
    /// `gridLayouts` expect (e.g., a letter-sized ballot scored against a
    /// `custom-8.5x17` election), some gridPositions land outside the detected
    /// grid.
    #[test]
    fn test_rejects_ballot_with_grid_position_outside_timing_mark_grid() {
        // Letter-sized ballot images (the physical paper we'll scan).
        let (side_a_image, side_b_image, mut options) =
            load_hmpb_fixture("vx-general-election/letter-en", 1);
        // Override the election with the 17"-tall variant's election.json,
        // which has gridLayouts placing contests at rows that don't exist on
        // a letter-sized ballot's timing-mark grid. Keep the letter ballot's
        // hash so the hash check passes — we want to exercise the
        // scoring-time check, not the hash check.
        let custom_election_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../hmpb/fixtures/vx-general-election/custom-8.5x17-en/election.json");
        let (custom_election, _) = load_election_and_ballot_hash(&custom_election_path);
        options.election = custom_election;

        match ballot_card(side_a_image, side_b_image, &options) {
            Err(Error::GridPositionOutsideTimingMarkGrid {
                label,
                contest_id: _,
                column: _,
                row,
            }) => {
                assert_eq!(label, SIDE_A_LABEL);
                // The 17" gridLayout puts contests beyond what fits on letter,
                // so the offending row should be well past where the letter
                // ballot's grid ends.
                assert!(row > 10.0, "row was unexpectedly small: {row}");
            }
            Err(err) => panic!("unexpected error: {err:?}"),
            Ok(_) => panic!("interpretation unexpectedly succeeded"),
        }
    }

    #[test]
    /// Regression test: drawing a vertical line through most right-side timing marks
    /// should not cause empty bubbles to receive non-trivial scores.
    fn test_partial_streak_through_timing_marks() {
        // Load a blank HMPB fixture (no marks expected on bubbles).
        let (mut side_a_image, side_b_image, options) =
            load_hmpb_fixture("vx-general-election/letter-en", 1);
        // First, interpret the clean image to get timing marks.
        let clean_interpretation =
            ballot_card(side_a_image.clone(), side_b_image.clone(), &options)
                .expect("clean interpretation should succeed");

        // Draw a continuous vertical bar across the right border intersecting
        // all but the top two and bottom two right timing marks. This preserves
        // some marks so timing detection still succeeds but simulates a streak
        // that breaks bubble scoring in the buggy behavior.
        let right_marks = &clean_interpretation.front.timing_marks.border_marks.right;
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
            load_hmpb_fixture("vx-general-election/letter-en", 1);
        // First, interpret the clean image to get timing marks.
        let clean_interpretation =
            ballot_card(side_a_image.clone(), side_b_image.clone(), &options)
                .expect("clean interpretation should succeed");

        // Draw a continuous vertical bar across the right border intersecting
        // all but the top two and bottom two right timing marks. This preserves
        // some marks so timing detection can find the corners, but fails because
        // the streak is too wide.
        let right_marks = &clean_interpretation.front.timing_marks.border_marks.right;
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

    /// A vertical streak running the full image height through a top and
    /// bottom timing mark used to be rejected: the streak distorted the
    /// timing-mark shape past what the full-borders strategy's per-shape
    /// median filter could recover, so the mark was filtered out and
    /// `MissingTimingMarks` was returned. With the grid built only from
    /// the left/right borders and corners, the same streak no longer
    /// prevents interpretation.
    ///
    /// The streak is placed at a layout-gutter column (no contests live
    /// there), so the per-bubble intersection check during scoring also
    /// allows it. The streak is wider than the default cumulative-streak
    /// threshold, so the test raises the threshold — simulating a streak
    /// that's narrow enough to slip past streak detection in a deployment
    /// configured for higher tolerance, or wide enough only because of a
    /// localized printing artifact at top/bottom that gets binarized
    /// alongside it.
    #[test]
    fn test_streak_through_top_and_bottom_marks_does_not_break_interpretation() {
        const STREAK_HALF_WIDTH: i32 = 5; // 10 px wide, exceeds median filter window (8)

        let (mut side_a_image, side_b_image, mut options) =
            load_hmpb_fixture("vx-general-election/letter-en", 1);
        options.max_cumulative_streak_width = 20;

        let clean_interpretation =
            ballot_card(side_a_image.clone(), side_b_image.clone(), &options)
                .expect("clean interpretation should succeed");
        let tm = &clean_interpretation.front.timing_marks;
        let n_cols = tm.geometry.grid_size.width;

        // Find an interior column whose horizontal extent doesn't overlap
        // any bubble's matched bounds. We need to avoid the leftmost and
        // rightmost timing-mark columns (those are still required for grid
        // reconstruction) and any column that holds a bubble (those would
        // trip the per-bubble intersection check).
        let bubble_x_ranges: Vec<(i32, i32)> = clean_interpretation
            .front
            .marks
            .iter()
            .filter_map(|(_, m)| {
                m.as_ref()
                    .map(|m| (m.matched_bounds.left(), m.matched_bounds.right()))
            })
            .collect();
        // Expand the exclusion zone generously: the streak's added darkness
        // can attract a nearby bubble's matched bounds toward the streak,
        // and we want clear of both the bubble template's max search
        // distance AND the bubble template's full width on either side.
        let bubble_w = options.bubble_template.width() as i32;
        let exclude_radius =
            STREAK_HALF_WIDTH + scoring::DEFAULT_MAXIMUM_SEARCH_DISTANCE as i32 + bubble_w;
        let line_x = (1..n_cols - 1)
            .map(|col| {
                let frac = col as f32 / (n_cols - 1) as f32;
                (tm.top_left_corner.x + frac * (tm.top_right_corner.x - tm.top_left_corner.x))
                    .round() as i32
            })
            .find(|&cx| {
                let exclude_left = cx - exclude_radius;
                let exclude_right = cx + exclude_radius;
                !bubble_x_ranges
                    .iter()
                    .any(|(l, r)| *l <= exclude_right && *r >= exclude_left)
            })
            .expect("expected at least one interior column with no bubble in its x-range");

        // 10-pixel-wide black streak running the full image height.
        let black = Luma([0u8]);
        let img_w = side_a_image.width() as i32;
        for y in 0..side_a_image.height() as i32 {
            for dx in -STREAK_HALF_WIDTH..STREAK_HALF_WIDTH {
                let x = line_x + dx;
                if x >= 0 && x < img_w {
                    side_a_image.put_pixel(x as u32, y as u32, black);
                }
            }
        }

        let interpretation = ballot_card(side_a_image, side_b_image, &options)
            .expect("interpretation should succeed despite streak through top/bottom timing marks");

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

    /// A ballot with several top and bottom timing marks rendered
    /// undetectable (e.g. from a fold, smudge, or ink residue at the very
    /// top or bottom edge) used to be rejected by the previous full-borders
    /// strategy. The grid is now constructed from the left/right borders and
    /// the four corners, so as long as those are intact the ballot still
    /// interprets correctly.
    #[test]
    fn test_missing_top_and_bottom_timing_marks_does_not_break_interpretation() {
        let (mut side_a_image, side_b_image, options) =
            load_hmpb_fixture("vx-general-election/letter-en", 1);

        // We no longer record top/bottom marks on `TimingMarks`, so use the
        // four corners (which we still record) to compute approximate
        // top/bottom mark positions for a clean ballot.
        let clean_interpretation =
            ballot_card(side_a_image.clone(), side_b_image.clone(), &options)
                .expect("clean interpretation should succeed");
        let tm = &clean_interpretation.front.timing_marks;
        let n_cols = tm.geometry.grid_size.width as i32;
        let mark_w = tm.geometry.timing_mark_width_pixels().ceil() as i32;
        let mark_h = tm.geometry.timing_mark_height_pixels().ceil() as i32;
        let pad = 6_i32; // extra slop so the mark is fully covered
        let img_w = side_a_image.width() as i32;
        let img_h = side_a_image.height() as i32;
        let white = Luma([0xFFu8]);

        // Paint a white rectangle over a handful of middle top marks and the
        // matching middle bottom marks. We avoid the four corners (still
        // needed for corner detection) and the left/right marks (still
        // needed for grid reconstruction).
        let middle = n_cols / 2;
        for col in [middle - 2, middle - 1, middle, middle + 1, middle + 2] {
            let frac = col as f32 / (n_cols - 1) as f32;
            for (corner_a, corner_b) in [
                (tm.top_left_corner, tm.top_right_corner),
                (tm.bottom_left_corner, tm.bottom_right_corner),
            ] {
                let cx = (corner_a.x + frac * (corner_b.x - corner_a.x)).round() as i32;
                let cy = (corner_a.y + frac * (corner_b.y - corner_a.y)).round() as i32;
                for y in (cy - mark_h / 2 - pad).max(0)..(cy + mark_h / 2 + pad).min(img_h) {
                    for x in (cx - mark_w / 2 - pad).max(0)..(cx + mark_w / 2 + pad).min(img_w) {
                        side_a_image.put_pixel(x as u32, y as u32, white);
                    }
                }
            }
        }

        let interpretation = ballot_card(side_a_image, side_b_image, &options)
            .expect("interpretation should succeed with several top/bottom marks obscured");

        // Bubble scores on a blank ballot should still be near zero — the
        // obscured marks are well outside the bubble grid.
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

    /// A ballot with several top timing marks rendered undetectable from text
    /// used to be rejected by the previous full-borders strategy. The grid is
    /// now constructed from the left/right borders and the four corners, so as
    /// long as those are intact the ballot still interprets correctly.
    #[test]
    fn test_obscured_top_and_bottom_timing_marks_does_not_break_interpretation() {
        let (side_a_image, side_b_image, options) =
            load_hmpb_fixture("vx-general-election/letter-en", 1);

        // We no longer record top/bottom marks on `TimingMarks`, so use the
        // four corners (which we still record) to compute approximate
        // top/bottom mark positions for a clean ballot.
        let clean_interpretation =
            ballot_card(side_a_image.clone(), side_b_image.clone(), &options)
                .expect("clean interpretation should succeed");
        let tm = &clean_interpretation.front.timing_marks;
        let black = Rgb([0, 0, 0]);

        // Draw text over a handful of top marks similar to how a clerk might
        // during L&A testing.
        let mut rgb_image = DynamicImage::ImageLuma8(side_a_image).into_rgb8();
        draw_text_mut(
            &mut rgb_image,
            black,
            (tm.top_left_corner.x + tm.geometry.timing_mark_width_pixels() * 3.0) as i32,
            (tm.top_left_corner.y + tm.geometry.timing_mark_height_pixels() - 30.0) as i32,
            72.0,
            &monospace_font(),
            "TEST BALLOT",
        );

        let side_a_image = DynamicImage::ImageRgb8(rgb_image).into_luma8();
        let interpretation = ballot_card(side_a_image, side_b_image, &options)
            .expect("interpretation should succeed with several top marks obscured");

        // Bubble scores on a blank ballot should still be near zero — the
        // obscured marks are well outside the bubble grid.
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
    fn test_reject_scaled_down_ballots() {
        let (side_a_image, side_b_image, options) =
            load_hmpb_fixture("vx-general-election/letter-en", 3);
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
        let (_, side_b_image, mut options) = load_hmpb_fixture("vx-general-election/letter-en", 1);

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
            load_hmpb_fixture("vx-general-election/letter-en", 1);

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
                page.find_timing_marks(&timing_marks::Options::default_for_geometry(
                    page.geometry(),
                ))
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
        let (_, side_b_image, mut options) = load_hmpb_fixture("vx-general-election/letter-en", 1);

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
        let (_, side_b_image, mut options) = load_hmpb_fixture("vx-general-election/letter-en", 1);

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
