use image::{imageops::rotate180, GrayImage};
use serde::Serialize;
use types_rs::geometry::{
    GridUnit, PixelPosition, PixelUnit, Point, Rect, Segment, Size, SubGridUnit, SubPixelUnit,
};

use crate::timing_marks::scoring::CandidateTimingMark;
use crate::{
    ballot_card::{Geometry, Orientation},
    debug::{draw_timing_mark_debug_image_mut, ImageDebugWriter},
    metadata::hmpb,
};

pub mod contours;
pub mod scoring;

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
    QrCode(hmpb::Metadata),
}

/// Represents a grid of timing marks and provides access to the expected
/// location of bubbles in the grid.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimingMarkGrid {
    /// The geometry of the ballot card.
    pub geometry: Geometry,

    /// Timing marks inferred from the partial timing marks.
    pub complete_timing_marks: Complete,
}

impl TimingMarkGrid {
    pub const fn new(geometry: Geometry, complete_timing_marks: Complete) -> Self {
        Self {
            geometry,
            complete_timing_marks,
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
