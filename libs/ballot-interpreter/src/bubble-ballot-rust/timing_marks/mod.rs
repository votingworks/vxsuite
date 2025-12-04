use std::str::FromStr;

use itertools::Itertools;
use serde::Serialize;
use types_rs::{
    bubble_ballot,
    geometry::{GridUnit, PixelPosition, Point, Rect, Segment, Size, SubGridUnit, SubPixelUnit},
};

use crate::ballot_card::Geometry;
use crate::scoring::UnitIntervalScore;
use crate::timing_marks::scoring::CandidateTimingMark;

pub mod contours;
pub mod corners;
pub mod scoring;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimingMarks {
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

impl TimingMarks {
    pub fn rotate180(&mut self, image_size: Size<u32>) {
        let rotator = Rotator180::new(image_size);

        let (top_left_corner, top_right_corner, bottom_left_corner, bottom_right_corner) = (
            rotator.rotate_point_around_subpixel_position(self.bottom_right_corner),
            rotator.rotate_point_around_subpixel_position(self.bottom_left_corner),
            rotator.rotate_point_around_subpixel_position(self.top_right_corner),
            rotator.rotate_point_around_subpixel_position(self.top_left_corner),
        );

        let (top_left_mark, top_right_mark, bottom_left_mark, bottom_right_mark) = (
            rotator.rotate_candidate_timing_mark(&self.bottom_right_mark),
            rotator.rotate_candidate_timing_mark(&self.bottom_left_mark),
            rotator.rotate_candidate_timing_mark(&self.top_right_mark),
            rotator.rotate_candidate_timing_mark(&self.top_left_mark),
        );

        let mut rotated_top_marks: Vec<CandidateTimingMark> = self
            .top_marks
            .iter()
            .map(|m| rotator.rotate_candidate_timing_mark(m))
            .collect();
        let mut rotated_bottom_marks: Vec<CandidateTimingMark> = self
            .bottom_marks
            .iter()
            .map(|m| rotator.rotate_candidate_timing_mark(m))
            .collect();
        let mut rotated_left_marks: Vec<CandidateTimingMark> = self
            .left_marks
            .iter()
            .map(|m| rotator.rotate_candidate_timing_mark(m))
            .collect();
        let mut rotated_right_marks: Vec<CandidateTimingMark> = self
            .right_marks
            .iter()
            .map(|m| rotator.rotate_candidate_timing_mark(m))
            .collect();

        rotated_bottom_marks.sort_by_key(|m| m.rect().left());
        rotated_top_marks.sort_by_key(|m| m.rect().left());
        rotated_left_marks.sort_by_key(|m| m.rect().top());
        rotated_right_marks.sort_by_key(|m| m.rect().top());

        self.top_left_corner = top_left_corner;
        self.top_right_corner = top_right_corner;
        self.bottom_left_corner = bottom_left_corner;
        self.bottom_right_corner = bottom_right_corner;
        self.top_left_mark = top_left_mark;
        self.top_right_mark = top_right_mark;
        self.bottom_left_mark = bottom_left_mark;
        self.bottom_right_mark = bottom_right_mark;
        self.top_marks = rotated_bottom_marks;
        self.bottom_marks = rotated_top_marks;
        self.left_marks = rotated_right_marks;
        self.right_marks = rotated_left_marks;
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
    /// 2. Interpolating horizontally between the left/right timing mark
    ///    positions based on the given column index.
    #[must_use]
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
        let left_before = self.left_marks.get(row_before as usize)?;
        let right_before = self.right_marks.get(row_before as usize)?;
        let left_after = self.left_marks.get(row_after as usize)?;
        let right_after = self.right_marks.get(row_after as usize)?;
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

        let horizontal_segment = Segment::new(left.center(), right.center());
        let distance_percentage = column / (self.geometry.grid_size.width - 1) as f32;
        let Segment {
            start: _,
            end: expected_timing_mark_center,
        } = horizontal_segment.with_length(horizontal_segment.length() * distance_percentage);
        Some(expected_timing_mark_center)
    }

    /// Computes a ballot page scale by examining the timing marks along one of
    /// the borders, taking the median value of the distance from each timing
    /// mark's center to the center of its neighbors.
    ///
    /// We don't try to compute by averaging multiple borders together because
    /// two of the four are in the direction of scan for a roller-based scanner
    /// and there may be stretching in that direction as a result, leading to
    /// unreliable scale values for the purposes of detecting mis-scaled
    /// ballots.
    ///
    /// ```text
    ///       top (or bottom) center-to-center distance
    ///        ┌───┴───┐
    ///      █████   █████   █████   █████   …
    ///
    ///      █████ ┐
    ///            ├ left (or right) center-to-center distance
    ///      █████ ┘
    ///
    ///      █████
    ///
    ///      …
    /// ```
    ///
    /// Note that, for now, we assume that the direction of scan is vertical
    /// from top to bottom or bottom to top. This function does not bake in that
    /// assumption, but its caller likely does.
    #[must_use]
    pub fn compute_scale_based_on_border(&self, border: Border) -> Option<UnitIntervalScore> {
        let marks = match border {
            Border::Top => &self.top_marks,
            Border::Bottom => &self.bottom_marks,
            Border::Left => &self.left_marks,
            Border::Right => &self.right_marks,
        };

        let actual_mark_period = median(
            marks
                .iter()
                .tuple_windows()
                .map(|(a, b)| a.rect().center().distance_to(&b.rect().center())),
        )?;
        let expected_mark_period = match border {
            Border::Top | Border::Bottom => self
                .geometry
                .horizontal_timing_mark_center_to_center_pixel_distance(),
            Border::Left | Border::Right => self
                .geometry
                .vertical_timing_mark_center_to_center_pixel_distance(),
        };

        Some(UnitIntervalScore(actual_mark_period / expected_mark_period))
    }

    /// Computes a ballot page scale by examining the distances between
    /// corresponding timing marks along horizontal or vertical borders,
    /// taking the median value of the distance from the center of one
    /// mark to the center of the other.
    ///
    /// ```text
    /// Horizontal:             Vertical:
    /// ▃ ▃ ▃ ▃ ▃ ▃ ▃ ▃ ▃ ▃     ▃ ▃ ▃ ▃ ▃ ▃ ▃ ▃ ▃ ▃
    /// ▃ ←─────────────→ ▃     ▃ ↑ ↑ ↑ ↑ ↑ ↑ ↑ ↑ ▃
    /// ▃ ←─────────────→ ▃     ▃ │ │ │ │ │ │ │ │ ▃
    /// ▃ ←─────────────→ ▃     ▃ │ │ │ │ │ │ │ │ ▃
    /// ▃ ←─────────────→ ▃     ▃ │ │ │ │ │ │ │ │ ▃
    /// ▃ ←─────────────→ ▃     ▃ │ │ │ │ │ │ │ │ ▃
    /// ▃ ←─────────────→ ▃     ▃ │ │ │ │ │ │ │ │ ▃
    /// ▃ ←─────────────→ ▃     ▃ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ▃
    /// ▃ ▃ ▃ ▃ ▃ ▃ ▃ ▃ ▃ ▃     ▃ ▃ ▃ ▃ ▃ ▃ ▃ ▃ ▃ ▃
    /// ```
    ///
    /// We should only use the axis that is perpendicular to the direction of
    /// scanning as there may be stretching in the direction of scanning,
    /// leading to unreliable scale values for the purposes of detecting
    /// mis-scaled ballots.
    ///
    /// Note that, for now, we assume that the direction of scan is vertical
    /// from top to bottom or bottom to top. This function does not bake in that
    /// assumption, but its caller likely does.
    #[must_use]
    pub fn compute_scale_based_on_axis(&self, axis: BorderAxis) -> Option<UnitIntervalScore> {
        let marks = match axis {
            BorderAxis::Horizontal => self.left_marks.iter().zip(&self.right_marks),
            BorderAxis::Vertical => self.top_marks.iter().zip(&self.bottom_marks),
        };

        let actual_border_to_border_distance =
            median(marks.map(|(a, b)| a.rect().center().distance_to(&b.rect().center())))?;
        let expected_border_to_border_distance = match axis {
            BorderAxis::Horizontal => self
                .geometry
                .left_to_right_center_to_center_pixel_distance(),
            BorderAxis::Vertical => self
                .geometry
                .top_to_bottom_center_to_center_pixel_distance(),
        };

        Some(UnitIntervalScore(
            actual_border_to_border_distance / expected_border_to_border_distance,
        ))
    }
}

fn median(values: impl IntoIterator<Item = SubPixelUnit>) -> Option<SubPixelUnit> {
    let values = values.into_iter().sorted_by(f32::total_cmp).collect_vec();

    if values.is_empty() {
        None
    } else if values.len() % 2 == 0 {
        let left = values[values.len() / 2 - 1];
        let right = values[values.len() / 2];
        Some(left.midpoint(right))
    } else {
        Some(values[(values.len() - 1) / 2])
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "source", rename_all = "kebab-case")]
pub enum BallotPageMetadata {
    QrCode(bubble_ballot::Metadata),
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

impl FromStr for Border {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "left" => Ok(Self::Left),
            "right" => Ok(Self::Right),
            "top" => Ok(Self::Top),
            "bottom" => Ok(Self::Bottom),
            _ => Err(format!("Invalid border: {s}")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BorderAxis {
    Horizontal,
    Vertical,
}

impl FromStr for BorderAxis {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "horizontal" => Ok(Self::Horizontal),
            "vertical" => Ok(Self::Vertical),
            _ => Err(format!("Invalid axis: {s}")),
        }
    }
}

/// Determines whether a rect could be a timing mark based on its rect.
#[must_use]
pub fn rect_could_be_timing_mark(geometry: &Geometry, rect: &Rect) -> bool {
    const MIN_RATIO: f32 = 0.75;
    const MAX_RATIO: f32 = 1.5;

    let timing_mark_width = geometry.timing_mark_width_pixels();
    let timing_mark_height = geometry.timing_mark_height_pixels();

    let min_timing_mark_width = (timing_mark_width * MIN_RATIO).floor() as u32;
    let min_timing_mark_height = (timing_mark_height * MIN_RATIO).floor() as u32;

    // Skew/rotation can cause the height of timing marks to be slightly larger
    // than expected, so allow for a small amount of extra height when
    // determining if a rect could be a timing mark. This applies to width as
    // well, but to a lesser extent.
    let max_timing_mark_width = (timing_mark_width * MAX_RATIO).round() as u32;
    let max_timing_mark_height = (timing_mark_height * MAX_RATIO).round() as u32;

    rect.width() >= min_timing_mark_width
        && rect.width() <= max_timing_mark_width
        && rect.height() >= min_timing_mark_height
        && rect.height() <= max_timing_mark_height
}

pub trait DefaultForGeometry {
    fn default_for_geometry(geometry: &Geometry) -> Self;
}
