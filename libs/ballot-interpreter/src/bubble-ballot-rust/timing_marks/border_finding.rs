use crate::{
    ballot_card::Geometry,
    draw_utils::draw_filled_rect_mut,
    image_utils::rainbow,
    interpret::Error,
    scoring::UnitIntervalScore,
    timing_marks::{
        corner_finding::BallotGridCorners, mark_finding::BallotGridCandidateMarks,
        util::mark_distances_to_point, Border, CandidateTimingMark, DefaultForGeometry,
    },
};
use image::RgbImage;
use itertools::Itertools;
use types_rs::geometry::{Segment, SubPixelUnit};

/// Represents the borders of a ballot grid. Only the borders parallel to the
/// scan direction (always left and right at the moment) are recorded; the
/// top and bottom borders are not used to build the grid.
#[derive(Debug, Clone)]
pub struct BallotGridBorders {
    pub left: GridBorder,
    pub right: GridBorder,
}

impl BallotGridBorders {
    #[allow(clippy::result_large_err)]
    #[allow(clippy::missing_errors_doc)]
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
            &candidates
                .left
                .iter()
                .filter(|m| m.scores().mark_score() >= options.min_border_timing_mark_score)
                .copied()
                .collect_vec(),
            (top_left, bottom_left),
        );

        let right = GridBorder::find_between_corners(
            vertical_timing_mark_center_to_center_distance,
            maximum_timing_mark_center_distance_error,
            Border::Right,
            &candidates
                .right
                .iter()
                .filter(|m| m.scores().mark_score() >= options.min_border_timing_mark_score)
                .copied()
                .collect_vec(),
            (top_right, bottom_right),
        );

        let height = geometry.grid_size.height as usize;
        let validate_mark_count = |gb: GridBorder| {
            let actual_count = gb.marks.len();
            if actual_count == height {
                Ok(gb)
            } else {
                Err(Error::MissingTimingMarks {
                    reason: format!(
                        "{:?} timing mark border has an unexpected number of marks. Expected {} marks, found {}",
                        gb.border, height, actual_count
                    ),
                })
            }
        };

        Ok(Self {
            left: left.and_then(validate_mark_count)?,
            right: right.and_then(validate_mark_count)?,
        })
    }

    pub fn debug_draw(&self, canvas: &mut RgbImage) {
        for (mark, color) in self
            .left
            .marks
            .iter()
            .chain(self.right.marks.iter())
            .zip(rainbow())
        {
            draw_filled_rect_mut(canvas, *mark.rect(), color);
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
    #[allow(clippy::missing_errors_doc, clippy::missing_panics_doc)]
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
    #[must_use]
    pub const fn border(&self) -> Border {
        self.border
    }

    #[must_use]
    pub fn into_marks(self) -> Vec<CandidateTimingMark> {
        self.marks
    }
}

pub struct Options {
    pub maximum_vertical_timing_mark_center_distance_error_ratio: f32,
    pub min_border_timing_mark_score: UnitIntervalScore,
}

impl DefaultForGeometry for Options {
    fn default_for_geometry(_geometry: &Geometry) -> Self {
        Self {
            maximum_vertical_timing_mark_center_distance_error_ratio: 0.5,
            min_border_timing_mark_score: UnitIntervalScore(0.8),
        }
    }
}
