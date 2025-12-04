use ab_glyph::PxScale;
use image::RgbImage;
use imageproc::drawing::{draw_filled_rect_mut, draw_text_mut, text_size};
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
        let scale = PxScale::from(12.0);
        let font = monospace_font();
        let padding = 3;

        // Helper function to format score as percentage, omitting decimal point if all zeros after it
        let format_score = |score: f32| -> String {
            let percentage = score * 100.0;
            let formatted = format!("{percentage:.2}");
            // Remove trailing zeros and decimal point if not needed
            let trimmed = formatted.trim_end_matches('0').trim_end_matches('.');
            format!("{trimmed}%")
        };

        // Left edge - text on the right (inside the grid)
        for (mark, color) in self.left.iter().zip(rainbow()) {
            let rect = mark.rect();
            draw_filled_rect_mut(canvas, imageproc_rect_from_rect(rect), color);

            let text = format_score(mark.scores().mark_score().0);
            draw_text_mut(
                canvas,
                color,
                rect.right() + padding,
                rect.top(),
                scale,
                &font,
                &text,
            );
        }

        // Right edge - text on the left (inside the grid)
        for (mark, color) in self.right.iter().zip(rainbow()) {
            let rect = mark.rect();
            draw_filled_rect_mut(canvas, imageproc_rect_from_rect(rect), color);

            let text = format_score(mark.scores().mark_score().0);
            let (text_width, _) = text_size(scale, &font, &text);
            draw_text_mut(
                canvas,
                color,
                rect.left() - text_width as i32 - padding,
                rect.top(),
                scale,
                &font,
                &text,
            );
        }

        // Top edge - text below (inside the grid)
        for (mark, color) in self.top.iter().zip(rainbow()) {
            let rect = mark.rect();
            draw_filled_rect_mut(canvas, imageproc_rect_from_rect(rect), color);

            let text = format_score(mark.scores().mark_score().0);
            draw_text_mut(
                canvas,
                color,
                rect.left(),
                rect.bottom() + padding,
                scale,
                &font,
                &text,
            );
        }

        // Bottom edge - text above (inside the grid)
        for (mark, color) in self.bottom.iter().zip(rainbow()) {
            let rect = mark.rect();
            draw_filled_rect_mut(canvas, imageproc_rect_from_rect(rect), color);

            let text = format_score(mark.scores().mark_score().0);
            let (_, text_height) = text_size(scale, &font, &text);
            draw_text_mut(
                canvas,
                color,
                rect.left(),
                rect.top() - text_height as i32 - padding,
                scale,
                &font,
                &text,
            );
        }
    }
}
