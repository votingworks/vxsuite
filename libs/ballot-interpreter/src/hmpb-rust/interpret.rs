use std::path::PathBuf;

use image::GenericImage;
use image::GrayImage;
use imageproc::contrast::otsu_level;
use logging_timer::time;
use serde::Serialize;

use crate::ballot_card::get_matching_paper_info_for_image_size;
use crate::ballot_card::BallotSide;
use crate::ballot_card::Geometry;
use crate::ballot_card::PaperInfo;
use crate::debug::ImageDebugWriter;
use crate::election::BallotStyleId;
use crate::election::Election;
use crate::election::MetadataEncoding;
use crate::geometry::PixelUnit;
use crate::geometry::Rect;
use crate::geometry::Size;
use crate::image_utils::find_scanned_document_inset;
use crate::image_utils::maybe_resize_image_to_fit;
use crate::image_utils::Inset;
use crate::layout::build_interpreted_page_layout;
use crate::layout::InterpretedContestLayout;
use crate::qr_code;
use crate::qr_code_metadata::decode_metadata_bits;
use crate::qr_code_metadata::BallotPageQrCodeMetadataError;
use crate::scoring::score_bubble_marks_from_grid_layout;
use crate::scoring::score_write_in_areas;
use crate::scoring::ScoredBubbleMarks;
use crate::scoring::ScoredPositionAreas;
use crate::timing_mark_metadata::BallotPageTimingMarkMetadata;
use crate::timing_mark_metadata::BallotPageTimingMarkMetadataError;
use crate::timing_marks::detect_metadata_and_normalize_orientation_from_timing_marks;
use crate::timing_marks::find_timing_mark_grid;
use crate::timing_marks::normalize_orientation;
use crate::timing_marks::BallotPageMetadata;
use crate::timing_marks::TimingMarkGrid;

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
pub struct NormalizedImageBuffer {
    width: u32,
    height: u32,
    data: Vec<u8>,
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
pub type InterpretResult = Result<InterpretedBallotCard, Error>;

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
    #[error("missing timing marks: {rects:?}")]
    MissingTimingMarks { rects: Vec<Rect> },
    #[error("unexpected dimensions for {label}: {dimensions:?}")]
    UnexpectedDimensions {
        label: String,
        dimensions: Size<PixelUnit>,
    },
    #[error("could not compute layout for {side:?}")]
    CouldNotComputeLayout { side: BallotSide },
}

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
) -> Result<BallotCard, Error> {
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
) -> Result<BallotPage, Error> {
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
) -> InterpretResult {
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
        |(image, debug)| find_timing_mark_grid(&geometry, image, debug),
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

            // TODO - To increase resiliency, if we successfully read a QR code from one
            // side but not the other, we could correct the other side's metadata before
            // unwrapping the results below.

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
                    detect_metadata_and_normalize_orientation_from_timing_marks(
                        label, &geometry, grid, image, debug,
                    )
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
                    BallotStyleId::from(format!("card-number-{}", front_metadata.card_number)),
                ),
                (
                    BallotPageTimingMarkMetadata::Back(_),
                    BallotPageTimingMarkMetadata::Front(front_metadata),
                ) => (
                    side_b,
                    side_a,
                    BallotStyleId::from(format!("card-number-{}", front_metadata.card_number)),
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
        (&front_grid, BallotSide::Front),
        (&back_grid, BallotSide::Back),
        |(grid, side)| {
            build_interpreted_page_layout(grid, grid_layout, sheet_number, side)
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
                    &front_contest_layouts,
                    &front_scored_bubble_marks,
                    &front_debug,
                ),
                (
                    &back_image,
                    &back_contest_layouts,
                    &back_scored_bubble_marks,
                    &back_debug,
                ),
                |(image, contest_layouts, scored_bubble_marks, debug)| {
                    score_write_in_areas(
                        image,
                        grid_layout,
                        contest_layouts,
                        scored_bubble_marks,
                        debug,
                    )
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
mod test {
    use std::{
        fs::File,
        io::BufReader,
        path::{Path, PathBuf},
    };

    use crate::ballot_card::load_ballot_scan_bubble_image;

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

    #[test]
    fn test_par_map_pair() {
        assert_eq!(par_map_pair(1, 2, |n| n * 2), (2, 4));
    }

    #[test]
    fn test_interpret_ballot_card() {
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test/fixtures/ashland");
        let election_path = fixture_path.join("election.json");
        let election: Election =
            serde_json::from_reader(BufReader::new(File::open(election_path).unwrap())).unwrap();
        let bubble_template = load_ballot_scan_bubble_image().unwrap();
        for (side_a_name, side_b_name) in [
            ("scan-side-a.jpeg", "scan-side-b.jpeg"),
            ("scan-rotated-side-b.jpeg", "scan-rotated-side-a.jpeg"),
        ] {
            let side_a_path = fixture_path.join(side_a_name);
            let side_b_path = fixture_path.join(side_b_name);
            let (side_a_image, side_b_image) = load_ballot_card_images(&side_a_path, &side_b_path);
            interpret_ballot_card(
                side_a_image,
                side_b_image,
                &Options {
                    debug_side_a_base: None,
                    debug_side_b_base: None,
                    bubble_template: bubble_template.clone(),
                    election: election.clone(),
                    score_write_ins: true,
                },
            )
            .unwrap();
        }
    }
}
