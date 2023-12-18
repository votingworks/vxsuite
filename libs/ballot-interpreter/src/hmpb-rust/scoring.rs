use std::fmt::{Display, Formatter};

use image::{GenericImageView, GrayImage};
use imageproc::contrast::otsu_level;
use logging_timer::time;
use rayon::prelude::{IntoParallelRefIterator, ParallelIterator};
use serde::Serialize;
use types_rs::election::{GridLayout, GridLocation, GridPosition, UnitIntervalValue};
use types_rs::geometry::{PixelPosition, PixelUnit, Point, Rect, SubGridUnit, SubPixelUnit};

use crate::{
    ballot_card::BallotSide,
    debug::{self, ImageDebugWriter},
    image_utils::{diff, ratio, BLACK, WHITE},
    timing_marks::TimingMarkGrid,
};

#[derive(Clone, Serialize)]
pub struct UnitIntervalScore(pub UnitIntervalValue);

impl Display for UnitIntervalScore {
    fn fmt(&self, f: &mut Formatter) -> std::fmt::Result {
        write!(f, "{:.2}%", self.0 * 100.0)
    }
}

impl core::fmt::Debug for UnitIntervalScore {
    fn fmt(&self, f: &mut Formatter) -> std::fmt::Result {
        write!(f, "{:.2}%", self.0 * 100.0)
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

    /// The cropped source image at `matched_bounds`.
    #[serde(skip_serializing)]
    pub source_image: GrayImage,

    /// The cropped source image at `matched_bounds` with each pixel binarized
    /// to either 0 (black) or 255 (white).
    #[serde(skip_serializing)]
    pub binarized_source_image: GrayImage,

    /// A binarized diff image of `binarized_source_image` with the template.
    /// The more white pixels, the better the match.
    #[serde(skip_serializing)]
    pub match_diff_image: GrayImage,

    /// A binarized diff image of `binarized_source_image` with the fill of the
    /// template. The more black pixels, the better the fill.
    #[serde(skip_serializing)]
    pub fill_diff_image: GrayImage,
}

impl std::fmt::Debug for ScoredBubbleMark {
    fn fmt(&self, f: &mut Formatter) -> std::fmt::Result {
        write!(
            f,
            "ScoredBubbleMark {{ location: {:?}, match_score: {}, fill_score: {}, matched_bounds: {:?} }}",
            self.location, self.match_score, self.fill_score, self.matched_bounds
        )
    }
}

pub const DEFAULT_MAXIMUM_SEARCH_DISTANCE: u32 = 7;

pub type ScoredBubbleMarks = Vec<(GridPosition, Option<ScoredBubbleMark>)>;

#[time]
pub fn score_bubble_marks_from_grid_layout(
    img: &GrayImage,
    bubble_template: &GrayImage,
    timing_mark_grid: &TimingMarkGrid,
    grid_layout: &GridLayout,
    sheet_number: u32,
    side: BallotSide,
    debug: &ImageDebugWriter,
) -> ScoredBubbleMarks {
    let threshold = otsu_level(img);

    let scored_bubbles = &grid_layout
        .grid_positions
        .par_iter()
        .flat_map(|grid_position| {
            let location = grid_position.location();

            if !(grid_position.sheet_number() == sheet_number && location.side == side) {
                return vec![];
            }

            timing_mark_grid
                .point_for_location(location.column as SubGridUnit, location.row as SubGridUnit)
                .map_or_else(
                    || vec![(grid_position.clone(), None)],
                    |expected_bubble_center| {
                        vec![(
                            grid_position.clone(),
                            score_bubble_mark(
                                img,
                                bubble_template,
                                expected_bubble_center,
                                &location,
                                DEFAULT_MAXIMUM_SEARCH_DISTANCE,
                                threshold,
                            ),
                        )]
                    },
                )
        })
        .collect::<ScoredBubbleMarks>();

    debug.write("scored_bubble_marks", |canvas| {
        debug::draw_scored_bubble_marks_debug_image_mut(canvas, scored_bubbles);
    });

    scored_bubbles.clone()
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
    img: &GrayImage,
    bubble_template: &GrayImage,
    expected_bubble_center: Point<SubPixelUnit>,
    location: &GridLocation,
    maximum_search_distance: PixelUnit,
    threshold: u8,
) -> Option<ScoredBubbleMark> {
    let center_x = expected_bubble_center.x.round() as PixelUnit;
    let center_y = expected_bubble_center.y.round() as PixelUnit;
    let left = center_x - bubble_template.width() / 2;
    let top = center_y - bubble_template.height() / 2;
    let width = bubble_template.width();
    let height = bubble_template.height();
    let expected_bounds = Rect::new(left as PixelPosition, top as PixelPosition, width, height);
    let mut best_match_score = UnitIntervalScore(UnitIntervalValue::NEG_INFINITY);
    let mut best_match_bounds: Option<Rect> = None;
    let mut best_match_diff: Option<GrayImage> = None;

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

            let cropped = img
                .view(x as PixelUnit, y as PixelUnit, width, height)
                .to_image();
            let cropped_and_thresholded = imageproc::contrast::threshold(&cropped, threshold);

            let match_diff = diff(&cropped_and_thresholded, bubble_template);
            let match_score = UnitIntervalScore(ratio(&match_diff, WHITE));

            if match_score > best_match_score {
                best_match_score = match_score;
                best_match_bounds = Some(Rect::new(x, y, width, bubble_template.height()));
                best_match_diff = Some(match_diff);
            }
        }
    }

    let best_match_bounds = best_match_bounds?;
    let best_match_diff = best_match_diff?;

    let source_image = img
        .view(
            best_match_bounds.left() as PixelUnit,
            best_match_bounds.top() as PixelUnit,
            best_match_bounds.width(),
            best_match_bounds.height(),
        )
        .to_image();
    let binarized_source_image = imageproc::contrast::threshold(&source_image, threshold);
    let diff_image = diff(bubble_template, &binarized_source_image);
    let fill_score = UnitIntervalScore(ratio(&diff_image, BLACK));

    Some(ScoredBubbleMark {
        location: *location,
        match_score: best_match_score,
        fill_score,
        expected_bounds,
        matched_bounds: best_match_bounds,
        source_image,
        binarized_source_image,
        match_diff_image: best_match_diff,
        fill_diff_image: diff_image,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoredPositionArea {
    pub grid_position: GridPosition,
    pub bounds: Rect,
    pub score: UnitIntervalScore,
}

pub type ScoredPositionAreas = Vec<ScoredPositionArea>;

/// Computes scores for all the write-in areas in a scanned ballot image. This could
/// be used to determine which write-in areas are most likely to contain a write-in
/// vote even if the bubble is not filled in.
pub fn score_write_in_areas(
    img: &GrayImage,
    grid: &TimingMarkGrid,
    grid_layout: &GridLayout,
    sheet_number: u32,
    side: BallotSide,
    debug: &ImageDebugWriter,
) -> Vec<ScoredPositionArea> {
    let threshold = otsu_level(img);

    let scored_write_in_areas = grid_layout
        .write_in_positions()
        .filter(|grid_position| {
            let location = grid_position.location();
            grid_position.sheet_number() == sheet_number && location.side == side
        })
        .filter_map(|grid_position| score_write_in_area(img, grid, grid_position, threshold))
        .collect();

    debug.write("scored_write_in_areas", |canvas| {
        debug::draw_scored_write_in_areas(canvas, &scored_write_in_areas);
    });

    scored_write_in_areas
}

fn score_write_in_area(
    img: &GrayImage,
    grid: &TimingMarkGrid,
    grid_position: &GridPosition,
    threshold: u8,
) -> Option<ScoredPositionArea> {
    let GridPosition::WriteIn { write_in_area, .. } = *grid_position else {
        return None;
    };

    let top_left_corner = grid.point_for_location(write_in_area.x, write_in_area.y)?;
    let bottom_right_corner = grid.point_for_location(
        write_in_area.x + write_in_area.width,
        write_in_area.y + write_in_area.height,
    )?;
    let bounds = Rect::from_points(top_left_corner.round(), bottom_right_corner.round());
    let cropped = img
        .view(
            bounds.left() as PixelUnit,
            bounds.top() as PixelUnit,
            bounds.width(),
            bounds.height(),
        )
        .to_image();
    let cropped_and_thresholded = imageproc::contrast::threshold(&cropped, threshold);
    let score = UnitIntervalScore(ratio(&cropped_and_thresholded, BLACK));

    Some(ScoredPositionArea {
        grid_position: grid_position.clone(),
        bounds,
        score,
    })
}
