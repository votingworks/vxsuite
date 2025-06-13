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
use types_rs::election::{BallotStyleId, Election, MetadataEncoding, PrecinctId};
use types_rs::geometry::PixelPosition;
use types_rs::geometry::{PixelUnit, Size};

use crate::ballot_card::get_matching_paper_info_for_image_size;
use crate::ballot_card::load_ballot_scan_bubble_image;
use crate::ballot_card::BallotCard;
use crate::ballot_card::BallotImage;
use crate::ballot_card::BallotPage;
use crate::ballot_card::BallotSide;
use crate::ballot_card::Geometry;
use crate::ballot_card::PaperInfo;
use crate::debug::ImageDebugWriter;
use crate::image_utils::detect_vertical_streaks;
use crate::image_utils::find_scanned_document_inset;
use crate::image_utils::Inset;
use crate::layout::build_interpreted_page_layout;
use crate::layout::InterpretedContestLayout;
use crate::metadata::hmpb;
use crate::qr_code;
use crate::scoring::score_bubble_marks_from_grid_layout;
use crate::scoring::score_write_in_areas;
use crate::scoring::ScoredBubbleMarks;
use crate::scoring::ScoredPositionAreas;
use crate::timing_marks::contours;
use crate::timing_marks::corners;
use crate::timing_marks::normalize_orientation;
use crate::timing_marks::BallotPageMetadata;
use crate::timing_marks::DefaultForGeometry;
use crate::timing_marks::TimingMarks;

#[derive(Debug, Clone)]
pub struct Options {
    pub election: Election,
    pub bubble_template: GrayImage,
    pub debug_side_a_base: Option<PathBuf>,
    pub debug_side_b_base: Option<PathBuf>,
    pub score_write_ins: bool,
    pub disable_vertical_streak_detection: bool,
    pub infer_timing_marks: bool,
    pub timing_mark_algorithm: TimingMarkAlgorithm,
}

#[derive(Debug, Clone, Copy)]
pub enum TimingMarkAlgorithm {
    Contours,
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
            Self::Contours => write!(f, "contours"),
            Self::Corners => write!(f, "corners"),
        }
    }
}

impl FromStr for TimingMarkAlgorithm {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "contours" => Ok(Self::Contours),
            "corners" => Ok(Self::Corners),
            _ => Err(format!("Unexpected algorithm: {s}")),
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
    #[error("could not compute layout for {side:?}")]
    CouldNotComputeLayout { side: BallotSide },
    #[error("vertical streaks detected on {label:?}")]
    #[serde(rename_all = "camelCase")]
    VerticalStreaksDetected {
        label: String,
        x_coordinates: Vec<PixelPosition>,
    },
}

pub type Result<T, E = Error> = std::result::Result<T, E>;

pub const SIDE_A_LABEL: &str = "side A";
pub const SIDE_B_LABEL: &str = "side B";

pub struct ScanInterpreter {
    election: Election,
    score_write_ins: bool,
    disable_vertical_streak_detection: bool,
    infer_timing_marks: bool,
    bubble_template_image: GrayImage,
    timing_mark_algorithm: TimingMarkAlgorithm,
}

impl ScanInterpreter {
    /// Creates a new `ScanInterpreter` with the given configuration.
    ///
    /// # Errors
    ///
    /// Returns an error if the bubble template image could not be loaded.
    pub fn new(
        election: Election,
        score_write_ins: bool,
        disable_vertical_streak_detection: bool,
        infer_timing_marks: bool,
        timing_mark_algorithm: TimingMarkAlgorithm,
    ) -> Result<Self, image::ImageError> {
        let bubble_template_image = load_ballot_scan_bubble_image()?;
        Ok(Self {
            election,
            score_write_ins,
            disable_vertical_streak_detection,
            infer_timing_marks,
            bubble_template_image,
            timing_mark_algorithm,
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
            score_write_ins: self.score_write_ins,
            disable_vertical_streak_detection: self.disable_vertical_streak_detection,
            infer_timing_marks: self.infer_timing_marks,
            timing_mark_algorithm: self.timing_mark_algorithm,
        };
        ballot_card(side_a_image, side_b_image, &options)
    }
}

/// Load both sides of a ballot card image and return the ballot card.
///
/// # Errors
///
/// Returns an error if the images could not be loaded or if the ballot card
/// could not be prepared.
#[allow(clippy::result_large_err)]
pub fn prepare_ballot_card_images(
    side_a_image: GrayImage,
    side_b_image: GrayImage,
    possible_paper_infos: &[PaperInfo],
) -> Result<BallotCard> {
    let (side_a_result, side_b_result) = par_map_pair(
        (SIDE_A_LABEL, side_a_image),
        (SIDE_B_LABEL, side_b_image),
        |(label, image)| prepare_ballot_page_image(label, image, possible_paper_infos),
    );

    let BallotPage {
        ballot_image: side_a_image,
        geometry: side_a_geometry,
    } = side_a_result?;
    let BallotPage {
        ballot_image: side_b_image,
        geometry: side_b_geometry,
    } = side_b_result?;

    if side_a_geometry != side_b_geometry {
        return Err(Error::MismatchedBallotCardGeometries {
            side_a: BallotPageAndGeometry {
                label: SIDE_A_LABEL.to_string(),
                border_inset: side_a_image.border_inset,
                geometry: side_a_geometry,
            },
            side_b: BallotPageAndGeometry {
                label: SIDE_B_LABEL.to_string(),
                border_inset: side_b_image.border_inset,
                geometry: side_b_geometry,
            },
        });
    }

    Ok(BallotCard {
        side_a: side_a_image,
        side_b: side_b_image,
        geometry: side_a_geometry,
    })
}

/// This sets the ratio of pixels required to be white (above the threshold) in
/// a given edge row or column to consider it no longer eligible to be cropped.
/// This used to be 50%, but we found that too much of the top/bottom of the
/// actual ballot content was being cropped, especially in the case of a skewed
/// ballot. In such cases, one of the corners would sometimes be partially or
/// completely cropped, leading to the ballot being rejected. We chose the new
/// value by trial and error, in particular by seeing how much cropping occurred
/// on ballots with significant but still acceptable skew (i.e. 3 degrees).
const CROP_BORDERS_THRESHOLD_RATIO: f32 = 0.1;

/// Return the image with the black border cropped off.
#[must_use]
pub fn crop_ballot_page_image_borders(image: GrayImage) -> Option<BallotImage> {
    let threshold = otsu_level(&image);
    let border_inset =
        find_scanned_document_inset(&image, threshold, CROP_BORDERS_THRESHOLD_RATIO)?;

    if border_inset.is_zero() {
        // Don't bother cropping if there's no inset.
        return Some(BallotImage {
            image,
            threshold,
            border_inset,
        });
    }

    let image = image
        .view(
            border_inset.left,
            border_inset.top,
            image.width() - border_inset.left - border_inset.right,
            image.height() - border_inset.top - border_inset.bottom,
        )
        .to_image();

    // Re-compute the threshold after cropping to ensure future
    // re-interpretations based on the saved image are consistent with the
    // initial one.
    let threshold = otsu_level(&image);

    Some(BallotImage {
        image,
        threshold,
        border_inset,
    })
}

/// Prepare a ballot page image for interpretation by cropping the black border.
///
/// # Errors
///
/// Returns an error if the image cannot be cropped or if the paper information
/// cannot be determined.
#[allow(clippy::result_large_err)]
pub fn prepare_ballot_page_image(
    label: &str,
    image: GrayImage,
    possible_paper_infos: &[PaperInfo],
) -> Result<BallotPage> {
    let Some(BallotImage {
        image,
        threshold,
        border_inset,
    }) = crop_ballot_page_image_borders(image)
    else {
        return Err(Error::BorderInsetNotFound {
            label: label.to_string(),
        });
    };

    let Some(paper_info) =
        get_matching_paper_info_for_image_size(image.dimensions(), possible_paper_infos)
    else {
        let (width, height) = image.dimensions();
        return Err(Error::UnexpectedDimensions {
            label: label.to_string(),
            dimensions: Size { width, height },
        });
    };

    Ok(BallotPage {
        ballot_image: BallotImage {
            image,
            threshold,
            border_inset,
        },
        geometry: paper_info.compute_geometry(),
    })
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
    let BallotCard {
        side_a,
        side_b,
        geometry,
    } = prepare_ballot_card_images(side_a_image, side_b_image, &PaperInfo::scanned())?;

    let mut side_a_debug = match &options.debug_side_a_base {
        Some(base) => ImageDebugWriter::new(base.clone(), side_a.image.clone()),
        None => ImageDebugWriter::disabled(),
    };
    let mut side_b_debug = match &options.debug_side_b_base {
        Some(base) => ImageDebugWriter::new(base.clone(), side_b.image.clone()),
        None => ImageDebugWriter::disabled(),
    };

    if !options.disable_vertical_streak_detection {
        [
            (SIDE_A_LABEL, &side_a, &side_a_debug),
            (SIDE_B_LABEL, &side_b, &side_b_debug),
        ]
        .par_iter()
        .map(|(label, side, debug)| {
            let streaks = detect_vertical_streaks(&side.image, side.threshold, debug);
            if streaks.is_empty() {
                Ok(())
            } else {
                Err(Error::VerticalStreaksDetected {
                    label: (*label).to_string(),
                    x_coordinates: streaks,
                })
            }
        })
        .collect::<Result<(), _>>()?;
    }

    let (side_a_timing_marks_result, side_b_timing_marks_result) = par_map_pair(
        (&side_a, &mut side_a_debug),
        (&side_b, &mut side_b_debug),
        |(ballot_image, debug)| match options.timing_mark_algorithm {
            TimingMarkAlgorithm::Contours => contours::find_timing_mark_grid(
                &geometry,
                ballot_image,
                contours::FindTimingMarkGridOptions {
                    allowed_timing_mark_inset_percentage_of_width:
                        contours::ALLOWED_TIMING_MARK_INSET_PERCENTAGE_OF_WIDTH,
                    infer_timing_marks: options.infer_timing_marks,
                    debug,
                },
            ),
            TimingMarkAlgorithm::Corners => {
                let default_geometry = PaperInfo::scanned_letter().compute_geometry();
                corners::find_timing_mark_grid(
                    ballot_image,
                    &geometry,
                    debug,
                    &corners::Options::default_for_geometry(&default_geometry),
                )
            }
        },
    );

    let side_a_timing_marks = side_a_timing_marks_result?;
    let side_b_timing_marks = side_b_timing_marks_result?;

    // We'll find the appropriate metadata, use it to normalize the image and
    // grid orientation, and extract the ballot style from it.
    let (
        (front_timing_marks, front_image, front_threshold, front_metadata, front_debug),
        (back_timing_marks, back_image, back_threshold, back_metadata, back_debug),
        ballot_style_id,
    ) = match options.election.ballot_layout.metadata_encoding {
        MetadataEncoding::QrCode => {
            let (side_a_qr_code_result, side_b_qr_code_result) = par_map_pair(
                (&side_a.image, &side_a_debug, SIDE_A_LABEL),
                (&side_b.image, &side_b_debug, SIDE_B_LABEL),
                |(image, debug, label)| {
                    let qr_code = qr_code::detect(image, debug).map_err(|e| {
                        Error::InvalidQrCodeMetadata {
                            label: label.to_owned(),
                            message: e.to_string(),
                        }
                    })?;
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

    let Some(grid_layout) = options
        .election
        .grid_layouts
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

    let (front_write_in_area_scores, back_write_in_area_scores) = options
        .score_write_ins
        .then(|| {
            par_map_pair(
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
            )
        })
        .unwrap_or_default();

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

    use image::Luma;
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
            score_write_ins: true,
            disable_vertical_streak_detection: false,
            infer_timing_marks: true,
            timing_mark_algorithm: TimingMarkAlgorithm::default(),
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
            score_write_ins: true,
            disable_vertical_streak_detection: false,
            infer_timing_marks: true,
            timing_mark_algorithm: TimingMarkAlgorithm::default(),
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
                disable_vertical_streak_detection: true,
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
