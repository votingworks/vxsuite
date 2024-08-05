use std::path::PathBuf;

use image::GenericImage;
use image::GrayImage;
use imageproc::contrast::otsu_level;
use logging_timer::time;
use serde::Serialize;
use types_rs::election::{BallotStyleId, Election, MetadataEncoding, PrecinctId};
use types_rs::geometry::{PixelUnit, Rect, Size};

use crate::ballot_card::get_matching_paper_info_for_image_size;
use crate::ballot_card::BallotSide;
use crate::ballot_card::Geometry;
use crate::ballot_card::PaperInfo;
use crate::debug::ImageDebugWriter;
use crate::image_utils::find_scanned_document_inset;
use crate::image_utils::maybe_resize_image_to_fit;
use crate::image_utils::Inset;
use crate::layout::build_interpreted_page_layout;
use crate::layout::InterpretedContestLayout;
use crate::qr_code;
use crate::qr_code_metadata::decode_metadata_bits;
use crate::qr_code_metadata::infer_missing_page_metadata;
use crate::qr_code_metadata::BallotPageQrCodeMetadataError;
use crate::scoring::score_bubble_marks_from_grid_layout;
use crate::scoring::score_write_in_areas;
use crate::scoring::ScoredBubbleMarks;
use crate::scoring::ScoredPositionAreas;
use crate::timing_mark_metadata::BallotPageTimingMarkMetadata;
use crate::timing_mark_metadata::BallotPageTimingMarkMetadataError;
use crate::timing_marks::detect_metadata_and_normalize_orientation;
use crate::timing_marks::find_timing_mark_grid;
use crate::timing_marks::normalize_orientation;
use crate::timing_marks::BallotPageMetadata;
use crate::timing_marks::FindTimingMarkGridOptions;
use crate::timing_marks::TimingMarkGrid;
use crate::timing_marks::ALLOWED_TIMING_MARK_INSET_PERCENTAGE_OF_WIDTH;

#[derive(Debug, Clone)]
pub struct Options {
    pub election: Election,
    pub bubble_template: GrayImage,
    pub debug_side_a_base: Option<PathBuf>,
    pub debug_side_b_base: Option<PathBuf>,
    pub score_write_ins: bool,
}

pub struct BallotImage {
    pub image: GrayImage,
    pub threshold: u8,
    pub border_inset: Inset,
}
pub struct BallotPage {
    ballot_image: BallotImage,
    geometry: Geometry,
}

pub struct BallotCard {
    pub side_a: BallotImage,
    pub side_b: BallotImage,
    pub geometry: Geometry,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterpretedBallotPage {
    pub grid: TimingMarkGrid,
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
    #[error("invalid timing mark metadata for {label}: {error:?}")]
    InvalidTimingMarkMetadata {
        label: String,
        error: BallotPageTimingMarkMetadataError,
    },
    #[error("invalid QR code metadata for {label}: {error:?}")]
    InvalidQrCodeMetadata {
        label: String,
        error: BallotPageQrCodeMetadataError,
    },
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
    #[error("missing timing marks: {rects:?}, reason: {reason}")]
    MissingTimingMarks { rects: Vec<Rect>, reason: String },
    #[error("unexpected dimensions for {label}: {dimensions:?}")]
    UnexpectedDimensions {
        label: String,
        dimensions: Size<PixelUnit>,
    },
    #[error("could not compute layout for {side:?}")]
    CouldNotComputeLayout { side: BallotSide },
}

pub type Result<T, E = Error> = std::result::Result<T, E>;

pub const SIDE_A_LABEL: &str = "side A";
pub const SIDE_B_LABEL: &str = "side B";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum ResizeStrategy {
    Fit,
    NoResize,
}

impl ResizeStrategy {
    pub fn compute_error(
        self,
        expected_dimensions: (u32, u32),
        actual_dimensions: (u32, u32),
    ) -> f32 {
        match self {
            Self::Fit => {
                let (expected_width, expected_height) = expected_dimensions;
                let (actual_width, actual_height) = actual_dimensions;
                let expected_aspect_ratio = expected_width as f32 / expected_height as f32;
                let actual_aspect_ratio = actual_width as f32 / actual_height as f32;
                (expected_aspect_ratio - actual_aspect_ratio).abs()
            }
            Self::NoResize => {
                let (expected_width, expected_height) = expected_dimensions;
                let (actual_width, actual_height) = actual_dimensions;
                let width_error =
                    (expected_width as f32 - actual_width as f32).abs() / expected_width as f32;
                let height_error =
                    (expected_height as f32 - actual_height as f32).abs() / expected_height as f32;
                width_error + height_error
            }
        }
    }
}

/// Load both sides of a ballot card image and return the ballot card.
#[time]
pub fn prepare_ballot_card_images(
    side_a_image: GrayImage,
    side_b_image: GrayImage,
    possible_paper_infos: &[PaperInfo],
    resize_strategy: ResizeStrategy,
) -> Result<BallotCard> {
    let (side_a_result, side_b_result) = par_map_pair(
        (SIDE_A_LABEL, side_a_image),
        (SIDE_B_LABEL, side_b_image),
        |(label, image)| {
            prepare_ballot_page_image(label, image, possible_paper_infos, resize_strategy)
        },
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

/// Return the image with the black border cropped off.
#[time]
pub fn crop_ballot_page_image_borders(mut image: GrayImage) -> Option<BallotImage> {
    let threshold = otsu_level(&image);
    let border_inset = find_scanned_document_inset(&image, threshold)?;
    let image = image
        .sub_image(
            border_inset.left,
            border_inset.top,
            image.width() - border_inset.left - border_inset.right,
            image.height() - border_inset.top - border_inset.bottom,
        )
        .to_image();

    Some(BallotImage {
        image,
        threshold,
        border_inset,
    })
}

/// Prepare a ballot page image for interpretation: crop the black border, and
/// maybe resize it to the expected dimensions.
#[time]
fn prepare_ballot_page_image(
    label: &str,
    image: GrayImage,
    possible_paper_infos: &[PaperInfo],
    resize_strategy: ResizeStrategy,
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

    let Some(paper_info) = get_matching_paper_info_for_image_size(
        image.dimensions(),
        possible_paper_infos,
        resize_strategy,
    ) else {
        let (width, height) = image.dimensions();
        return Err(Error::UnexpectedDimensions {
            label: label.to_string(),
            dimensions: Size { width, height },
        });
    };

    let geometry = paper_info.compute_geometry();
    let image = maybe_resize_image_to_fit(image, geometry.canvas_size);

    Ok(BallotPage {
        ballot_image: BallotImage {
            image,
            threshold,
            border_inset,
        },
        geometry,
    })
}

#[time]
pub fn interpret_ballot_card(
    side_a_image: GrayImage,
    side_b_image: GrayImage,
    options: &Options,
) -> Result<InterpretedBallotCard> {
    let BallotCard {
        side_a,
        side_b,
        geometry,
    } = prepare_ballot_card_images(
        side_a_image,
        side_b_image,
        &PaperInfo::scanned(),
        ResizeStrategy::Fit,
    )?;

    let mut side_a_debug = match &options.debug_side_a_base {
        Some(base) => ImageDebugWriter::new(base.clone(), side_a.image.clone()),
        None => ImageDebugWriter::disabled(),
    };
    let mut side_b_debug = match &options.debug_side_b_base {
        Some(base) => ImageDebugWriter::new(base.clone(), side_b.image.clone()),
        None => ImageDebugWriter::disabled(),
    };

    let (side_a_grid_result, side_b_grid_result) = par_map_pair(
        (&side_a.image, &mut side_a_debug),
        (&side_b.image, &mut side_b_debug),
        |(image, debug)| {
            find_timing_mark_grid(
                &geometry,
                image,
                FindTimingMarkGridOptions {
                    allowed_timing_mark_inset_percentage_of_width:
                        ALLOWED_TIMING_MARK_INSET_PERCENTAGE_OF_WIDTH,
                    debug,
                },
            )
        },
    );

    let side_a_grid = side_a_grid_result?;
    let side_b_grid = side_b_grid_result?;

    // Branch for VX-style ballots (with QR code metadata) vs. Accuvote-style
    // ballots (with timing mark encoded metadata).
    //
    // We'll find the appropriate metadata, use it to normalize the image and
    // grid orientation, and extract the ballot style from it.
    let (
        (front_grid, front_image, front_metadata, front_debug),
        (back_grid, back_image, back_metadata, back_debug),
        ballot_style_id,
    ) = match options.election.ballot_layout.metadata_encoding {
        MetadataEncoding::QrCode => {
            let (side_a_qr_code_result, side_b_qr_code_result) = par_map_pair(
                (&side_a.image, &side_a_debug, SIDE_A_LABEL),
                (&side_b.image, &side_b_debug, SIDE_B_LABEL),
                |(image, debug, label)| {
                    let qr_code = qr_code::detect(image, debug).map_err(|e| {
                        Error::InvalidQrCodeMetadata {
                            label: label.to_string(),
                            error: BallotPageQrCodeMetadataError::QrCodeError(e),
                        }
                    })?;
                    let metadata = decode_metadata_bits(&options.election, qr_code.bytes())
                        .ok_or_else(|| Error::InvalidQrCodeMetadata {
                            label: label.to_string(),
                            error: BallotPageQrCodeMetadataError::InvalidMetadata {
                                bytes: qr_code.bytes().clone(),
                            },
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
                        let side_a_metadata = infer_missing_page_metadata(&side_b_metadata);
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
                        let side_b_metadata = infer_missing_page_metadata(&side_a_metadata);
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
                    side_a_grid,
                    &side_a.image,
                    side_a_orientation,
                    &mut side_a_debug,
                ),
                (
                    side_b_grid,
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
            if side_a_metadata
                .page_number
                .abs_diff(side_b_metadata.page_number)
                != 1
            {
                return Err(Error::NonConsecutivePageNumbers {
                    side_a: side_a_metadata.page_number,
                    side_b: side_b_metadata.page_number,
                });
            }

            let (side_a, side_b) = (
                (
                    side_a_normalized_grid,
                    side_a_normalized_image,
                    BallotPageMetadata::QrCode(side_a_metadata.clone()),
                    side_a_debug,
                ),
                (
                    side_b_normalized_grid,
                    side_b_normalized_image,
                    BallotPageMetadata::QrCode(side_b_metadata),
                    side_b_debug,
                ),
            );

            let ballot_style_id = side_a_metadata.ballot_style_id.clone();

            if side_a_metadata.page_number % 2 == 1 {
                (side_a, side_b, ballot_style_id)
            } else {
                (side_b, side_a, ballot_style_id)
            }
        }

        MetadataEncoding::TimingMarks => {
            let (side_a_result, side_b_result) = par_map_pair(
                (SIDE_A_LABEL, side_a_grid, &side_a.image, &mut side_a_debug),
                (SIDE_B_LABEL, side_b_grid, &side_b.image, &mut side_b_debug),
                |(label, grid, image, debug)| {
                    detect_metadata_and_normalize_orientation(label, &geometry, grid, image, debug)
                },
            );

            let (side_a_normalized_grid, side_a_normalized_image, side_a_metadata) = side_a_result?;
            let (side_b_normalized_grid, side_b_normalized_image, side_b_metadata) = side_b_result?;

            let (side_a, side_b) = (
                (
                    side_a_normalized_grid,
                    side_a_normalized_image,
                    BallotPageMetadata::TimingMarks(side_a_metadata.clone()),
                    side_a_debug,
                ),
                (
                    side_b_normalized_grid,
                    side_b_normalized_image,
                    BallotPageMetadata::TimingMarks(side_b_metadata.clone()),
                    side_b_debug,
                ),
            );

            match (&side_a_metadata, &side_b_metadata) {
                (
                    BallotPageTimingMarkMetadata::Front(front_metadata),
                    BallotPageTimingMarkMetadata::Back(_),
                ) => (
                    side_a,
                    side_b,
                    BallotStyleId::from(format!("card-number-{}", front_metadata.card)),
                ),
                (
                    BallotPageTimingMarkMetadata::Back(_),
                    BallotPageTimingMarkMetadata::Front(front_metadata),
                ) => (
                    side_b,
                    side_a,
                    BallotStyleId::from(format!("card-number-{}", front_metadata.card)),
                ),
                _ => {
                    return Err(Error::InvalidCardMetadata {
                        side_a: BallotPageMetadata::TimingMarks(side_a_metadata),
                        side_b: BallotPageMetadata::TimingMarks(side_b_metadata),
                    })
                }
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
            (f32::from(metadata.page_number) / 2.0).ceil() as u32
        }
        BallotPageMetadata::TimingMarks(_) => 1,
    };

    let (front_scored_bubble_marks, back_scored_bubble_marks) = par_map_pair(
        (&front_image, &front_grid, BallotSide::Front, &front_debug),
        (&back_image, &back_grid, BallotSide::Back, &back_debug),
        |(image, grid, side, debug)| {
            score_bubble_marks_from_grid_layout(
                image,
                &options.bubble_template,
                grid,
                grid_layout,
                sheet_number,
                side,
                debug,
            )
        },
    );

    let (front_contest_layouts, back_contest_layouts) = map_pair(
        (&front_grid, BallotSide::Front, &front_debug),
        (&back_grid, BallotSide::Back, &back_debug),
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
                (&front_image, &front_grid, BallotSide::Front, &front_debug),
                (&back_image, &back_grid, BallotSide::Back, &back_debug),
                |(image, grid, side, debug)| {
                    score_write_in_areas(image, grid, grid_layout, sheet_number, side, debug)
                },
            )
        })
        .unwrap_or_default();

    Ok(InterpretedBallotCard {
        front: InterpretedBallotPage {
            grid: front_grid,
            metadata: front_metadata,
            marks: front_scored_bubble_marks,
            write_ins: front_write_in_area_scores,
            normalized_image: front_image,
            contest_layouts: front_contest_layouts,
        },
        back: InterpretedBallotPage {
            grid: back_grid,
            metadata: back_metadata,
            marks: back_scored_bubble_marks,
            write_ins: back_write_in_area_scores,
            normalized_image: back_image,
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

    use crate::{ballot_card::load_ballot_scan_bubble_image, scoring::UnitIntervalScore};

    use super::*;

    /// Loads a ballot page image from disk as grayscale.
    #[time]
    pub fn load_ballot_page_image(image_path: &Path) -> GrayImage {
        image::open(image_path).unwrap().into_luma8()
    }

    /// Loads images for both sides of a ballot card and returns them.
    pub fn load_ballot_card_images(
        side_a_path: &Path,
        side_b_path: &Path,
    ) -> (GrayImage, GrayImage) {
        par_map_pair(side_a_path, side_b_path, load_ballot_page_image)
    }

    pub fn load_ballot_card_fixture(
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
        };
        (side_a_image, side_b_image, options)
    }

    #[test]
    fn test_par_map_pair() {
        assert_eq!(par_map_pair(1, 2, |n| n * 2), (2, 4));
    }

    #[test]
    fn test_interpret_ballot_card() {
        let (side_a_image, side_b_image, options) =
            load_ballot_card_fixture("ashland", ("scan-side-a.jpeg", "scan-side-b.jpeg"));
        interpret_ballot_card(side_a_image, side_b_image, &options).unwrap();

        let (side_a_image, side_b_image, options) = load_ballot_card_fixture(
            "ashland",
            ("scan-rotated-side-a.jpeg", "scan-rotated-side-b.jpeg"),
        );
        interpret_ballot_card(side_a_image, side_b_image, &options).unwrap();
    }

    #[test]
    fn test_inferred_missing_metadata_from_one_side() {
        let (side_a_image, side_b_image, options) = load_ballot_card_fixture(
            "alameda-test",
            ("scan-skewed-side-a.jpeg", "scan-skewed-side-b.jpeg"),
        );
        interpret_ballot_card(side_a_image, side_b_image, &options).unwrap();
    }

    #[test]
    fn test_missing_bottom_row_timing_marks() {
        let (side_a_image, side_b_image, options) = load_ballot_card_fixture(
            "missing-bottom-timing-marks",
            ("standard-front.jpeg", "standard-back.jpeg"),
        );
        interpret_ballot_card(side_a_image, side_b_image, &options).unwrap();
    }

    #[test]
    fn test_missing_bottom_row_timing_marks_rotated() {
        let (side_a_image, side_b_image, options) = load_ballot_card_fixture(
            "missing-bottom-timing-marks",
            ("rotated-front.jpeg", "rotated-back.jpeg"),
        );
        interpret_ballot_card(side_a_image, side_b_image, &options).unwrap();
    }

    #[test]
    fn test_smudged_timing_mark() {
        let (side_a_image, side_b_image, options) = load_ballot_card_fixture(
            "nh-test-ballot",
            (
                "timing-mark-smudge-front.jpeg",
                "timing-mark-smudge-back.jpeg",
            ),
        );
        let interpretation = interpret_ballot_card(side_a_image, side_b_image, &options).unwrap();

        for side in &[interpretation.front, interpretation.back] {
            for (_, ref scored_mark) in &side.marks {
                // the ballot is not filled out, so the scores should be very low
                assert!(scored_mark.clone().unwrap().fill_score < UnitIntervalScore(0.01));
            }
        }
    }

    #[test]
    fn test_skewed_ballot_scoring_write_in_areas_no_write_ins() {
        let (side_a_image, side_b_image, options) = load_ballot_card_fixture(
            "2023-05-09-nh-moultonborough",
            ("no-write-ins-front.jpeg", "no-write-ins-back.jpeg"),
        );
        let interpretation = interpret_ballot_card(side_a_image, side_b_image, &options).unwrap();

        let front = interpretation.front;
        let back = interpretation.back;

        // front has write-ins, back doesn't
        assert!(!front.write_ins.is_empty());
        assert!(back.write_ins.is_empty());

        for write_in in front.write_ins {
            // no write-ins are written in, so the scores should be low
            assert!(write_in.score < UnitIntervalScore(0.01));
        }
    }

    #[test]
    fn test_skewed_ballot_scoring_write_in_areas_with_write_ins() {
        let (side_a_image, side_b_image, options) = load_ballot_card_fixture(
            "2023-05-09-nh-moultonborough",
            ("write-ins-front.jpeg", "write-ins-back.jpeg"),
        );
        let interpretation = interpret_ballot_card(side_a_image, side_b_image, &options).unwrap();
        let front = interpretation.front;
        let back = interpretation.back;

        // front has write-ins, back doesn't
        assert!(!front.write_ins.is_empty());
        assert!(back.write_ins.is_empty());

        for write_in in front.write_ins {
            // all write-ins are written in, so the scores should be non-zero
            assert!(write_in.score > UnitIntervalScore(0.01));
        }
    }

    #[test]
    fn test_high_rotation_is_rejected() {
        let (side_a_image, side_b_image, options) = load_ballot_card_fixture(
            "2021-06-06-lincoln-test-ballot",
            ("high-rotation-front.png", "high-rotation-back.png"),
        );
        let Error::MissingTimingMarks { reason, .. } =
            interpret_ballot_card(side_a_image, side_b_image, &options).unwrap_err()
        else {
            panic!("wrong error type");
        };

        assert_eq!(
            reason,
            "Unusually high rotation detected: top=3.73°, bottom=1.32°, left=1.33°, right=0.64°"
        );
    }

    #[test]
    fn test_high_skew_is_rejected() {
        let (side_a_image, side_b_image, options) = load_ballot_card_fixture(
            "nh-test-ballot",
            ("high-top-skew-front.png", "high-top-skew-back.png"),
        );
        let Error::MissingTimingMarks { reason, .. } =
            interpret_ballot_card(side_a_image, side_b_image, &options).unwrap_err()
        else {
            panic!("wrong error type");
        };

        assert_eq!(
            reason,
            "Unusually high skew detected: top-left=1.02°, top-right=1.12°, bottom-left=0.01°, bottom-right=0.11°"
        );
    }
}
