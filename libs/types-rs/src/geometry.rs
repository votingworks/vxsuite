use std::{
    f32::consts::PI,
    ops::{Add, AddAssign, Sub},
};

use serde::{Deserialize, Serialize};

/// A unit of length in timing mark grid, i.e. 1 `GridUnit` is the logical
/// distance from one timing mark to the next. This does not map directly to
/// pixels.
///
/// Because this is just a type alias it does not enforce that another type
/// with the same underlying representation is not used.
pub type GridUnit = i32;

/// A fractional `GridUnit`.
///
/// Because this is just a type alias it does not enforce that another type
/// with the same underlying representation is not used.
pub type SubGridUnit = f32;

/// A rectangle area defined by coordinates in the timing mark grid.
#[derive(Copy, Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SubGridRect {
    pub x: SubGridUnit,
    pub y: SubGridUnit,
    pub width: SubGridUnit,
    pub height: SubGridUnit,
}

/// An x or y coordinate in pixels.
///
/// Because this is just a type alias it does not enforce that another type
/// with the same underlying representation is not used.
pub type PixelPosition = i32;

/// A width or height in pixels.
///
/// Because this is just a type alias it does not enforce that another type
/// with the same underlying representation is not used.
pub type PixelUnit = u32;

/// A sub-pixel coordinate or distance of pixels.
///
/// Because this is just a type alias it does not enforce that another type
/// with the same underlying representation is not used.
pub type SubPixelUnit = f32;

/// Angle in radians.
///
/// Because this is just a type alias it does not enforce that another type
/// with the same underlying representation is not used.
pub type Radians = f32;

/// Fractional number of inches.
///
/// Because this is just a type alias it does not enforce that another type
/// with the same underlying representation is not used.
pub type Inch = f32;

#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize)]
#[must_use]
pub struct Point<T: Sub<Output = T>> {
    pub x: T,
    pub y: T,
}

impl<T: Sub<Output = T>> Point<T> {
    pub const fn new(x: T, y: T) -> Self {
        Self { x, y }
    }
}

impl<T: Sub<Output = T> + Add<Output = T>> Add for Point<T> {
    type Output = Self;

    fn add(self, other: Self) -> Self {
        Self::new(self.x + other.x, self.y + other.y)
    }
}

impl<T: Sub<Output = T> + AddAssign + Copy> AddAssign for Point<T> {
    fn add_assign(&mut self, rhs: Self) {
        self.x += rhs.x;
        self.y += rhs.y;
    }
}

impl Point<SubPixelUnit> {
    pub fn round(self) -> Point<PixelPosition> {
        Point::new(
            self.x.round() as PixelPosition,
            self.y.round() as PixelPosition,
        )
    }
}

/// A rectangle area of pixels within an image.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize)]
#[must_use]
pub struct Rect {
    left: PixelPosition,
    top: PixelPosition,
    width: PixelUnit,
    height: PixelUnit,
}

impl Rect {
    pub const fn new(
        left: PixelPosition,
        top: PixelPosition,
        width: PixelUnit,
        height: PixelUnit,
    ) -> Self {
        Self {
            left,
            top,
            width,
            height,
        }
    }

    pub const fn from_points(
        top_left: Point<PixelPosition>,
        bottom_right: Point<PixelPosition>,
    ) -> Self {
        Self::new(
            top_left.x,
            top_left.y,
            (bottom_right.x - top_left.x + 1) as PixelUnit,
            (bottom_right.y - top_left.y + 1) as PixelUnit,
        )
    }

    #[must_use]
    pub const fn left(&self) -> PixelPosition {
        self.left
    }

    #[must_use]
    pub const fn top(&self) -> PixelPosition {
        self.top
    }

    #[must_use]
    pub const fn width(&self) -> PixelUnit {
        self.width
    }

    #[must_use]
    pub const fn height(&self) -> PixelUnit {
        self.height
    }

    #[must_use]
    pub const fn right(&self) -> PixelPosition {
        self.left + self.width as PixelPosition - 1
    }

    #[must_use]
    pub const fn bottom(&self) -> PixelPosition {
        self.top + self.height as PixelPosition - 1
    }

    pub const fn offset(&self, dx: PixelPosition, dy: PixelPosition) -> Self {
        Self::new(self.left + dx, self.top + dy, self.width, self.height)
    }

    pub const fn top_left(&self) -> Point<PixelPosition> {
        Point::new(self.left, self.top)
    }

    pub const fn bottom_right(&self) -> Point<PixelPosition> {
        Point::new(self.right(), self.bottom())
    }

    pub fn center(&self) -> Point<SubPixelUnit> {
        Point::new(
            self.left() as SubPixelUnit
                + (self.right() as SubPixelUnit - self.left() as SubPixelUnit) / 2.0,
            self.top() as SubPixelUnit
                + (self.bottom() as SubPixelUnit - self.top() as SubPixelUnit) / 2.0,
        )
    }

    #[must_use]
    pub fn intersect(&self, other: &Self) -> Option<Self> {
        let left = self.left.max(other.left);
        let top = self.top.max(other.top);
        let right = self.right().min(other.right());
        let bottom = self.bottom().min(other.bottom());
        if left <= right && top <= bottom {
            Some(Self::new(
                left,
                top,
                (right - left + 1) as PixelUnit,
                (bottom - top + 1) as PixelUnit,
            ))
        } else {
            None
        }
    }

    // Returns the smallest rectangle that contains both `self` and `other`.
    pub fn union(&self, other: &Self) -> Self {
        let left = self.left.min(other.left);
        let top = self.top.min(other.top);
        let right = self.right().max(other.right());
        let bottom = self.bottom().max(other.bottom());
        Self::new(
            left,
            top,
            (right - left + 1) as PixelUnit,
            (bottom - top + 1) as PixelUnit,
        )
    }
}

#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize)]
#[must_use]
pub struct Size<T> {
    pub width: T,
    pub height: T,
}

/// A line segment from `start` to `end`.
#[must_use]
pub struct Segment {
    pub start: Point<SubPixelUnit>,
    pub end: Point<SubPixelUnit>,
}

impl Segment {
    /// Creates a new line segment from `start` to `end`.
    pub const fn new(start: Point<SubPixelUnit>, end: Point<SubPixelUnit>) -> Self {
        Self { start, end }
    }

    /// Computes the length of the segment.
    #[must_use]
    pub fn length(&self) -> SubPixelUnit {
        let dx = self.end.x - self.start.x;
        let dy = self.end.y - self.start.y;
        dx.hypot(dy)
    }

    /// Generates a new segment based on the given segment, but with the
    /// given length. The new segment will have the same start point as the
    /// given segment, but the end point will be the given length away from
    /// the start point. The angle of the new segment will be the same as
    /// the given segment.
    pub fn with_length(&self, length: SubPixelUnit) -> Self {
        let dx = self.end.x - self.start.x;
        let dy = self.end.y - self.start.y;
        let angle = dy.atan2(dx);
        let end = Point::new(
            length.mul_add(angle.cos(), self.start.x),
            length.mul_add(angle.sin(), self.start.y),
        );
        Self::new(self.start, end)
    }

    /// Computes a vector from the start point to the end point.
    pub fn vector(&self) -> Point<SubPixelUnit> {
        let dx = self.end.x - self.start.x;
        let dy = self.end.y - self.start.y;
        Point::new(dx, dy)
    }
}

/// Determines an intersection point of two line segments. If `bounded` is set
/// to `true`, the intersection point must be within the bounds of both
/// segments. If `bounded` is set to `false`, the intersection point may be
/// outside the bounds of either segment.
#[must_use]
pub fn intersection_of_lines(
    segment1: &Segment,
    segment2: &Segment,
    bounded: bool,
) -> Option<Point<SubPixelUnit>> {
    let p1 = segment1.start;
    let p2 = segment1.end;
    let p3 = segment2.start;
    let p4 = segment2.end;
    let d = (p4.y - p3.y).mul_add(p2.x - p1.x, -(p4.x - p3.x) * (p2.y - p1.y));
    if d == 0.0 {
        return None;
    }
    let u_a = (p4.x - p3.x).mul_add(p1.y - p3.y, -(p4.y - p3.y) * (p1.x - p3.x)) / d;
    let u_b = (p2.x - p1.x).mul_add(p1.y - p3.y, -(p2.y - p1.y) * (p1.x - p3.x)) / d;
    if !bounded || ((0.0..=1.0).contains(&u_a) && (0.0..=1.0).contains(&u_b)) {
        return Some(Point::new(
            u_a.mul_add(p2.x - p1.x, p1.x),
            u_a.mul_add(p2.y - p1.y, p1.y),
        ));
    }
    None
}

/// Determines whether the two line segments intersect.
#[must_use]
pub fn segments_intersect(line1: &Segment, line2: &Segment) -> bool {
    intersection_of_lines(line1, line2, true).is_some()
}

/// Determines whether a line segment intersects a rectangle.
#[must_use]
pub fn rect_intersects_line(rect: &Rect, line: &Segment) -> bool {
    let top_left = Point::new(rect.left() as SubPixelUnit, rect.top() as SubPixelUnit);
    let top_right = Point::new(rect.right() as SubPixelUnit, rect.top() as SubPixelUnit);
    let bottom_left = Point::new(rect.left() as SubPixelUnit, rect.bottom() as SubPixelUnit);
    let bottom_right = Point::new(rect.right() as SubPixelUnit, rect.bottom() as SubPixelUnit);
    let top_line = Segment::new(top_left, top_right);
    let right_line = Segment::new(top_right, bottom_right);
    let bottom_line = Segment::new(bottom_left, bottom_right);
    let left_line = Segment::new(top_left, bottom_left);

    segments_intersect(&top_line, line)
        || segments_intersect(&bottom_line, line)
        || segments_intersect(&left_line, line)
        || segments_intersect(&right_line, line)
}

/// Returns the angle between two angles in radians.
#[must_use]
pub fn angle_diff(a: Radians, b: Radians) -> Radians {
    let diff = normalize_angle(a - b);
    diff.min(PI - diff)
}

/// Normalize angle to [0, PI). This means that two angles that are
/// equivalent modulo PI will be equal, e.g. 90° and 270°, even though
/// they are not equal in the mathematical sense.
#[must_use]
pub fn normalize_angle(angle: Radians) -> Radians {
    if angle.is_infinite() || angle.is_nan() {
        return angle;
    }

    let mut angle = angle % (2.0 * PI);
    while angle < 0.0 {
        angle += PI;
    }
    while angle >= PI {
        angle -= PI;
    }
    angle
}

/// Finds the largest subset of rectangles such that a line can be drawn through
/// all of them for any line within the given tolerance of the given angle.
#[must_use]
pub fn find_largest_subset_intersecting_line(
    rects: &[Rect],
    angle: Radians,
    tolerance: Radians,
) -> Vec<Rect> {
    rects
        .iter()
        // Get all pairs of rectangles.
        .flat_map(|rect| rects.iter().map(move |other_rect| (rect, other_rect)))
        // Map to lists of rectangles in line with each pair.
        .filter_map(|(rect, other_rect)| {
            let line_angle = (other_rect.center().y - rect.center().y)
                .atan2(other_rect.center().x - rect.center().x);
            if angle_diff(line_angle, angle) > tolerance {
                // The line between the two rectangles is not within the
                // tolerance of the desired angle, so skip this pair.
                return None;
            }

            // Find all rectangles in line with the pair of rectangles.
            let segment = Segment::new(rect.center(), other_rect.center());
            Some(
                rects
                    .iter()
                    .filter(|r| rect_intersects_line(r, &segment))
                    .collect::<Vec<_>>(),
            )
        })
        // Pick the list of rectangles that is the longest.
        .max_by_key(Vec::len)
        .unwrap_or_default()
        // Dereference the pointers.
        .iter()
        .map(|r| **r)
        .collect()
}

#[cfg(test)]
mod normalize_angle_tests {
    use std::{f32::consts::PI, ops::Range};

    use proptest::prelude::*;

    use super::Radians;

    const ANGLE_RANGE: Range<Radians> = -(10.0 * PI)..(10.0 * PI);

    macro_rules! assert_nearly_eq {
        ($a:expr, $b:expr) => {
            #[allow(clippy::suboptimal_flops)]
            {
                assert!(
                    ($a - $b).abs() < 0.0001,
                    "assertion failed: `({} - {}) < 0.0001`",
                    $a,
                    $b
                );
            }
        };
    }

    #[test]
    fn test_normalize_angle() {
        assert_nearly_eq!(super::normalize_angle(0.0), 0.0);
        assert_nearly_eq!(super::normalize_angle(PI), 0.0);
        assert_nearly_eq!(super::normalize_angle(2.0 * PI), 0.0);
        assert_nearly_eq!(super::normalize_angle(1.5 * PI), 0.5 * PI);
    }

    #[test]
    fn test_normalize_infinity_eq() {
        assert_eq!(super::normalize_angle(Radians::INFINITY), Radians::INFINITY);
        assert_eq!(
            super::normalize_angle(Radians::NEG_INFINITY),
            Radians::NEG_INFINITY
        );
    }

    proptest! {
        #[test]
        fn prop_normalize_angle(angle in ANGLE_RANGE) {
            let normalized = super::normalize_angle(angle);
            assert!((0.0..PI).contains(&normalized));
        }

        #[test]
        fn prop_normalize_angle_is_idempotent(angle in ANGLE_RANGE) {
            let normalized = super::normalize_angle(angle);
            let normalized_again = super::normalize_angle(normalized);
            assert_nearly_eq!(normalized, normalized_again);
        }

        #[test]
        fn prop_normalize_angle_is_equivalent(angle in ANGLE_RANGE) {
            let normalized = super::normalize_angle(angle);
            let equivalent = super::normalize_angle(angle + PI);
            assert_nearly_eq!(normalized, equivalent);
        }
    }
}

#[cfg(test)]
mod normalize_center_of_rect {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn test_center_of_rect() {
        let rect = super::Rect::new(0, 0, 10, 10);
        let center = rect.center();
        assert!((center.x - 4.5).abs() < f32::EPSILON);
        assert!((center.y - 4.5).abs() < f32::EPSILON);
    }

    #[test]
    fn test_center_of_rect_with_odd_dimensions() {
        let rect = super::Rect::new(0, 0, 11, 11);
        let center = rect.center();
        assert!((center.x - 5.0).abs() < f32::EPSILON);
        assert!((center.y - 5.0).abs() < f32::EPSILON);
    }

    proptest! {
        #[test]
        fn prop_center_of_rect_is_in_rect(x in 0i32..100i32, y in 0i32..100i32, width in 1u32..100u32, height in 1u32..100u32) {
            let rect = super::Rect::new(x, y, width, height);
            let center = rect.center();
            prop_assert!((rect.left() as SubPixelUnit) <= center.x);
            prop_assert!(center.x <= (rect.right() as SubPixelUnit));
            prop_assert!((rect.top() as SubPixelUnit) <= center.y);
            prop_assert!(center.y <= (rect.bottom() as SubPixelUnit));
        }
    }
}
