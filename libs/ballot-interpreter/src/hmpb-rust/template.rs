#![allow(clippy::similar_names)]

use image::GrayImage;
use serde::Serialize;
use types_rs::geometry::{GridUnit, Point};

use crate::ballot_card::{load_ballot_template_bubble_image, PaperInfo};
use crate::debug::ImageDebugWriter;
use crate::interpret::{prepare_ballot_card_images, BallotCard, ResizeStrategy};
use crate::timing_mark_metadata::BallotPageTimingMarkMetadata;
use crate::timing_marks::{
    detect_metadata_and_normalize_orientation_from_timing_marks,
    find_empty_bubbles_matching_template, find_timing_mark_grid, TimingMarkGrid,
};

#[derive(Debug, Serialize)]
pub struct TemplateGridAndBubbles {
    pub grid: TimingMarkGrid,
    pub bubbles: Vec<Point<GridUnit>>,
    pub metadata: BallotPageTimingMarkMetadata,
}

#[derive(Debug, Serialize, thiserror::Error)]
pub enum Error {
    #[error("image error: {0}")]
    ImageError(String),
    #[error("timing mark grid error: {0}")]
    TimingMarkGridError(String),
}

/// How similar should a bubble be to the template to be considered a match? (1 = identical)
const BUBBLE_MATCH_THRESHOLD: f32 = 0.95;

/// How many pixels should we look around the expected bubble location for a match?
const BUBBLE_MATCH_ERROR_PIXELS: u32 = 2;

/// Find the timing mark grid and bubbles for a ballot card template.
#[allow(clippy::similar_names)]
pub fn find_template_grid_and_bubbles(
    side_a_image: GrayImage,
    side_b_image: GrayImage,
    side_a_label: &str,
    side_b_label: &str,
) -> Result<(TemplateGridAndBubbles, TemplateGridAndBubbles), Error> {
    let ballot_card = prepare_ballot_card_images(
        side_a_image,
        side_b_image,
        &PaperInfo::template(),
        ResizeStrategy::NoResize,
    )
    .map_err(|_| Error::ImageError("failed to prepare ballot card images".to_string()))?;

    let BallotCard {
        side_a,
        side_b,
        geometry,
    } = ballot_card;
    let (side_a_result, side_b_result) = rayon::join(
        || {
            let mut debug = ImageDebugWriter::disabled();
            let grid = find_timing_mark_grid(&geometry, &side_a.image, &mut debug)?;
            detect_metadata_and_normalize_orientation_from_timing_marks(
                side_a_label,
                &geometry,
                grid,
                &side_a.image,
                &mut debug,
            )
        },
        || {
            let mut debug = ImageDebugWriter::disabled();
            let grid = find_timing_mark_grid(&geometry, &side_b.image, &mut debug)?;
            detect_metadata_and_normalize_orientation_from_timing_marks(
                side_b_label,
                &geometry,
                grid,
                &side_b.image,
                &mut debug,
            )
        },
    );

    let (
        (side_a_grid, side_a_image, side_a_metadata),
        (side_b_grid, side_b_image, side_b_metadata),
    ) = match (side_a_result, side_b_result) {
        (Ok(a), Ok(b)) => (a, b),
        (Err(err), _) | (_, Err(err)) => {
            return Err(Error::TimingMarkGridError(format!(
                "failed to find timing mark grid for ballot card: {err:?}"
            )));
        }
    };

    let bubble_template =
        load_ballot_template_bubble_image().expect("failed to load template bubble image");

    let (side_a_bubbles, side_b_bubbles) = rayon::join(
        || {
            find_empty_bubbles_matching_template(
                &side_a_image,
                &bubble_template,
                &side_a_grid,
                BUBBLE_MATCH_THRESHOLD,
                BUBBLE_MATCH_ERROR_PIXELS,
            )
        },
        || {
            find_empty_bubbles_matching_template(
                &side_b_image,
                &bubble_template,
                &side_b_grid,
                BUBBLE_MATCH_THRESHOLD,
                BUBBLE_MATCH_ERROR_PIXELS,
            )
        },
    );

    Ok((
        TemplateGridAndBubbles {
            grid: side_a_grid,
            bubbles: side_a_bubbles,
            metadata: side_a_metadata,
        },
        TemplateGridAndBubbles {
            grid: side_b_grid,
            bubbles: side_b_bubbles,
            metadata: side_b_metadata,
        },
    ))
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test {
    use std::path::PathBuf;

    use super::find_template_grid_and_bubbles;

    #[test]
    fn test_find_template_grid_and_bubbles() {
        let fixture_path =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test/fixtures/nh-test-ballot");
        let template_front_path = fixture_path.join("template-front.jpeg");
        let template_back_path = fixture_path.join("template-back.jpeg");
        let side_a_image = image::open(template_front_path).unwrap().to_luma8();
        let side_b_image = image::open(template_back_path).unwrap().to_luma8();
        let (side_a_grid_and_bubbles, side_b_grid_and_bubbles) =
            find_template_grid_and_bubbles(side_a_image, side_b_image, "side A", "side B").unwrap();
        assert_eq!(side_a_grid_and_bubbles.bubbles.len(), 32);
        assert_eq!(side_b_grid_and_bubbles.bubbles.len(), 20);
    }

    #[test]
    fn test_find_template_grid_and_bubbles_error() {
        let side_a_image = image::GrayImage::new(1, 1);
        let side_b_image = image::GrayImage::new(1, 1);
        find_template_grid_and_bubbles(side_a_image, side_b_image, "side A", "side B").unwrap_err();
    }
}
