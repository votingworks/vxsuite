use std::{
    f32::consts::PI,
    ops::{Add, AddAssign},
};

use rayon::prelude::{IntoParallelRefIterator, ParallelIterator};
use serde::Serialize;

#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize)]
pub struct Point<T> {
    pub x: T,
    pub y: T,
}

impl<T> Point<T> {
    pub const fn new(x: T, y: T) -> Self {
        Self { x, y }
    }
}

impl<T: Add<Output = T>> Add for Point<T> {
    type Output = Self;

    fn add(self, other: Self) -> Self {
        Self::new(self.x + other.x, self.y + other.y)
    }
}

impl<T: AddAssign + Copy> AddAssign for Point<T> {
    fn add_assign(&mut self, rhs: Self) {
        self.x += rhs.x;
        self.y += rhs.y;
    }
}

#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize)]
pub struct Rect {
    left: i32,
    top: i32,
    width: u32,
    height: u32,
}

impl Rect {
    pub const fn new(left: i32, top: i32, width: u32, height: u32) -> Self {
        Self {
            left,
            top,
            width,
            height,
        }
    }

    pub const fn left(&self) -> i32 {
        self.left
    }

    pub const fn top(&self) -> i32 {
        self.top
    }

    pub const fn width(&self) -> u32 {
        self.width
    }

    pub const fn height(&self) -> u32 {
        self.height
    }

    pub const fn right(&self) -> i32 {
        self.left + self.width as i32 - 1
    }

    pub const fn bottom(&self) -> i32 {
        self.top + self.height as i32 - 1
    }

    pub const fn offset(&self, dx: i32, dy: i32) -> Self {
        Self::new(self.left + dx, self.top + dy, self.width, self.height)
    }
}

impl From<Rect> for imageproc::rect::Rect {
    fn from(r: Rect) -> Self {
        Self::at(r.left, r.top).of_size(r.width, r.height)
    }
}

#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize)]
pub struct Size<T> {
    pub width: T,
    pub height: T,
}

/// A line segment from `start` to `end`.
pub struct Segment {
    pub start: Point<f32>,
    pub end: Point<f32>,
}

impl Segment {
    /// Creates a new line segment from `start` to `end`.
    pub const fn new(start: Point<f32>, end: Point<f32>) -> Self {
        Self { start, end }
    }

    /// Computes the length of the segment.
    pub fn length(&self) -> f32 {
        let dx = self.end.x - self.start.x;
        let dy = self.end.y - self.start.y;
        dx.hypot(dy)
    }

    /// Generates a new segment based on the given segment, but with the
    /// given length. The new segment will have the same start point as the
    /// given segment, but the end point will be the given length away from
    /// the start point. The angle of the new segment will be the same as
    /// the given segment.
    pub fn with_length(&self, length: f32) -> Self {
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
    pub fn vector(&self) -> Point<f32> {
        let dx = self.end.x - self.start.x;
        let dy = self.end.y - self.start.y;
        Point::new(dx, dy)
    }
}

/// Determines an intersection point of two line segments. If `bounded` is set
/// to `true`, the intersection point must be within the bounds of both
/// segments. If `bounded` is set to `false`, the intersection point may be
/// outside the bounds of either segment.
pub fn intersection_of_lines(
    segment1: &Segment,
    segment2: &Segment,
    bounded: bool,
) -> Option<Point<f32>> {
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
pub fn segments_intersect(line1: &Segment, line2: &Segment) -> bool {
    intersection_of_lines(line1, line2, true).is_some()
}

/// Determines whether a line segment intersects a rectangle.
pub fn rect_intersects_line(rect: &Rect, line: &Segment) -> bool {
    let top_left = Point::new(rect.left() as f32, rect.top() as f32);
    let top_right = Point::new(rect.right() as f32, rect.top() as f32);
    let bottom_left = Point::new(rect.left() as f32, rect.bottom() as f32);
    let bottom_right = Point::new(rect.right() as f32, rect.bottom() as f32);
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
pub fn angle_diff(a: f32, b: f32) -> f32 {
    let diff = normalize_angle(a - b);
    diff.min(PI - diff)
}

/// Normalize angle to [0, PI). This means that two angles that are
/// equivalent modulo PI will be equal, e.g. 90° and 270°, even though
/// they are not equal in the mathematical sense.
pub fn normalize_angle(angle: f32) -> f32 {
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

/// Generates a new segment based on the given segment, but with the
/// given length. The new segment will have the same start point as the
/// given segment, but the end point will be the given length away from
/// the start point. The angle of the new segment will be the same as
/// the given segment.
pub fn segment_with_length(segment: &Segment, length: f32) -> Segment {
    let p1 = segment.start;
    let p2 = segment.end;
    let angle = (p2.y - p1.y).atan2(p2.x - p1.x);
    let p3 = Point::new(
        length.mul_add(angle.cos(), p1.x),
        length.mul_add(angle.sin(), p1.y),
    );
    Segment::new(p1, p3)
}

/// Returns the center of a rect.
pub fn center_of_rect(rect: &Rect) -> Point<f32> {
    Point::new(
        rect.left() as f32 + (rect.right() as f32 - rect.left() as f32) / 2.0,
        rect.top() as f32 + (rect.bottom() as f32 - rect.top() as f32) / 2.0,
    )
}

#[cfg(test)]
mod normalize_angle_tests {
    use std::{f32::consts::PI, ops::Range};

    use proptest::prelude::*;

    const ANGLE_RANGE: Range<f32> = -(10.0 * PI)..(10.0 * PI);

    macro_rules! assert_nearly_eq {
        ($a:expr, $b:expr) => {
            assert!(
                ($a - $b).abs() < 0.0001,
                "assertion failed: `({} - {}) < 0.0001`",
                $a,
                $b
            );
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
    fn test_normalize_infinity() {
        assert_eq!(super::normalize_angle(f32::INFINITY), f32::INFINITY);
        assert_eq!(super::normalize_angle(f32::NEG_INFINITY), f32::NEG_INFINITY);
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
    use proptest::prelude::*;

    #[test]
    fn test_center_of_rect() {
        let rect = super::Rect::new(0, 0, 10, 10);
        let center = super::center_of_rect(&rect);
        assert_eq!(center.x, 4.5);
        assert_eq!(center.y, 4.5);
    }

    #[test]
    fn test_center_of_rect_with_odd_dimensions() {
        let rect = super::Rect::new(0, 0, 11, 11);
        let center = super::center_of_rect(&rect);
        assert_eq!(center.x, 5.0);
        assert_eq!(center.y, 5.0);
    }

    proptest! {
        #[test]
        fn prop_center_of_rect_is_in_rect(x in 0i32..100i32, y in 0i32..100i32, width in 1u32..100u32, height in 1u32..100u32) {
            let rect = super::Rect::new(x, y, width, height);
            let center = super::center_of_rect(&rect);
            prop_assert!((rect.left() as f32) <= center.x);
            prop_assert!(center.x <= (rect.right() as f32));
            prop_assert!((rect.top() as f32) <= center.y);
            prop_assert!(center.y <= (rect.bottom() as f32));
        }
    }
}

pub fn find_best_line_through_items(rects: &Vec<Rect>, angle: f32, tolerance: f32) -> Vec<Rect> {
    if rects.is_empty() {
        return vec![];
    }

    let best_rects: Vec<&Rect> = rects
        .par_iter()
        .fold_with(vec![], |best_rects, rect| {
            let mut best_rects = best_rects;

            for other_rect in rects.iter() {
                let rect_center = center_of_rect(rect);
                let other_rect_center = center_of_rect(other_rect);
                let line_angle = (other_rect_center.y - rect_center.y)
                    .atan2(other_rect_center.x - rect_center.x);

                if angle_diff(line_angle, angle) > tolerance {
                    continue;
                }

                let rects_intsersecting_line = rects
                    .iter()
                    .filter(|r| {
                        rect_intersects_line(r, &Segment::new(rect_center, other_rect_center))
                    })
                    .collect::<Vec<&Rect>>();

                if rects_intsersecting_line.len() > best_rects.len() {
                    best_rects = rects_intsersecting_line;
                }
            }

            best_rects
        })
        .reduce_with(|best_rects, other_best_rects| {
            if other_best_rects.len() > best_rects.len() {
                other_best_rects
            } else {
                best_rects
            }
        })
        .expect("at least one result because we have at least one rect");

    return best_rects.iter().map(|r| **r).collect();
}
