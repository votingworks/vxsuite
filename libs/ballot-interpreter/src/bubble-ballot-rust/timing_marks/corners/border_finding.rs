use crate::{
    ballot_card::Geometry,
    debug::imageproc_rect_from_rect,
    image_utils::rainbow,
    impl_edgewise,
    interpret::Error,
    timing_marks::{
        corners::{
            corner_finding::BallotGridCorners, util::mark_distances_to_point,
            BallotGridCandidateMarks,
        },
        Border, CandidateTimingMark, DefaultForGeometry,
    },
};
use image::RgbImage;
use imageproc::drawing::draw_filled_rect_mut;
use types_rs::geometry::{Segment, SubPixelUnit};

/// Represents the four borders of a ballot grid.
#[derive(Debug, Clone)]
pub struct BallotGridBorders {
    pub left: GridBorder,
    pub right: GridBorder,
    pub top: GridBorder,
    pub bottom: GridBorder,
}

impl_edgewise!(BallotGridBorders, GridBorder);

impl BallotGridBorders {
    #[allow(clippy::result_large_err)]
    pub fn find_all(
        geometry: &Geometry,
        corners: &BallotGridCorners,
        candidates: &BallotGridCandidateMarks,
        options: &Options,
    ) -> Result<Self, Error> {
        let (top_left, top_right, bottom_left, bottom_right) = corners.corner_marks();

        let vertical_timing_mark_center_to_center_distance =
            geometry.vertical_timing_mark_center_to_center_pixel_distance();
        let maximum_timing_mark_center_distance_error =
            vertical_timing_mark_center_to_center_distance
                * options.maximum_vertical_timing_mark_center_distance_error_ratio;

        let left = GridBorder::find_between_corners(
            vertical_timing_mark_center_to_center_distance,
            maximum_timing_mark_center_distance_error,
            Border::Left,
            &candidates.left,
            (top_left, bottom_left),
        )?;

        let right = GridBorder::find_between_corners(
            vertical_timing_mark_center_to_center_distance,
            maximum_timing_mark_center_distance_error,
            Border::Right,
            &candidates.right,
            (top_right, bottom_right),
        )?;

        // Look for the top and bottom borders by finding the appropriate marks
        // between the corners we used to find the left and right borders. This
        // ensures that all four borders are congruent.
        let mut top_candidates = candidates.top.clone();
        let mut bottom_candidates = candidates.bottom.clone();
        top_candidates.extend_from_slice(&[*top_left, *top_right]);
        bottom_candidates.extend_from_slice(&[*bottom_left, *bottom_right]);

        let horizontal_timing_mark_center_to_center_distance =
            geometry.horizontal_timing_mark_center_to_center_pixel_distance();
        let maximum_timing_mark_center_distance_error =
            horizontal_timing_mark_center_to_center_distance
                * options.maximum_horizontal_timing_mark_center_distance_error_ratio;

        let top = GridBorder::find_between_corners(
            horizontal_timing_mark_center_to_center_distance,
            maximum_timing_mark_center_distance_error,
            Border::Top,
            &top_candidates,
            (top_left, top_right),
        )?;

        let bottom = GridBorder::find_between_corners(
            horizontal_timing_mark_center_to_center_distance,
            maximum_timing_mark_center_distance_error,
            Border::Bottom,
            &bottom_candidates,
            (bottom_left, bottom_right),
        )?;

        let actual_left_count = left.marks.len();
        if actual_left_count != geometry.grid_size.height as usize {
            return Err(Error::MissingTimingMarks {
                reason: format!("Left timing mark border has an unexpected number of marks. Expected {} marks, found {}", geometry.grid_size.height, actual_left_count),
            });
        }

        let actual_right_count = right.marks.len();
        if actual_right_count != geometry.grid_size.height as usize {
            return Err(Error::MissingTimingMarks {
                reason: format!("Right timing mark border has an unexpected number of marks. Expected {} marks, found {}", geometry.grid_size.height, actual_right_count),
            });
        }

        let actual_top_count = top.marks.len();
        if actual_top_count != geometry.grid_size.width as usize {
            return Err(Error::MissingTimingMarks {
                reason: format!("Top timing mark border has an unexpected number of marks. Expected {} marks, found {}", geometry.grid_size.width, actual_top_count),
            });
        }

        let actual_bottom_count = bottom.marks.len();
        if actual_bottom_count != geometry.grid_size.width as usize {
            return Err(Error::MissingTimingMarks {
                reason: format!("Bottom timing mark border has an unexpected number of marks. Expected {} marks, found {}", geometry.grid_size.width, actual_bottom_count),
            });
        }

        Ok(Self {
            left,
            right,
            top,
            bottom,
        })
    }

    pub fn debug_draw(&self, canvas: &mut RgbImage) {
        for (mark, color) in self
            .left
            .marks
            .iter()
            .chain(self.right.marks.iter())
            .chain(self.top.marks.iter())
            .chain(self.bottom.marks.iter())
            .zip(rainbow())
        {
            draw_filled_rect_mut(canvas, imageproc_rect_from_rect(mark.rect()), color);
        }
    }
}

#[derive(Debug, Clone)]
pub struct GridBorder {
    border: Border,
    marks: Vec<CandidateTimingMark>,
}

impl GridBorder {
    /// Find the set of marks along a border by moving along the space between
    /// two corners, finding timing marks that are close enough to the expected
    /// location to be counted.
    #[allow(clippy::result_large_err)]
    pub fn find_between_corners(
        timing_mark_center_to_center_distance: SubPixelUnit,
        maximum_timing_mark_center_distance_error: SubPixelUnit,
        border: Border,
        candidate_timing_marks: &[CandidateTimingMark],
        corners: (&CandidateTimingMark, &CandidateTimingMark),
    ) -> Result<Self, Error> {
        let (starting_mark, ending_mark) = corners;
        assert!(
            candidate_timing_marks.contains(starting_mark),
            "Starting corner must be a candidate timing mark"
        );
        assert!(
            candidate_timing_marks.contains(ending_mark),
            "Ending corner must be a candidate timing mark"
        );

        let corner_to_corner_segment =
            Segment::new(starting_mark.rect().center(), ending_mark.rect().center());
        let unit_segment =
            corner_to_corner_segment.with_length(timing_mark_center_to_center_distance);
        let unit_vector = unit_segment.vector();

        let mut last_expected_mark_center = starting_mark.rect().center();
        let mut marks = vec![*starting_mark];

        loop {
            let next_expected_mark_center = last_expected_mark_center + unit_vector;
            let Some((_, closest_mark_to_expected_center)) =
                mark_distances_to_point(candidate_timing_marks, next_expected_mark_center)
                    .filter(|(distance, _)| *distance <= maximum_timing_mark_center_distance_error)
                    .min_by(|(a, _), (b, _)| a.total_cmp(b))
            else {
                return Err(Error::MissingTimingMarks {
                        reason: format!(
                            "Unable to find mark along {border:?} border at index {index}; no marks close enough?",
                            index = marks.len()
                        ),
                    });
            };

            marks.push(*closest_mark_to_expected_center);

            if closest_mark_to_expected_center == ending_mark {
                break;
            }

            last_expected_mark_center = closest_mark_to_expected_center.rect().center();
        }

        Ok(Self { border, marks })
    }

    #[allow(dead_code)]
    pub const fn border(&self) -> Border {
        self.border
    }

    pub fn into_marks(self) -> Vec<CandidateTimingMark> {
        self.marks
    }
}

pub struct Options {
    pub maximum_vertical_timing_mark_center_distance_error_ratio: f32,
    pub maximum_horizontal_timing_mark_center_distance_error_ratio: f32,
}

impl DefaultForGeometry for Options {
    fn default_for_geometry(_geometry: &Geometry) -> Self {
        Self {
            maximum_vertical_timing_mark_center_distance_error_ratio: 0.5,
            maximum_horizontal_timing_mark_center_distance_error_ratio: 0.5,
        }
    }
}
