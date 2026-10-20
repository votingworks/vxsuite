use ab_glyph::PxScale;
use image::RgbImage;
use rayon::iter::{IntoParallelRefIterator, ParallelIterator};
use types_rs::pair::Pair;

use crate::{
    ballot_card::{BallotImage, Geometry},
    debug::monospace_font,
    draw_utils::{draw_filled_rect_mut, draw_text_mut, text_size},
    image_utils::rainbow,
    timing_marks::{CandidateTimingMark, shape_finding::BallotGridBorderShapes},
};

/// Represents the candidate timing marks found on a ballot grid.
pub struct BallotGridCandidateMarks {
    pub left: Vec<CandidateTimingMark>,
    pub right: Vec<CandidateTimingMark>,
}

impl BallotGridCandidateMarks {
    /// Converts a set of ballot grid border shapes into a set of candidate
    /// timing marks. This operation cannot fail because it doesn't do any
    /// validation of the input shapes, it just scores the shapes.
    #[must_use]
    pub fn from_shapes(
        ballot_image: &BallotImage,
        geometry: &Geometry,
        BallotGridBorderShapes { left, right }: BallotGridBorderShapes,
    ) -> Self {
        // Since we're scoring the shapes by examining every pixel in every shape,
        // we use parallel processing to speed up the operation.
        let (left, right) = Pair::new(left, right)
            .par_map(|shapes| {
                shapes
                    .par_iter()
                    .map(|shape| shape.to_candidate_timing_mark(ballot_image, geometry))
                    .collect()
            })
            .into();

        Self { left, right }
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
            draw_filled_rect_mut(canvas, *rect, color);

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
            draw_filled_rect_mut(canvas, *rect, color);

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
    }
}
