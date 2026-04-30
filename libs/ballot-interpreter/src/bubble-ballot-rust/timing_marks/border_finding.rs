use std::{fmt::Display, str::FromStr};

use crate::{
    ballot_card::Geometry,
    draw_utils::draw_filled_rect_mut,
    image_utils::rainbow,
    interpret::Error,
    scoring::UnitIntervalScore,
    timing_marks::{
        corner_finding::BallotGridCorners,
        mark_finding::BallotGridCandidateMarks,
        util::{mark_distances_to_point, CornerWise},
        Border, CandidateTimingMark, DefaultForGeometry,
    },
};
use image::RgbImage;
use itertools::Itertools;
use serde::{de::IntoDeserializer, Deserialize, Serialize};
use types_rs::geometry::{Segment, SubPixelUnit};

/// Represents the borders of a ballot grid. Under [`GridStrategy::FullBorders`]
/// (`Full`) every detected mark along each border is recorded; under
/// [`GridStrategy::CornersOnly`] (`OnlyCorners`) the per-border mark sequences
/// are not available — only the four corner marks (held on `TimingMarks`
/// itself) were used.
#[derive(Debug, Clone)]
pub enum BallotGridBorders {
    Full {
        left: GridBorder,
        right: GridBorder,
        top: GridBorder,
        bottom: GridBorder,
    },
    CornersOnly,
    ScanDirectionBordersOnly {
        left: GridBorder,
        right: GridBorder,
    },
}

impl BallotGridBorders {
    #[allow(clippy::result_large_err)]
    #[allow(clippy::missing_errors_doc)]
    pub fn find_all(
        geometry: &Geometry,
        corners: &BallotGridCorners,
        candidates: &BallotGridCandidateMarks,
        grid_strategy: GridStrategy,
        options: &Options,
    ) -> Result<Self, Error> {
        match grid_strategy {
            GridStrategy::FullBorders => {
                Self::find_all_with_full_border(geometry, corners, candidates, options)
            }
            GridStrategy::CornersOnly => {
                Self::find_all_using_only_corners(geometry, corners, options)
            }
            GridStrategy::ScanDirectionBordersOnly => {
                Self::find_all_using_only_scan_direction_borders(
                    geometry, corners, candidates, options,
                )
            }
        }
    }

    /// Tries to find all the borders, returning edge-wise results (left, right, top, bottom).
    fn try_find_all_borders(
        geometry: &Geometry,
        corners: &BallotGridCorners,
        candidates: &BallotGridCandidateMarks,
        options: &Options,
    ) -> [Result<GridBorder, Error>; 4] {
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

        // Look for the top and bottom borders by finding the appropriate marks
        // between the corners we used to find the left and right borders. This
        // ensures that all four borders are congruent.
        let mut top_candidates = candidates
            .top
            .iter()
            .filter(|m| m.scores().mark_score() >= options.min_border_timing_mark_score)
            .copied()
            .collect_vec();
        let mut bottom_candidates = candidates
            .bottom
            .iter()
            .filter(|m| m.scores().mark_score() >= options.min_border_timing_mark_score)
            .copied()
            .collect_vec();
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
        );

        let bottom = GridBorder::find_between_corners(
            horizontal_timing_mark_center_to_center_distance,
            maximum_timing_mark_center_distance_error,
            Border::Bottom,
            &bottom_candidates,
            (bottom_left, bottom_right),
        );

        let validate_mark_count = |gb: GridBorder, expected_count: usize| {
            let actual_count = gb.marks.len();
            if actual_count == expected_count {
                Ok(gb)
            } else {
                Err(Error::MissingTimingMarks {
                    reason: format!(
                        "{:?} timing mark border has an unexpected number of marks. Expected {} marks, found {}",
                        gb.border,
                        geometry.grid_size.height,
                        actual_count
                    ),
                })
            }
        };

        let width = geometry.grid_size.width as usize;
        let height = geometry.grid_size.height as usize;
        [
            left.and_then(|border| validate_mark_count(border, height)),
            right.and_then(|border| validate_mark_count(border, height)),
            top.and_then(|border| validate_mark_count(border, width)),
            bottom.and_then(|border| validate_mark_count(border, width)),
        ]
    }

    /// Finds the ballot grid borders using all timing marks along each border.
    /// Each border is the sequence of marks between two corners, validated
    /// against the expected center-to-center spacing.
    #[allow(clippy::result_large_err)]
    #[allow(clippy::missing_errors_doc)]
    fn find_all_with_full_border(
        geometry: &Geometry,
        corners: &BallotGridCorners,
        candidates: &BallotGridCandidateMarks,
        options: &Options,
    ) -> Result<Self, Error> {
        let [left, right, top, bottom] =
            Self::try_find_all_borders(geometry, corners, candidates, options);

        Ok(Self::Full {
            left: left?,
            right: right?,
            top: top?,
            bottom: bottom?,
        })
    }

    /// Validates the four corner groupings — each corner mark plus its two
    /// adjacent "row"/"column" marks must be within the expected
    /// center-to-center distance — and returns
    /// [`BallotGridBorders::OnlyCorners`]. Since this algorithm does not look
    /// for the full timing mark border, we don't record them or infer them.
    #[allow(clippy::result_large_err)]
    #[allow(clippy::missing_errors_doc)]
    fn find_all_using_only_corners(
        geometry: &Geometry,
        ballot_grid_corners: &BallotGridCorners,
        options: &Options,
    ) -> Result<Self, Error> {
        let max_row_distance = geometry.vertical_timing_mark_center_to_center_pixel_distance()
            * (1.0 + options.maximum_vertical_timing_mark_center_distance_error_ratio);
        let max_column_distance = geometry.horizontal_timing_mark_center_to_center_pixel_distance()
            * (1.0 + options.maximum_horizontal_timing_mark_center_distance_error_ratio);

        for corner in ballot_grid_corners.corners() {
            let grouping = corner.best_corner_grouping();
            let corner_mark_center = grouping.corner_mark().rect().center();
            let row_distance = corner_mark_center.distance_to(&grouping.row_mark().rect().center());
            let column_distance =
                corner_mark_center.distance_to(&grouping.column_mark().rect().center());

            if row_distance > max_row_distance || column_distance > max_column_distance {
                return Err(Error::MissingTimingMarks {
                    reason: format!(
                        "Corner mark too far from its neighbors: row distance = {row_distance} \
                         (max: {max_row_distance}), column distance = {column_distance} \
                         (max: {max_column_distance}), corner mark center = {corner_mark_center:?}"
                    ),
                });
            }
        }

        Ok(Self::CornersOnly)
    }

    #[allow(clippy::result_large_err)]
    #[allow(clippy::missing_errors_doc)]
    fn find_all_using_only_scan_direction_borders(
        geometry: &Geometry,
        corners: &BallotGridCorners,
        candidates: &BallotGridCandidateMarks,
        options: &Options,
    ) -> Result<Self, Error> {
        let [left, right, _, _] =
            Self::try_find_all_borders(geometry, corners, candidates, options);

        Ok(Self::ScanDirectionBordersOnly {
            left: left?,
            right: right?,
        })
    }

    pub fn debug_draw(&self, canvas: &mut RgbImage) {
        let Self::Full {
            left,
            right,
            top,
            bottom,
        } = self
        else {
            return;
        };
        for (mark, color) in left
            .marks
            .iter()
            .chain(right.marks.iter())
            .chain(top.marks.iter())
            .chain(bottom.marks.iter())
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
    pub maximum_horizontal_timing_mark_center_distance_error_ratio: f32,
    pub min_border_timing_mark_score: UnitIntervalScore,
}

impl DefaultForGeometry for Options {
    fn default_for_geometry(_geometry: &Geometry) -> Self {
        Self {
            maximum_vertical_timing_mark_center_distance_error_ratio: 0.5,
            maximum_horizontal_timing_mark_center_distance_error_ratio: 0.5,
            min_border_timing_mark_score: UnitIntervalScore(0.8),
        }
    }
}

/// Determines how the timing mark grid is reconstructed from the candidate
/// timing marks.
#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum GridStrategy {
    /// Ensure every timing mark is found along all four borders. Uses the sides
    /// parallel to the direction of scanning (always left & right for now) to
    /// determine the grid for bubble finding purposes.
    #[default]
    FullBorders,

    /// Uses only the corner timing mark groupings, i.e. the corner marks plus
    /// one in each of the horizontal and vertical directions. This strategy is
    /// more resilient to issues with timing marks, but is bad at correcting for
    /// stretching in the image when determining bubble positions.
    CornersOnly,

    /// Uses only the borders paralle to the direction of scan, which is always
    /// the left and right borders at the moment. Does not bother identifying
    /// any of the marks in the non-scanning direction except the corners.
    ScanDirectionBordersOnly,
}

impl GridStrategy {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::FullBorders => "full-borders",
            Self::CornersOnly => "corners-only",
            Self::ScanDirectionBordersOnly => "scan-direction-borders-only",
        }
    }
}

impl FromStr for GridStrategy {
    type Err = serde::de::value::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::deserialize(s.into_deserializer())
    }
}

impl Display for GridStrategy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn grid_strategy_round_trips_through_display() {
        for variant in [GridStrategy::FullBorders, GridStrategy::CornersOnly] {
            let rendered = variant.to_string();
            let reparsed: GridStrategy = rendered.parse().unwrap();
            assert!(matches!(
                (variant, reparsed),
                (GridStrategy::FullBorders, GridStrategy::FullBorders)
                    | (GridStrategy::CornersOnly, GridStrategy::CornersOnly)
            ));
        }
    }

    #[test]
    fn grid_strategy_from_str_rejects_unknown_values() {
        assert!("nope".parse::<GridStrategy>().is_err());
        assert!("FullBorders".parse::<GridStrategy>().is_err()); // PascalCase isn't accepted
        assert!("".parse::<GridStrategy>().is_err());
    }
}
