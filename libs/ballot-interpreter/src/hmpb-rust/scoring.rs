use std::fmt::{Display, Formatter};
use std::ops::Add;

use image::{GenericImageView, GrayImage};
use serde::Serialize;
use types_rs::election::{GridLocation, GridPosition, UnitIntervalValue};
use types_rs::geometry::{PixelPosition, PixelUnit, Point, Quadrilateral, Rect, SubPixelUnit};

use crate::ballot_card::BallotImage;
use crate::image_utils::{count_pixels, count_pixels_in_shape};
use crate::image_utils::{diff, BLACK, WHITE};
use crate::timing_marks::TimingMarks;

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

#[derive(Debug, Clone, Serialize)]
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

pub const DEFAULT_MAXIMUM_SEARCH_DISTANCE: u32 = 7;

pub type ScoredBubbleMarks = Vec<(GridPosition, Option<ScoredBubbleMark>)>;

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
        diff: GrayImage,
    }

    let center_x = expected_bubble_center.x.round() as PixelUnit;
    let center_y = expected_bubble_center.y.round() as PixelUnit;
    let left = center_x - bubble_template.width() / 2;
    let top = center_y - bubble_template.height() / 2;
    let width = bubble_template.width();
    let height = bubble_template.height();
    let expected_bounds = Rect::new(left as PixelPosition, top as PixelPosition, width, height);
    let mut best_match = None;

    for offset_x in
        -(maximum_search_distance as PixelPosition)..(maximum_search_distance as PixelPosition)
    {
        let x = left as PixelPosition + offset_x;
        if x < 0 {
            continue;
        }

        for offset_y in
            -(maximum_search_distance as PixelPosition)..(maximum_search_distance as PixelPosition)
        {
            let y = top as PixelPosition + offset_y;
            if y < 0 {
                continue;
            }

            let cropped = ballot_image
                .image()
                .view(x as PixelUnit, y as PixelUnit, width, height)
                .to_image();
            let cropped_and_thresholded =
                imageproc::contrast::threshold(&cropped, ballot_image.threshold());

            let match_diff = diff(&cropped_and_thresholded, bubble_template);
            let match_score = UnitIntervalScore(count_pixels(&match_diff, WHITE).ratio());

            match best_match {
                None => {
                    best_match = Some(Match {
                        bounds: Rect::new(x, y, width, height),
                        score: match_score,
                        diff: match_diff,
                    });
                }
                Some(ref mut best_match) => {
                    if match_score > best_match.score {
                        best_match.bounds = Rect::new(x, y, width, height);
                        best_match.score = match_score;
                        best_match.diff = match_diff;
                    }
                }
            }
        }
    }

    let best_match = best_match?;
    let source_image = ballot_image
        .image()
        .view(
            best_match.bounds.left() as PixelUnit,
            best_match.bounds.top() as PixelUnit,
            best_match.bounds.width(),
            best_match.bounds.height(),
        )
        .to_image();
    let binarized_source_image =
        imageproc::contrast::threshold(&source_image, ballot_image.threshold());
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

pub fn score_write_in_area(
    ballot_image: &BallotImage,
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
    let counted = count_pixels_in_shape(ballot_image.image(), &shape, ballot_image.threshold());
    let score = UnitIntervalScore(counted.ratio());

    Some(ScoredPositionArea {
        grid_position: grid_position.clone(),
        shape,
        score,
    })
}
