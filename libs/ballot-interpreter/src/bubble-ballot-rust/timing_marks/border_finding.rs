use std::{fmt::Display, str::FromStr};

use crate::{
    ballot_card::Geometry,
    draw_utils::draw_filled_rect_mut,
    image_utils::rainbow,
    impl_edgewise,
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
        }
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
        )?;

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
        )?;

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

    /// Builds borders consisting only of the four corner groupings: each
    /// border is the two corner marks at its ends plus the two adjacent
    /// "row"/"column" marks one step in from each corner. No interior marks
    /// are read, so this strategy works on ballots that have only corner
    /// timing marks printed. Validates that the row/column marks are within
    /// the expected center-to-center distance from their corners.
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

        let [top_left, top_right, bottom_left, bottom_right] = ballot_grid_corners.corners();

        Ok(Self {
            left: GridBorder {
                border: Border::Left,
                marks: vec![
                    *top_left.best_corner_grouping().corner_mark(),
                    *top_left.best_corner_grouping().column_mark(),
                    *bottom_left.best_corner_grouping().column_mark(),
                    *bottom_left.best_corner_grouping().corner_mark(),
                ],
            },
            right: GridBorder {
                border: Border::Right,
                marks: vec![
                    *top_right.best_corner_grouping().corner_mark(),
                    *top_right.best_corner_grouping().column_mark(),
                    *bottom_right.best_corner_grouping().column_mark(),
                    *bottom_right.best_corner_grouping().corner_mark(),
                ],
            },
            top: GridBorder {
                border: Border::Top,
                marks: vec![
                    *top_left.best_corner_grouping().corner_mark(),
                    *top_left.best_corner_grouping().row_mark(),
                    *top_right.best_corner_grouping().row_mark(),
                    *top_right.best_corner_grouping().corner_mark(),
                ],
            },
            bottom: GridBorder {
                border: Border::Bottom,
                marks: vec![
                    *bottom_left.best_corner_grouping().corner_mark(),
                    *bottom_left.best_corner_grouping().row_mark(),
                    *bottom_right.best_corner_grouping().row_mark(),
                    *bottom_right.best_corner_grouping().corner_mark(),
                ],
            },
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
/// timing marks. `FullBorders` reads every mark along all four borders;
/// `CornersOnly` uses only the four corner groupings and is appropriate for
/// ballots that print only corner timing marks. `CornersOnly` is faster but
/// less robust: a single bad corner detection skews the entire grid.
#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum GridStrategy {
    #[default]
    FullBorders,
    CornersOnly,
}

impl GridStrategy {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::FullBorders => "full-borders",
            Self::CornersOnly => "corners-only",
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
