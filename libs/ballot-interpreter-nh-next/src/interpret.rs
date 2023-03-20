use std::path::Path;

use image::DynamicImage;
use image::GenericImage;
use image::GrayImage;
use image::ImageBuffer;
use image::Luma;
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
use crate::metadata::BallotPageMetadata;
use crate::metadata::BallotPageMetadataError;
use crate::scoring::score_oval_marks_from_grid_layout;
use crate::scoring::ScoredOvalMarks;
use crate::timing_marks::find_timing_mark_grid;
use crate::timing_marks::TimingMarkGrid;

#[derive(Debug, Clone)]
pub struct Options {
    pub debug: bool,
    pub oval_template: GrayImage,
    pub election: Election,
}

pub struct LoadedBallotImage {
    image: GrayImage,
    threshold: u8,
    border_inset: Inset,
}
pub struct LoadedBallotPage {
    ballot_image: LoadedBallotImage,
    geometry: Geometry,
}
pub struct LoadedBallotCard {
    side_a: LoadedBallotImage,
    side_b: LoadedBallotImage,
    geometry: Geometry,
}

#[derive(Debug, Serialize)]
pub struct NormalizedImageBuffer {
    width: u32,
    height: u32,
    data: Vec<u8>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterpretedBallotPage {
    grid: TimingMarkGrid,
    marks: ScoredOvalMarks,
    normalized_image: NormalizedImageBuffer,
}
#[derive(Debug, Serialize)]
pub struct InterpretedBallotCard {
    pub front: InterpretedBallotPage,
    pub back: InterpretedBallotPage,
}
pub type Result = core::result::Result<InterpretedBallotCard, Error>;

#[derive(Debug, Serialize)]
pub struct BallotPagePathAndGeometry {
    pub path: String,
    pub border_inset: Inset,
    pub geometry: Geometry,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Error {
    ImageOpenFailure {
        path: String,
    },
    BorderInsetNotFound {
        path: String,
    },
    #[serde(rename_all = "camelCase")]
    InvalidCardMetadata {
        side_a: BallotPageMetadata,
        side_b: BallotPageMetadata,
    },
    InvalidMetadata {
        path: String,
        error: BallotPageMetadataError,
    },
    #[serde(rename_all = "camelCase")]
    MismatchedBallotCardGeometries {
        side_a: BallotPagePathAndGeometry,
        side_b: BallotPagePathAndGeometry,
    },
    MissingGridLayout {
        front: BallotPageMetadata,
        back: BallotPageMetadata,
    },
    MissingTimingMarks {
        rects: Vec<Rect>,
    },
    UnexpectedDimensions {
        path: String,
        dimensions: Size<PixelUnit>,
    },
}

#[time]
/// Load both sides of a ballot card image and return the ballot card.
fn load_ballot_card_images(
    side_a_path: &Path,
    side_b_path: &Path,
) -> core::result::Result<LoadedBallotCard, Error> {
    let (side_a_result, side_b_result) = rayon::join(
        || load_and_prepare_ballot_page_image(side_a_path),
        || load_and_prepare_ballot_page_image(side_b_path),
    );

    let LoadedBallotPage {
        ballot_image: side_a_image,
        geometry: side_a_geometry,
    } = side_a_result?;
    let LoadedBallotPage {
        ballot_image: side_b_image,
        geometry: side_b_geometry,
    } = side_b_result?;

    if side_a_geometry != side_b_geometry {
        return Err(Error::MismatchedBallotCardGeometries {
            side_a: BallotPagePathAndGeometry {
                path: side_a_path.to_str().unwrap_or_default().to_string(),
                border_inset: side_a_image.border_inset,
                geometry: side_a_geometry,
            },
            side_b: BallotPagePathAndGeometry {
                path: side_b_path.to_str().unwrap_or_default().to_string(),
                border_inset: side_b_image.border_inset,
                geometry: side_b_geometry,
            },
        });
    }

    Ok(LoadedBallotCard {
        side_a: side_a_image,
        side_b: side_b_image,
        geometry: side_a_geometry,
    })
}

/// Loads a ballot page image from disk as grayscale.
#[time]
pub fn load_ballot_page_image(image_path: &Path) -> core::result::Result<GrayImage, Error> {
    match image::open(image_path) {
        Ok(image) => Ok(image.into_luma8()),
        Err(_) => {
            return Err(Error::ImageOpenFailure {
                path: image_path.to_str().unwrap_or_default().to_string(),
            })
        }
    }
}

/// Return the image with the black border cropped off.
#[time]
pub fn crop_ballot_page_image_borders(mut image: GrayImage) -> Option<LoadedBallotImage> {
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

    Some(LoadedBallotImage {
        image,
        threshold,
        border_inset,
    })
}

/// Load a ballot page image from disk, crop the black border, and maybe resize
/// it to the expected dimensions.
#[time]
pub fn load_and_prepare_ballot_page_image(
    image_path: &Path,
) -> core::result::Result<LoadedBallotPage, Error> {
    let image = load_ballot_page_image(image_path)?;

    let Some(LoadedBallotImage {
        image,
        threshold,
        border_inset,
    }) = crop_ballot_page_image_borders(image) else {
        return Err(Error::BorderInsetNotFound {
            path: image_path.to_str().unwrap_or_default().to_string(),
        });
    };

    let Some(geometry) = get_scanned_ballot_card_geometry(image.dimensions()) else {
        let (width, height) = image.dimensions();
        return Err(Error::UnexpectedDimensions {
            path: image_path.to_str().unwrap_or_default().to_string(),
            dimensions: Size { width, height },
        });
    };

    let image = maybe_resize_image_to_fit(image, geometry.canvas_size);

    Ok(LoadedBallotPage {
        ballot_image: LoadedBallotImage {
            image,
            threshold,
            border_inset,
        },
        geometry,
    })
}

#[time]
fn make_normalized_image_buffer(image: ImageBuffer<Luma<u8>, Vec<u8>>) -> NormalizedImageBuffer {
    let (width, height) = image.dimensions();
    let rgba_image = DynamicImage::ImageLuma8(image).into_rgba8();
    NormalizedImageBuffer {
        width,
        height,
        data: rgba_image.into_raw(),
    }
}

#[time]
pub fn interpret_ballot_card(side_a_path: &Path, side_b_path: &Path, options: &Options) -> Result {
    let LoadedBallotCard {
        side_a,
        side_b,
        geometry,
    } = load_ballot_card_images(side_a_path, side_b_path)?;

    let mut side_a_debug = if options.debug {
        ImageDebugWriter::new(side_a_path.to_path_buf(), side_a.image.clone())
    } else {
        ImageDebugWriter::disabled()
    };
    let mut side_b_debug = if options.debug {
        ImageDebugWriter::new(side_b_path.to_path_buf(), side_b.image.clone())
    } else {
        ImageDebugWriter::disabled()
    };

    let (side_a_result, side_b_result) = rayon::join(
        || {
            find_timing_mark_grid(
                side_a_path,
                &geometry,
                &side_a.image,
                side_a.border_inset,
                &mut side_a_debug,
            )
        },
        || {
            find_timing_mark_grid(
                side_b_path,
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

    Ok(InterpretedBallotCard {
        front: InterpretedBallotPage {
            grid: front_grid,
            marks: front_scored_oval_marks,
            normalized_image: make_normalized_image_buffer(front_image),
        },
        back: InterpretedBallotPage {
            grid: back_grid,
            marks: back_scored_oval_marks,
            normalized_image: make_normalized_image_buffer(back_image),
        },
    })
}

#[cfg(test)]
mod test {
    use std::{fs::File, io::BufReader, path::PathBuf};

    use crate::ballot_card::load_oval_template;

    use super::*;

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
            interpret_ballot_card(
                side_a_path.as_path(),
                side_b_path.as_path(),
                &Options {
                    debug: false,
                    oval_template: oval_template.clone(),
                    election: election.clone(),
                },
            )
            .unwrap();
        }
    }
}
