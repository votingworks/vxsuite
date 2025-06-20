use std::{
    fmt::Display,
    ops::{Add, AddAssign, Sub},
};

use serde::{Deserialize, Serialize};

use crate::f32_newtype::f32_newtype;

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

macro_rules! impl_angle {
    ($name:ident, $pi:expr, $suffix:expr) => {
        impl $name {
            pub const PI: Self = Self($pi);

            /// Normalize angle to [0, PI). This means that two angles that are
            /// equivalent modulo PI will be equal, e.g. 90° and 270°, even though
            /// they are not equal in the mathematical sense.
            pub fn normalize(self) -> Self {
                if self.is_infinite() || self.is_nan() {
                    return self;
                }

                let mut angle = self % (Self::PI * 2.0);
                while angle < Self(0.0) {
                    angle += Self::PI;
                }
                while angle >= Self::PI {
                    angle -= Self::PI;
                }
                angle
            }
        }

        impl ::std::fmt::Display for $name {
            fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
                write!(
                    f,
                    "{:.precision$}{suffix}",
                    self.0,
                    precision = f.precision().unwrap_or(2),
                    suffix = $suffix
                )
            }
        }
    };
}

f32_newtype!(Radians);
impl_angle!(Radians, std::f32::consts::PI, "rad");

impl Radians {
    pub const fn to_degrees(self) -> Degrees {
        Degrees::new(self.0.to_degrees())
    }
}

impl From<Degrees> for Radians {
    fn from(degrees: Degrees) -> Self {
        degrees.to_radians()
    }
}

f32_newtype!(Degrees);
impl_angle!(Degrees, 180.0, "°");

impl Degrees {
    pub const fn to_radians(self) -> Radians {
        Radians::new(self.0.to_radians())
    }
}

impl From<Radians> for Degrees {
    fn from(radians: Radians) -> Self {
        radians.to_degrees()
    }
}

#[must_use]
pub enum Direction {
    Up,
    Down,
    Left,
    Right,
}

f32_newtype!(Inch);

impl Inch {
    #[must_use]
    pub fn pixels(self, ppi: u32) -> SubPixelUnit {
        self.0 * ppi as SubPixelUnit
    }
}

impl Display for Inch {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} in", self.0)
    }
}

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

impl<T: Sub<Output = T> + Default> Point<T> {
    pub fn zero() -> Self {
        Self::new(T::default(), T::default())
    }
}

impl Point<f32> {
    #[must_use]
    pub fn distance_to(&self, other: &Self) -> f32 {
        (self.x - other.x).hypot(self.y - other.y)
    }

    pub fn major_direction(&self) -> Direction {
        let dx = self.x.abs();
        let dy = self.y.abs();
        if dx > dy {
            if self.x > 0.0 {
                Direction::Right
            } else {
                Direction::Left
            }
        } else if self.y > 0.0 {
            Direction::Down
        } else {
            Direction::Up
        }
    }
}

impl Point<PixelPosition> {
    pub const fn to_f32(self) -> Point<f32> {
        Point::new(self.x as f32, self.y as f32)
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

impl From<Point<SubPixelUnit>> for (SubPixelUnit, SubPixelUnit) {
    fn from(value: Point<SubPixelUnit>) -> Self {
        (value.x, value.y)
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

    pub const fn zero() -> Self {
        Self::new(0, 0, 0, 0)
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

    pub const fn bottom_left(&self) -> Point<PixelPosition> {
        Point::new(self.left, self.bottom())
    }

    pub const fn top_right(&self) -> Point<PixelPosition> {
        Point::new(self.right(), self.top)
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
    pub const fn contains(&self, point: Point<PixelPosition>) -> bool {
        point.x >= self.left
            && point.x <= self.right()
            && point.y >= self.top
            && point.y <= self.bottom()
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

    #[must_use]
    pub fn overlaps(&self, other: &Self) -> bool {
        let left = self.left.max(other.left);
        let top = self.top.max(other.top);
        let right = self.right().min(other.right());
        let bottom = self.bottom().min(other.bottom());

        left <= right && top <= bottom
    }

    // Returns the smallest rectangle that contains both `self` and `other`.
    pub fn union(&self, other: &Self) -> Self {
        if self.width == 0 || self.height == 0 {
            return *other;
        }

        if other.width == 0 || other.height == 0 {
            return *self;
        }

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

    /// Determines whether a line segment intersects a rectangle.
    #[must_use]
    pub fn intersects_line(&self, line: &Segment) -> bool {
        let top_left = Point::new(self.left() as SubPixelUnit, self.top() as SubPixelUnit);
        let top_right = Point::new(self.right() as SubPixelUnit, self.top() as SubPixelUnit);
        let bottom_left = Point::new(self.left() as SubPixelUnit, self.bottom() as SubPixelUnit);
        let bottom_right = Point::new(self.right() as SubPixelUnit, self.bottom() as SubPixelUnit);
        let top_line = Segment::new(top_left, top_right);
        let right_line = Segment::new(top_right, bottom_right);
        let bottom_line = Segment::new(bottom_left, bottom_right);
        let left_line = Segment::new(top_left, bottom_left);

        top_line.intersects(line)
            || bottom_line.intersects(line)
            || left_line.intersects(line)
            || right_line.intersects(line)
    }
}

#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize)]
#[must_use]
pub struct Size<T> {
    pub width: T,
    pub height: T,
}

impl From<(u32, u32)> for Size<u32> {
    fn from((width, height): (u32, u32)) -> Self {
        Self { width, height }
    }
}

/// A line segment from `start` to `end`.
#[must_use]
#[derive(Debug, Clone, PartialEq)]
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
    /// Computes the angle of the segment in radians.
    pub fn angle(&self) -> Radians {
        let dx = self.end.x - self.start.x;
        let dy = self.end.y - self.start.y;
        Radians::new(dy.atan2(dx))
    }

    /// Determines whether the two line segments intersect.
    #[must_use]
    pub fn intersects(&self, other: &Self) -> bool {
        self.intersection_point(other, IntersectionBounds::Bounded)
            .is_some()
    }

    /// Determines an intersection point of two line segments. If `bounded` is set
    /// to `true`, the intersection point must be within the bounds of both
    /// segments. If `bounded` is set to `false`, the intersection point may be
    /// outside the bounds of either segment.
    #[must_use]
    pub fn intersection_point(
        &self,
        other: &Self,
        bounds: IntersectionBounds,
    ) -> Option<Point<SubPixelUnit>> {
        let p1 = self.start;
        let p2 = self.end;
        let p3 = other.start;
        let p4 = other.end;
        let d = (p4.y - p3.y).mul_add(p2.x - p1.x, -(p4.x - p3.x) * (p2.y - p1.y));
        if d == 0.0 {
            return None;
        }
        let u_a = (p4.x - p3.x).mul_add(p1.y - p3.y, -(p4.y - p3.y) * (p1.x - p3.x)) / d;
        let u_b = (p2.x - p1.x).mul_add(p1.y - p3.y, -(p2.y - p1.y) * (p1.x - p3.x)) / d;
        if matches!(bounds, IntersectionBounds::Unbounded)
            || ((0.0..=1.0).contains(&u_a) && (0.0..=1.0).contains(&u_b))
        {
            return Some(Point::new(
                u_a.mul_add(p2.x - p1.x, p1.x),
                u_a.mul_add(p2.y - p1.y, p1.y),
            ));
        }
        None
    }

    pub const fn reversed(&self) -> Self {
        Self::new(self.end, self.start)
    }

    pub fn major_direction(&self) -> Direction {
        let dx = (self.start.x - self.end.x).abs();
        let dy = (self.start.y - self.end.y).abs();
        if dx > dy {
            if self.start.x < self.end.x {
                Direction::Right
            } else {
                Direction::Left
            }
        } else if self.start.y < self.end.y {
            Direction::Down
        } else {
            Direction::Up
        }
    }

    #[must_use]
    pub fn extend_within_rect(&self, rect: Rect) -> Option<Self> {
        let left = rect.left();
        let top = rect.top();
        let right = rect.right();
        let bottom = rect.bottom();
        let left_segment = Self::new(
            Point::new(left as f32, top as f32),
            Point::new(left as f32, bottom as f32),
        );
        let right_segment = Self::new(
            Point::new(right as f32, top as f32),
            Point::new(right as f32, bottom as f32),
        );
        let top_segment = Self::new(
            Point::new(left as f32, top as f32),
            Point::new(right as f32, top as f32),
        );
        let bottom_segment = Self::new(
            Point::new(left as f32, bottom as f32),
            Point::new(right as f32, bottom as f32),
        );

        let left_intersection =
            left_segment.intersection_point(self, IntersectionBounds::Unbounded);
        let right_intersection =
            right_segment.intersection_point(self, IntersectionBounds::Unbounded);
        let top_intersection = top_segment.intersection_point(self, IntersectionBounds::Unbounded);
        let bottom_intersection =
            bottom_segment.intersection_point(self, IntersectionBounds::Unbounded);

        if let (Some(left_intersection), Some(right_intersection)) =
            (left_intersection, right_intersection)
        {
            if left_intersection.y >= rect.top() as f32
                && left_intersection.y <= rect.bottom() as f32
                && right_intersection.y >= rect.top() as f32
                && right_intersection.y <= rect.bottom() as f32
            {
                return Some(Self::new(left_intersection, right_intersection));
            }
        }

        if let (Some(top_intersection), Some(bottom_intersection)) =
            (top_intersection, bottom_intersection)
        {
            if top_intersection.x >= rect.left() as f32
                && top_intersection.x <= rect.right() as f32
                && bottom_intersection.x >= rect.left() as f32
                && bottom_intersection.x <= rect.right() as f32
            {
                return Some(Self::new(top_intersection, bottom_intersection));
            }
        }

        if let (Some(left_intersection), Some(top_intersection)) =
            (left_intersection, top_intersection)
        {
            if left_intersection.y >= rect.top() as f32
                && left_intersection.y <= rect.bottom() as f32
                && top_intersection.x >= rect.left() as f32
                && top_intersection.x <= rect.right() as f32
            {
                return Some(Self::new(left_intersection, top_intersection));
            }
        }

        if let (Some(left_intersection), Some(bottom_intersection)) =
            (left_intersection, bottom_intersection)
        {
            if left_intersection.y >= rect.top() as f32
                && left_intersection.y <= rect.bottom() as f32
                && bottom_intersection.x >= rect.left() as f32
                && bottom_intersection.x <= rect.right() as f32
            {
                return Some(Self::new(left_intersection, bottom_intersection));
            }
        }

        if let (Some(right_intersection), Some(top_intersection)) =
            (right_intersection, top_intersection)
        {
            if right_intersection.y >= rect.top() as f32
                && right_intersection.y <= rect.bottom() as f32
                && top_intersection.x >= rect.left() as f32
                && top_intersection.x <= rect.right() as f32
            {
                return Some(Self::new(right_intersection, top_intersection));
            }
        }

        if let (Some(right_intersection), Some(bottom_intersection)) =
            (right_intersection, bottom_intersection)
        {
            if right_intersection.y >= rect.top() as f32
                && right_intersection.y <= rect.bottom() as f32
                && bottom_intersection.x >= rect.left() as f32
                && bottom_intersection.x <= rect.right() as f32
            {
                return Some(Self::new(right_intersection, bottom_intersection));
            }
        }

        None
    }
}

#[derive(Debug, Clone, Copy)]
pub enum IntersectionBounds {
    Unbounded,
    Bounded,
}

/// Returns the angle between two angles in radians.
pub fn angle_diff(a: Radians, b: Radians) -> Radians {
    let diff = (a - b).normalize();
    Radians::min(diff, Radians::PI - diff)
}

/// A quadrilateral defined by four points, i.e. a four-sided polygon.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Quadrilateral {
    pub top_left: Point<SubPixelUnit>,
    pub top_right: Point<SubPixelUnit>,
    pub bottom_left: Point<SubPixelUnit>,
    pub bottom_right: Point<SubPixelUnit>,
}

impl Quadrilateral {
    pub fn bounds(&self) -> Rect {
        let top_left = Point::new(
            f32::min(self.top_left.x, self.bottom_left.x).floor() as PixelPosition,
            f32::min(self.top_left.y, self.top_right.y).floor() as PixelPosition,
        );
        let bottom_right = Point::new(
            f32::max(self.top_right.x, self.bottom_right.x).ceil() as PixelPosition,
            f32::max(self.bottom_left.y, self.bottom_right.y).ceil() as PixelPosition,
        );

        Rect::from_points(top_left, bottom_right)
    }

    #[must_use]
    pub fn contains_subpixel(&self, x: f32, y: f32) -> bool {
        let ab = (self.top_right.x - self.top_left.x).mul_add(
            y - self.top_left.y,
            -((self.top_right.y - self.top_left.y) * (x - self.top_left.x)),
        );
        let bc = (self.bottom_right.x - self.top_right.x).mul_add(
            y - self.top_right.y,
            -((self.bottom_right.y - self.top_right.y) * (x - self.top_right.x)),
        );
        let cd = (self.bottom_left.x - self.bottom_right.x).mul_add(
            y - self.bottom_right.y,
            -((self.bottom_left.y - self.bottom_right.y) * (x - self.bottom_right.x)),
        );
        let da = (self.top_left.x - self.bottom_left.x).mul_add(
            y - self.bottom_left.y,
            -((self.top_left.y - self.bottom_left.y) * (x - self.bottom_left.x)),
        );

        ab >= 0.0 && bc >= 0.0 && cd >= 0.0 && da >= 0.0
            || ab <= 0.0 && bc <= 0.0 && cd <= 0.0 && da <= 0.0
    }
}

#[cfg(test)]
mod normalize_angle_tests {
    use std::{f32::consts::PI, ops::Range};

    use proptest::prelude::*;

    use super::Radians;

    const ANGLE_RANGE: Range<f32> = -(10.0 * PI)..(10.0 * PI);

    macro_rules! assert_nearly_eq {
        ($a:expr, $b:expr) => {
            #[allow(clippy::suboptimal_flops)]
            {
                assert!(
                    ($a - $b).abs().0 < 0.0001,
                    "assertion failed: `({} - {}) < 0.0001`",
                    $a,
                    $b
                );
            }
        };
    }

    #[test]
    fn test_normalize_angle() {
        assert_nearly_eq!(Radians::new(0.0).normalize(), Radians::new(0.0));
        assert_nearly_eq!(Radians::new(PI).normalize(), Radians::new(0.0));
        assert_nearly_eq!(Radians::new(2.0 * PI).normalize(), Radians::new(0.0));
        assert_nearly_eq!(Radians::new(1.5 * PI).normalize(), Radians::new(0.5 * PI));
    }

    #[test]
    fn test_normalize_infinity_eq() {
        assert_eq!(Radians::INFINITY.normalize(), Radians::INFINITY);
        assert_eq!(Radians::NEG_INFINITY.normalize(), Radians::NEG_INFINITY);
    }

    proptest! {
        #[test]
        fn prop_normalize_angle(angle in ANGLE_RANGE) {
            let normalized = Radians::new(angle).normalize();
            assert!((0.0..PI).contains(&normalized.0));
        }

        #[test]
        fn prop_normalize_angle_is_idempotent(angle in ANGLE_RANGE) {
            let normalized = Radians::new(angle).normalize();
            let normalized_again = (normalized).normalize();
            assert_nearly_eq!(normalized, normalized_again);
        }

        #[test]
        fn prop_normalize_angle_is_equivalent(angle in ANGLE_RANGE) {
            let normalized = Radians::new(angle).normalize();
            let equivalent = Radians::new(angle + PI).normalize();
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

#[cfg(test)]
mod test_quadrilateral {
    use super::*;

    #[test]
    fn test_quadrilateral_bounds() {
        let quad = Quadrilateral {
            top_left: Point::new(0.0, 0.0),
            top_right: Point::new(10.0, 0.0),
            bottom_left: Point::new(0.0, 10.0),
            bottom_right: Point::new(10.0, 10.0),
        };
        let bounds = quad.bounds();
        assert_eq!(bounds.left(), 0);
        assert_eq!(bounds.top(), 0);
        assert_eq!(bounds.right(), 10);
        assert_eq!(bounds.bottom(), 10);
    }

    #[test]
    fn test_quadrilateral_contains_subpixel() {
        let quad = Quadrilateral {
            top_left: Point::new(0.0, 0.0),
            top_right: Point::new(10.0, 0.0),
            bottom_left: Point::new(0.0, 10.0),
            bottom_right: Point::new(10.0, 10.0),
        };
        assert!(quad.contains_subpixel(5.0, 5.0));
        assert!(!quad.contains_subpixel(15.0, 5.0));
        assert!(!quad.contains_subpixel(5.0, 15.0));
        assert!(!quad.contains_subpixel(-5.0, 5.0));
        assert!(!quad.contains_subpixel(5.0, -5.0));
    }

    #[test]
    fn test_rect_union() {
        assert_eq!(
            Rect::new(0, 0, 1, 1).union(&Rect::new(1, 1, 1, 1)),
            Rect::new(0, 0, 2, 2)
        );
        assert_eq!(
            Rect::zero().union(&Rect::new(1, 1, 1, 1)),
            Rect::new(1, 1, 1, 1)
        );
    }
}
