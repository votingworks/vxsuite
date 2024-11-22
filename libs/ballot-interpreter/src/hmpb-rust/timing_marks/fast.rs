use std::{cmp::Ordering, time::Instant};

use itertools::Itertools;
use types_rs::geometry::{angle_diff, Degrees, Direction, Radians, Rect, Segment};

use crate::{
    ballot_card::Geometry,
    debug::{self, ImageDebugWriter},
    scoring::UnitIntervalScore,
};

use super::{BestFit, BestFitSearchResult, CandidateTimingMark, TimingMarkScore};

/// Finds the best fit of timing marks on the left side of the ballot card. Must
/// find exactly the expected number of timing marks.
pub fn find_left_timing_marks<'a>(
    geometry: &Geometry,
    candidates: &'a [CandidateTimingMark],
    debug: &ImageDebugWriter,
) -> BestFitSearchResult<'a> {
    let find_result = find_timing_marks(
        candidates,
        |a, b| b.rect().left().cmp(&a.rect().left()),
        geometry.grid_size.height as usize,
        Degrees::new(90.0),
        FindTimingMarkOptions::default(),
    );

    debug::draw_find_timing_mark_border_result_mut("border_find_left", debug, &find_result);

    find_result
}

/// Finds the best fit of timing marks on the right side of the ballot card. Must
/// find exactly the expected number of timing marks.
pub fn find_right_timing_marks<'a>(
    geometry: &Geometry,
    candidates: &'a [CandidateTimingMark],
    debug: &ImageDebugWriter,
) -> BestFitSearchResult<'a> {
    let find_result = find_timing_marks(
        candidates,
        |a, b| a.rect().right().cmp(&b.rect().right()),
        geometry.grid_size.height as usize,
        Degrees::new(90.0),
        FindTimingMarkOptions::default(),
    );

    debug::draw_find_timing_mark_border_result_mut("border_find_right", debug, &find_result);

    find_result
}

/// Finds the best fit of timing marks on the top side of the ballot card. Must
/// find exactly the expected number of timing marks.
pub fn find_top_timing_marks<'a>(
    geometry: &Geometry,
    candidates: &'a [CandidateTimingMark],
    debug: &ImageDebugWriter,
) -> BestFitSearchResult<'a> {
    let find_result = find_timing_marks(
        candidates,
        |a, b| b.rect().top().cmp(&a.rect().top()),
        geometry.grid_size.width as usize,
        Degrees::new(0.0),
        FindTimingMarkOptions::default(),
    );

    debug::draw_find_timing_mark_border_result_mut("border_find_top", debug, &find_result);

    find_result
}

/// Finds the best fit of timing marks on the bottom side of the ballot card. Must
/// find exactly the expected number of timing marks.
pub fn find_bottom_timing_marks<'a>(
    geometry: &Geometry,
    candidates: &'a [CandidateTimingMark],
    debug: &ImageDebugWriter,
) -> BestFitSearchResult<'a> {
    let find_result = find_timing_marks(
        candidates,
        |a, b| a.rect().bottom().cmp(&b.rect().bottom()),
        geometry.grid_size.width as usize,
        Degrees::new(0.0),
        FindTimingMarkOptions::default(),
    );

    debug::draw_find_timing_mark_border_result_mut("border_find_bottom", debug, &find_result);

    find_result
}

/// Options for finding timing marks.
#[derive(Debug, Clone, Copy)]
struct FindTimingMarkOptions {
    /// Minimum scores for a mark to be the starting point for a search.
    min_search_scores: TimingMarkScore,

    /// Minimum scores for an interior mark to be considered a valid timing
    /// mark.
    min_interior_acceptance_scores: TimingMarkScore,

    /// Minimum scores for an exterior mark to be considered a valid timing
    /// mark.
    min_exterior_acceptance_scores: TimingMarkScore,

    /// Maximum number of pairs whose scores are at least `min_search_scores` to
    /// search for the best fit.
    ///
    /// The number of attempts will be `pairs_to_search` choose 2. So, for
    /// example, if `pairs_to_search` is 20, we will try up to 190 pairs. For
    /// 40, we will try up to 780 pairs. Etc.
    pairs_to_search: usize,

    /// Tolerance for the angle of the best fit line as a difference from the
    /// expected angle.
    angle_tolerance: Radians,
}

impl Default for FindTimingMarkOptions {
    fn default() -> Self {
        Self {
            // Set a higher threshold for the search scores to reduce the number
            // of bad line segments we try.
            min_search_scores: TimingMarkScore {
                mark_score: UnitIntervalScore(0.8),
                padding_score: UnitIntervalScore(0.8),
            },

            // Interior marks are expected to have a higher score than exterior
            // marks since they are less likely to be cropped.
            min_interior_acceptance_scores: TimingMarkScore {
                mark_score: UnitIntervalScore(0.7),
                padding_score: UnitIntervalScore(0.7),
            },

            // Exterior marks may be cropped, so we allow for a lower score.
            min_exterior_acceptance_scores: TimingMarkScore {
                mark_score: UnitIntervalScore(0.33),
                padding_score: UnitIntervalScore(0.33),
            },

            // Pick a high enough number to have good odds of finding a best fit
            // line if one exists that meets the criteria.
            pairs_to_search: 20,

            // Allow enough deviation from the expected angle to cover moderate
            // skew without allowing truly insane angles.
            angle_tolerance: Degrees::new(5.0).to_radians(),
        }
    }
}

/// Finds the best fit segment and intersected timing marks by pairing
/// `candidates` according to the `compare` function. The `expected_count` is
/// the number of timing marks that must be found for this function to succeed.
///
/// The `compare` function should sort candidate timing marks to be tried
/// earlier as `Ordering::Less`.
fn find_timing_marks(
    candidates: &[CandidateTimingMark],
    compare: impl Fn(&CandidateTimingMark, &CandidateTimingMark) -> Ordering,
    expected_count: usize,
    expected_angle: impl Into<Radians>,
    options: FindTimingMarkOptions,
) -> BestFitSearchResult {
    let expected_angle = expected_angle.into();
    let start = Instant::now();

    // Get the area containing all the candidates.
    let candidates_extent = candidates
        .iter()
        .fold(Rect::zero(), |extent, mark| extent.union(mark.rect()));

    // Get the candidates with a high enough score to start a search from.
    let candidates_to_pair = candidates
        .iter()
        // Exclude lower-quality timing marks as search starting points.
        .filter(|m| m.scores().mark_score() > options.min_search_scores.mark_score())
        // Sort by `compare`, then by score.
        .sorted_by(|a, b| match compare(b, a) {
            Ordering::Equal => b
                .scores()
                .mark_score()
                .partial_cmp(&a.scores().mark_score())
                .unwrap_or(Ordering::Equal),
            cmp => cmp,
        })
        // Limit the number of pairs to search.
        .take(options.pairs_to_search)
        // We collect the candidates here because we may need to iterate over
        // them twice in the event we do not find a best fit line.
        .collect_vec();

    // Keep track of searched segments for debugging purposes.
    let mut searched = vec![];

    for (a, b) in candidates_to_pair.iter().tuple_combinations() {
        let Some(segment) = Segment::new(a.rect().center(), b.rect().center())
            .extend_within_rect(candidates_extent)
        else {
            continue;
        };

        if angle_diff(segment.angle(), expected_angle) > options.angle_tolerance {
            // The line between the two rectangles is not within the
            // tolerance of the desired angle, so skip this pair.
            continue;
        }

        let mut marks = candidates
            .iter()
            .filter(|m| m.rect().intersects_line(&segment))
            .collect_vec();

        searched.push(segment.clone());

        // Did we find the right number of marks?
        if marks.len() == expected_count {
            // Sort the marks in the right direction so we can distinguish exterior/interior.
            match segment.major_direction() {
                Direction::Right | Direction::Left => {
                    marks.sort_by_key(|m| m.rect().left());
                }
                Direction::Down | Direction::Up => {
                    marks.sort_by_key(|m| m.rect().top());
                }
            }

            if marks.iter().enumerate().all(|(i, m)| {
                let min_scores = if i == 0 || i == marks.len() - 1 {
                    options.min_exterior_acceptance_scores
                } else {
                    options.min_interior_acceptance_scores
                };

                m.scores().mark_score() >= min_scores.mark_score()
                    && m.scores().padding_score() >= min_scores.padding_score()
            }) {
                // All the marks had high enough scores, so we found a good fit.
                return BestFitSearchResult::Found {
                    best_fit: BestFit { segment, marks },
                    searched,
                    duration: start.elapsed(),
                };
            }
        }
    }

    // We didn't find a suitable line segment, so return the segments we tried
    // for debugging purposes.
    BestFitSearchResult::NotFound {
        searched: candidates_to_pair
            .iter()
            .tuple_combinations()
            .filter_map(|(a, b)| {
                Segment::new(a.rect().center(), b.rect().center())
                    .extend_within_rect(candidates_extent)
            })
            .collect(),
        duration: start.elapsed(),
    }
}
