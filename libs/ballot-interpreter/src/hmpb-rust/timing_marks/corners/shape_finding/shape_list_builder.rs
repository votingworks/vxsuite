use std::{borrow::Borrow, ops::RangeInclusive};

use itertools::Itertools;

use super::TimingMarkShape;

/// Builds `TimingMarkShape`s by joining vertical slices of timing marks.
pub struct ShapeListBuilder {
    shapes: Vec<TimingMarkShape>,
}

impl ShapeListBuilder {
    pub fn new() -> Self {
        Self { shapes: vec![] }
    }

    /// Adds a vertical slice that may be part of a timing mark's shape. If this
    /// slice is adjacent to any existing shapes, it is added to them.
    ///
    /// When scanning the image column-by-column we look for contiguous vertical
    /// slices of black pixels in each column. When we find such a slice that is
    /// approximately the height of a timing mark, we call this method to add it
    /// and either join it to one or more existing shapes or create a new shape
    /// for it.
    ///
    /// # Example
    ///
    /// In the portion of an image shown below, two shapes are found using a
    /// left-to-right scan of each image column.
    ///
    /// ```text
    /// ┌──────────────────────────────────────────────────────────────────────┐
    /// │                                                                      │
    /// │      x=6 slice found, new shape `S` added.                           │
    /// │      ↓                                                               │
    /// │      ↓  x=8 slice found, added to `S` as with x=7.                   │
    /// │      ↓  ↓                                                            │
    /// │      ↓  ↓      Unevenness is ok,  x=33 slice found, last one added   │
    /// │      ↓  ↓      given overlap.     to shape `S2`.                     │
    /// │      ↓  ↓      ↓                  ↓                                  │
    /// │      ↓  ↓      ████               ↓                                  │
    /// │      ██████████████  ██████████████                                  │
    /// │      ██████████████  ██████████████                                  │
    /// │      ██████████████  ██████████████                                  │
    /// │      ██████████████  ██████████████                                  │
    /// │      ██████████████  ██████████████                                  │
    /// │      ██████████████  ██████████████                                  │
    /// │      ██████████████  ██████████████                                  │
    /// │      ██████████████  ██████████████                                  │
    /// │      ██████████████  ██████████████                                  │
    /// │      ██████████████  ██████████████                                  │
    /// │      ████████        ██████████████                                  │
    /// │       ↑              ↑                                               │
    /// │       ↑              x=20 slice found, no adjacent shapes found,     │
    /// │       ↑              so new shape `S2` added for this slice.         │
    /// │       ↑                                                              │
    /// │       x=7 slice found, finds `S` to the left and adds this           │
    /// │       new slice to the shape.                                        │
    /// │                                                                      │
    /// └──────────────────────────────────────────────────────────────────────┘
    /// ```
    ///
    /// Note that this method supports scanning columns in an arbitrary order,
    /// including an essentially random order, and will stitch shapes together
    /// as they become adjacent.
    pub fn add_slice(&mut self, x: u32, y_range: RangeInclusive<u32>) {
        let shape_to_the_right = self.shapes.iter().find_position(|shape| {
            shape.x == x + 1
                && shape
                    .y_ranges
                    .first()
                    .is_some_and(|r| ranges_overlap(r, &y_range))
        });

        let shape_to_the_left = self.shapes.iter().find_position(|shape| {
            shape.x + shape.y_ranges.len() as u32 == x
                && shape
                    .y_ranges
                    .last()
                    .is_some_and(|r| ranges_overlap(r, &y_range))
        });

        match (shape_to_the_left, shape_to_the_right) {
            (Some((shape_to_the_left_index, _)), Some((shape_to_the_right_index, _))) => {
                let shape_right = self.shapes.remove(shape_to_the_right_index);
                if let Some(shape_left) = self.shapes.get_mut(shape_to_the_left_index) {
                    shape_left.y_ranges.push(y_range);
                    shape_left.y_ranges.extend(shape_right.y_ranges);
                }
            }
            (Some((shape_to_the_left_index, _)), None) => {
                if let Some(shape) = self.shapes.get_mut(shape_to_the_left_index) {
                    shape.y_ranges.push(y_range);
                }
            }
            (None, Some((shape_to_the_right_index, _))) => {
                if let Some(shape) = self.shapes.get_mut(shape_to_the_right_index) {
                    shape.x = x;
                    shape.y_ranges.insert(0, y_range);
                }
            }
            (None, None) => {
                self.shapes.push(TimingMarkShape {
                    x,
                    y_ranges: vec![y_range],
                });
            }
        }
    }

    /// Destroys the container and extracts the built list of shapes.
    pub fn into_shapes(self) -> Vec<TimingMarkShape> {
        self.shapes
    }
}

/// Allow `ShapeListBuilder` to be used as an iterator directly.
impl IntoIterator for ShapeListBuilder {
    type Item = TimingMarkShape;
    type IntoIter = std::vec::IntoIter<Self::Item>;

    fn into_iter(self) -> Self::IntoIter {
        self.into_shapes().into_iter()
    }
}

/// Determines whether the given ranges share at least one value.
fn ranges_overlap(
    a: impl Borrow<RangeInclusive<u32>>,
    b: impl Borrow<RangeInclusive<u32>>,
) -> bool {
    let a = a.borrow();
    let b = b.borrow();
    a.contains(b.start()) || a.contains(b.end()) || b.contains(a.start()) || b.contains(a.end())
}

#[cfg(test)]
mod tests {
    use proptest::proptest;

    use super::*;

    proptest! {
        #[test]
        fn test_ranges_overlap_with_self(n: u32) {
            assert!(ranges_overlap(n..=n, n..=n));
        }

        #[test]
        fn test_ranges_overlap_arguments_are_associative(a: u32, b: u32, c: u32, d: u32) {
            assert_eq!(ranges_overlap(a..=b, c..=d), ranges_overlap(c..=d, a..=b));
        }

        #[test]
        #[allow(clippy::range_minus_one)]
        fn test_ranges_do_not_overlap_with_adjacent_ranges(n: u32) {
            assert!(!ranges_overlap(n..=n, n - 1..=n - 1));
            assert!(!ranges_overlap(n..=n, n + 1..=n + 1));
        }
    }

    #[test]
    fn test_ranges_overlap_one_before_the_other() {
        assert!(!ranges_overlap(0..=2, 3..=5));
        assert!(!ranges_overlap(3..=5, 0..=2));
    }

    #[test]
    fn test_ranges_overlap_one_starts_but_does_not_end_within_the_other() {
        assert!(ranges_overlap(0..=2, 1..=3));
        assert!(ranges_overlap(1..=3, 0..=2));
    }

    #[test]
    fn test_ranges_overlap_one_is_contained_within_the_other() {
        assert!(ranges_overlap(0..=3, 1..=2));
        assert!(ranges_overlap(1..=2, 0..=3));
    }

    #[test]
    fn test_empty_state() {
        assert_eq!(ShapeListBuilder::new().into_shapes(), vec![]);
    }

    #[test]
    fn test_single_slice() {
        let mut builder = ShapeListBuilder::new();
        builder.add_slice(0, 0..=2);
        assert_eq!(
            builder.into_shapes(),
            vec![TimingMarkShape {
                x: 0,
                y_ranges: vec![0..=2]
            }]
        );
    }

    #[test]
    fn test_separate_slices() {
        let mut builder = ShapeListBuilder::new();
        builder.add_slice(0, 0..=2);
        builder.add_slice(2, 0..=2);
        assert_eq!(
            builder.into_shapes(),
            vec![
                TimingMarkShape {
                    x: 0,
                    y_ranges: vec![0..=2]
                },
                TimingMarkShape {
                    x: 2,
                    y_ranges: vec![0..=2]
                }
            ]
        );
    }

    #[test]
    fn test_multiple_slices_in_one_column() {
        let mut builder = ShapeListBuilder::new();
        builder.add_slice(0, 0..=2);
        builder.add_slice(0, 6..=9);
        assert_eq!(
            builder.into_shapes(),
            vec![
                TimingMarkShape {
                    x: 0,
                    y_ranges: vec![0..=2]
                },
                TimingMarkShape {
                    x: 0,
                    y_ranges: vec![6..=9]
                }
            ]
        );
    }

    #[test]
    fn test_join_to_left() {
        let mut builder = ShapeListBuilder::new();
        builder.add_slice(0, 0..=2);
        builder.add_slice(1, 0..=2);
        assert_eq!(
            builder.into_shapes(),
            vec![TimingMarkShape {
                x: 0,
                y_ranges: vec![0..=2, 0..=2]
            },]
        );
    }

    #[test]
    fn test_join_to_right() {
        let mut builder = ShapeListBuilder::new();
        builder.add_slice(1, 0..=2);
        builder.add_slice(0, 0..=2);
        assert_eq!(
            builder.into_shapes(),
            vec![TimingMarkShape {
                x: 0,
                y_ranges: vec![0..=2, 0..=2]
            },]
        );
    }

    #[test]
    fn test_join_both_sides() {
        let mut builder = ShapeListBuilder::new();
        builder.add_slice(0, 0..=2);
        builder.add_slice(2, 0..=2);
        builder.add_slice(1, 0..=2);
        assert_eq!(
            builder.into_shapes(),
            vec![TimingMarkShape {
                x: 0,
                y_ranges: vec![0..=2, 0..=2, 0..=2]
            },]
        );
    }
}
