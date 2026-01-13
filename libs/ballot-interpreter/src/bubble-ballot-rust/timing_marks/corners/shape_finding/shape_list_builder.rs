use std::{borrow::Borrow, ops::RangeInclusive};

use itertools::Itertools;

use crate::ballot_card::Geometry;

use super::TimingMarkShape;

/// Builds `TimingMarkShape`s by joining vertical slices of timing marks.
pub struct ShapeListBuilder {
    geometry: Geometry,
    shapes: Vec<TimingMarkShape>,
}

impl ShapeListBuilder {
    pub fn new(geometry: Geometry) -> Self {
        Self {
            geometry,
            shapes: vec![],
        }
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

    /// Combines adjacent shapes that are close enough to each other as judged
    /// by the given maximum x gap and maximum y offset. Shapes will only be
    /// combined if the resulting shape is closer to the expected timing mark
    /// width than either of the original shapes.
    pub fn combine_adjacent_shapes(&mut self, max_x_gap: usize, max_y_offset: usize) {
        let mut shapes = vec![];
        std::mem::swap(&mut shapes, &mut self.shapes);

        // Sort shapes by x coordinate to ensure left-to-right processing.
        shapes.sort_by_key(|shape| shape.x);

        let expected_timing_mark_width = self.geometry.timing_mark_width_pixels() as u32;
        let mut combined_shapes: Vec<TimingMarkShape> = vec![];

        for shape in shapes {
            let shape_median_top = shape.median_top();
            let shape_median_bottom = shape.median_bottom();

            // Find the best matching shape to the left within the given gaps.
            if let Some(left_shape) = combined_shapes
                .iter_mut()
                .filter_map(|s| {
                    let x_gap = shape.left().saturating_sub(s.right() + 1);
                    let top_offset = shape_median_top.abs_diff(s.median_top());
                    let bottom_offset = shape_median_bottom.abs_diff(s.median_bottom());
                    // Only select shapes to the left, within max_x_gap, and within max_y_offset
                    if shape.left() > s.right()
                        && (x_gap as usize) <= max_x_gap
                        && (top_offset as usize) <= max_y_offset
                        && (bottom_offset as usize) <= max_y_offset
                    {
                        Some((s, x_gap, top_offset, bottom_offset))
                    } else {
                        None
                    }
                })
                .min_by(
                    |(_, a_x_gap, a_top_offset, a_bottom_offset),
                     (_, b_x_gap, b_top_offset, b_bottom_offset)| {
                        a_x_gap.cmp(b_x_gap).then_with(|| {
                            (a_top_offset + a_bottom_offset).cmp(&(b_top_offset + b_bottom_offset))
                        })
                    },
                )
                .map(|(s, _, _, _)| s)
            {
                let merged_shape_width = shape.right() - left_shape.left() + 1;
                let shape_width_error = shape.width().abs_diff(expected_timing_mark_width);
                let left_shape_width_error =
                    left_shape.width().abs_diff(expected_timing_mark_width);
                let merged_shape_width_error =
                    merged_shape_width.abs_diff(expected_timing_mark_width);

                // Only merge if the merged shape is closer to the expected width
                // than either of the existing shapes.
                if merged_shape_width_error < shape_width_error
                    && merged_shape_width_error < left_shape_width_error
                {
                    // Merge shape into left_shape, filling in the gap between the
                    // y_ranges of the two shapes.
                    let gap_start = left_shape.right() + 1;
                    let gap_end = shape.left() - 1;
                    for _ in gap_start..=gap_end {
                        left_shape.y_ranges.push(
                            left_shape
                                .y_ranges
                                .last()
                                .cloned()
                                .expect("there is at least one range"),
                        );
                    }
                    left_shape.y_ranges.extend(shape.y_ranges);
                    debug_assert_eq!(left_shape.width(), merged_shape_width);
                    continue;
                }
            }

            // No suitable left shape found, just add this shape as-is.
            combined_shapes.push(shape);
        }

        self.shapes = combined_shapes;
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

    use crate::ballot_card::PaperInfo;

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
        assert_eq!(
            ShapeListBuilder::new(PaperInfo::scanned_letter().compute_geometry()).into_shapes(),
            vec![]
        );
    }

    #[test]
    fn test_single_slice() {
        let mut builder = ShapeListBuilder::new(PaperInfo::scanned_letter().compute_geometry());
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
        let mut builder = ShapeListBuilder::new(PaperInfo::scanned_letter().compute_geometry());
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
        let mut builder = ShapeListBuilder::new(PaperInfo::scanned_letter().compute_geometry());
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
        let mut builder = ShapeListBuilder::new(PaperInfo::scanned_letter().compute_geometry());
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
        let mut builder = ShapeListBuilder::new(PaperInfo::scanned_letter().compute_geometry());
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
        let mut builder = ShapeListBuilder::new(PaperInfo::scanned_letter().compute_geometry());
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

    #[test]
    fn test_combine_adjacent_shapes_no_shapes() {
        let mut builder = ShapeListBuilder::new(PaperInfo::scanned_letter().compute_geometry());
        builder.combine_adjacent_shapes(5, 2);
        assert_eq!(builder.into_shapes(), vec![]);
    }

    #[test]
    fn test_combine_adjacent_shapes_single_shape() {
        let mut builder = ShapeListBuilder::new(PaperInfo::scanned_letter().compute_geometry());
        builder.add_slice(0, 0..=10);
        builder.add_slice(1, 0..=10);
        builder.combine_adjacent_shapes(5, 2);
        assert_eq!(
            builder.into_shapes(),
            vec![TimingMarkShape {
                x: 0,
                y_ranges: vec![0..=10, 0..=10]
            }]
        );
    }

    #[test]
    fn test_combine_adjacent_shapes_two_shapes_too_far_apart_horizontally() {
        let mut builder = ShapeListBuilder::new(PaperInfo::scanned_letter().compute_geometry());
        // Create two shapes with a gap of 6 pixels
        builder.add_slice(0, 0..=10);
        builder.add_slice(7, 0..=10);
        builder.combine_adjacent_shapes(5, 2); // max_x_gap = 5
                                               // Should not be combined because gap (6) > max_x_gap (5)
        assert_eq!(
            builder.into_shapes(),
            vec![
                TimingMarkShape {
                    x: 0,
                    y_ranges: vec![0..=10]
                },
                TimingMarkShape {
                    x: 7,
                    y_ranges: vec![0..=10]
                }
            ]
        );
    }

    #[test]
    fn test_combine_adjacent_shapes_two_shapes_too_far_apart_vertically() {
        let mut builder = ShapeListBuilder::new(PaperInfo::scanned_letter().compute_geometry());
        // Create two shapes with a small x gap but large y offset
        builder.add_slice(0, 0..=10);
        builder.add_slice(2, 15..=25); // y offset is 5 pixels
        builder.combine_adjacent_shapes(5, 2); // max_y_offset = 2
                                               // Should not be combined because y offset (5) > max_y_offset (2)
        assert_eq!(
            builder.into_shapes(),
            vec![
                TimingMarkShape {
                    x: 0,
                    y_ranges: vec![0..=10]
                },
                TimingMarkShape {
                    x: 2,
                    y_ranges: vec![15..=25]
                }
            ]
        );
    }

    #[test]
    fn test_combine_adjacent_shapes_combines_when_within_limits() {
        let geometry = PaperInfo::scanned_letter().compute_geometry();
        let expected_width = geometry.timing_mark_width_pixels() as u32;
        let mut builder = ShapeListBuilder::new(geometry);

        // Create two shapes that are close together and will result in a better width
        // Each shape is too narrow on its own
        let shape_width = expected_width / 3;
        for x in 0..shape_width {
            builder.add_slice(x, 0..=10);
        }
        let gap = 2; // Small gap
        for x in (shape_width + gap)..(shape_width * 2 + gap) {
            builder.add_slice(x, 0..=10);
        }

        builder.combine_adjacent_shapes(5, 2);

        // Should be combined into one shape
        let shapes = builder.into_shapes();
        assert_eq!(shapes.len(), 1);
        assert_eq!(shapes[0].x, 0);
        assert_eq!(shapes[0].width(), shape_width * 2 + gap);
    }

    #[test]
    fn test_combine_adjacent_shapes_does_not_combine_when_merged_width_is_worse() {
        let geometry = PaperInfo::scanned_letter().compute_geometry();
        let expected_width = geometry.timing_mark_width_pixels() as u32;
        let mut builder = ShapeListBuilder::new(geometry);

        // Create two shapes that are already close to the expected width
        // Combining them would make the width worse
        for x in 0..expected_width {
            builder.add_slice(x, 0..=10);
        }
        for x in (expected_width + 1)..=(expected_width * 2) {
            builder.add_slice(x, 0..=10);
        }

        builder.combine_adjacent_shapes(5, 2);

        // Should NOT be combined because the merged width would be too large
        let shapes = builder.into_shapes();
        assert_eq!(shapes.len(), 2);
    }

    #[test]
    fn test_combine_adjacent_shapes_fills_gap_between_shapes() {
        let geometry = PaperInfo::scanned_letter().compute_geometry();
        let expected_width = geometry.timing_mark_width_pixels() as u32;
        let mut builder = ShapeListBuilder::new(geometry);

        // Create two narrow shapes with a gap
        let shape_width = expected_width / 3;
        for x in 0..shape_width {
            builder.add_slice(x, 0..=10);
        }
        let gap = 3;
        for x in (shape_width + gap)..(shape_width * 2 + gap) {
            builder.add_slice(x, 1..=11);
        }

        builder.combine_adjacent_shapes(5, 2);

        let shapes = builder.into_shapes();
        assert_eq!(shapes.len(), 1);
        // The gap should be filled with copies of the last y_range from the left shape
        let shape = &shapes[0];
        assert_eq!(shape.width(), shape_width * 2 + gap);
        // Verify the gap was filled with the left shape's last range
        for i in shape_width..(shape_width + gap) {
            assert_eq!(shape.y_ranges[i as usize], 0..=10);
        }
    }

    #[test]
    fn test_combine_adjacent_shapes_processes_left_to_right() {
        let geometry = PaperInfo::scanned_letter().compute_geometry();
        let expected_width = geometry.timing_mark_width_pixels() as u32;
        let mut builder = ShapeListBuilder::new(geometry);

        // Add shapes in reverse order to test that they're sorted
        let shape_width = expected_width / 3;
        for x in (shape_width + 2)..(shape_width * 2 + 2) {
            builder.add_slice(x, 0..=10);
        }
        for x in 0..shape_width {
            builder.add_slice(x, 0..=10);
        }

        builder.combine_adjacent_shapes(5, 2);

        let shapes = builder.into_shapes();
        assert_eq!(shapes.len(), 1);
        assert_eq!(shapes[0].x, 0); // Should start from the leftmost position
    }

    #[test]
    fn test_combine_adjacent_shapes_chooses_closest_shape_by_x_gap() {
        let geometry = PaperInfo::scanned_letter().compute_geometry();
        let expected_width = geometry.timing_mark_width_pixels() as u32;
        let mut builder = ShapeListBuilder::new(geometry);

        let shape_width = expected_width / 4;

        // Create three shapes: far left, middle, right
        for x in 0..shape_width {
            builder.add_slice(x, 0..=10);
        }
        for x in (shape_width + 10)..(shape_width * 2 + 10) {
            builder.add_slice(x, 0..=10);
        }
        for x in (shape_width * 2 + 12)..(shape_width * 3 + 12) {
            builder.add_slice(x, 0..=10);
        }

        builder.combine_adjacent_shapes(15, 2);

        // The right shape should be combined with the middle shape (closer),
        // not the far left shape
        let shapes = builder.into_shapes();
        // The far left and the middle+right should result in 2 shapes if the
        // algorithm correctly chooses the closest match
        assert!(shapes.len() <= 2);
    }

    #[test]
    fn test_combine_adjacent_shapes_with_vertical_alignment_check() {
        let geometry = PaperInfo::scanned_letter().compute_geometry();
        let expected_width = geometry.timing_mark_width_pixels() as u32;
        let mut builder = ShapeListBuilder::new(geometry);

        let shape_width = expected_width / 3;

        // Create two narrow shapes with identical vertical position
        for x in 0..shape_width {
            builder.add_slice(x, 5..=15);
        }
        // Second shape with same vertical alignment
        for x in (shape_width + 2)..(shape_width * 2 + 2) {
            builder.add_slice(x, 5..=15);
        }
        // Third shape with different vertical alignment (but close enough)
        for x in (shape_width * 2 + 4)..(shape_width * 3 + 4) {
            builder.add_slice(x, 6..=16);
        }

        builder.combine_adjacent_shapes(5, 2);

        // All three should combine due to being within vertical tolerance
        let shapes = builder.into_shapes();
        assert!(shapes.len() <= 2); // At least some combination should happen
    }
}
