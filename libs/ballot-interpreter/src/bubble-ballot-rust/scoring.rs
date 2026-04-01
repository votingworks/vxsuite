use std::fmt::{Debug, Display, Formatter};
use std::ops::{Add, Mul};

use image::{GenericImageView, GrayImage};
use rayon::prelude::{IntoParallelRefIterator, ParallelIterator};
use serde::Serialize;
use types_rs::ballot_card::BallotSide;
use types_rs::election::{GridLayout, GridLocation, GridPosition, UnitIntervalValue};
use types_rs::geometry::{
    PixelPosition, PixelUnit, Point, Quadrilateral, Rect, SubGridUnit, SubPixelUnit,
};

use crate::ballot_card::BallotImage;
use crate::image_utils::{count_pixels, count_pixels_in_shape, threshold, VerticalStreak};
use crate::interpret::{Error, Result};
use crate::timing_marks::TimingMarks;
use crate::{
    debug,
    image_utils::{diff, BLACK},
};

#[derive(Clone, Copy, Serialize, Default)]
#[must_use]
pub struct UnitIntervalScore(pub UnitIntervalValue);

impl Display for UnitIntervalScore {
    fn fmt(&self, f: &mut Formatter) -> std::fmt::Result {
        write!(
            f,
            "{:.precision$}%",
            self.0 * 100.0,
            precision = f.precision().unwrap_or(2)
        )
    }
}

impl core::fmt::Debug for UnitIntervalScore {
    fn fmt(&self, f: &mut Formatter) -> std::fmt::Result {
        write!(
            f,
            "{:.precision$}%",
            self.0 * 100.0,
            precision = f.precision().unwrap_or(2)
        )
    }
}

impl PartialEq for UnitIntervalScore {
    fn eq(&self, other: &Self) -> bool {
        self.0.eq(&other.0)
    }
}

impl PartialOrd for UnitIntervalScore {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        self.0.partial_cmp(&other.0)
    }
}

impl Add for UnitIntervalScore {
    type Output = f32;

    fn add(self, rhs: Self) -> Self::Output {
        self.0 + rhs.0
    }
}

impl Mul<f32> for UnitIntervalScore {
    type Output = Self;

    fn mul(self, rhs: f32) -> Self::Output {
        Self(self.0 * rhs)
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoredBubbleMark {
    /// The location of the bubble mark in the grid. Uses side/column/row, not
    /// x/y.
    pub location: GridLocation,

    /// The score for the match between the source image and the template. This
    /// is the highest value found when looking around `expected_bounds` for the
    /// bubble. 100% is a perfect match.
    pub match_score: UnitIntervalScore,

    /// The score for the fill of the bubble at `matched_bounds`. 100% is
    /// perfectly filled.
    pub fill_score: UnitIntervalScore,

    /// The expected bounds of the bubble mark in the scanned source image.
    pub expected_bounds: Rect,

    /// The bounds of the bubble mark in the scanned source image that was
    /// determined to be the best match.
    pub matched_bounds: Rect,

    /// The diff image that was used to produce `fill_score`.
    #[serde(skip)]
    pub fill_diff_image: GrayImage,
}

impl Debug for ScoredBubbleMark {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ScoredBubbleMark")
            .field("location", &self.location)
            .field("match_score", &self.match_score)
            .field("fill_score", &self.fill_score)
            .field("expected_bounds", &self.expected_bounds)
            .field("matched_bounds", &self.matched_bounds)
            .finish_non_exhaustive()
    }
}

pub const DEFAULT_MAXIMUM_SEARCH_DISTANCE: u32 = 7;

pub type ScoredBubbleMarks = Vec<(GridPosition, Option<ScoredBubbleMark>)>;

#[allow(clippy::too_many_arguments, clippy::result_large_err)]
pub fn score_bubble_marks_from_grid_layout(
    ballot_image: &BallotImage,
    label: &str,
    bubble_template: &GrayImage,
    timing_marks: &TimingMarks,
    grid_layout: &GridLayout,
    detected_vertical_streaks: &[VerticalStreak],
    sheet_number: u32,
    side: BallotSide,
) -> Result<ScoredBubbleMarks> {
    let scored_bubbles = grid_layout
        .grid_positions
        .par_iter()
        .filter_map(|grid_position| {
            let location = grid_position.location();

            if !(grid_position.sheet_number() == sheet_number && location.side == side) {
                return None;
            }

            let expected_bubble_center = timing_marks
                .point_for_location(location.column as SubGridUnit, location.row as SubGridUnit)?;

            let scored_bubble_mark = score_bubble_mark(
                ballot_image,
                bubble_template,
                expected_bubble_center,
                &location,
                DEFAULT_MAXIMUM_SEARCH_DISTANCE,
            );

            Some((grid_position.clone(), scored_bubble_mark))
        })
        .collect::<Vec<_>>();

    // Check for vertical streaks after collecting
    for (_, scored_bubble_mark) in &scored_bubbles {
        if let Some(scored_bubble_mark) = scored_bubble_mark {
            if detected_vertical_streaks.iter().any(|streak| {
                Rect::new(
                    *streak.x_range.start(),
                    0,
                    (*streak.x_range.end() - *streak.x_range.start() + 1) as u32,
                    ballot_image.height(),
                )
                .intersect(&scored_bubble_mark.matched_bounds)
                .is_some()
            }) {
                return Err(Error::VerticalStreaksDetected {
                    label: label.to_owned(),
                    x_coordinates: detected_vertical_streaks
                        .iter()
                        .flat_map(|streak| streak.x_range.clone())
                        .collect(),
                });
            }
        }
    }

    ballot_image.debug().write("scored_bubble_marks", |canvas| {
        debug::draw_scored_bubble_marks_debug_image_mut(
            canvas,
            &scored_bubbles,
            detected_vertical_streaks,
            timing_marks,
        );
    });

    Ok(scored_bubbles)
}

/// Computes a match score between a region of the source image and a bubble
/// template. Equivalent to `threshold` -> `diff` -> counting white pixels, but
/// without allocating intermediate images.
///
/// # Panics
///
/// Panics if the template-sized region at `(x, y)` extends beyond the image
/// bounds, i.e. if `x + template.width() > img.width()` or
/// `y + template.height() > img.height()`.
fn compute_match_score(
    img: &GrayImage,
    template: &GrayImage,
    x: u32,
    y: u32,
    threshold_val: u8,
) -> UnitIntervalScore {
    let width = template.width();
    let height = template.height();
    let total_pixels = (width * height) as f32;
    let mut matching_pixels = 0u32;
    for py in 0..height {
        for px in 0..width {
            let source_val = img.get_pixel(x + px, y + py).0[0];
            let binarized = if source_val <= threshold_val {
                0u8
            } else {
                255u8
            };
            if binarized <= template.get_pixel(px, py).0[0] {
                matching_pixels += 1;
            }
        }
    }
    UnitIntervalScore(matching_pixels as f32 / total_pixels)
}

/// Scores a bubble mark within a scanned ballot image.
///
/// Compares the source image to the bubble template image at every pixel location
/// within `maximum_search_distance` pixels of `expected_bubble_center` in all
/// directions. This comparison produces a match score in the unit interval for
/// each location. The highest match score is used to determine the bounds of
/// the bubble mark in the source image. The best matching bounds is also where
/// we compute a fill score for the bubble.
///
/// We look for the highest match score in the vicinity of where we expect
/// because the bubble mark may not be exactly where we expect in the scanned
/// image due to stretching or other distortions.
pub fn score_bubble_mark(
    ballot_image: &BallotImage,
    bubble_template: &GrayImage,
    expected_bubble_center: Point<SubPixelUnit>,
    location: &GridLocation,
    maximum_search_distance: PixelUnit,
) -> Option<ScoredBubbleMark> {
    struct Match {
        bounds: Rect,
        score: UnitIntervalScore,
    }

    let center_x = expected_bubble_center.x.round() as PixelPosition;
    let center_y = expected_bubble_center.y.round() as PixelPosition;
    let width = bubble_template.width();
    let height = bubble_template.height();
    let left = center_x - (width / 2) as PixelPosition;
    let top = center_y - (height / 2) as PixelPosition;
    let expected_bounds = Rect::new(left, top, width, height);

    let img = ballot_image.image();
    let img_width = img.width();
    let img_height = img.height();
    let threshold_val = ballot_image.threshold();
    let mut best_match = None;

    for offset_x in
        -(maximum_search_distance as PixelPosition)..(maximum_search_distance as PixelPosition)
    {
        let x = left + offset_x;
        if x < 0 || x as u32 + width > img_width {
            continue;
        }

        for offset_y in
            -(maximum_search_distance as PixelPosition)..(maximum_search_distance as PixelPosition)
        {
            let y = top + offset_y;
            if y < 0 || y as u32 + height > img_height {
                continue;
            }

            let match_score =
                compute_match_score(img, bubble_template, x as u32, y as u32, threshold_val);

            match best_match {
                None => {
                    best_match = Some(Match {
                        bounds: Rect::new(x, y, width, height),
                        score: match_score,
                    });
                }
                Some(ref mut best_match) => {
                    if match_score > best_match.score {
                        best_match.bounds = Rect::new(x, y, width, height);
                        best_match.score = match_score;
                    }
                }
            }
        }
    }

    let best_match = best_match?;
    let source_image = img
        .view(
            best_match.bounds.left() as PixelUnit,
            best_match.bounds.top() as PixelUnit,
            best_match.bounds.width(),
            best_match.bounds.height(),
        )
        .to_image();
    let binarized_source_image = threshold(&source_image, ballot_image.threshold());
    let diff_image = diff(bubble_template, &binarized_source_image);
    let fill_score = UnitIntervalScore(count_pixels(&diff_image, BLACK).ratio());

    Some(ScoredBubbleMark {
        location: *location,
        match_score: best_match.score,
        fill_score,
        expected_bounds,
        matched_bounds: best_match.bounds,
        fill_diff_image: diff_image,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoredPositionArea {
    pub grid_position: GridPosition,
    pub shape: Quadrilateral,
    pub score: UnitIntervalScore,
}

pub type ScoredPositionAreas = Vec<ScoredPositionArea>;

/// Computes scores for all the write-in areas in a scanned ballot image. This could
/// be used to determine which write-in areas are most likely to contain a write-in
/// vote even if the bubble is not filled in.
pub fn score_write_in_areas(
    ballot_image: &BallotImage,
    timing_marks: &TimingMarks,
    grid_layout: &GridLayout,
    sheet_number: u32,
    side: BallotSide,
) -> Vec<ScoredPositionArea> {
    let scored_write_in_areas = grid_layout
        .write_in_positions()
        .filter(|grid_position| {
            let location = grid_position.location();
            grid_position.sheet_number() == sheet_number && location.side == side
        })
        .filter_map(|grid_position| score_write_in_area(ballot_image, timing_marks, grid_position))
        .collect();

    ballot_image
        .debug()
        .write("scored_write_in_areas", |canvas| {
            debug::draw_scored_write_in_areas(canvas, &scored_write_in_areas);
        });

    scored_write_in_areas
}

fn score_write_in_area(
    img: &BallotImage,
    timing_marks: &TimingMarks,
    grid_position: &GridPosition,
) -> Option<ScoredPositionArea> {
    let GridPosition::WriteIn { write_in_area, .. } = *grid_position else {
        return None;
    };

    let top_left_corner = timing_marks.point_for_location(write_in_area.x, write_in_area.y)?;
    let top_right_corner =
        timing_marks.point_for_location(write_in_area.x + write_in_area.width, write_in_area.y)?;
    let bottom_left_corner =
        timing_marks.point_for_location(write_in_area.x, write_in_area.y + write_in_area.height)?;
    let bottom_right_corner = timing_marks.point_for_location(
        write_in_area.x + write_in_area.width,
        write_in_area.y + write_in_area.height,
    )?;
    let shape = Quadrilateral {
        top_left: top_left_corner,
        top_right: top_right_corner,
        bottom_left: bottom_left_corner,
        bottom_right: bottom_right_corner,
    };
    let counted = count_pixels_in_shape(img, &shape);
    let score = UnitIntervalScore(counted.ratio());

    Some(ScoredPositionArea {
        grid_position: grid_position.clone(),
        shape,
        score,
    })
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test {
    use super::*;
    use crate::ballot_card::BallotImage;
    use image::{GenericImageView, GrayImage};
    use proptest::prelude::*;
    use types_rs::ballot_card::BallotSide;
    use types_rs::geometry::Point;

    fn make_ballot_image(width: u32, height: u32) -> BallotImage {
        BallotImage::for_testing(
            GrayImage::from_pixel(width, height, image::Luma([200])),
            128,
        )
    }

    fn make_location() -> GridLocation {
        GridLocation::new(BallotSide::Front, 0.0, 0.0)
    }

    #[test]
    fn score_bubble_mark_returns_none_when_bubble_is_entirely_off_image() {
        let ballot_image = make_ballot_image(100, 100);
        let template = GrayImage::new(20, 20);
        let location = make_location();

        // Center way off the right edge
        let result = score_bubble_mark(
            &ballot_image,
            &template,
            Point { x: 200.0, y: 50.0 },
            &location,
            DEFAULT_MAXIMUM_SEARCH_DISTANCE,
        );
        assert!(result.is_none());

        // Center way off the bottom edge
        let result = score_bubble_mark(
            &ballot_image,
            &template,
            Point { x: 50.0, y: 200.0 },
            &location,
            DEFAULT_MAXIMUM_SEARCH_DISTANCE,
        );
        assert!(result.is_none());
    }

    #[test]
    fn score_bubble_mark_does_not_panic_near_edges() {
        let ballot_image = make_ballot_image(100, 100);
        let template = GrayImage::new(20, 20);
        let location = make_location();

        // Near left edge
        let _ = score_bubble_mark(
            &ballot_image,
            &template,
            Point { x: 5.0, y: 50.0 },
            &location,
            DEFAULT_MAXIMUM_SEARCH_DISTANCE,
        );

        // Near top edge
        let _ = score_bubble_mark(
            &ballot_image,
            &template,
            Point { x: 50.0, y: 5.0 },
            &location,
            DEFAULT_MAXIMUM_SEARCH_DISTANCE,
        );

        // Near right edge
        let _ = score_bubble_mark(
            &ballot_image,
            &template,
            Point { x: 95.0, y: 50.0 },
            &location,
            DEFAULT_MAXIMUM_SEARCH_DISTANCE,
        );

        // Near bottom edge
        let _ = score_bubble_mark(
            &ballot_image,
            &template,
            Point { x: 50.0, y: 95.0 },
            &location,
            DEFAULT_MAXIMUM_SEARCH_DISTANCE,
        );
    }

    /// Computes the match score using the original allocating pipeline
    /// (`threshold` -> `diff` -> `count_pixels`) as a reference implementation.
    fn reference_match_score(
        source: &GrayImage,
        template: &GrayImage,
        threshold_val: u8,
    ) -> UnitIntervalScore {
        use crate::image_utils::{count_pixels, diff, threshold};
        let white = image::Luma([255u8]);
        let binarized = threshold(source, threshold_val);
        let match_diff = diff(&binarized, template);
        UnitIntervalScore(count_pixels(&match_diff, white).ratio())
    }

    proptest! {
        #[test]
        fn score_bubble_mark_never_panics(
            img_w in 10u32..200,
            img_h in 10u32..200,
            tmpl_w in 5u32..30,
            tmpl_h in 5u32..30,
            center_x in -20.0f32..220.0,
            center_y in -20.0f32..220.0,
            search_dist in 0u32..15,
        ) {
            let ballot_image = make_ballot_image(img_w, img_h);
            let template = GrayImage::new(tmpl_w, tmpl_h);
            let location = make_location();

            let _ = score_bubble_mark(
                &ballot_image,
                &template,
                Point { x: center_x, y: center_y },
                &location,
                search_dist,
            );
        }

        #[test]
        fn compute_match_score_agrees_with_reference_pipeline_proptest(
            img_pixels in proptest::collection::vec(proptest::num::u8::ANY, 10_000),
            tmpl_pixels in proptest::collection::vec(
                proptest::strategy::Union::new([
                    proptest::strategy::Just(0u8).boxed(),
                    proptest::strategy::Just(255u8).boxed(),
                ]),
                400,
            ),
            threshold_val in 1u8..254,
            x in 0u32..80,
            y in 0u32..80,
        ) {
            let img = GrayImage::from_raw(100, 100, img_pixels).unwrap();
            let template = GrayImage::from_raw(20, 20, tmpl_pixels).unwrap();

            let actual = compute_match_score(&img, &template, x, y, threshold_val);
            let expected = reference_match_score(
                &img.view(x, y, 20, 20).to_image(),
                &template,
                threshold_val,
            );

            prop_assert!(
                (actual.0 - expected.0).abs() < f32::EPSILON,
                "compute_match_score={} != reference={}", actual.0, expected.0
            );
        }
    }
}
