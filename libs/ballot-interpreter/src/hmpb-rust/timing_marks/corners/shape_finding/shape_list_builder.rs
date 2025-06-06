use std::ops::RangeInclusive;

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
    pub fn add_slice(&mut self, x: u32, y_range: RangeInclusive<u32>) {
        let shape_to_the_right = self.shapes.iter().find_position(|shape| {
            shape.x == x + 1
                && shape
                    .y_ranges
                    .first()
                    .map_or(false, |r| ranges_overlap(r, &y_range))
        });

        let shape_to_the_left = self.shapes.iter().find_position(|shape| {
            shape.x + shape.y_ranges.len() as u32 == x
                && shape
                    .y_ranges
                    .last()
                    .map_or(false, |r| ranges_overlap(r, &y_range))
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
fn ranges_overlap(a: &RangeInclusive<u32>, b: &RangeInclusive<u32>) -> bool {
    a.contains(b.start()) || a.contains(b.end()) || b.contains(a.start()) || b.contains(a.end())
}

#[cfg(test)]
mod tests {
    use super::*;

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
        )
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
        )
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
        )
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
        )
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
        )
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
        )
    }
}
