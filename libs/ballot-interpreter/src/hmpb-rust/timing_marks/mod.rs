use std::cmp::Ordering;
use std::time::Duration;
use std::{iter::once, ops::Range};

use image::{imageops::rotate180, GenericImageView, GrayImage};
use imageproc::contours::{find_contours_with_threshold, BorderType, Contour};
use itertools::Itertools;
use serde::Serialize;
use types_rs::geometry::{
    angle_diff, Degrees, GridUnit, PixelPosition, PixelUnit, Point, Radians, Rect, Segment, Size,
    SubGridUnit, SubPixelUnit,
};
use types_rs::{election::UnitIntervalValue, geometry::IntersectionBounds};

use crate::scoring::UnitIntervalScore;
use crate::{
    ballot_card::{BallotImage, Geometry, Orientation},
    debug::{self, draw_timing_mark_debug_image_mut, ImageDebugWriter},
    image_utils::{expand_image, match_template, WHITE},
    interpret::{self, Error},
    qr_code_metadata::BallotPageQrCodeMetadata,
    timing_mark_metadata::BallotPageTimingMarkMetadata,
};

mod fast;
mod slow;

pub enum BestFitSearchResult<'a> {
    Found {
        searched: Vec<Segment>,
        best_fit: BestFit<'a>,
        duration: Duration,
    },
    NotFound {
        searched: Vec<Segment>,
        duration: Duration,
    },
}

impl<'a> BestFitSearchResult<'a> {
    pub fn or_else<F>(self, f: F) -> Self
    where
        F: FnOnce() -> Self,
    {
        match self {
            BestFitSearchResult::Found { .. } => self,
            BestFitSearchResult::NotFound { .. } => f(),
        }
    }

    pub fn found(self) -> Option<BestFit<'a>> {
        match self {
            BestFitSearchResult::Found { best_fit, .. } => Some(best_fit),
            BestFitSearchResult::NotFound { .. } => None,
        }
    }
}

pub struct BestFit<'a> {
    pub segment: Segment,
    pub marks: Vec<&'a CandidateTimingMark>,
}

/// Represents partial timing marks found in a ballot card.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Partial {
    pub geometry: Geometry,
    pub top_left_corner: Point<f32>,
    pub top_right_corner: Point<f32>,
    pub bottom_left_corner: Point<f32>,
    pub bottom_right_corner: Point<f32>,
    pub top_marks: Vec<CandidateTimingMark>,
    pub bottom_marks: Vec<CandidateTimingMark>,
    pub left_marks: Vec<CandidateTimingMark>,
    pub right_marks: Vec<CandidateTimingMark>,
    pub top_left_mark: Option<CandidateTimingMark>,
    pub top_right_mark: Option<CandidateTimingMark>,
    pub bottom_left_mark: Option<CandidateTimingMark>,
    pub bottom_right_mark: Option<CandidateTimingMark>,
}

impl Partial {
    pub fn left_side_rotation(&self) -> Radians {
        let left_angle = Segment::new(self.top_left_corner, self.bottom_left_corner).angle();
        // expected angle is 90 degrees and not 270 degrees because the Y axis
        // is inverted in the image coordinate system
        let expected_angle = Radians::PI / 2.0;
        (left_angle - expected_angle).abs()
    }

    pub fn right_side_rotation(&self) -> Radians {
        let right_angle = Segment::new(self.top_right_corner, self.bottom_right_corner).angle();
        // expected angle is 90 degrees and not 270 degrees because the Y axis
        // is inverted in the image coordinate system
        let expected_angle = Radians::PI / 2.0;
        (right_angle - expected_angle).abs()
    }

    pub fn top_side_rotation(&self) -> Radians {
        let top_angle = Segment::new(self.top_left_corner, self.top_right_corner).angle();
        let expected_angle = Radians::new(0.0);
        (top_angle - expected_angle).abs()
    }

    pub fn bottom_side_rotation(&self) -> Radians {
        let bottom_angle = Segment::new(self.bottom_left_corner, self.bottom_right_corner).angle();
        let expected_angle = Radians::new(0.0);
        (bottom_angle - expected_angle).abs()
    }

    /// Calculates the skew angle at the top left corner, which is the absolute
    /// difference in expected angle at that corner.
    pub fn top_left_corner_skew(&self) -> Radians {
        let top_angle = Segment::new(self.top_left_corner, self.top_right_corner).angle();
        let left_angle = Segment::new(self.top_left_corner, self.bottom_left_corner).angle();
        let expected_angle = Radians::PI / 2.0;
        let diff = angle_diff(top_angle, left_angle);
        angle_diff(diff, expected_angle).abs()
    }

    /// Calculates the skew angle at the top-right corner, which is the absolute
    /// difference in expected angle at that corner.
    pub fn top_right_corner_skew(&self) -> Radians {
        let top_angle = Segment::new(self.top_left_corner, self.top_right_corner).angle();
        let right_angle = Segment::new(self.top_right_corner, self.bottom_right_corner).angle();
        let expected_angle = Radians::PI / 2.0;
        let diff = angle_diff(top_angle, right_angle);
        angle_diff(diff, expected_angle).abs()
    }

    /// Calculates the skew angle at the bottom-left corner, which is the
    /// absolute difference in expected angle at that corner.
    pub fn bottom_left_corner_skew(&self) -> Radians {
        let bottom_angle = Segment::new(self.bottom_left_corner, self.bottom_right_corner).angle();
        let left_angle = Segment::new(self.top_left_corner, self.bottom_left_corner).angle();
        let expected_angle = Radians::PI / 2.0;
        let diff = angle_diff(bottom_angle, left_angle);
        angle_diff(diff, expected_angle).abs()
    }

    /// Calculates the skew angle at the bottom-right corner, which is the
    /// absolute difference in expected angle at that corner.
    pub fn bottom_right_corner_skew(&self) -> Radians {
        let bottom_angle = Segment::new(self.bottom_left_corner, self.bottom_right_corner).angle();
        let right_angle = Segment::new(self.top_right_corner, self.bottom_right_corner).angle();
        let expected_angle = Radians::PI / 2.0;
        let diff = angle_diff(bottom_angle, right_angle);
        angle_diff(diff, expected_angle).abs()
    }

    pub const fn top_line_segment_from_corners(&self) -> Segment {
        Segment::new(self.top_left_corner, self.top_right_corner)
    }

    pub const fn bottom_line_segment_from_corners(&self) -> Segment {
        Segment::new(self.bottom_left_corner, self.bottom_right_corner)
    }

    pub const fn left_line_segment_from_corners(&self) -> Segment {
        Segment::new(self.top_left_corner, self.bottom_left_corner)
    }

    pub const fn right_line_segment_from_corners(&self) -> Segment {
        Segment::new(self.top_right_corner, self.bottom_right_corner)
    }
}

impl From<Complete> for Partial {
    fn from(complete_timing_marks: Complete) -> Self {
        Self {
            geometry: complete_timing_marks.geometry,
            top_left_corner: complete_timing_marks.top_left_corner,
            top_right_corner: complete_timing_marks.top_right_corner,
            bottom_left_corner: complete_timing_marks.bottom_left_corner,
            bottom_right_corner: complete_timing_marks.bottom_right_corner,
            top_marks: complete_timing_marks.top_marks,
            bottom_marks: complete_timing_marks.bottom_marks,
            left_marks: complete_timing_marks.left_marks,
            right_marks: complete_timing_marks.right_marks,
            top_left_mark: Some(complete_timing_marks.top_left_mark),
            top_right_mark: Some(complete_timing_marks.top_right_mark),
            bottom_left_mark: Some(complete_timing_marks.bottom_left_mark),
            bottom_right_mark: Some(complete_timing_marks.bottom_right_mark),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Complete {
    pub geometry: Geometry,
    pub top_left_corner: Point<f32>,
    pub top_right_corner: Point<f32>,
    pub bottom_left_corner: Point<f32>,
    pub bottom_right_corner: Point<f32>,
    pub top_marks: Vec<CandidateTimingMark>,
    pub bottom_marks: Vec<CandidateTimingMark>,
    pub left_marks: Vec<CandidateTimingMark>,
    pub right_marks: Vec<CandidateTimingMark>,
    pub top_left_mark: CandidateTimingMark,
    pub top_right_mark: CandidateTimingMark,
    pub bottom_left_mark: CandidateTimingMark,
    pub bottom_right_mark: CandidateTimingMark,
}

impl Complete {
    fn rotate(self, image_size: Size<u32>) -> Self {
        let Self {
            geometry,
            top_left_corner,
            top_right_corner,
            bottom_left_corner,
            bottom_right_corner,
            top_left_mark,
            top_right_mark,
            bottom_left_mark,
            bottom_right_mark,
            top_marks,
            bottom_marks,
            left_marks,
            right_marks,
        } = self;

        let rotator = Rotator180::new(image_size);

        let (top_left_corner, top_right_corner, bottom_left_corner, bottom_right_corner) = (
            rotator.rotate_point_around_subpixel_position(bottom_right_corner),
            rotator.rotate_point_around_subpixel_position(bottom_left_corner),
            rotator.rotate_point_around_subpixel_position(top_right_corner),
            rotator.rotate_point_around_subpixel_position(top_left_corner),
        );

        let (top_left_mark, top_right_mark, bottom_left_mark, bottom_right_mark) = (
            rotator.rotate_candidate_timing_mark(&bottom_right_mark),
            rotator.rotate_candidate_timing_mark(&bottom_left_mark),
            rotator.rotate_candidate_timing_mark(&top_right_mark),
            rotator.rotate_candidate_timing_mark(&top_left_mark),
        );

        let mut rotated_top_marks: Vec<CandidateTimingMark> = top_marks
            .iter()
            .map(|m| rotator.rotate_candidate_timing_mark(m))
            .collect();
        let mut rotated_bottom_marks: Vec<CandidateTimingMark> = bottom_marks
            .iter()
            .map(|m| rotator.rotate_candidate_timing_mark(m))
            .collect();
        let mut rotated_left_marks: Vec<CandidateTimingMark> = left_marks
            .iter()
            .map(|m| rotator.rotate_candidate_timing_mark(m))
            .collect();
        let mut rotated_right_marks: Vec<CandidateTimingMark> = right_marks
            .iter()
            .map(|m| rotator.rotate_candidate_timing_mark(m))
            .collect();

        rotated_bottom_marks.sort_by_key(|m| m.rect().left());
        rotated_top_marks.sort_by_key(|m| m.rect().left());
        rotated_left_marks.sort_by_key(|m| m.rect().top());
        rotated_right_marks.sort_by_key(|m| m.rect().top());

        Self {
            geometry,
            top_left_corner,
            top_right_corner,
            bottom_left_corner,
            bottom_right_corner,
            top_left_mark,
            top_right_mark,
            bottom_left_mark,
            bottom_right_mark,
            top_marks: rotated_bottom_marks,
            bottom_marks: rotated_top_marks,
            left_marks: rotated_right_marks,
            right_marks: rotated_left_marks,
        }
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "source", rename_all = "kebab-case")]
pub enum BallotPageMetadata {
    TimingMarks(BallotPageTimingMarkMetadata),
    QrCode(BallotPageQrCodeMetadata),
}

/// Represents a grid of timing marks and provides access to the expected
/// location of bubbles in the grid.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimingMarkGrid {
    /// The geometry of the ballot card.
    pub geometry: Geometry,

    /// Timing marks found by examining the image.
    pub partial_timing_marks: Partial,

    /// Timing marks inferred from the partial timing marks.
    pub complete_timing_marks: Complete,

    /// Areas of the ballot card that contain shapes that may be timing marks.
    pub candidate_timing_marks: Vec<CandidateTimingMark>,
}

impl TimingMarkGrid {
    pub const fn new(
        geometry: Geometry,
        partial_timing_marks: Partial,
        complete_timing_marks: Complete,
        candidate_timing_marks: Vec<CandidateTimingMark>,
    ) -> Self {
        Self {
            geometry,
            partial_timing_marks,
            complete_timing_marks,
            candidate_timing_marks,
        }
    }

    /// Returns the center of the grid position at the given coordinates. Timing
    /// marks are at the edges of the grid, and the inside of the grid is where
    /// the bubbles are. The grid coordinates may be fractional.
    ///
    /// For example, if the grid is 34x51, then:
    ///
    ///   - (0, 0) is the top left corner of the grid
    ///   - (33, 0) is the top right corner of the grid
    ///   - (0, 50) is the bottom left corner of the grid
    ///   - (33, 50) is the bottom right corner of the grid
    ///   - (c, r) where 0 < c < 33 and 0 < r < 50 is the bubble at column c and
    ///     row r
    ///
    /// The point location is determined by:
    /// 1. Finding the left and right timing marks for the given row (if given a
    ///    fractional row index, then interpolating vertically between the closest
    ///    two rows).
    /// 2. Correcting the left/right timing mark position to account for
    ///    the marks being cropped during scanning or border removal
    /// 3. Interpolating horizontally between the left/right timing mark
    ///    positions based on the given column index.
    pub fn point_for_location(
        &self,
        column: SubGridUnit,
        row: SubGridUnit,
    ) -> Option<Point<SubPixelUnit>> {
        if column >= self.geometry.grid_size.width as SubGridUnit
            || row >= self.geometry.grid_size.height as SubGridUnit
        {
            return None;
        }

        // Find the left and right timing marks for the given row, interpolating
        // vertically if given a fractional row index
        let row_before = row.floor() as GridUnit;
        let row_after = row.ceil() as GridUnit;
        let distance_percentage_between_rows = row - row_before as f32;
        let left_before = self
            .complete_timing_marks
            .left_marks
            .get(row_before as usize)?;
        let right_before = self
            .complete_timing_marks
            .right_marks
            .get(row_before as usize)?;
        let left_after = self
            .complete_timing_marks
            .left_marks
            .get(row_after as usize)?;
        let right_after = self
            .complete_timing_marks
            .right_marks
            .get(row_after as usize)?;
        let left = Rect::new(
            left_before.rect().left(),
            left_before.rect().top()
                + (distance_percentage_between_rows
                    * ((left_after.rect().top() - left_before.rect().top()) as SubPixelUnit))
                    as PixelPosition,
            left_before.rect().width(),
            left_before.rect().height(),
        );
        let right = Rect::new(
            right_before.rect().left(),
            right_before.rect().top()
                + (distance_percentage_between_rows
                    * ((right_after.rect().top() - right_before.rect().top()) as SubPixelUnit))
                    as PixelPosition,
            right_before.rect().width(),
            right_before.rect().height(),
        );

        // account for marks being cropped during scanning or border removal
        let timing_mark_width = self.geometry.timing_mark_size.width.round() as PixelUnit;
        let corrected_left = Rect::new(
            left.right() - timing_mark_width as PixelPosition,
            left.top(),
            timing_mark_width,
            left.height(),
        );
        let corrected_right =
            Rect::new(right.left(), right.top(), timing_mark_width, right.height());

        let horizontal_segment = Segment::new(corrected_left.center(), corrected_right.center());
        let distance_percentage = column / (self.geometry.grid_size.width - 1) as f32;
        let Segment {
            start: _,
            end: expected_timing_mark_center,
        } = horizontal_segment.with_length(horizontal_segment.length() * distance_percentage);
        Some(expected_timing_mark_center)
    }
}

#[derive(Debug)]
pub struct FindTimingMarkGridOptions<'a> {
    pub allowed_timing_mark_inset_percentage_of_width: UnitIntervalValue,
    pub debug: &'a mut ImageDebugWriter,
}

/// Finds the timing marks in the given image and computes the grid of timing
/// marks, i.e. the locations of all the possible bubbles.
pub fn find_timing_mark_grid(
    geometry: &Geometry,
    ballot_image: &BallotImage,
    options: FindTimingMarkGridOptions,
) -> Result<TimingMarkGrid, Error> {
    let debug = options.debug;
    // Find shapes that look like timing marks but may not be.
    let candidate_timing_marks = find_timing_mark_shapes(geometry, ballot_image, debug);

    // Find timing marks along the border of the image from the candidate
    // shapes. This step may not find all the timing marks, but it should find
    // enough to determine the borders and orientation of the ballot card.
    let Some(partial_timing_marks) =
        find_partial_timing_marks_from_candidates(geometry, &candidate_timing_marks, debug)
    else {
        return Err(Error::MissingTimingMarks {
            candidates: candidate_timing_marks,
            reason: "No partial timing marks found".to_owned(),
        });
    };

    let complete_timing_marks = match find_complete_from_partial(
        ballot_image,
        geometry,
        &partial_timing_marks,
        &FindCompleteTimingMarksFromPartialTimingMarksOptions {
            allowed_timing_mark_inset_percentage_of_width: options
                .allowed_timing_mark_inset_percentage_of_width,
            debug,
        },
    ) {
        Ok(complete_timing_marks) => complete_timing_marks,
        Err(find_complete_timing_marks_error) => {
            return Err(Error::MissingTimingMarks {
                candidates: candidate_timing_marks,
                reason: find_complete_timing_marks_error.to_string(),
            });
        }
    };

    let timing_mark_grid = TimingMarkGrid::new(
        *geometry,
        partial_timing_marks,
        complete_timing_marks,
        candidate_timing_marks,
    );

    debug.write("timing_mark_grid", |canvas| {
        debug::draw_timing_mark_grid_debug_image_mut(canvas, &timing_mark_grid, geometry);
    });

    Ok(timing_mark_grid)
}

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
    geometry: &Geometry,
) -> TimingMarkScore {
    let image = &ballot_image.image;
    let threshold = ballot_image.threshold;
    let image_rect = Rect::new(0, 0, image.width(), image.height());
    let expected_width = geometry.timing_mark_size.width as PixelUnit;
    let expected_height = geometry.timing_mark_size.height as PixelUnit;
    let expected_timing_mark_rect = Rect::new(
        timing_mark.left(),
        timing_mark.top(),
        expected_width,
        expected_height,
    );
    let search_rect = Rect::new(
        (timing_mark.center().x - expected_width as f32 / 2.0 - expected_height as f32) as i32,
        (timing_mark.center().y - 1.5 * expected_height as f32) as i32,
        expected_width + 2 * expected_height,
        3 * expected_height,
    );
    let mut mark_pixel_match_count = 0;
    let mut padding_pixel_match_count = 0;

    for y in search_rect.top()..search_rect.bottom() {
        for x in search_rect.left()..search_rect.right() {
            let point = Point::new(x, y);
            if image_rect.contains(point) {
                let luma = image.get_pixel(x as u32, y as u32);
                let expects_mark_pixel = expected_timing_mark_rect.contains(point);
                let is_black_pixel = luma.0[0] <= threshold;

                if expects_mark_pixel == is_black_pixel {
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

/// Filters the bottom timing marks by using the candidate timing mark scores to
/// determine whether timing marks are actually present.
pub fn find_actual_bottom_marks(
    complete_timing_marks: &Complete,
) -> Vec<Option<CandidateTimingMark>> {
    // allow marks at the exterior (i.e. corners) to be substantially cropped
    const MIN_REQUIRED_EXTERIOR_MARK_SCORE: UnitIntervalScore = UnitIntervalScore(0.33);
    const MIN_REQUIRED_EXTERIOR_PADDING_SCORE: UnitIntervalScore = UnitIntervalScore(0.5);

    // interior marks could be cropped too, but less dramatically
    const MIN_REQUIRED_INTERIOR_MARK_SCORE: UnitIntervalScore = UnitIntervalScore(0.7);
    const MIN_REQUIRED_INTERIOR_PADDING_SCORE: UnitIntervalScore = UnitIntervalScore(0.7);

    complete_timing_marks
        .bottom_marks
        .iter()
        .enumerate()
        .map(|(i, mark)| {
            let (min_mark_score, min_padding_score) =
                if i == 0 || i == complete_timing_marks.bottom_marks.len() - 1 {
                    (
                        MIN_REQUIRED_EXTERIOR_MARK_SCORE,
                        MIN_REQUIRED_EXTERIOR_PADDING_SCORE,
                    )
                } else {
                    (
                        MIN_REQUIRED_INTERIOR_MARK_SCORE,
                        MIN_REQUIRED_INTERIOR_PADDING_SCORE,
                    )
                };

            if mark.scores().mark_score() >= min_mark_score
                && mark.scores().padding_score() >= min_padding_score
            {
                Some(*mark)
            } else {
                None
            }
        })
        .collect()
}

/// Returns the bounding rectangle of the given contour such that the rectangle
/// is the smallest rectangle that contains all of the points in the contour.
fn get_contour_bounding_rect(contour: &Contour<u32>) -> Rect {
    let min_x = contour.points.iter().map(|p| p.x).min().unwrap_or(0);
    let max_x = contour.points.iter().map(|p| p.x).max().unwrap_or(0);
    let min_y = contour.points.iter().map(|p| p.y).min().unwrap_or(0);
    let max_y = contour.points.iter().map(|p| p.y).max().unwrap_or(0);
    Rect::new(
        min_x as PixelPosition,
        min_y as PixelPosition,
        max_x - min_x + 1,
        max_y - min_y + 1,
    )
}

const BORDER_SIZE: u8 = 1;

/// Looks for possible timing mark shapes in the image without trying to
/// determine if they are actually timing marks.
pub fn find_timing_mark_shapes(
    geometry: &Geometry,
    ballot_image: &BallotImage,
    debug: &ImageDebugWriter,
) -> Vec<CandidateTimingMark> {
    // `find_contours_with_threshold` does not consider timing marks on the edge
    // of the image to be contours, so we expand the image and add whitespace
    // around the edges to ensure no timing marks are on the edge of the image
    let Ok(img) = expand_image(&ballot_image.image, BORDER_SIZE.into(), WHITE) else {
        return vec![];
    };

    let contours = find_contours_with_threshold(&img, ballot_image.threshold);

    debug.write("contours", |canvas| {
        debug::draw_contours_debug_image_mut(
            canvas,
            &contours
                .iter()
                .map(get_contour_bounding_rect)
                .collect::<Vec<_>>(),
        );
    });

    let candidate_timing_marks = contours
        .iter()
        .filter_map(|contour| {
            if contour.border_type == BorderType::Hole {
                let contour_bounds = get_contour_bounding_rect(contour).offset(
                    -PixelPosition::from(BORDER_SIZE),
                    -PixelPosition::from(BORDER_SIZE),
                );
                if rect_could_be_timing_mark(geometry, &contour_bounds) {
                    return Some(CandidateTimingMark::new(
                        contour_bounds,
                        score_timing_mark_geometry_match(ballot_image, &contour_bounds, geometry),
                    ));
                }
            }
            None
        })
        .collect_vec();

    debug.write("candidate_timing_marks", |canvas| {
        debug::draw_candidate_timing_marks_debug_image_mut(
            canvas,
            &candidate_timing_marks,
            MIN_REQUIRED_CORNER_MARK_SCORE,
            MIN_REQUIRED_CORNER_PADDING_SCORE,
        );
    });

    candidate_timing_marks
}

const MAX_BEST_FIT_LINE_ERROR: Degrees = Degrees::new(5.0);
const HORIZONTAL_ANGLE: Degrees = Degrees::new(0.0);
const VERTICAL_ANGLE: Degrees = Degrees::new(90.0);
const TIMING_MARK_SIZE_COMPARISON_ERROR_TOLERANCE: f32 = 4.0;

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
pub struct TimingMarkScore {
    mark_score: UnitIntervalScore,
    padding_score: UnitIntervalScore,
}

impl TimingMarkScore {
    pub const fn mark_score(self) -> UnitIntervalScore {
        self.mark_score
    }

    pub const fn padding_score(self) -> UnitIntervalScore {
        self.padding_score
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
pub struct CandidateTimingMark {
    rect: Rect,
    scores: TimingMarkScore,
}

impl CandidateTimingMark {
    pub const fn new(rect: Rect, scores: TimingMarkScore) -> Self {
        Self { rect, scores }
    }

    pub const fn scores(&self) -> TimingMarkScore {
        self.scores
    }

    pub const fn rect(&self) -> &Rect {
        &self.rect
    }
}

/// Finds timing marks along the border of the image based on the rectangles
/// found by some other method. This algorithm focuses on finding timing marks
/// that intersect a line approximately aligned with the edges of the image,
/// i.e. along the borders.
#[allow(clippy::too_many_lines)]
pub fn find_partial_timing_marks_from_candidates(
    geometry: &Geometry,
    candidates: &[CandidateTimingMark],
    debug: &ImageDebugWriter,
) -> Option<Partial> {
    let half_height = (geometry.canvas_size.height / 2) as PixelPosition;
    let half_width = (geometry.canvas_size.width / 2) as PixelPosition;
    let top_half_candidates = candidates
        .iter()
        .filter(|m| m.rect().top() < half_height)
        .copied()
        .collect_vec();
    let bottom_half_candidates = candidates
        .iter()
        .filter(|m| m.rect().top() >= half_height)
        .copied()
        .collect_vec();
    let left_half_candidates = candidates
        .iter()
        .filter(|m| m.rect().left() < half_width)
        .copied()
        .collect_vec();
    let right_half_candidates = candidates
        .iter()
        .filter(|m| m.rect().left() >= half_width)
        .copied()
        .collect_vec();

    let mut top = fast::find_top_timing_marks(geometry, &top_half_candidates, debug)
        .or_else(|| slow::find_top_timing_marks(&top_half_candidates))
        .found()?;
    let mut bottom = fast::find_bottom_timing_marks(geometry, &bottom_half_candidates, debug)
        .or_else(|| slow::find_bottom_timing_marks(&bottom_half_candidates))
        .found()?;
    let mut left = fast::find_left_timing_marks(geometry, &left_half_candidates, debug)
        .or_else(|| slow::find_left_timing_marks(geometry, &left_half_candidates))
        .found()?;
    let mut right = fast::find_right_timing_marks(geometry, &right_half_candidates, debug)
        .or_else(|| slow::find_right_timing_marks(geometry, &right_half_candidates))
        .found()?;

    top.marks.sort_by_key(|c| c.rect().left());
    bottom.marks.sort_by_key(|c| c.rect().left());
    left.marks.sort_by_key(|c| c.rect().top());
    right.marks.sort_by_key(|c| c.rect().top());

    debug.write("timing_mark_best_fit_set_and_segments", |canvas| {
        debug::draw_best_fit_timing_mark_borders_mut(
            canvas,
            (
                top.segment,
                &top.marks.clone().into_iter().copied().collect_vec(),
            ),
            (
                bottom.segment,
                &bottom.marks.clone().into_iter().copied().collect_vec(),
            ),
            (
                left.segment,
                &left.marks.clone().into_iter().copied().collect_vec(),
            ),
            (
                right.segment,
                &right.marks.clone().into_iter().copied().collect_vec(),
            ),
        );
    });

    // Filter rects that are outliers in terms of their size.  Note that we do
    // not include the corners in this filtering when processing the top and
    // bottom lines because the corners might be somewhat cropped when any image
    // rotation is present, making them appear smaller than the other timing
    // marks. We do include the corners when processing the left and right lines
    // because the corners are not cropped more than the others when the image
    // is rotated.

    let leftmost_top_rect = top.marks.first().copied();
    let rightmost_top_rect = top.marks.last().copied();
    let top_line_inner_count = top.marks.len() - 2;
    let top_line_inner = top
        .marks
        .into_iter()
        .skip(1)
        .take(top_line_inner_count)
        .collect_vec();

    let leftmost_bottom_rect = bottom.marks.first().copied();
    let rightmost_bottom_rect = bottom.marks.last().copied();
    let bottom_line_inner_count = bottom.marks.len() - 2;
    let bottom_line_inner = bottom
        .marks
        .into_iter()
        .skip(1)
        .take(bottom_line_inner_count)
        .collect_vec();

    let top_line_filtered = filter_size_outlier_marks(
        &top_line_inner.into_iter().copied().collect_vec(),
        TIMING_MARK_SIZE_COMPARISON_ERROR_TOLERANCE,
    );
    let bottom_line_filtered = filter_size_outlier_marks(
        &bottom_line_inner.into_iter().copied().collect_vec(),
        TIMING_MARK_SIZE_COMPARISON_ERROR_TOLERANCE,
    );
    let left_line_filtered = filter_size_outlier_marks(
        &left.marks.into_iter().copied().collect_vec(),
        TIMING_MARK_SIZE_COMPARISON_ERROR_TOLERANCE,
    );
    let right_line_filtered = filter_size_outlier_marks(
        &right.marks.into_iter().copied().collect_vec(),
        TIMING_MARK_SIZE_COMPARISON_ERROR_TOLERANCE,
    );

    if !debug.is_disabled()
        && (!top_line_filtered.removed_marks.is_empty()
            || !bottom_line_filtered.removed_marks.is_empty()
            || !left_line_filtered.removed_marks.is_empty()
            || !right_line_filtered.removed_marks.is_empty())
    {
        debug.write("filtered_timing_marks", |canvas| {
            debug::draw_filtered_timing_marks_debug_image_mut(
                canvas,
                &top_line_filtered,
                &bottom_line_filtered,
                &left_line_filtered,
                &right_line_filtered,
            );
        });
    }

    // Add the corners back to the filtered top/bottom lines. See above for why
    // we do not filter the corners.

    let top_line = once(leftmost_top_rect.copied())
        .chain(top_line_filtered.marks.into_iter().map(Some))
        .chain(once(rightmost_top_rect.copied()))
        .flatten()
        .collect_vec();

    let bottom_line = once(leftmost_bottom_rect.copied())
        .chain(bottom_line_filtered.marks.into_iter().map(Some))
        .chain(once(rightmost_bottom_rect.copied()))
        .flatten()
        .collect_vec();

    let left_line = left_line_filtered.marks;
    let right_line = right_line_filtered.marks;

    let top_start_rect_center = top_line.first()?.rect().center();
    let top_last_rect_center = top_line.last()?.rect().center();

    let bottom_start_rect_center = bottom_line.first()?.rect().center();
    let bottom_last_rect_center = bottom_line.last()?.rect().center();

    let left_start_rect_center = left_line.first()?.rect().center();
    let left_last_rect_center = left_line.last()?.rect().center();

    let right_start_rect_center = right_line.first()?.rect().center();
    let right_last_rect_center = right_line.last()?.rect().center();

    let top_left_corner = if top_line.first() == left_line.first() {
        top_line.first()
    } else {
        None
    };
    let top_right_corner = if top_line.last() == right_line.first() {
        top_line.last()
    } else {
        None
    };
    let bottom_left_corner = if bottom_line.first() == left_line.last() {
        bottom_line.first()
    } else {
        None
    };
    let bottom_right_corner = if bottom_line.last() == right_line.last() {
        bottom_line.last()
    } else {
        None
    };

    let top_left_intersection = Segment::new(top_start_rect_center, top_last_rect_center)
        .intersection_point(
            &Segment::new(left_start_rect_center, left_last_rect_center),
            IntersectionBounds::Unbounded,
        )?;

    let top_right_intersection = Segment::new(top_start_rect_center, top_last_rect_center)
        .intersection_point(
            &Segment::new(right_start_rect_center, right_last_rect_center),
            IntersectionBounds::Unbounded,
        )?;

    let bottom_left_intersection = Segment::new(bottom_start_rect_center, bottom_last_rect_center)
        .intersection_point(
            &Segment::new(left_start_rect_center, left_last_rect_center),
            IntersectionBounds::Unbounded,
        )?;

    let bottom_right_intersection = Segment::new(bottom_start_rect_center, bottom_last_rect_center)
        .intersection_point(
            &Segment::new(right_start_rect_center, right_last_rect_center),
            IntersectionBounds::Unbounded,
        )?;

    let partial_timing_marks = Partial {
        geometry: *geometry,
        top_left_corner: top_left_intersection,
        top_right_corner: top_right_intersection,
        bottom_left_corner: bottom_left_intersection,
        bottom_right_corner: bottom_right_intersection,
        top_left_mark: top_left_corner.copied(),
        top_right_mark: top_right_corner.copied(),
        bottom_left_mark: bottom_left_corner.copied(),
        bottom_right_mark: bottom_right_corner.copied(),
        top_marks: top_line,
        bottom_marks: bottom_line,
        left_marks: left_line,
        right_marks: right_line,
    };

    debug.write("partial_timing_marks", |canvas| {
        debug::draw_timing_mark_debug_image_mut(canvas, geometry, &partial_timing_marks);
    });

    Some(partial_timing_marks)
}

fn mean(values: &[u32]) -> f32 {
    values.iter().sum::<u32>() as f32 / values.len() as f32
}

fn standard_deviation(values: &[u32]) -> f32 {
    let m = mean(values);
    let variance =
        values.iter().map(|v| (*v as f32 - m).powi(2)).sum::<f32>() / values.len() as f32;
    variance.sqrt()
}

#[derive(Debug, PartialEq)]
pub struct FilteredMarks {
    pub marks: Vec<CandidateTimingMark>,
    pub removed_marks: Vec<CandidateTimingMark>,
    pub mean_width: f32,
    pub mean_height: f32,
    pub stddev_width: f32,
    pub stddev_height: f32,
    pub stddev_threshold: f32,
    pub width_range: Range<u32>,
    pub height_range: Range<u32>,
}

/// Filters rectangles that are outliers in terms of their size, according to
/// the given standard deviation threshold.
fn filter_size_outlier_marks(
    marks: &[CandidateTimingMark],
    stddev_threshold: f32,
) -> FilteredMarks {
    let widths = marks.iter().map(|m| m.rect().width()).collect::<Vec<_>>();
    let heights = marks.iter().map(|m| m.rect().height()).collect::<Vec<_>>();
    let mean_width = mean(&widths);
    let mean_height = mean(&heights);
    let stddev_width = standard_deviation(&widths);
    let stddev_height = standard_deviation(&heights);
    let lower_bound_width = stddev_threshold.mul_add(-stddev_width, mean_width).floor() as u32;
    let upper_bound_width = stddev_threshold.mul_add(stddev_width, mean_width).ceil() as u32;
    let lower_bound_height = stddev_threshold
        .mul_add(-stddev_height, mean_height)
        .floor() as u32;
    let upper_bound_height = stddev_threshold.mul_add(stddev_height, mean_height).ceil() as u32;

    let (rects, removed_rects): (Vec<_>, Vec<_>) = marks.iter().partition(|m| {
        let width = m.rect().width();
        let height = m.rect().height();
        width >= lower_bound_width
            && width <= upper_bound_width
            && height >= lower_bound_height
            && height <= upper_bound_height
    });

    FilteredMarks {
        marks: rects,
        removed_marks: removed_rects,
        mean_width,
        mean_height,
        stddev_width,
        stddev_height,
        stddev_threshold,
        width_range: lower_bound_width..upper_bound_width,
        height_range: lower_bound_height..upper_bound_height,
    }
}

struct Rotator180 {
    canvas_area: Rect,
}

impl Rotator180 {
    pub const fn new(canvas_size: Size<u32>) -> Self {
        Self {
            canvas_area: Rect::new(0, 0, canvas_size.width, canvas_size.height),
        }
    }

    pub const fn rotate_candidate_timing_mark(
        &self,
        mark: &CandidateTimingMark,
    ) -> CandidateTimingMark {
        CandidateTimingMark::new(self.rotate_rect(mark.rect()), mark.scores())
    }

    pub const fn rotate_rect(&self, rect: &Rect) -> Rect {
        Rect::from_points(
            self.rotate_point_around_pixel_position(rect.bottom_right()),
            self.rotate_point_around_pixel_position(rect.top_left()),
        )
    }

    pub const fn rotate_point_around_pixel_position(
        &self,
        point: Point<PixelPosition>,
    ) -> Point<PixelPosition> {
        Point::new(
            self.canvas_area.width() as PixelPosition - 1 - point.x,
            self.canvas_area.height() as PixelPosition - 1 - point.y,
        )
    }

    pub fn rotate_point_around_subpixel_position(&self, point: Point<f32>) -> Point<f32> {
        Point::new(
            (self.canvas_area.width() as PixelPosition - 1) as SubPixelUnit - point.x,
            (self.canvas_area.height() as PixelPosition - 1) as SubPixelUnit - point.y,
        )
    }
}

#[derive(Debug, thiserror::Error)]
pub enum FindCompleteTimingMarksError {
    /// The number of timing marks on the left or right side is too few.
    #[error("The number of timing marks on the left or right side is too few ({left_side_count} left, {right_side_count} right)")]
    TooFewVerticalTimingMarks {
        left_side_count: usize,
        right_side_count: usize,
    },

    /// The number of timing marks on the top or bottom side is too few.
    #[error("The number of timing marks on the top or bottom side is too few ({top_side_count} top, {bottom_side_count} bottom)")]
    TooFewHorizontalTimingMarks {
        top_side_count: usize,
        bottom_side_count: usize,
    },

    /// The number of inferred timing marks on a side does not match its opposite side.
    #[error("The number of inferred timing marks on a side does not match its opposite side ({left_side_count} left, {right_side_count} right, {top_side_count} top, {bottom_side_count} bottom)")]
    MismatchedInferredTimingMarks {
        left_side_count: usize,
        right_side_count: usize,
        top_side_count: usize,
        bottom_side_count: usize,
    },

    /// One or more of the corners of the ballot card could not be found.
    #[error(
        "One or more of the corners of the ballot card could not be found: {missing_corners:?}"
    )]
    MissingCorners { missing_corners: Vec<Corner> },

    /// One of the timing mark border sides is invalid.
    #[error("Invalid timing mark side: {side_marks:?}")]
    InvalidTimingMarkSide { side_marks: SideMarks },

    /// At least one ballot edge is too rotated to be confident in the timing
    /// marks.
    #[error("Unusually high rotation detected: top={top_rotation}, bottom={bottom_rotation}, left={left_rotation}, right={right_rotation}")]
    HighRotation {
        top_rotation: Degrees,
        bottom_rotation: Degrees,
        left_rotation: Degrees,
        right_rotation: Degrees,
    },

    /// One or more of the corner angles is too skewed to be confident in the
    /// timing marks.
    #[error("Unusually high skew detected: top-left={top_left_skew}, top-right={top_right_skew}, bottom-left={bottom_left_skew}, bottom-right={bottom_right_skew}")]
    HighSkew {
        top_left_skew: Degrees,
        top_right_skew: Degrees,
        bottom_left_skew: Degrees,
        bottom_right_skew: Degrees,
    },

    /// At least one pair of timing marks is too far apart to be confident in
    /// the timing marks.
    #[error("Timing marks are too far apart, likely due to stretching: border={border:?}, index={index} distance={distance}px",
       distance = timing_mark_center.distance_to(next_timing_mark_center)
    )]
    HighStretch {
        border: Border,
        index: usize,
        timing_mark_center: Point<f32>,
        next_timing_mark_center: Point<f32>,
    },
}

#[derive(Debug)]
pub enum SideMarks {
    #[allow(dead_code)]
    Left {
        top_left_corner: Point<f32>,
        bottom_left_corner: Point<f32>,
        marks: Vec<CandidateTimingMark>,
    },
    #[allow(dead_code)]
    Right {
        top_right_corner: Point<f32>,
        bottom_right_corner: Point<f32>,
        marks: Vec<CandidateTimingMark>,
    },
    #[allow(dead_code)]
    Top {
        top_left_corner: Point<f32>,
        top_right_corner: Point<f32>,
        marks: Vec<CandidateTimingMark>,
    },
    #[allow(dead_code)]
    Bottom {
        bottom_left_corner: Point<f32>,
        bottom_right_corner: Point<f32>,
        marks: Vec<CandidateTimingMark>,
    },
}

#[derive(Debug, Clone, Copy)]
pub enum Corner {
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Border {
    Left,
    Right,
    Top,
    Bottom,
}

pub type FindCompleteTimingMarksResult = Result<Complete, FindCompleteTimingMarksError>;

pub const ALLOWED_TIMING_MARK_INSET_PERCENTAGE_OF_WIDTH: UnitIntervalValue = 0.1;

/// How far can any of the edges be rotated from the expected angle before we
/// reject the ballot.
pub const MAXIMUM_ALLOWED_BALLOT_ROTATION: Degrees = Degrees::new(2.0);

/// How far can any of the edges be skewed relative to the other edges before we
/// reject the ballot.
pub const MAXIMUM_ALLOWED_BALLOT_SKEW: Degrees = Degrees::new(1.0);

/// The minimum required score for a corner mark to be considered valid.
pub const MIN_REQUIRED_CORNER_MARK_SCORE: UnitIntervalScore = UnitIntervalScore(0.8);

/// The minimum required score for a corner mark to be considered valid.
pub const MIN_REQUIRED_CORNER_PADDING_SCORE: UnitIntervalScore = UnitIntervalScore(0.5);

/// How much of an error is allowed in the distance between timing marks.
pub const MAX_ALLOWED_TIMING_MARK_DISTANCE_ERROR: UnitIntervalValue = 0.2;

pub struct FindCompleteTimingMarksFromPartialTimingMarksOptions<'a> {
    pub allowed_timing_mark_inset_percentage_of_width: UnitIntervalValue,
    pub debug: &'a ImageDebugWriter,
}

#[allow(clippy::too_many_lines)]
pub fn find_complete_from_partial(
    ballot_image: &BallotImage,
    geometry: &Geometry,
    partial_timing_marks: &Partial,
    options: &FindCompleteTimingMarksFromPartialTimingMarksOptions,
) -> FindCompleteTimingMarksResult {
    let debug = options.debug;
    let allowed_inset =
        geometry.canvas_size.width as f32 * options.allowed_timing_mark_inset_percentage_of_width;

    let is_top_line_invalid = {
        let top_line_segment = partial_timing_marks.top_line_segment_from_corners();
        let min_y = top_line_segment.start.y.min(top_line_segment.end.y);
        min_y > allowed_inset
    };

    if is_top_line_invalid {
        return Err(FindCompleteTimingMarksError::InvalidTimingMarkSide {
            side_marks: SideMarks::Top {
                top_left_corner: partial_timing_marks.top_left_corner,
                top_right_corner: partial_timing_marks.top_right_corner,
                marks: partial_timing_marks.top_marks.clone(),
            },
        });
    }

    let is_bottom_line_invalid = {
        let bottom_line_segment = partial_timing_marks.bottom_line_segment_from_corners();
        let max_y = bottom_line_segment.start.y.max(bottom_line_segment.end.y);
        max_y < geometry.canvas_size.height as f32 - allowed_inset
    };

    if is_bottom_line_invalid {
        return Err(FindCompleteTimingMarksError::InvalidTimingMarkSide {
            side_marks: SideMarks::Bottom {
                bottom_left_corner: partial_timing_marks.bottom_left_corner,
                bottom_right_corner: partial_timing_marks.bottom_right_corner,
                marks: partial_timing_marks.bottom_marks.clone(),
            },
        });
    }

    let is_left_line_invalid = {
        let left_line_segment = partial_timing_marks.left_line_segment_from_corners();
        let min_x = left_line_segment.start.x.min(left_line_segment.end.x);
        min_x > allowed_inset
    };

    if is_left_line_invalid {
        return Err(FindCompleteTimingMarksError::InvalidTimingMarkSide {
            side_marks: SideMarks::Left {
                top_left_corner: partial_timing_marks.top_left_corner,
                bottom_left_corner: partial_timing_marks.bottom_left_corner,
                marks: partial_timing_marks.left_marks.clone(),
            },
        });
    }

    let is_right_line_invalid = {
        let right_line_segment = partial_timing_marks.right_line_segment_from_corners();
        let max_x = right_line_segment.start.x.max(right_line_segment.end.x);
        max_x < geometry.canvas_size.width as f32 - allowed_inset
    };

    if is_right_line_invalid {
        return Err(FindCompleteTimingMarksError::InvalidTimingMarkSide {
            side_marks: SideMarks::Right {
                top_right_corner: partial_timing_marks.top_right_corner,
                bottom_right_corner: partial_timing_marks.bottom_right_corner,
                marks: partial_timing_marks.right_marks.clone(),
            },
        });
    }

    let top_line_marks = &partial_timing_marks.top_marks;
    let bottom_line_marks = &partial_timing_marks.bottom_marks;
    let left_line_marks = &partial_timing_marks.left_marks;
    let right_line_marks = &partial_timing_marks.right_marks;

    let min_left_right_timing_marks = (geometry.grid_size.height as f32 * 0.25).ceil() as usize;
    if left_line_marks.len() < min_left_right_timing_marks
        || right_line_marks.len() < min_left_right_timing_marks
    {
        return Err(FindCompleteTimingMarksError::TooFewVerticalTimingMarks {
            left_side_count: left_line_marks.len(),
            right_side_count: right_line_marks.len(),
        });
    }

    let mut horizontal_distances = vec![];
    horizontal_distances.append(&mut distances_between_marks(top_line_marks));
    horizontal_distances.append(&mut distances_between_marks(bottom_line_marks));
    horizontal_distances.sort_by(|a, b| a.partial_cmp(b).unwrap_or(Ordering::Equal));
    let mut vertical_distances = vec![];
    vertical_distances.append(&mut distances_between_marks(left_line_marks));
    vertical_distances.append(&mut distances_between_marks(right_line_marks));
    vertical_distances.sort_by(|a, b| a.partial_cmp(b).unwrap_or(Ordering::Equal));

    if horizontal_distances.is_empty() {
        return Err(FindCompleteTimingMarksError::TooFewHorizontalTimingMarks {
            top_side_count: top_line_marks.len(),
            bottom_side_count: bottom_line_marks.len(),
        });
    }

    if vertical_distances.is_empty() {
        return Err(FindCompleteTimingMarksError::TooFewVerticalTimingMarks {
            left_side_count: left_line_marks.len(),
            right_side_count: right_line_marks.len(),
        });
    }

    let median_horizontal_distance = horizontal_distances[horizontal_distances.len() / 2];
    let median_vertical_distance = vertical_distances[vertical_distances.len() / 2];

    let complete_top_line_marks = infer_missing_timing_marks_on_segment(
        ballot_image,
        Border::Top,
        top_line_marks,
        &Segment::new(
            partial_timing_marks.top_left_corner,
            partial_timing_marks.top_right_corner,
        ),
        median_horizontal_distance,
        geometry.grid_size.width,
        geometry,
    );

    let complete_bottom_line_marks = infer_missing_timing_marks_on_segment(
        ballot_image,
        Border::Bottom,
        bottom_line_marks,
        &Segment::new(
            partial_timing_marks.bottom_left_corner,
            partial_timing_marks.bottom_right_corner,
        ),
        median_horizontal_distance,
        geometry.grid_size.width,
        geometry,
    );

    let complete_left_line_marks = infer_missing_timing_marks_on_segment(
        ballot_image,
        Border::Left,
        left_line_marks,
        &Segment::new(
            partial_timing_marks.top_left_corner,
            partial_timing_marks.bottom_left_corner,
        ),
        median_vertical_distance,
        geometry.grid_size.height,
        geometry,
    );

    let complete_right_line_marks = infer_missing_timing_marks_on_segment(
        ballot_image,
        Border::Right,
        right_line_marks,
        &Segment::new(
            partial_timing_marks.top_right_corner,
            partial_timing_marks.bottom_right_corner,
        ),
        median_vertical_distance,
        geometry.grid_size.height,
        geometry,
    );

    if complete_top_line_marks.len() != complete_bottom_line_marks.len()
        || complete_left_line_marks.len() != complete_right_line_marks.len()
    {
        return Err(
            FindCompleteTimingMarksError::MismatchedInferredTimingMarks {
                left_side_count: complete_left_line_marks.len(),
                right_side_count: complete_right_line_marks.len(),
                top_side_count: complete_top_line_marks.len(),
                bottom_side_count: complete_bottom_line_marks.len(),
            },
        );
    }

    // We only check for stretching along the vertical axis because that's the
    // direction we scan ballots in. If we ever begin scanning horizontally, we
    // should also check for stretching along the horizontal axis.
    let max_allowed_vertical_distance =
        median_vertical_distance * (1.0 + MAX_ALLOWED_TIMING_MARK_DISTANCE_ERROR);
    for (border, marks) in [
        (Border::Left, &complete_left_line_marks),
        (Border::Right, &complete_right_line_marks),
    ] {
        for (index, pair) in marks.windows(2).enumerate() {
            let (timing_mark_center, next_timing_mark_center) =
                (pair[0].rect().center(), pair[1].rect().center());
            let distance = timing_mark_center.distance_to(&next_timing_mark_center);
            if distance > max_allowed_vertical_distance {
                return Err(FindCompleteTimingMarksError::HighStretch {
                    border,
                    index,
                    timing_mark_center,
                    next_timing_mark_center,
                });
            }
        }
    }

    let mut corner_match_info = vec![];
    let mut missing_corners = vec![];

    for (mark, corner, fallback) in [
        (
            partial_timing_marks.top_left_mark,
            Corner::TopLeft,
            complete_top_line_marks.first(),
        ),
        (
            partial_timing_marks.top_right_mark,
            Corner::TopRight,
            complete_top_line_marks.last(),
        ),
        (
            partial_timing_marks.bottom_left_mark,
            Corner::BottomLeft,
            complete_bottom_line_marks.first(),
        ),
        (
            partial_timing_marks.bottom_right_mark,
            Corner::BottomRight,
            complete_bottom_line_marks.last(),
        ),
    ] {
        match mark {
            Some(mark) => {
                corner_match_info.push((mark, corner));
            }
            None => match fallback {
                Some(fallback) => {
                    if fallback.scores().mark_score() < MIN_REQUIRED_CORNER_MARK_SCORE
                        || fallback.scores().padding_score() < MIN_REQUIRED_CORNER_PADDING_SCORE
                    {
                        missing_corners.push(corner);
                    }

                    corner_match_info.push((*fallback, corner));
                }
                None => {
                    missing_corners.push(corner);
                }
            },
        }
    }

    debug.write("corner_match_info", |canvas| {
        debug::draw_corner_match_info_debug_image_mut(canvas, &corner_match_info);
    });

    if !missing_corners.is_empty() {
        return Err(FindCompleteTimingMarksError::MissingCorners { missing_corners });
    }

    let (
        Some(top_left_rect),
        Some(top_right_rect),
        Some(bottom_left_rect),
        Some(bottom_right_rect),
    ) = (
        complete_top_line_marks.first().copied(),
        complete_top_line_marks.last().copied(),
        complete_bottom_line_marks.first().copied(),
        complete_bottom_line_marks.last().copied(),
    )
    else {
        let mut missing_corners = vec![];
        if complete_top_line_marks.first().is_none() {
            missing_corners.push(Corner::TopLeft);
        }
        if complete_top_line_marks.last().is_none() {
            missing_corners.push(Corner::TopRight);
        }
        if complete_bottom_line_marks.first().is_none() {
            missing_corners.push(Corner::BottomLeft);
        }
        if complete_bottom_line_marks.last().is_none() {
            missing_corners.push(Corner::BottomRight);
        }
        return Err(FindCompleteTimingMarksError::MissingCorners { missing_corners });
    };

    let complete_timing_marks = Complete {
        geometry: *geometry,
        top_marks: complete_top_line_marks,
        bottom_marks: complete_bottom_line_marks,
        left_marks: complete_left_line_marks,
        right_marks: complete_right_line_marks,
        top_left_corner: partial_timing_marks.top_left_corner,
        top_right_corner: partial_timing_marks.top_right_corner,
        bottom_left_corner: partial_timing_marks.bottom_left_corner,
        bottom_right_corner: partial_timing_marks.bottom_right_corner,
        top_left_mark: top_left_rect,
        top_right_mark: top_right_rect,
        bottom_left_mark: bottom_left_rect,
        bottom_right_mark: bottom_right_rect,
    };

    let partial_timing_marks_from_complete_timing_marks: Partial =
        complete_timing_marks.clone().into();

    let inferred_any_top_timing_marks =
        complete_timing_marks.top_marks != partial_timing_marks.top_marks;
    let inferred_any_bottom_timing_marks =
        complete_timing_marks.bottom_marks != partial_timing_marks.bottom_marks;
    let inferred_any_left_timing_marks =
        complete_timing_marks.left_marks != partial_timing_marks.left_marks;
    let inferred_any_right_timing_marks =
        complete_timing_marks.right_marks != partial_timing_marks.right_marks;

    // be more careful about the rotation and skew of the ballot if we inferred
    // any timing marks outside the metadata timing marks
    if (inferred_any_top_timing_marks && inferred_any_bottom_timing_marks)
        || inferred_any_left_timing_marks
        || inferred_any_right_timing_marks
    {
        let top_rotation = partial_timing_marks_from_complete_timing_marks
            .top_side_rotation()
            .to_degrees();
        let bottom_rotation = partial_timing_marks_from_complete_timing_marks
            .bottom_side_rotation()
            .to_degrees();
        let left_rotation = partial_timing_marks_from_complete_timing_marks
            .left_side_rotation()
            .to_degrees();
        let right_rotation = partial_timing_marks_from_complete_timing_marks
            .right_side_rotation()
            .to_degrees();

        if top_rotation > MAXIMUM_ALLOWED_BALLOT_ROTATION
            || bottom_rotation > MAXIMUM_ALLOWED_BALLOT_ROTATION
            || left_rotation > MAXIMUM_ALLOWED_BALLOT_ROTATION
            || right_rotation > MAXIMUM_ALLOWED_BALLOT_ROTATION
        {
            return Err(FindCompleteTimingMarksError::HighRotation {
                top_rotation,
                bottom_rotation,
                left_rotation,
                right_rotation,
            });
        }

        let top_left_skew = partial_timing_marks_from_complete_timing_marks
            .top_left_corner_skew()
            .to_degrees();
        let top_right_skew = partial_timing_marks_from_complete_timing_marks
            .top_right_corner_skew()
            .to_degrees();
        let bottom_left_skew = partial_timing_marks_from_complete_timing_marks
            .bottom_left_corner_skew()
            .to_degrees();
        let bottom_right_skew = partial_timing_marks_from_complete_timing_marks
            .bottom_right_corner_skew()
            .to_degrees();

        if top_left_skew > MAXIMUM_ALLOWED_BALLOT_SKEW
            || top_right_skew > MAXIMUM_ALLOWED_BALLOT_SKEW
            || bottom_left_skew > MAXIMUM_ALLOWED_BALLOT_SKEW
            || bottom_right_skew > MAXIMUM_ALLOWED_BALLOT_SKEW
        {
            return Err(FindCompleteTimingMarksError::HighSkew {
                top_left_skew,
                top_right_skew,
                bottom_left_skew,
                bottom_right_skew,
            });
        }
    }

    debug.write("complete_timing_marks", |canvas| {
        debug::draw_timing_mark_debug_image_mut(
            canvas,
            geometry,
            &partial_timing_marks_from_complete_timing_marks,
        );
    });

    Ok(complete_timing_marks)
}

/// Infers missing timing marks along a segment. It's expected that there are
/// timing marks centered at the start and end of the segment and that the
/// distance between them is roughly `expected_distance`. There should be
/// exactly `expected_count` timing marks along the segment.
fn infer_missing_timing_marks_on_segment(
    ballot_image: &BallotImage,
    border: Border,
    timing_marks: &[CandidateTimingMark],
    segment: &Segment,
    expected_distance: f32,
    expected_count: GridUnit,
    geometry: &Geometry,
) -> Vec<CandidateTimingMark> {
    if timing_marks.is_empty() {
        return vec![];
    }

    let mut inferred_timing_marks = vec![];
    let mut current_timing_mark_center = segment.start;
    let next_point_vector = segment.with_length(expected_distance).vector();
    let maximum_error = expected_distance / 2.0;
    while inferred_timing_marks.len() < expected_count as usize {
        // find the closest existing timing mark
        let closest_mark = timing_marks
            .iter()
            .min_by(|a, b| {
                let a_distance = a.rect().center().distance_to(&current_timing_mark_center);
                let b_distance = b.rect().center().distance_to(&current_timing_mark_center);
                a_distance
                    .partial_cmp(&b_distance)
                    .unwrap_or(Ordering::Equal)
            })
            .map_or_else(
                || unreachable!("[{border:?}] there will always be a closest timing mark"),
                |rect| rect,
            );

        // if the closest timing mark is close enough, use it
        if closest_mark
            .rect()
            .center()
            .distance_to(&current_timing_mark_center)
            <= maximum_error
        {
            inferred_timing_marks.push(*closest_mark);
            current_timing_mark_center = closest_mark.rect().center() + next_point_vector;
        } else {
            // otherwise, we need to fill in a point
            let rect = Rect::new(
                (current_timing_mark_center.x - geometry.timing_mark_size.width / 2.0).round()
                    as PixelPosition,
                (current_timing_mark_center.y - geometry.timing_mark_size.height / 2.0).round()
                    as PixelPosition,
                geometry.timing_mark_size.width.round() as u32,
                geometry.timing_mark_size.height.round() as u32,
            );
            inferred_timing_marks.push(CandidateTimingMark::new(
                rect,
                score_timing_mark_geometry_match(ballot_image, &rect, geometry),
            ));
            current_timing_mark_center += next_point_vector;
        }
    }
    inferred_timing_marks
}

/// Determines whether a rect could be a timing mark based on its rect.
pub fn rect_could_be_timing_mark(geometry: &Geometry, rect: &Rect) -> bool {
    let timing_mark_size = geometry.timing_mark_size;

    let is_near_left_or_right_edge = rect.left() < timing_mark_size.width.ceil() as i32
        || rect.right()
            > (geometry.canvas_size.width as f32 - timing_mark_size.width.ceil()) as i32;
    let is_near_top_or_bottom_edge = rect.top() < timing_mark_size.height.ceil() as i32
        || rect.bottom()
            > (geometry.canvas_size.height as f32 - timing_mark_size.height.ceil()) as i32;

    // allow timing marks near an edge to be substantially clipped
    let min_timing_mark_width_multiplier = if is_near_left_or_right_edge {
        0.20
    } else {
        0.5
    };
    let min_timing_mark_height_multiplier = if is_near_top_or_bottom_edge {
        0.20
    } else {
        0.5
    };

    let min_timing_mark_width =
        (timing_mark_size.width * min_timing_mark_width_multiplier).floor() as u32;
    let min_timing_mark_height =
        (timing_mark_size.height * min_timing_mark_height_multiplier).floor() as u32;

    // Skew/rotation can cause the height of timing marks to be slightly larger
    // than expected, so allow for a small amount of extra height when
    // determining if a rect could be a timing mark. This applies to width as
    // well, but to a lesser extent.
    let max_timing_mark_width = (timing_mark_size.width * 1.80).round() as u32;
    let max_timing_mark_height = (timing_mark_size.height * 1.80).round() as u32;

    rect.width() >= min_timing_mark_width
        && rect.width() <= max_timing_mark_width
        && rect.height() >= min_timing_mark_height
        && rect.height() <= max_timing_mark_height
}

pub fn detect_orientation_from_grid(grid: &TimingMarkGrid) -> Orientation {
    // For Accuvote-style ballots, assume that we will find most of
    // the timing marks and that there will be more missing on the bottom than
    // the top. If that's not the case, then we'll need to rotate the image.
    if grid.partial_timing_marks.top_marks.len() >= grid.partial_timing_marks.bottom_marks.len() {
        Orientation::Portrait
    } else {
        Orientation::PortraitReversed
    }
}

/// Gets all the distances between adjacent marks in a list of marks.
pub fn distances_between_marks(marks: &[CandidateTimingMark]) -> Vec<f32> {
    let mut distances = marks
        .windows(2)
        .map(|w| Segment::new(w[1].rect().center(), w[0].rect().center()).length())
        .collect::<Vec<_>>();
    distances.sort_by(|a, b| a.partial_cmp(b).unwrap_or(Ordering::Equal));
    distances
}

/// Finds the points in a timing mark grid that contain empty bubbles matching a
/// given template image.
pub fn find_empty_bubbles_matching_template(
    ballot_image: &GrayImage,
    bubble_template: &GrayImage,
    grid: &TimingMarkGrid,
    threshold: UnitIntervalValue,
    match_error_pixels: PixelUnit,
) -> Vec<Point<GridUnit>> {
    let mut empty_bubbles = vec![];

    for column in 1..grid.geometry.grid_size.width - 1 {
        for row in 1..grid.geometry.grid_size.height - 1 {
            if let Some(bubble_center) =
                grid.point_for_location(column as SubGridUnit, row as SubGridUnit)
            {
                let bubble_center = bubble_center.round();
                let bubble_origin = Point::new(
                    (bubble_center.x as SubPixelUnit
                        - bubble_template.width() as SubPixelUnit / 2.0)
                        as PixelUnit,
                    (bubble_center.y as SubPixelUnit
                        - bubble_template.height() as SubPixelUnit / 2.0)
                        as PixelUnit,
                );
                assert!(bubble_origin.x >= match_error_pixels);
                assert!(bubble_origin.y >= match_error_pixels);
                assert!(
                    (bubble_origin.x + bubble_template.width() as PixelUnit)
                        < ballot_image.width() - match_error_pixels,
                    "column: {column}, row: {row}, bubble origin: {:?}, bubble template size: {:?}, ballot image size: {:?}",
                    bubble_origin,
                    bubble_template.dimensions(),
                    ballot_image.dimensions()
                );
                assert!(
                    (bubble_origin.y + bubble_template.height() as PixelUnit)
                        < ballot_image.height() - match_error_pixels,
                    "column: {column}, row: {row}, bubble origin: {:?}, bubble template size: {:?}, ballot image size: {:?}",
                    bubble_origin,
                    bubble_template.dimensions(),
                    ballot_image.dimensions()
                );

                'bubble_search: for x in
                    (bubble_origin.x - match_error_pixels)..=(bubble_origin.x + match_error_pixels)
                {
                    for y in (bubble_origin.y - match_error_pixels)
                        ..=(bubble_origin.y + match_error_pixels)
                    {
                        let bubble_image = ballot_image.view(
                            x,
                            y,
                            bubble_template.width(),
                            bubble_template.height(),
                        );

                        let bubble_image = bubble_image.to_image();
                        let match_score = match_template(&bubble_image, bubble_template);
                        if match_score >= threshold {
                            empty_bubbles.push(Point::new(column, row));
                            break 'bubble_search;
                        }
                    }
                }
            }
        }
    }
    empty_bubbles
}

pub fn normalize_orientation(
    geometry: &Geometry,
    grid: TimingMarkGrid,
    image: &GrayImage,
    orientation: Orientation,
    debug: &mut ImageDebugWriter,
) -> (TimingMarkGrid, GrayImage) {
    // Handle rotating the image and our timing marks if necessary.
    let (complete_timing_marks, normalized_image) = if orientation == Orientation::Portrait {
        (grid.complete_timing_marks, image.clone())
    } else {
        let (width, height) = image.dimensions();
        debug.rotate180();
        (
            grid.complete_timing_marks.rotate(Size { width, height }),
            rotate180(image),
        )
    };

    debug.write(
        "complete_timing_marks_after_orientation_correction",
        |canvas| {
            draw_timing_mark_debug_image_mut(
                canvas,
                geometry,
                &complete_timing_marks.clone().into(),
            );
        },
    );

    let grid = TimingMarkGrid {
        complete_timing_marks,
        ..grid
    };
    (grid, normalized_image)
}

#[allow(clippy::result_large_err)]
pub fn detect_metadata_and_normalize_orientation(
    label: &str,
    geometry: &Geometry,
    grid: TimingMarkGrid,
    ballot_image: &BallotImage,
    debug: &mut ImageDebugWriter,
) -> interpret::Result<(TimingMarkGrid, BallotImage, BallotPageTimingMarkMetadata)> {
    let orientation = detect_orientation_from_grid(&grid);
    let (normalized_grid, normalized_image) =
        normalize_orientation(geometry, grid, &ballot_image.image, orientation, debug);
    let normalized_ballot_image = BallotImage {
        image: normalized_image,
        threshold: ballot_image.threshold,
        border_inset: ballot_image.border_inset,
    };
    let bottom_timing_marks = find_actual_bottom_marks(&normalized_grid.complete_timing_marks);

    debug.write("bottom_timing_marks", |canvas| {
        debug::draw_bottom_timing_mark_detection_debug_image_mut(
            canvas,
            &bottom_timing_marks,
            &normalized_grid.complete_timing_marks.bottom_marks,
        );
    });

    let metadata =
        BallotPageTimingMarkMetadata::decode_from_timing_marks(geometry, &bottom_timing_marks)
            .map_err(|error| Error::InvalidTimingMarkMetadata {
                label: label.to_string(),
                error,
            })?;
    Ok((normalized_grid, normalized_ballot_image, metadata))
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::similar_names)]
mod tests {
    use std::path::{Path, PathBuf};

    use image::GrayImage;

    use crate::{
        ballot_card::{BallotCard, PaperInfo},
        debug::ImageDebugWriter,
        interpret::{par_map_pair, prepare_ballot_card_images, ResizeStrategy},
    };

    use super::*;

    /// Loads a ballot page image from disk as grayscale.
    pub fn load_ballot_page_image(image_path: &Path) -> GrayImage {
        image::open(image_path).unwrap().into_luma8()
    }

    /// Loads images for both sides of a ballot card and returns them.
    pub fn load_ballot_card_images(
        side_a_path: &Path,
        side_b_path: &Path,
    ) -> (GrayImage, GrayImage) {
        par_map_pair(side_a_path, side_b_path, load_ballot_page_image)
    }

    #[test]
    fn test_ignore_smudged_timing_mark() {
        let fixture_path =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test/fixtures/nh-test-ballot");
        let side_a_path = fixture_path.join("timing-mark-smudge-front.jpeg");
        let side_b_path = fixture_path.join("timing-mark-smudge-back.jpeg");
        let (side_a_image, side_b_image) = load_ballot_card_images(&side_a_path, &side_b_path);

        let BallotCard {
            side_a: _,
            side_b,
            geometry,
        } = prepare_ballot_card_images(
            side_a_image,
            side_b_image,
            &PaperInfo::scanned(),
            ResizeStrategy::Fit,
        )
        .unwrap();

        let rects = find_timing_mark_shapes(&geometry, &side_b, &ImageDebugWriter::disabled());
        let partial_timing_marks = find_partial_timing_marks_from_candidates(
            &geometry,
            &rects,
            &ImageDebugWriter::disabled(),
        )
        .unwrap();

        // we're working with letter sized paper, so the grid size should be 34x41
        assert_eq!(
            geometry.grid_size,
            Size {
                width: 34,
                height: 41
            }
        );

        // verify that the smudged timing mark is not detected. this isn't
        // required if we someday find a way to correct it, but for now we're
        // operating under the assumption that it's better to ignore the smudged
        // mark and infer its real position from the other timing marks.
        assert_eq!(partial_timing_marks.right_marks.len(), 40);

        // also verify the other sides are detected correctly. notably, the
        // bottom only has 20 because it's encoding metadata.
        assert_eq!(partial_timing_marks.left_marks.len(), 41);
        assert_eq!(partial_timing_marks.top_marks.len(), 34);
        assert_eq!(partial_timing_marks.bottom_marks.len(), 20);

        let complete_timing_marks = find_complete_from_partial(
            &side_b,
            &geometry,
            &partial_timing_marks,
            &FindCompleteTimingMarksFromPartialTimingMarksOptions {
                allowed_timing_mark_inset_percentage_of_width: 0.1,
                debug: &ImageDebugWriter::disabled(),
            },
        )
        .unwrap();

        // once we've inferred the missing timing marks, we should have the
        // correct number of timing marks on each side.
        assert_eq!(complete_timing_marks.top_marks.len(), 34);
        assert_eq!(complete_timing_marks.bottom_marks.len(), 34);
        assert_eq!(complete_timing_marks.left_marks.len(), 41);
        assert_eq!(complete_timing_marks.right_marks.len(), 41);
    }

    #[test]
    fn test_filter_size_outlier_rects() {
        let timing_mark_scores = TimingMarkScore {
            mark_score: UnitIntervalScore(0.0),
            padding_score: UnitIntervalScore(0.0),
        };
        let marks = [
            CandidateTimingMark::new(Rect::new(0, 0, 9, 10), timing_mark_scores),
            CandidateTimingMark::new(Rect::new(0, 0, 10, 10), timing_mark_scores),
            CandidateTimingMark::new(Rect::new(0, 0, 13, 13), timing_mark_scores),
            CandidateTimingMark::new(Rect::new(0, 0, 11, 10), timing_mark_scores),
            CandidateTimingMark::new(Rect::new(0, 0, 10, 9), timing_mark_scores),
        ];

        let filtered_marks = filter_size_outlier_marks(&marks, 1.0);
        assert_eq!(
            filtered_marks,
            FilteredMarks {
                marks: vec![marks[0], marks[1], marks[3], marks[4]],
                removed_marks: vec![marks[2]],
                mean_width: 10.6,
                mean_height: 10.4,
                stddev_width: 1.356_466,
                stddev_height: 1.356_465_9,
                stddev_threshold: 1.0,
                width_range: 9..12,
                height_range: 9..12,
            }
        );

        let filtered_rects = filter_size_outlier_marks(&marks, 5.0);
        assert_eq!(
            filtered_rects,
            FilteredMarks {
                marks: marks.to_vec(),
                removed_marks: vec![],
                mean_width: 10.6,
                mean_height: 10.4,
                stddev_width: 1.356_466,
                stddev_height: 1.356_465_9,
                stddev_threshold: 5.0,
                width_range: 3..18,
                height_range: 3..18,
            }
        );
    }
}
