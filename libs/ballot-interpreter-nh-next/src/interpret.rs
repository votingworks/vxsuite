use std::fmt::Display;
use std::path::PathBuf;

use image::GenericImage;
use image::GrayImage;
use imageproc::contrast::otsu_level;
use logging_timer::time;
use serde::Serialize;

use crate::ballot_card::get_scanned_ballot_card_geometry;
use crate::ballot_card::BallotSide;
use crate::ballot_card::Geometry;
use crate::debug::ImageDebugWriter;
use crate::election::BallotStyleId;
use crate::election::Election;
use crate::geometry::PixelUnit;
use crate::geometry::Rect;
use crate::geometry::Size;
use crate::image_utils::find_scanned_document_inset;
use crate::image_utils::maybe_resize_image_to_fit;
use crate::image_utils::Inset;
use crate::layout::build_interpreted_page_layout;
use crate::layout::InterpretedContestLayout;
use crate::metadata::BallotPageMetadata;
use crate::metadata::BallotPageMetadataError;
use crate::scoring::score_oval_marks_from_grid_layout;
use crate::scoring::ScoredOvalMarks;
use crate::timing_marks::find_timing_mark_grid;
use crate::timing_marks::TimingMarkGrid;

#[derive(Debug, Clone)]
pub struct Options {
    pub debug_side_a_base: Option<PathBuf>,
    pub debug_side_b_base: Option<PathBuf>,
    pub oval_template: GrayImage,
    pub election: Election,
}

pub struct BallotImage {
    pub image: GrayImage,
    pub threshold: u8,
    pub border_inset: Inset,
}
pub struct BallotPage {
    pub ballot_image: BallotImage,
    pub geometry: Geometry,
}

pub struct BallotCard {
    side_a: BallotImage,
    side_b: BallotImage,
    geometry: Geometry,
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
    pub marks: ScoredOvalMarks,
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
pub type Result = core::result::Result<InterpretedBallotCard, Error>;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BallotPageAndGeometry {
    pub label: String,
    pub border_inset: Inset,
    pub geometry: Geometry,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Error {
    BorderInsetNotFound {
        label: String,
    },
    #[serde(rename_all = "camelCase")]
    InvalidCardMetadata {
        side_a: BallotPageMetadata,
        side_b: BallotPageMetadata,
    },
    InvalidMetadata {
        label: String,
        error: BallotPageMetadataError,
    },
    #[serde(rename_all = "camelCase")]
    MismatchedBallotCardGeometries {
        side_a: BallotPageAndGeometry,
        side_b: BallotPageAndGeometry,
    },
    MissingGridLayout {
        front: BallotPageMetadata,
        back: BallotPageMetadata,
    },
    MissingTimingMarks {
        rects: Vec<Rect>,
    },
    UnexpectedDimensions {
        label: String,
        dimensions: Size<PixelUnit>,
    },
    CouldNotComputeLayout {
        side: BallotSide,
    },
}

pub const SIDE_A_LABEL: &str = "side A";
pub const SIDE_B_LABEL: &str = "side B";

impl Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::BorderInsetNotFound { label } => {
                write!(f, "Could not find border inset for {label}")
            }
            Self::InvalidCardMetadata { side_a, side_b } => write!(
                f,
                "Invalid card metadata: {SIDE_A_LABEL}: {side_a:?}, {SIDE_B_LABEL}: {side_b:?}"
            ),
            Self::InvalidMetadata { label, error } => {
                write!(f, "Invalid metadata for {label}: {error:?}")
            }
            Self::MismatchedBallotCardGeometries { side_a, side_b } => write!(
                f,
                "Mismatched ballot card geometries: {SIDE_A_LABEL}: {side_a:?}, {SIDE_B_LABEL}: {side_b:?}"
            ),
            Self::MissingGridLayout { front, back } => write!(
                f,
                "Missing grid layout: front: {front:?}, back: {back:?}"
            ),
            Self::MissingTimingMarks { rects } => write!(
                f,
                "Missing timing marks: {}",
                rects
                    .iter()
                    .map(|rect| format!("({:?}, {:?})", rect.left(), rect.top()))
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            Self::UnexpectedDimensions { label, dimensions } => {
                write!(f, "Unexpected dimensions for {label}: {dimensions:?}")
            }
            Self::CouldNotComputeLayout { side } => {
                write!(f, "Could not compute layout for {side:?}")
            }
        }
    }
}

/// Load both sides of a ballot card image and return the ballot card.
#[time]
fn prepare_ballot_card_images(
    side_a_image: GrayImage,
    side_b_image: GrayImage,
) -> core::result::Result<BallotCard, Error> {
    let (side_a_result, side_b_result) = rayon::join(
        || prepare_ballot_scan_image(SIDE_A_LABEL, side_a_image),
        || prepare_ballot_scan_image(SIDE_B_LABEL, side_b_image),
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
pub fn prepare_ballot_scan_image(
    label: &str,
    image: GrayImage,
) -> core::result::Result<BallotPage, Error> {
    let Some(BallotImage {
        image,
        threshold,
        border_inset,
    }) = crop_ballot_page_image_borders(image) else {
        return Err(Error::BorderInsetNotFound {
            label: label.to_string(),
        });
    };

    let Some(geometry) = get_scanned_ballot_card_geometry(image.dimensions()) else {
        let (width, height) = image.dimensions();
        return Err(Error::UnexpectedDimensions {
            label: label.to_string(),
            dimensions: Size { width, height },
        });
    };

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
) -> Result {
    let BallotCard {
        side_a,
        side_b,
        geometry,
    } = prepare_ballot_card_images(side_a_image, side_b_image)?;

    let mut side_a_debug = match &options.debug_side_a_base {
        Some(base) => ImageDebugWriter::new(base.clone(), side_a.image.clone()),
        None => ImageDebugWriter::disabled(),
    };
    let mut side_b_debug = match &options.debug_side_b_base {
        Some(base) => ImageDebugWriter::new(base.clone(), side_b.image.clone()),
        None => ImageDebugWriter::disabled(),
    };

    let (side_a_result, side_b_result) = rayon::join(
        || {
            find_timing_mark_grid(
                SIDE_A_LABEL,
                &geometry,
                &side_a.image,
                side_a.border_inset,
                &mut side_a_debug,
            )
        },
        || {
            find_timing_mark_grid(
                SIDE_B_LABEL,
                &geometry,
                &side_b.image,
                side_b.border_inset,
                &mut side_b_debug,
            )
        },
    );

    let (side_a_grid, side_a_normalized_img) = side_a_result?;
    let (side_b_grid, side_b_normalized_img) = side_b_result?;

    let ((front_image, front_grid, front_debug), (back_image, back_grid, back_debug)) =
        match (&side_a_grid.metadata, &side_b_grid.metadata) {
            (BallotPageMetadata::Front(_), BallotPageMetadata::Back(_)) => (
                (
                    side_a_normalized_img.unwrap_or(side_a.image),
                    side_a_grid,
                    side_a_debug,
                ),
                (
                    side_b_normalized_img.unwrap_or(side_b.image),
                    side_b_grid,
                    side_b_debug,
                ),
            ),
            (BallotPageMetadata::Back(_), BallotPageMetadata::Front(_)) => (
                (
                    side_b_normalized_img.unwrap_or(side_b.image),
                    side_b_grid,
                    side_b_debug,
                ),
                (
                    side_a_normalized_img.unwrap_or(side_a.image),
                    side_a_grid,
                    side_a_debug,
                ),
            ),
            _ => {
                return Err(Error::InvalidCardMetadata {
                    side_a: side_a_grid.metadata,
                    side_b: side_b_grid.metadata,
                })
            }
        };

    let ballot_style_id = match &front_grid.metadata {
        BallotPageMetadata::Front(metadata) => {
            BallotStyleId::from(format!("card-number-{}", metadata.card_number))
        }
        BallotPageMetadata::Back(_) => unreachable!(),
    };

    let Some(grid_layout) = options
        .election
        .grid_layouts
        .iter()
        .find(|layout| layout.ballot_style_id == ballot_style_id) else {
            return Err(Error::MissingGridLayout {
                front: front_grid.metadata,
                back: back_grid.metadata,
            })
    };

    let (front_scored_oval_marks, back_scored_oval_marks) = rayon::join(
        || {
            score_oval_marks_from_grid_layout(
                &front_image,
                &options.oval_template,
                &front_grid,
                grid_layout,
                BallotSide::Front,
                &front_debug,
            )
        },
        || {
            score_oval_marks_from_grid_layout(
                &back_image,
                &options.oval_template,
                &back_grid,
                grid_layout,
                BallotSide::Back,
                &back_debug,
            )
        },
    );

    let front_contest_layouts =
        build_interpreted_page_layout(&front_grid, grid_layout, BallotSide::Front).ok_or(
            Error::CouldNotComputeLayout {
                side: BallotSide::Front,
            },
        )?;
    let back_contest_layouts =
        build_interpreted_page_layout(&back_grid, grid_layout, BallotSide::Back).ok_or(
            Error::CouldNotComputeLayout {
                side: BallotSide::Back,
            },
        )?;

    Ok(InterpretedBallotCard {
        front: InterpretedBallotPage {
            grid: front_grid,
            marks: front_scored_oval_marks,
            normalized_image: front_image,
            contest_layouts: front_contest_layouts,
        },
        back: InterpretedBallotPage {
            grid: back_grid,
            marks: back_scored_oval_marks,
            normalized_image: back_image,
            contest_layouts: back_contest_layouts,
        },
    })
}

#[cfg(test)]
mod test {
    use std::{
        fs::File,
        io::BufReader,
        path::{Path, PathBuf},
    };

    use crate::ballot_card::load_oval_template;

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
        rayon::join(
            || load_ballot_page_image(side_a_path),
            || load_ballot_page_image(side_b_path),
        )
    }

    #[test]
    fn test_interpret_ballot_card() {
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test/fixtures/ashland");
        let election_path = fixture_path.join("election.json");
        let election: Election =
            serde_json::from_reader(BufReader::new(File::open(election_path).unwrap())).unwrap();
        let oval_template = load_oval_template().unwrap();
        for (side_a_name, side_b_name) in vec![
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
                    oval_template: oval_template.clone(),
                    election: election.clone(),
                },
            )
            .unwrap();
        }
    }
}
