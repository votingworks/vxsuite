use serde::Serialize;
use types_rs::geometry::{PixelUnit, Point, Rect};

use crate::{ballot_card::BallotImage, scoring::UnitIntervalScore};

/// Scores the given timing mark against its expected geometry. The score is
/// based on the number of pixels in the timing mark that are the expected
/// luminosity, and the number of pixels in the surrounding area that are not the
/// expected luminosity.
///
/// The function looks for black pixels in the timing mark area and white pixels
/// in the areas to the left, right, above, and below the timing mark. It's
/// important to re-iterate that the gap between one timing mark and the next is
/// assumed to be the same as the *height* of the timing mark, not the width,
/// whether they're arranged horizontally or vertically. Thus, in a horizontal
/// arrangement (i.e. the timing marks are on the top and bottom of the image),
/// we do not look to the sides of the timing mark for white pixels of the same
/// width as the timing mark, but only as much as the expected gap, which is the
/// height of the timing mark:
///
/// ```plaintext
///
///         ██████
///
///         ██████    If we're scoring the corner timing mark, the box around
///                   it is roughly the area we're looking at. The white pixels
///         ██████    are expected to be a border around the timing mark whose
///                   size is the same as the timing mark's height.
///         ██████
///      ┌──────────┐
///      │  ██████  │██████   ██████   ██████   ██████   ██████   ██████   ██████
///      └──────────┘
///
/// ```
fn score_timing_mark_geometry_match(
    ballot_image: &BallotImage,
    timing_mark: &Rect,
) -> TimingMarkScore {
    let image = ballot_image.image();
    let image_rect = Rect::new(0, 0, image.width(), image.height());
    let expected_width = ballot_image.geometry().timing_mark_width_pixels() as PixelUnit;
    let expected_height = ballot_image.geometry().timing_mark_height_pixels() as PixelUnit;
    let expected_timing_mark_rect = Rect::new(
        timing_mark.left(),
        timing_mark.top(),
        expected_width,
        expected_height,
    );
    let search_rect = Rect::new(
        (timing_mark.center().x - expected_width as f32 / 2.0 - expected_height as f32) as i32,
        1.5f32.mul_add(-(expected_height as f32), timing_mark.center().y) as i32,
        expected_width + 2 * expected_height,
        3 * expected_height,
    );
    let mut mark_pixel_match_count = 0;
    let mut padding_pixel_match_count = 0;

    for y in search_rect.top()..search_rect.bottom() {
        for x in search_rect.left()..search_rect.right() {
            let point = Point::new(x, y);
            if image_rect.contains(point) {
                let pixel = ballot_image.get_pixel(x as u32, y as u32);
                let expects_mark_pixel = expected_timing_mark_rect.contains(point);

                if expects_mark_pixel == pixel.is_foreground() {
                    if expects_mark_pixel {
                        mark_pixel_match_count += 1;
                    } else {
                        padding_pixel_match_count += 1;
                    }
                }
            }
        }
    }

    // Note that we DO NOT use the actual width and height of the timing mark
    // here, but the expected width and height. This is because the timing mark
    // may be cropped and its score will be artificially inflated if we use the
    // actual width and height.
    let timing_mark_area = expected_width * expected_height;
    let search_area = search_rect.width() * search_rect.height();
    TimingMarkScore {
        mark_score: UnitIntervalScore(mark_pixel_match_count as f32 / timing_mark_area as f32),
        padding_score: UnitIntervalScore(
            padding_pixel_match_count as f32 / (search_area - timing_mark_area) as f32,
        ),
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[must_use]
#[serde(rename_all = "camelCase")]
pub struct TimingMarkScore {
    mark_score: UnitIntervalScore,
    padding_score: UnitIntervalScore,
}

impl TimingMarkScore {
    pub const fn new(mark_score: UnitIntervalScore, padding_score: UnitIntervalScore) -> Self {
        Self {
            mark_score,
            padding_score,
        }
    }

    pub const fn mark_score(self) -> UnitIntervalScore {
        self.mark_score
    }

    pub const fn padding_score(self) -> UnitIntervalScore {
        self.padding_score
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[must_use]
pub struct CandidateTimingMark {
    rect: Rect,
    scores: TimingMarkScore,
}

impl CandidateTimingMark {
    pub const fn new(rect: Rect, scores: TimingMarkScore) -> Self {
        Self { rect, scores }
    }

    pub fn scored(ballot_image: &BallotImage, rect: Rect) -> Self {
        Self {
            scores: score_timing_mark_geometry_match(ballot_image, &rect),
            rect,
        }
    }

    pub const fn scores(&self) -> TimingMarkScore {
        self.scores
    }

    pub const fn rect(&self) -> &Rect {
        &self.rect
    }
}
