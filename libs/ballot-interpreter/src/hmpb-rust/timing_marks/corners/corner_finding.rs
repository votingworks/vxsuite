use image::RgbImage;
use imageproc::drawing::draw_filled_rect_mut;
use itertools::Itertools;
use types_rs::geometry::{Point, Size};

use crate::{
    ballot_card::Geometry,
    debug::imageproc_rect_from_rect,
    image_utils::rainbow,
    impl_cornerwise,
    interpret::Error,
    scoring::UnitIntervalScore,
    timing_marks::{
        corners::{
            util::{mark_distances_to_point, CornerWise, EdgeWise},
            BallotGridCandidateMarks,
        },
        CandidateTimingMark, Corner,
    },
};

/// Represents the four corners of a ballot grid.
#[derive(Debug, Clone)]
pub struct BallotGridCorners {
    top_left: BallotGridCorner,
    top_right: BallotGridCorner,
    bottom_left: BallotGridCorner,
    bottom_right: BallotGridCorner,
}

impl_cornerwise!(BallotGridCorners, BallotGridCorner);

const MIN_CORNER_TIMING_MARK_SCORE: UnitIntervalScore = UnitIntervalScore(0.8);

impl BallotGridCorners {
    /// Get the four corner candidate timing marks for the ballot grid.
    pub fn corner_marks(
        &self,
    ) -> (
        &CandidateTimingMark,
        &CandidateTimingMark,
        &CandidateTimingMark,
        &CandidateTimingMark,
    ) {
        (
            &self.top_left.best_corner_grouping.corner_mark,
            &self.top_right.best_corner_grouping.corner_mark,
            &self.bottom_left.best_corner_grouping.corner_mark,
            &self.bottom_right.best_corner_grouping.corner_mark,
        )
    }

    /// Get the top-left corner of the ballot grid.
    pub const fn top_left(&self) -> &BallotGridCorner {
        &self.top_left
    }

    /// Get the top-right corner of the ballot grid.
    pub const fn top_right(&self) -> &BallotGridCorner {
        &self.top_right
    }

    /// Get the bottom-left corner of the ballot grid.
    pub const fn bottom_left(&self) -> &BallotGridCorner {
        &self.bottom_left
    }

    /// Get the bottom-right corner of the ballot grid.
    pub const fn bottom_right(&self) -> &BallotGridCorner {
        &self.bottom_right
    }

    /// Find all corners of the ballot grid. Searches based on the left and
    /// right edges rather than the top and bottom ones.
    pub fn find_all(
        image_size: Size<u32>,
        geometry: &Geometry,
        candidates: &BallotGridCandidateMarks,
    ) -> Result<Self, Error> {
        let timing_mark_center_to_center_distance =
            geometry.timing_mark_size.width + geometry.timing_mark_size.height;
        let ballot_top_left = Point::new(0.0, 0.0);
        let ballot_top_right = Point::new(image_size.width as f32 - 1.0, 0.0);
        let ballot_bottom_left = Point::new(0.0, image_size.height as f32 - 1.0);
        let ballot_bottom_right = Point::new(
            image_size.width as f32 - 1.0,
            image_size.height as f32 - 1.0,
        );

        let top_left_corner_candidates =
            CandidateCornerGrouping::find_all_within_border_candidate_marks(
                geometry,
                &candidates.left,
                ballot_top_left,
                Point::new(timing_mark_center_to_center_distance, 0.0),
                Point::new(0.0, timing_mark_center_to_center_distance),
            );
        let top_right_corner_candidates =
            CandidateCornerGrouping::find_all_within_border_candidate_marks(
                geometry,
                &candidates.right,
                ballot_top_right,
                Point::new(-timing_mark_center_to_center_distance, 0.0),
                Point::new(0.0, timing_mark_center_to_center_distance),
            );
        let bottom_left_corner_candidates =
            CandidateCornerGrouping::find_all_within_border_candidate_marks(
                geometry,
                &candidates.left,
                ballot_bottom_left,
                Point::new(timing_mark_center_to_center_distance, 0.0),
                Point::new(0.0, -timing_mark_center_to_center_distance),
            );
        let bottom_right_corner_candidates =
            CandidateCornerGrouping::find_all_within_border_candidate_marks(
                geometry,
                &candidates.right,
                ballot_bottom_right,
                Point::new(-timing_mark_center_to_center_distance, 0.0),
                Point::new(0.0, -timing_mark_center_to_center_distance),
            );

        let [top_left_result, top_right_result, bottom_left_result, bottom_right_result] = [
            (top_left_corner_candidates.clone(), Corner::TopLeft),
            (top_right_corner_candidates.clone(), Corner::TopRight),
            (bottom_left_corner_candidates.clone(), Corner::BottomLeft),
            (bottom_right_corner_candidates.clone(), Corner::BottomRight),
        ]
        .map_edgewise(|(corner_candidates, corner)| {
            corner_candidates
                .into_iter()
                .find(|grouping| {
                    grouping
                        .iter()
                        .all(|mark| mark.scores().mark_score() >= MIN_CORNER_TIMING_MARK_SCORE)
                })
                .ok_or_else(|| Error::MissingTimingMarks {
                    reason: format!("Could not find corner: {corner:?}"),
                })
        });

        let (
            best_top_left_grouping,
            best_top_right_grouping,
            best_bottom_left_grouping,
            best_bottom_right_grouping,
        ) = (
            top_left_result?,
            top_right_result?,
            bottom_left_result?,
            bottom_right_result?,
        );

        Ok(Self {
            top_left: BallotGridCorner {
                best_corner_grouping: best_top_left_grouping,
                all_possible_corner_groupings: top_left_corner_candidates,
            },
            top_right: BallotGridCorner {
                best_corner_grouping: best_top_right_grouping,
                all_possible_corner_groupings: top_right_corner_candidates,
            },
            bottom_left: BallotGridCorner {
                best_corner_grouping: best_bottom_left_grouping,
                all_possible_corner_groupings: bottom_left_corner_candidates,
            },
            bottom_right: BallotGridCorner {
                best_corner_grouping: best_bottom_right_grouping,
                all_possible_corner_groupings: bottom_right_corner_candidates,
            },
        })
    }

    pub fn debug_draw(&self, canvas: &mut RgbImage) {
        for (grouping, color) in self
            .top_left
            .all_possible_corner_groupings()
            .iter()
            .chain(self.top_right.all_possible_corner_groupings().iter())
            .chain(self.bottom_left.all_possible_corner_groupings().iter())
            .chain(self.bottom_right.all_possible_corner_groupings().iter())
            .zip(rainbow())
        {
            for mark in grouping.iter() {
                draw_filled_rect_mut(canvas, imageproc_rect_from_rect(mark.rect()), color);
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct BallotGridCorner {
    best_corner_grouping: CandidateCornerGrouping,
    all_possible_corner_groupings: Vec<CandidateCornerGrouping>,
}

impl BallotGridCorner {
    pub const fn best_corner_grouping(&self) -> &CandidateCornerGrouping {
        &self.best_corner_grouping
    }

    pub fn all_possible_corner_groupings(&self) -> &[CandidateCornerGrouping] {
        &self.all_possible_corner_groupings
    }
}

#[derive(Debug, Clone)]
pub struct CandidateCornerGrouping {
    corner_mark: CandidateTimingMark,
    row_mark: CandidateTimingMark,
    column_mark: CandidateTimingMark,
}

impl CandidateCornerGrouping {
    pub const fn corner_mark(&self) -> &CandidateTimingMark {
        &self.corner_mark
    }

    pub fn iter(&self) -> impl Iterator<Item = &CandidateTimingMark> {
        [&self.corner_mark, &self.row_mark, &self.column_mark].into_iter()
    }

    pub fn find_all_within_border_candidate_marks(
        geometry: &Geometry,
        candidate_timing_marks: &[CandidateTimingMark],
        closest_to_point: Point<f32>,
        expected_horizontal_offset: Point<f32>,
        expected_vertical_offset: Point<f32>,
    ) -> Vec<CandidateCornerGrouping> {
        mark_distances_to_point(candidate_timing_marks, closest_to_point)
            .sorted_by(|(a, _), (b, _)| a.total_cmp(b))
            .filter_map(|(_, corner_mark)| {
                let error_tolerance = geometry.timing_mark_size.height;

                let expected_row_mark_center =
                    corner_mark.rect().center() + expected_horizontal_offset;
                let Some((_, row_mark)) =
                    mark_distances_to_point(candidate_timing_marks, expected_row_mark_center)
                        .filter(|(distance, _)| distance <= &error_tolerance)
                        .min_by(|(a, _), (b, _)| a.total_cmp(b))
                else {
                    return None;
                };

                let expected_column_mark_center =
                    corner_mark.rect().center() + expected_vertical_offset;
                let Some((_, column_mark)) =
                    mark_distances_to_point(candidate_timing_marks, expected_column_mark_center)
                        .filter(|(distance, _)| distance <= &error_tolerance)
                        .min_by(|(a, _), (b, _)| a.total_cmp(b))
                else {
                    return None;
                };

                Some(CandidateCornerGrouping {
                    corner_mark: *corner_mark,
                    row_mark: *row_mark,
                    column_mark: *column_mark,
                })
            })
            .collect_vec()
    }
}

impl IntoIterator for CandidateCornerGrouping {
    type Item = CandidateTimingMark;
    type IntoIter = core::array::IntoIter<Self::Item, 3>;

    fn into_iter(self) -> Self::IntoIter {
        [self.corner_mark, self.row_mark, self.column_mark].into_iter()
    }
}
