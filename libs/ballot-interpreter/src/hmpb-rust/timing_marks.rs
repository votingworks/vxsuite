use image::{imageops::rotate180, GenericImageView, GrayImage};
use imageproc::{
    contours::{find_contours_with_threshold, BorderType, Contour},
    contrast::otsu_level,
};
use logging_timer::time;
use rayon::iter::ParallelIterator;
use rayon::prelude::IntoParallelRefIterator;
use serde::Serialize;
use types_rs::geometry::{
    find_inline_subsets, Degrees, GridUnit, PixelPosition, PixelUnit, Point, Radians, Rect,
    Segment, Size, SubGridUnit, SubPixelUnit,
};
use types_rs::{election::UnitIntervalValue, geometry::IntersectionBounds};

use crate::{
    ballot_card::{Geometry, Orientation},
    debug::{self, draw_timing_mark_debug_image_mut, ImageDebugWriter},
    image_utils::{expand_image, match_template, WHITE},
    interpret::{self, Error},
    qr_code_metadata::BallotPageQrCodeMetadata,
    timing_mark_metadata::BallotPageTimingMarkMetadata,
};

/// Represents partial timing marks found in a ballot card.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Partial {
    pub geometry: Geometry,
    pub top_left_corner: Point<f32>,
    pub top_right_corner: Point<f32>,
    pub bottom_left_corner: Point<f32>,
    pub bottom_right_corner: Point<f32>,
    pub top_rects: Vec<Rect>,
    pub bottom_rects: Vec<Rect>,
    pub left_rects: Vec<Rect>,
    pub right_rects: Vec<Rect>,
    pub top_left_rect: Option<Rect>,
    pub top_right_rect: Option<Rect>,
    pub bottom_left_rect: Option<Rect>,
    pub bottom_right_rect: Option<Rect>,
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
            top_rects: complete_timing_marks.top_rects,
            bottom_rects: complete_timing_marks.bottom_rects,
            left_rects: complete_timing_marks.left_rects,
            right_rects: complete_timing_marks.right_rects,
            top_left_rect: Some(complete_timing_marks.top_left_rect),
            top_right_rect: Some(complete_timing_marks.top_right_rect),
            bottom_left_rect: Some(complete_timing_marks.bottom_left_rect),
            bottom_right_rect: Some(complete_timing_marks.bottom_right_rect),
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
    pub top_rects: Vec<Rect>,
    pub bottom_rects: Vec<Rect>,
    pub left_rects: Vec<Rect>,
    pub right_rects: Vec<Rect>,
    pub top_left_rect: Rect,
    pub top_right_rect: Rect,
    pub bottom_left_rect: Rect,
    pub bottom_right_rect: Rect,
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
    pub candidate_timing_marks: Vec<Rect>,
}

impl TimingMarkGrid {
    pub fn new(
        geometry: Geometry,
        partial_timing_marks: Partial,
        complete_timing_marks: Complete,
        candidate_timing_marks: Vec<Rect>,
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
    /// fractional row index, then interpolating vertically between the closest
    /// two rows).
    /// 2. Correcting the left/right timing mark position to account for
    /// the marks being cropped during scanning or border removal
    /// 3. Interpolating horizontally between the left/right timing mark
    /// positions based on the given column index.
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
            .left_rects
            .get(row_before as usize)?;
        let right_before = self
            .complete_timing_marks
            .right_rects
            .get(row_before as usize)?;
        let left_after = self
            .complete_timing_marks
            .left_rects
            .get(row_after as usize)?;
        let right_after = self
            .complete_timing_marks
            .right_rects
            .get(row_after as usize)?;
        let left = Rect::new(
            left_before.left(),
            left_before.top()
                + (distance_percentage_between_rows
                    * ((left_after.top() - left_before.top()) as SubPixelUnit))
                    as PixelPosition,
            left_before.width(),
            left_before.height(),
        );
        let right = Rect::new(
            right_before.left(),
            right_before.top()
                + (distance_percentage_between_rows
                    * ((right_after.top() - right_before.top()) as SubPixelUnit))
                    as PixelPosition,
            right_before.width(),
            right_before.height(),
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

/// Finds the timing marks in the given image and computes the grid of timing
/// marks, i.e. the locations of all the possible bubbles.
#[time]
pub fn find_timing_mark_grid(
    geometry: &Geometry,
    img: &GrayImage,
    debug: &mut ImageDebugWriter,
) -> Result<TimingMarkGrid, Error> {
    let threshold = otsu_level(img);
    // Find shapes that look like timing marks but may not be.
    let candidate_timing_marks = find_timing_mark_shapes(geometry, img, threshold, debug);

    // Find timing marks along the border of the image from the candidate
    // shapes. This step may not find all the timing marks, but it should find
    // enough to determine the borders and orientation of the ballot card.
    let Some(partial_timing_marks) =
        find_partial_timing_marks_from_candidate_rects(geometry, &candidate_timing_marks, debug)
    else {
        return Err(Error::MissingTimingMarks {
            rects: candidate_timing_marks,
            reason: "No partial timing marks found".to_owned(),
        });
    };

    let complete_timing_marks = match find_complete_timing_marks_from_partial_timing_marks(
        geometry,
        &partial_timing_marks,
        debug,
    ) {
        Ok(complete_timing_marks) => complete_timing_marks,
        Err(find_complete_timing_marks_error) => {
            return Err(Error::MissingTimingMarks {
                rects: candidate_timing_marks,
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

/// Filters the bottom timing marks by examining the image to determine if the
/// timing marks are actually present.
pub fn find_actual_bottom_marks(
    complete_timing_marks: &Complete,
    image: &GrayImage,
    threshold: u8,
) -> Vec<Option<Rect>> {
    complete_timing_marks
        .bottom_rects
        .par_iter()
        .map(|rect| {
            let rect_within_image =
                rect.intersect(&Rect::new(0, 0, image.width(), image.height()))?;

            let rect_sub_image = GenericImageView::view(
                image,
                rect_within_image.left() as u32,
                rect_within_image.top() as u32,
                rect_within_image.width(),
                rect_within_image.height(),
            );
            let rect_area = rect.width() * rect.height();
            if rect_sub_image
                .pixels()
                .filter(|(_, _, luma)| luma.0[0] <= threshold)
                .count()
                > (rect_area / 2) as usize
            {
                Some(*rect)
            } else {
                None
            }
        })
        .collect()
}

/// Determines if the given contour is rectangular. This is not an exact test,
/// but it is a good approximation.
fn is_contour_rectangular(contour: &Contour<u32>) -> bool {
    let rect = get_contour_bounding_rect(contour);

    let error_value = contour
        .points
        .iter()
        .map(|p| {
            (p.x - rect.left() as u32)
                .min(p.y - rect.top() as u32)
                .min(rect.right() as u32 - p.x)
                .min(rect.bottom() as u32 - p.y)
        })
        .sum::<u32>();
    let rectangular_score = error_value as SubPixelUnit / contour.points.len() as SubPixelUnit;
    rectangular_score < 1.0
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
#[time]
pub fn find_timing_mark_shapes(
    geometry: &Geometry,
    img: &GrayImage,
    threshold: u8,
    debug: &ImageDebugWriter,
) -> Vec<Rect> {
    // `find_contours_with_threshold` does not consider timing marks on the edge
    // of the image to be contours, so we expand the image and add whitespace
    // around the edges to ensure no timing marks are on the edge of the image
    let Ok(img) = expand_image(img, BORDER_SIZE.into(), WHITE) else {
        return vec![];
    };

    let contours = find_contours_with_threshold(&img, threshold);
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
                if rect_could_be_timing_mark(geometry, &contour_bounds)
                    && is_contour_rectangular(contour)
                {
                    return Some(contour_bounds);
                }
            }
            None
        })
        .collect::<Vec<_>>();

    debug.write("candidate_timing_marks", |canvas| {
        debug::draw_candidate_timing_marks_debug_image_mut(
            canvas,
            &contours
                .iter()
                .map(|c| {
                    get_contour_bounding_rect(c).offset(
                        -PixelPosition::from(BORDER_SIZE),
                        -PixelPosition::from(BORDER_SIZE),
                    )
                })
                .collect::<Vec<_>>(),
            &candidate_timing_marks,
        );
    });

    candidate_timing_marks
}

const MAX_BEST_FIT_LINE_ERROR: Degrees = Degrees::new(5.0);
const HORIZONTAL_ANGLE: Degrees = Degrees::new(0.0);
const VERTICAL_ANGLE: Degrees = Degrees::new(90.0);

/// Finds timing marks along the border of the image based on the rectangles
/// found by some other method. This algorithm focuses on finding timing marks
/// that intersect a line approximately aligned with the edges of the image,
/// i.e. along the borders.
#[time]
pub fn find_partial_timing_marks_from_candidate_rects(
    geometry: &Geometry,
    rects: &[Rect],
    debug: &ImageDebugWriter,
) -> Option<Partial> {
    fn average<T: IntoIterator<Item = PixelPosition>>(values: T) -> PixelPosition {
        let mut sum = 0;
        let mut count = 0;
        for value in values {
            sum += value;
            count += 1;
        }
        if count == 0 {
            0
        } else {
            sum / count
        }
    }

    let half_height = (geometry.canvas_size.height / 2) as PixelPosition;
    let half_width = (geometry.canvas_size.width / 2) as PixelPosition;
    let top_half_rects = rects
        .iter()
        .filter(|r| r.top() < half_height)
        .copied()
        .collect::<Vec<_>>();
    let bottom_half_rects = rects
        .iter()
        .filter(|r| r.top() >= half_height)
        .copied()
        .collect::<Vec<_>>();
    let left_half_rects = rects
        .iter()
        .filter(|r| r.left() < half_width)
        .copied()
        .collect::<Vec<_>>();
    let right_half_rects = rects
        .iter()
        .filter(|r| r.left() >= half_width)
        .copied()
        .collect::<Vec<_>>();

    let cmp_top_line_candidates = |a: &Vec<&Rect>, b: &Vec<&Rect>| -> std::cmp::Ordering {
        match a.len().cmp(&b.len()) {
            std::cmp::Ordering::Equal => {
                // if the counts are equal, sort by top opposite (where we want the smallest value)
                average(b.iter().map(|r| r.top())).cmp(&average(a.iter().map(|r| r.top())))
            }
            cmp => cmp,
        }
    };

    let cmp_bottom_line_candidates = |a: &Vec<&Rect>, b: &Vec<&Rect>| -> std::cmp::Ordering {
        match a.len().cmp(&b.len()) {
            std::cmp::Ordering::Equal => {
                // if the counts are equal, sort by bottom (where we want the largest value)
                average(a.iter().map(|r| r.bottom())).cmp(&average(b.iter().map(|r| r.bottom())))
            }
            cmp => cmp,
        }
    };

    let cmp_left_line_candidates = |a: &Vec<&Rect>, b: &Vec<&Rect>| -> std::cmp::Ordering {
        // compare by the difference from the expected number of timing marks.
        // we can do this because the left side should be completely filled
        let a_diff_from_expected = (a.len() as i32 - geometry.grid_size.height).abs();
        let b_diff_from_expected = (b.len() as i32 - geometry.grid_size.height).abs();

        match a_diff_from_expected.cmp(&b_diff_from_expected) {
            std::cmp::Ordering::Equal => {
                // if the counts are equal, sort by left opposite (where we want the smallest value)
                average(b.iter().map(|r| r.left())).cmp(&average(a.iter().map(|r| r.left())))
            }
            // swap the ordering because we're using max_by and we want to minimize the diff
            std::cmp::Ordering::Less => std::cmp::Ordering::Greater,
            std::cmp::Ordering::Greater => std::cmp::Ordering::Less,
        }
    };

    let cmp_right_line_candidates = |a: &Vec<&Rect>, b: &Vec<&Rect>| -> std::cmp::Ordering {
        // compare by the difference from the expected number of timing marks.
        // we can do this because the right side should be completely filled
        let a_diff_from_expected = (a.len() as i32 - geometry.grid_size.height).abs();
        let b_diff_from_expected = (b.len() as i32 - geometry.grid_size.height).abs();

        match a_diff_from_expected.cmp(&b_diff_from_expected) {
            std::cmp::Ordering::Equal => {
                // if the counts are equal, sort by right (where we want the largest value)
                average(a.iter().map(|r| r.right())).cmp(&average(b.iter().map(|r| r.right())))
            }
            // swap the ordering because we're using max_by and we want to minimize the diff
            std::cmp::Ordering::Less => std::cmp::Ordering::Greater,
            std::cmp::Ordering::Greater => std::cmp::Ordering::Less,
        }
    };

    let mut top_line =
        find_inline_subsets(&top_half_rects, HORIZONTAL_ANGLE, MAX_BEST_FIT_LINE_ERROR)
            .max_by(cmp_top_line_candidates)
            .unwrap_or_default()
            .into_iter()
            .copied()
            .collect::<Vec<_>>();

    let mut bottom_line = find_inline_subsets(
        &bottom_half_rects,
        HORIZONTAL_ANGLE,
        MAX_BEST_FIT_LINE_ERROR,
    )
    .max_by(cmp_bottom_line_candidates)?
    .into_iter()
    .copied()
    .collect::<Vec<_>>();

    let mut left_line =
        find_inline_subsets(&left_half_rects, VERTICAL_ANGLE, MAX_BEST_FIT_LINE_ERROR)
            .max_by(cmp_left_line_candidates)
            .unwrap_or_default()
            .into_iter()
            .copied()
            .collect::<Vec<_>>();

    let mut right_line =
        find_inline_subsets(&right_half_rects, VERTICAL_ANGLE, MAX_BEST_FIT_LINE_ERROR)
            .max_by(cmp_right_line_candidates)
            .unwrap_or_default()
            .into_iter()
            .copied()
            .collect::<Vec<_>>();

    top_line.sort_by_key(Rect::left);
    bottom_line.sort_by_key(Rect::left);
    left_line.sort_by_key(Rect::top);
    right_line.sort_by_key(Rect::top);

    let top_start_rect_center = (top_line.first()?).center();
    let top_last_rect_center = (top_line.last()?).center();

    let bottom_start_rect_center = (bottom_line.first()?).center();
    let bottom_last_rect_center = (bottom_line.last()?).center();

    let left_start_rect_center = (left_line.first()?).center();
    let left_last_rect_center = (left_line.last()?).center();

    let right_start_rect_center = (right_line.first()?).center();
    let right_last_rect_center = (right_line.last()?).center();

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
        top_left_rect: top_left_corner.copied(),
        top_right_rect: top_right_corner.copied(),
        bottom_left_rect: bottom_left_corner.copied(),
        bottom_right_rect: bottom_right_corner.copied(),
        top_rects: top_line,
        bottom_rects: bottom_line,
        left_rects: left_line,
        right_rects: right_line,
    };

    debug.write("partial_timing_marks", |canvas| {
        debug::draw_timing_mark_debug_image_mut(canvas, geometry, &partial_timing_marks);
    });

    Some(partial_timing_marks)
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

#[time]
pub fn rotate_complete_timing_marks(
    image_size: &Size<u32>,
    complete_timing_marks: Complete,
) -> Complete {
    let Complete {
        geometry,
        top_left_corner,
        top_right_corner,
        bottom_left_corner,
        bottom_right_corner,
        top_left_rect,
        top_right_rect,
        bottom_left_rect,
        bottom_right_rect,
        top_rects,
        bottom_rects,
        left_rects,
        right_rects,
    } = complete_timing_marks;

    let rotator = Rotator180::new(*image_size);

    let (top_left_corner, top_right_corner, bottom_left_corner, bottom_right_corner) = (
        rotator.rotate_point_around_subpixel_position(bottom_right_corner),
        rotator.rotate_point_around_subpixel_position(bottom_left_corner),
        rotator.rotate_point_around_subpixel_position(top_right_corner),
        rotator.rotate_point_around_subpixel_position(top_left_corner),
    );

    let (top_left_rect, top_right_rect, bottom_left_rect, bottom_right_rect) = (
        rotator.rotate_rect(&bottom_right_rect),
        rotator.rotate_rect(&bottom_left_rect),
        rotator.rotate_rect(&top_right_rect),
        rotator.rotate_rect(&top_left_rect),
    );

    let mut rotated_top_rects: Vec<Rect> =
        top_rects.iter().map(|r| rotator.rotate_rect(r)).collect();
    let mut rotated_bottom_rects: Vec<Rect> = bottom_rects
        .iter()
        .map(|r| rotator.rotate_rect(r))
        .collect();
    let mut rotated_left_rects: Vec<Rect> =
        left_rects.iter().map(|r| rotator.rotate_rect(r)).collect();
    let mut rotated_right_rects: Vec<Rect> =
        right_rects.iter().map(|r| rotator.rotate_rect(r)).collect();

    rotated_bottom_rects.sort_by_key(Rect::left);
    rotated_top_rects.sort_by_key(Rect::left);
    rotated_left_rects.sort_by_key(Rect::top);
    rotated_right_rects.sort_by_key(Rect::top);

    Complete {
        geometry,
        top_left_corner,
        top_right_corner,
        bottom_left_corner,
        bottom_right_corner,
        top_left_rect,
        top_right_rect,
        bottom_left_rect,
        bottom_right_rect,
        top_rects: rotated_bottom_rects,
        bottom_rects: rotated_top_rects,
        left_rects: rotated_right_rects,
        right_rects: rotated_left_rects,
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

    /// Not enough corners of the ballot card could be found.
    #[error("Not enough corners of the ballot card could be found")]
    MissingCorners,

    /// One of the timing mark border sides is invalid.
    #[error("Invalid timing mark side: {side_marks:?}")]
    InvalidTimingMarkSide { side_marks: SideMarks },
}

#[derive(Debug)]
pub enum SideMarks {
    #[allow(dead_code)]
    Left {
        top_left_corner: Point<f32>,
        bottom_left_corner: Point<f32>,
        rects: Vec<Rect>,
    },
    #[allow(dead_code)]
    Right {
        top_right_corner: Point<f32>,
        bottom_right_corner: Point<f32>,
        rects: Vec<Rect>,
    },
    #[allow(dead_code)]
    Top {
        top_left_corner: Point<f32>,
        top_right_corner: Point<f32>,
        rects: Vec<Rect>,
    },
    #[allow(dead_code)]
    Bottom {
        bottom_left_corner: Point<f32>,
        bottom_right_corner: Point<f32>,
        rects: Vec<Rect>,
    },
}

pub type FindCompleteTimingMarksResult = Result<Complete, FindCompleteTimingMarksError>;

pub const ALLOWED_TIMING_MARK_INSET_PERCENTAGE_OF_WIDTH: UnitIntervalValue = 0.1;

#[time]
pub fn find_complete_timing_marks_from_partial_timing_marks(
    geometry: &Geometry,
    partial_timing_marks: &Partial,
    debug: &ImageDebugWriter,
) -> FindCompleteTimingMarksResult {
    let allowed_inset =
        geometry.canvas_size.width as f32 * ALLOWED_TIMING_MARK_INSET_PERCENTAGE_OF_WIDTH;

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
                rects: partial_timing_marks.top_rects.clone(),
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
                rects: partial_timing_marks.bottom_rects.clone(),
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
                rects: partial_timing_marks.left_rects.clone(),
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
                rects: partial_timing_marks.right_rects.clone(),
            },
        });
    }

    let top_line_rects = &partial_timing_marks.top_rects;
    let bottom_line_rects = &partial_timing_marks.bottom_rects;
    let left_line_rects = &partial_timing_marks.left_rects;
    let right_line_rects = &partial_timing_marks.right_rects;

    let min_left_right_timing_marks = (geometry.grid_size.height as f32 * 0.25).ceil() as usize;
    if left_line_rects.len() < min_left_right_timing_marks
        || right_line_rects.len() < min_left_right_timing_marks
    {
        return Err(FindCompleteTimingMarksError::TooFewVerticalTimingMarks {
            left_side_count: left_line_rects.len(),
            right_side_count: right_line_rects.len(),
        });
    }

    let mut horizontal_distances = vec![];
    horizontal_distances.append(&mut distances_between_rects(top_line_rects));
    horizontal_distances.append(&mut distances_between_rects(bottom_line_rects));
    horizontal_distances.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let mut vertical_distances = vec![];
    vertical_distances.append(&mut distances_between_rects(left_line_rects));
    vertical_distances.append(&mut distances_between_rects(right_line_rects));
    vertical_distances.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    if horizontal_distances.is_empty() {
        return Err(FindCompleteTimingMarksError::TooFewHorizontalTimingMarks {
            top_side_count: top_line_rects.len(),
            bottom_side_count: bottom_line_rects.len(),
        });
    }

    if vertical_distances.is_empty() {
        return Err(FindCompleteTimingMarksError::TooFewVerticalTimingMarks {
            left_side_count: left_line_rects.len(),
            right_side_count: right_line_rects.len(),
        });
    }

    let median_horizontal_distance = horizontal_distances[horizontal_distances.len() / 2];
    let median_vertical_distance = vertical_distances[vertical_distances.len() / 2];

    let complete_top_line_rects = infer_missing_timing_marks_on_segment(
        top_line_rects,
        &Segment::new(
            partial_timing_marks.top_left_corner,
            partial_timing_marks.top_right_corner,
        ),
        median_horizontal_distance,
        geometry.grid_size.width,
        geometry,
    );

    let complete_bottom_line_rects = infer_missing_timing_marks_on_segment(
        bottom_line_rects,
        &Segment::new(
            partial_timing_marks.bottom_left_corner,
            partial_timing_marks.bottom_right_corner,
        ),
        median_horizontal_distance,
        geometry.grid_size.width,
        geometry,
    );

    let complete_left_line_rects = infer_missing_timing_marks_on_segment(
        left_line_rects,
        &Segment::new(
            partial_timing_marks.top_left_corner,
            partial_timing_marks.bottom_left_corner,
        ),
        median_vertical_distance,
        geometry.grid_size.height,
        geometry,
    );

    let complete_right_line_rects = infer_missing_timing_marks_on_segment(
        right_line_rects,
        &Segment::new(
            partial_timing_marks.top_right_corner,
            partial_timing_marks.bottom_right_corner,
        ),
        median_vertical_distance,
        geometry.grid_size.height,
        geometry,
    );

    if complete_top_line_rects.len() != complete_bottom_line_rects.len()
        || complete_left_line_rects.len() != complete_right_line_rects.len()
    {
        return Err(
            FindCompleteTimingMarksError::MismatchedInferredTimingMarks {
                left_side_count: complete_left_line_rects.len(),
                right_side_count: complete_right_line_rects.len(),
                top_side_count: complete_top_line_rects.len(),
                bottom_side_count: complete_bottom_line_rects.len(),
            },
        );
    }

    let (
        Some(top_left_rect),
        Some(top_right_rect),
        Some(bottom_left_rect),
        Some(bottom_right_rect),
    ) = (
        complete_top_line_rects.first().copied(),
        complete_top_line_rects.last().copied(),
        complete_bottom_line_rects.first().copied(),
        complete_bottom_line_rects.last().copied(),
    )
    else {
        return Err(FindCompleteTimingMarksError::MissingCorners);
    };

    let complete_timing_marks = Complete {
        geometry: *geometry,
        top_rects: complete_top_line_rects,
        bottom_rects: complete_bottom_line_rects,
        left_rects: complete_left_line_rects,
        right_rects: complete_right_line_rects,
        top_left_corner: partial_timing_marks.top_left_corner,
        top_right_corner: partial_timing_marks.top_right_corner,
        bottom_left_corner: partial_timing_marks.bottom_left_corner,
        bottom_right_corner: partial_timing_marks.bottom_right_corner,
        top_left_rect,
        top_right_rect,
        bottom_left_rect,
        bottom_right_rect,
    };

    debug.write("complete_timing_marks", |canvas| {
        debug::draw_timing_mark_debug_image_mut(
            canvas,
            geometry,
            &complete_timing_marks.clone().into(),
        );
    });

    Ok(complete_timing_marks)
}

/// Infers missing timing marks along a segment. It's expected that there are
/// timing marks centered at the start and end of the segment and that the
/// distance between them is roughly `expected_distance`. There should be
/// exactly `expected_count` timing marks along the segment.
fn infer_missing_timing_marks_on_segment(
    timing_marks: &[Rect],
    segment: &Segment,
    expected_distance: f32,
    expected_count: GridUnit,
    geometry: &Geometry,
) -> Vec<Rect> {
    if timing_marks.is_empty() {
        return vec![];
    }

    let mut inferred_timing_marks = vec![];
    let mut current_timing_mark_center = segment.start;
    let next_point_vector = segment.with_length(expected_distance).vector();
    let maximum_error = expected_distance / 2.0;
    while inferred_timing_marks.len() < expected_count as usize {
        // find the closest existing timing mark
        let closest_rect = timing_marks
            .iter()
            .min_by(|a, b| {
                let a_distance = Segment::new(a.center(), current_timing_mark_center).length();
                let b_distance = Segment::new(b.center(), current_timing_mark_center).length();
                a_distance
                    .partial_cmp(&b_distance)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .map_or_else(
                || unreachable!("there will always be a closest timing mark"),
                |rect| rect,
            );

        // if the closest timing mark is close enough, use it
        if Segment::new(closest_rect.center(), current_timing_mark_center).length() <= maximum_error
        {
            inferred_timing_marks.push(*closest_rect);
            current_timing_mark_center = closest_rect.center() + next_point_vector;
        } else {
            // otherwise, we need to fill in a point
            inferred_timing_marks.push(Rect::new(
                (current_timing_mark_center.x - geometry.timing_mark_size.width / 2.0).round()
                    as PixelPosition,
                (current_timing_mark_center.y - geometry.timing_mark_size.height / 2.0).round()
                    as PixelPosition,
                geometry.timing_mark_size.width.round() as u32,
                geometry.timing_mark_size.height.round() as u32,
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
        0.75
    };
    let min_timing_mark_height_multiplier = if is_near_top_or_bottom_edge {
        0.20
    } else {
        0.75
    };

    let min_timing_mark_width =
        (timing_mark_size.width * min_timing_mark_width_multiplier).floor() as u32;
    let min_timing_mark_height =
        (timing_mark_size.height * min_timing_mark_height_multiplier).floor() as u32;
    let max_timing_mark_width = (timing_mark_size.width * 1.50).round() as u32;
    let max_timing_mark_height = (timing_mark_size.height * 1.50).round() as u32;

    rect.width() >= min_timing_mark_width
        && rect.width() <= max_timing_mark_width
        && rect.height() >= min_timing_mark_height
        && rect.height() <= max_timing_mark_height
}

pub fn detect_orientation_from_grid(grid: &TimingMarkGrid) -> Orientation {
    // For Accuvote-style ballots, assume that we will find most of
    // the timing marks and that there will be more missing on the bottom than
    // the top. If that's not the case, then we'll need to rotate the image.
    if grid.partial_timing_marks.top_rects.len() >= grid.partial_timing_marks.bottom_rects.len() {
        Orientation::Portrait
    } else {
        Orientation::PortraitReversed
    }
}

/// Gets all the distances between adjacent rects in a list of rects.
pub fn distances_between_rects(rects: &[Rect]) -> Vec<f32> {
    let mut distances = rects
        .windows(2)
        .map(|w| Segment::new(w[1].center(), w[0].center()).length())
        .collect::<Vec<_>>();
    distances.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
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
            rotate_complete_timing_marks(&Size { width, height }, grid.complete_timing_marks),
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
    image: &GrayImage,
    debug: &mut ImageDebugWriter,
) -> interpret::Result<(TimingMarkGrid, GrayImage, BallotPageTimingMarkMetadata)> {
    let orientation = detect_orientation_from_grid(&grid);
    let (normalized_grid, normalized_image) =
        normalize_orientation(geometry, grid, image, orientation, debug);
    let metadata = BallotPageTimingMarkMetadata::decode_from_timing_marks(
        geometry,
        &find_actual_bottom_marks(
            &normalized_grid.complete_timing_marks,
            &normalized_image,
            otsu_level(&normalized_image),
        ),
    )
    .map_err(|error| Error::InvalidTimingMarkMetadata {
        label: label.to_string(),
        error,
    })?;
    Ok((normalized_grid, normalized_image, metadata))
}
