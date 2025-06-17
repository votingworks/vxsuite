use std::iter::repeat;

use types_rs::geometry::Point;

use crate::timing_marks::CandidateTimingMark;

pub fn mark_distances_to_point(
    marks: &[CandidateTimingMark],
    point: Point<f32>,
) -> impl Iterator<Item = (f32, &CandidateTimingMark)> {
    marks
        .iter()
        .zip(repeat(point))
        .map(|(mark, point)| (mark.rect().center().distance_to(&point), mark))
}

/// Implements the `EdgeWise` trait for a given type.
#[macro_export]
macro_rules! impl_edgewise {
    ($name:ident, $element:ty) => {
        impl crate::timing_marks::corners::util::EdgeWise<$element> for $name {
            fn from_array([left, right, top, bottom]: [$element; 4]) -> Self {
                Self {
                    left,
                    right,
                    top,
                    bottom,
                }
            }

            fn into_array(self) -> [$element; 4] {
                [self.left, self.right, self.top, self.bottom]
            }
        }
    };
}

/// Provides methods for managing data structures with data for each of its four
/// edges, such as data about a ballot page.
pub trait EdgeWise<T>
where
    Self: Sized,
{
    fn from_array(edges: [T; 4]) -> Self;
    fn into_array(self) -> [T; 4];

    /// Map each edge in series.
    #[allow(dead_code)]
    fn map_edgewise<F, U, Output>(self, f: F) -> Output
    where
        F: Fn(T) -> U,
        Output: EdgeWise<U>,
    {
        Output::from_array(Self::into_array(self).map(f))
    }

    /// Map each edge in parallel.
    #[allow(dead_code)]
    fn par_map_edgewise<F, U, Output>(self, f: F) -> Output
    where
        F: Fn(T) -> U + Send + Sync,
        T: Send + Sync,
        U: Send + Sync,
        Output: EdgeWise<U>,
    {
        let [left, right, top, bottom] = self.into_array();
        let ((left, right), (top, bottom)) = rayon::join(
            || rayon::join(|| f(left), || f(right)),
            || rayon::join(|| f(top), || f(bottom)),
        );
        Output::from_array([left, right, top, bottom])
    }
}

/// Provide a blanket implementation for arrays of length 4.
impl<T> EdgeWise<T> for [T; 4] {
    fn from_array(edges: [T; 4]) -> Self {
        edges
    }

    fn into_array(self) -> [T; 4] {
        self
    }
}

/// Implements the `CornerWise` trait for a given type.
#[macro_export]
macro_rules! impl_cornerwise {
    ($name:ident, $element:ty) => {
        impl CornerWise<$element> for $name {
            fn from_array([top_left, top_right, bottom_left, bottom_right]: [$element; 4]) -> Self {
                Self {
                    top_left,
                    top_right,
                    bottom_left,
                    bottom_right,
                }
            }

            fn into_array(self) -> [$element; 4] {
                [
                    self.top_left,
                    self.top_right,
                    self.bottom_left,
                    self.bottom_right,
                ]
            }
        }
    };
}

/// Provides methods for managing data structures with data for each of its four
/// corners, such as data about a ballot page.
pub trait CornerWise<T>
where
    Self: Sized,
{
    fn from_array(corners: [T; 4]) -> Self;
    fn into_array(self) -> [T; 4];

    /// Map each corner in series.
    #[allow(dead_code)]
    fn map_cornerwise<F, U, Output>(self, f: F) -> Output
    where
        F: Fn(T) -> U,
        Output: CornerWise<U>,
    {
        Output::from_array(Self::into_array(self).map(f))
    }

    /// Map each corner in parallel.
    #[allow(dead_code)]
    fn par_map_cornerwise<F, U, Output>(self, f: F) -> Output
    where
        F: Fn(T) -> U + Send + Sync,
        T: Send + Sync,
        U: Send + Sync,
        Output: CornerWise<U>,
    {
        let [top_left, top_right, bottom_left, bottom_right] = self.into_array();
        let ((top_left, top_right), (bottom_left, bottom_right)) = rayon::join(
            || rayon::join(|| f(top_left), || f(top_right)),
            || rayon::join(|| f(bottom_left), || f(bottom_right)),
        );
        Output::from_array([top_left, top_right, bottom_left, bottom_right])
    }
}

/// Provide a blanket implementation for arrays of length 4.
impl<T> CornerWise<T> for [T; 4] {
    fn from_array(corners: [T; 4]) -> Self {
        corners
    }

    fn into_array(self) -> [T; 4] {
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_edgewise() {
        let edges = [1, 2, 3, 4];
        let mapped: [i32; 4] = edges.map_edgewise(|x| x * 2);
        assert_eq!(mapped, [2, 4, 6, 8]);
    }

    #[test]
    fn test_par_map_edgewise() {
        let edges = [1, 2, 3, 4];
        let mapped: [i32; 4] = edges.par_map_edgewise(|x| x * 2);
        assert_eq!(mapped, [2, 4, 6, 8]);
    }

    #[test]
    fn test_impl_edgewise() {
        struct MyEdgeWise {
            left: i32,
            right: i32,
            top: i32,
            bottom: i32,
        }

        impl_edgewise!(MyEdgeWise, i32);

        let edges = MyEdgeWise {
            left: 1,
            right: 2,
            top: 3,
            bottom: 4,
        };

        let mapped: MyEdgeWise = edges.map_edgewise(|x| x * 2);
        assert_eq!(mapped.left, 2);
        assert_eq!(mapped.right, 4);
        assert_eq!(mapped.top, 6);
        assert_eq!(mapped.bottom, 8);
    }

    #[test]
    fn test_map_cornerwise() {
        let corners = [1, 2, 3, 4];
        let mapped: [i32; 4] = corners.map_cornerwise(|x| x * 2);
        assert_eq!(mapped, [2, 4, 6, 8]);
    }

    #[test]
    fn test_par_map_cornerwise() {
        let corners = [1, 2, 3, 4];
        let mapped: [i32; 4] = corners.par_map_cornerwise(|x| x * 2);
        assert_eq!(mapped, [2, 4, 6, 8]);
    }

    #[test]
    fn test_impl_cornerwise() {
        struct MyCornerWise {
            top_left: i32,
            top_right: i32,
            bottom_left: i32,
            bottom_right: i32,
        }

        impl_cornerwise!(MyCornerWise, i32);

        let corners = MyCornerWise {
            top_left: 1,
            top_right: 2,
            bottom_left: 3,
            bottom_right: 4,
        };

        let mapped: MyCornerWise = corners.map_cornerwise(|x| x * 2);
        assert_eq!(mapped.top_left, 2);
        assert_eq!(mapped.top_right, 4);
        assert_eq!(mapped.bottom_left, 6);
        assert_eq!(mapped.bottom_right, 8);
    }
}
