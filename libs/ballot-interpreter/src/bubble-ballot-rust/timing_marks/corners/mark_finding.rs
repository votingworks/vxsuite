use ab_glyph::PxScale;
use image::RgbImage;
use imageproc::drawing::{draw_filled_rect_mut, draw_text_mut};
use rayon::iter::{IntoParallelRefIterator, ParallelIterator};

use crate::{
    ballot_card::{BallotImage, Geometry},
    debug::{imageproc_rect_from_rect, monospace_font},
    image_utils::rainbow,
    impl_edgewise,
    timing_marks::{
        corners::{shape_finding::BallotGridBorderShapes, util::EdgeWise},
        CandidateTimingMark,
    },
};

/// Represents the candidate timing marks found on a ballot grid.
pub struct BallotGridCandidateMarks {
    pub left: Vec<CandidateTimingMark>,
    pub right: Vec<CandidateTimingMark>,
    pub top: Vec<CandidateTimingMark>,
    pub bottom: Vec<CandidateTimingMark>,
}

impl_edgewise!(BallotGridCandidateMarks, Vec<CandidateTimingMark>);

impl BallotGridCandidateMarks {
    /// Converts a set of ballot grid border shapes into a set of candidate
    /// timing marks. This operation cannot fail because it doesn't do any
    /// validation of the input shapes, it just scores the shapes.
    pub fn from_shapes(
        ballot_image: &BallotImage,
        geometry: &Geometry,
        shapes: BallotGridBorderShapes,
    ) -> Self {
        // Since we're scoring the shapes by examining every pixel in every shape,
        // we use parallel processing to speed up the operation.
        shapes.par_map_edgewise(|shapes| {
            shapes
                .par_iter()
                .map(|shape| shape.to_candidate_timing_mark(ballot_image, geometry))
                .collect()
        })
    }

    pub fn debug_draw(&self, canvas: &mut RgbImage) {
        for (mark, color) in self
            .left
            .iter()
            .chain(self.right.iter())
            .chain(self.top.iter())
            .chain(self.bottom.iter())
            .zip(rainbow())
        {
            let rect = mark.rect();
            draw_filled_rect_mut(canvas, imageproc_rect_from_rect(rect), color);

            let scale = PxScale::from(20.0);
            let font = monospace_font();
            draw_text_mut(
                canvas,
                color,
                rect.right(),
                rect.top(),
                scale,
                &font,
                &format!("{:?}", mark.scores()),
            );
        }
    }
}
