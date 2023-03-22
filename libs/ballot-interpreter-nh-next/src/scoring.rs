use std::fmt::{Display, Formatter};

use image::{GenericImageView, GrayImage};
use imageproc::contrast::otsu_level;
use logging_timer::time;
use rayon::prelude::{IntoParallelRefIterator, ParallelIterator};
use serde::Serialize;

use crate::{
    ballot_card::BallotSide,
    debug::{self, ImageDebugWriter},
    election::{GridLayout, GridLocation, GridPosition, UnitIntervalValue},
    geometry::{PixelPosition, PixelUnit, Point, Rect, SubPixelUnit},
    image_utils::{diff, ratio, BLACK, WHITE},
    timing_marks::TimingMarkGrid,
};

#[derive(Clone, Serialize)]
pub struct OvalMarkScore(pub UnitIntervalValue);

impl Display for OvalMarkScore {
    fn fmt(&self, f: &mut Formatter) -> std::fmt::Result {
        write!(f, "{:.2}%", self.0 * 100.0)
    }
}

impl core::fmt::Debug for OvalMarkScore {
    fn fmt(&self, f: &mut Formatter) -> std::fmt::Result {
        write!(f, "{:.2}%", self.0 * 100.0)
    }
}

impl PartialEq for OvalMarkScore {
    fn eq(&self, other: &Self) -> bool {
        self.0.eq(&other.0)
    }
}

impl PartialOrd for OvalMarkScore {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        self.0.partial_cmp(&other.0)
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoredOvalMark {
    /// The location of the oval mark in the grid. Uses side/column/row, not
    /// x/y.
    pub location: GridLocation,

    /// The score for the match between the source image and the template. This
    /// is the highest value found when looking around `expected_bounds` for the
    /// oval. 100% is a perfect match.
    pub match_score: OvalMarkScore,

    /// The score for the fill of the oval at `matched_bounds`. 100% is
    /// perfectly filled.
    pub fill_score: OvalMarkScore,

    /// The expected bounds of the oval mark in the scanned source image.
    pub expected_bounds: Rect,

    /// The bounds of the oval mark in the scanned source image that was
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

impl std::fmt::Debug for ScoredOvalMark {
    fn fmt(&self, f: &mut Formatter) -> std::fmt::Result {
        write!(
            f,
            "ScoredOvalMark {{ location: {:?}, match_score: {}, fill_score: {}, matched_bounds: {:?} }}",
            self.location, self.match_score, self.fill_score, self.matched_bounds
        )
    }
}

pub const DEFAULT_MAXIMUM_SEARCH_DISTANCE: u32 = 7;

pub type ScoredOvalMarks = Vec<(GridPosition, Option<ScoredOvalMark>)>;

#[time]
pub fn score_oval_marks_from_grid_layout(
    img: &GrayImage,
    oval_template: &GrayImage,
    timing_mark_grid: &TimingMarkGrid,
    grid_layout: &GridLayout,
    side: BallotSide,
    debug: &ImageDebugWriter,
) -> ScoredOvalMarks {
    let threshold = otsu_level(img);

    let scored_ovals = &grid_layout
        .grid_positions
        .par_iter()
        .flat_map(|grid_position| {
            let location = grid_position.location();

            if location.side != side {
                return vec![];
            }

            timing_mark_grid
                .point_for_location(location.column, location.row)
                .map_or_else(
                    || vec![(grid_position.clone(), None)],
                    |expected_oval_center| {
                        vec![(
                            grid_position.clone(),
                            score_oval_mark(
                                img,
                                oval_template,
                                expected_oval_center,
                                &location,
                                DEFAULT_MAXIMUM_SEARCH_DISTANCE,
                                threshold,
                            ),
                        )]
                    },
                )
        })
        .collect::<ScoredOvalMarks>();

    debug.write("scored_oval_marks", |canvas| {
        debug::draw_scored_oval_marks_debug_image_mut(canvas, scored_ovals);
    });

    scored_ovals.clone()
}

/// Scores an oval mark within a scanned ballot image.
///
/// Compares the source image to the oval template image at every pixel location
/// within `maximum_search_distance` pixels of `expected_oval_center` in all
/// directions. This comparison produces a match score in the unit interval for
/// each location. The highest match score is used to determine the bounds of
/// the oval mark in the source image. The best matching bounds is also where
/// we compute a fill score for the oval.
///
/// We look for the highest match score in the vicinity of where we expect
/// because the oval mark may not be exactly where we expect in the scanned
/// image due to stretching or other distortions.
pub fn score_oval_mark(
    img: &GrayImage,
    oval_template: &GrayImage,
    expected_oval_center: Point<SubPixelUnit>,
    location: &GridLocation,
    maximum_search_distance: PixelUnit,
    threshold: u8,
) -> Option<ScoredOvalMark> {
    let center_x = expected_oval_center.x.round() as PixelUnit;
    let center_y = expected_oval_center.y.round() as PixelUnit;
    let left = center_x - oval_template.width() / 2;
    let top = center_y - oval_template.height() / 2;
    let width = oval_template.width();
    let height = oval_template.height();
    let expected_bounds = Rect::new(left as PixelPosition, top as PixelPosition, width, height);
    let mut best_match_score = OvalMarkScore(UnitIntervalValue::NEG_INFINITY);
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

            let match_diff = diff(&cropped_and_thresholded, oval_template);
            let match_score = OvalMarkScore(ratio(&match_diff, WHITE));

            if match_score > best_match_score {
                best_match_score = match_score;
                best_match_bounds = Some(Rect::new(x, y, width, oval_template.height()));
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
    let diff_image = diff(oval_template, &binarized_source_image);
    let fill_score = OvalMarkScore(ratio(&diff_image, BLACK));

    Some(ScoredOvalMark {
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
