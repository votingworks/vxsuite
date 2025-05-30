use std::{cmp::Ordering, time::Instant};

use itertools::Itertools;
use types_rs::geometry::{angle_diff, Degrees, Direction, Radians, Rect, Segment};

use crate::{
    ballot_card::Geometry,
    debug::{self, ImageDebugWriter},
    scoring::UnitIntervalScore,
};

use super::{
    validate::{validate_consecutive_timing_marks, ValidateConsecutiveTimingMarksOptions},
    BestFit, BestFitSearchResult, Border, CandidateTimingMark, ConsecutiveMarkValidation,
    TimingMarkScore,
};

/// Finds the best fit of timing marks on the left side of the ballot card. Must
/// find exactly the expected number of timing marks.
pub fn find_left_timing_marks(
    geometry: &Geometry,
    candidates: &[CandidateTimingMark],
    debug: &ImageDebugWriter,
) -> BestFitSearchResult {
    let options = FindTimingMarkOptions::default_for_geometry(geometry);
    let find_result = find_timing_marks(
        Border::Left,
        candidates,
        |a, b| b.rect().left().cmp(&a.rect().left()),
        geometry.grid_size.height as usize,
        Degrees::new(90.0),
        &options,
        debug,
    );

    debug::draw_find_timing_mark_border_result_mut(
        "border_find_left",
        debug,
        candidates,
        &options,
        &find_result,
    );

    find_result
}

/// Finds the best fit of timing marks on the right side of the ballot card. Must
/// find exactly the expected number of timing marks.
pub fn find_right_timing_marks(
    geometry: &Geometry,
    candidates: &[CandidateTimingMark],
    debug: &ImageDebugWriter,
) -> BestFitSearchResult {
    let options = FindTimingMarkOptions::default_for_geometry(geometry);
    let find_result = find_timing_marks(
        Border::Right,
        candidates,
        |a, b| a.rect().right().cmp(&b.rect().right()),
        geometry.grid_size.height as usize,
        Degrees::new(90.0),
        &options,
        debug,
    );

    debug::draw_find_timing_mark_border_result_mut(
        "border_find_right",
        debug,
        candidates,
        &options,
        &find_result,
    );

    find_result
}

/// Finds the best fit of timing marks on the top side of the ballot card. Must
/// find exactly the expected number of timing marks.
pub fn find_top_timing_marks(
    geometry: &Geometry,
    candidates: &[CandidateTimingMark],
    debug: &ImageDebugWriter,
) -> BestFitSearchResult {
    let options = FindTimingMarkOptions::default_for_geometry(geometry);
    let find_result = find_timing_marks(
        Border::Top,
        candidates,
        |a, b| b.rect().top().cmp(&a.rect().top()),
        geometry.grid_size.width as usize,
        Degrees::new(0.0),
        &options,
        debug,
    );

    debug::draw_find_timing_mark_border_result_mut(
        "border_find_top",
        debug,
        candidates,
        &options,
        &find_result,
    );

    find_result
}

/// Finds the best fit of timing marks on the bottom side of the ballot card. Must
/// find exactly the expected number of timing marks.
pub fn find_bottom_timing_marks(
    geometry: &Geometry,
    candidates: &[CandidateTimingMark],
    debug: &ImageDebugWriter,
) -> BestFitSearchResult {
    let options = FindTimingMarkOptions::default_for_geometry(geometry);
    let find_result = find_timing_marks(
        Border::Bottom,
        candidates,
        |a, b| a.rect().bottom().cmp(&b.rect().bottom()),
        geometry.grid_size.width as usize,
        Degrees::new(0.0),
        &options,
        debug,
    );

    debug::draw_find_timing_mark_border_result_mut(
        "border_find_bottom",
        debug,
        candidates,
        &options,
        &find_result,
    );

    find_result
}

/// Options for finding timing marks.
#[derive(Debug, Clone, Copy)]
pub struct FindTimingMarkOptions<'a> {
    /// Geometry of the ballot being interpreted.
    geometry: &'a Geometry,

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

impl<'a> FindTimingMarkOptions<'a> {
    /// Returns the minimum scores for a mark to be the starting point for a
    /// search.
    pub fn min_search_scores(&self) -> TimingMarkScore {
        self.min_search_scores
    }

    /// Returns the minimum scores for an interior mark to be considered a valid
    /// timing mark.
    pub fn min_interior_acceptance_scores(&self) -> TimingMarkScore {
        self.min_interior_acceptance_scores
    }

    /// Returns the minimum scores for an exterior mark to be considered a valid
    /// timing mark.
    pub fn min_exterior_acceptance_scores(&self) -> TimingMarkScore {
        self.min_exterior_acceptance_scores
    }

    /// Returns the maximum number of pairs to search.
    pub fn pairs_to_search(&self) -> usize {
        self.pairs_to_search
    }

    /// Returns the angle tolerance for the best fit line.
    pub fn angle_tolerance(&self) -> Radians {
        self.angle_tolerance
    }

    fn default_for_geometry(geometry: &'a Geometry) -> Self {
        Self {
            geometry,

            // Set a higher threshold for the search scores to reduce the number
            // of bad line segments we try.
            min_search_scores: TimingMarkScore {
                mark_score: UnitIntervalScore(0.8),
                vertical_padding_score: UnitIntervalScore(0.4),
                horizontal_padding_score: UnitIntervalScore(0.2),
            },

            // Interior marks are expected to have a higher score than exterior
            // marks since they are less likely to be cropped.
            min_interior_acceptance_scores: TimingMarkScore {
                mark_score: UnitIntervalScore(0.7),
                vertical_padding_score: UnitIntervalScore(0.65),
                horizontal_padding_score: UnitIntervalScore(0.35),
            },

            // Exterior marks may be cropped, so we allow for a lower score.
            min_exterior_acceptance_scores: TimingMarkScore {
                mark_score: UnitIntervalScore(0.55),
                vertical_padding_score: UnitIntervalScore(0.45),
                horizontal_padding_score: UnitIntervalScore(0.3),
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
    border: Border,
    candidates: &[CandidateTimingMark],
    compare: impl Fn(&CandidateTimingMark, &CandidateTimingMark) -> Ordering,
    expected_count: usize,
    expected_angle: impl Into<Radians>,
    options: &FindTimingMarkOptions,
    debug: &ImageDebugWriter,
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
        .filter(|m| m.scores().cmp(&options.min_search_scores) == Some(Ordering::Greater))
        // Sort by `compare`, then by score.
        .sorted_by(|a, b| {
            compare(b, a).then_with(|| {
                b.scores()
                    .mark_score()
                    .partial_cmp(&a.scores().mark_score())
                    .unwrap_or(Ordering::Equal)
            })
        })
        .collect_vec();

    let mut remaining_pairs_to_try =
        n_choose_2(options.pairs_to_search).expect("'pairs_to_search' option is too high");

    // Keep track of searched segments for debugging purposes.
    let mut searched = vec![];
    let mut failed_validations = vec![];

    for (a, b) in candidates_to_pair.iter().tuple_combinations() {
        if remaining_pairs_to_try == 0 {
            break;
        }

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

        if searched.iter().contains(&segment) {
            continue;
        }

        searched.push(segment.clone());
        remaining_pairs_to_try -= 1;

        let mut marks = candidates
            .iter()
            .copied()
            .filter(|m| m.rect().intersects_line(&segment))
            .collect_vec();

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

            let validation = validate_consecutive_timing_marks(
                border,
                marks,
                &ValidateConsecutiveTimingMarksOptions::default_for_geometry(options.geometry),
                debug,
            );

            match validation {
                ConsecutiveMarkValidation::Valid { .. } => {
                    // All the marks had high enough scores, so we found a good fit.
                    return BestFitSearchResult::Found {
                        best_fit: BestFit {
                            segment,
                            validation: Some(validation.clone()),
                            marks: validation.into_candidate_marks(),
                        },
                        searched,
                        duration: start.elapsed(),
                    };
                }
                ConsecutiveMarkValidation::Invalid { .. } => failed_validations.push(validation),
            }
        }
    }

    // We didn't find a suitable line segment, so return the segments we tried
    // for debugging purposes.
    BestFitSearchResult::NotFound {
        searched,
        failed_validations,
        duration: start.elapsed(),
    }
}

fn n_choose_2(n: usize) -> Option<usize> {
    if n < 2 {
        None
    } else {
        Some(n * (n - 1) / 2)
    }
}
