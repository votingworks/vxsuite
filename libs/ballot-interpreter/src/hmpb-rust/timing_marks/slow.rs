use std::{cmp::Ordering, time::Instant};

use itertools::Itertools;
use types_rs::geometry::{angle_diff, PixelPosition, Radians, Rect, Segment};

use crate::ballot_card::Geometry;

use super::{
    BestFit, BestFitSearchResult, CandidateTimingMark, HORIZONTAL_ANGLE, MAX_BEST_FIT_LINE_ERROR,
    VERTICAL_ANGLE,
};

/// Finds the best fit of timing marks along the top border of the ballot card,
/// even if the number of timing marks is not equal to the expected number.
pub fn find_top_timing_marks(candidates: &[CandidateTimingMark]) -> BestFitSearchResult {
    find_best_fit_segment(
        candidates,
        HORIZONTAL_ANGLE,
        MAX_BEST_FIT_LINE_ERROR,
        |a, b| {
            let a = &a.marks;
            let b = &b.marks;
            match a.len().cmp(&b.len()) {
                Ordering::Equal => {
                    // if the counts are equal, sort by top opposite (where we want the smallest value)
                    average(b.iter().map(|c| c.rect().top()))
                        .cmp(&average(a.iter().map(|c| c.rect().top())))
                }
                cmp => cmp,
            }
        },
    )
}

/// Finds the best fit of timing marks along the left border of the ballot card,
/// even if the number of timing marks is not equal to the expected number.
pub fn find_left_timing_marks<'a>(
    geometry: &Geometry,
    candidates: &'a [CandidateTimingMark],
) -> BestFitSearchResult<'a> {
    find_best_fit_segment(
        candidates,
        VERTICAL_ANGLE,
        MAX_BEST_FIT_LINE_ERROR,
        |a, b| {
            let a = &a.marks;
            let b = &b.marks;
            match cmp_vertical_border_candidates(geometry, a, b) {
                Ordering::Equal => {
                    // if the counts are equal, sort by left opposite (where we want the smallest value)
                    average(b.iter().map(|c| c.rect().left()))
                        .cmp(&average(a.iter().map(|c| c.rect().left())))
                }
                cmp => cmp,
            }
        },
    )
}

/// Finds the best fit of timing marks along the right border of the ballot card,
/// even if the number of timing marks is not equal to the expected number.
pub fn find_right_timing_marks<'a>(
    geometry: &Geometry,
    candidates: &'a [CandidateTimingMark],
) -> BestFitSearchResult<'a> {
    find_best_fit_segment(
        &candidates,
        VERTICAL_ANGLE,
        MAX_BEST_FIT_LINE_ERROR,
        |a, b| {
            let a = &a.marks;
            let b = &b.marks;
            match cmp_vertical_border_candidates(geometry, a, b) {
                Ordering::Equal => {
                    // if the counts are equal, sort by right (where we want the largest value)
                    average(a.iter().map(|c| c.rect().right()))
                        .cmp(&average(b.iter().map(|c| c.rect().right())))
                }
                cmp => cmp,
            }
        },
    )
}

/// Finds the best fit of timing marks along the bottom border of the ballot card,
/// even if the number of timing marks is not equal to the expected number.
pub fn find_bottom_timing_marks(candidates: &[CandidateTimingMark]) -> BestFitSearchResult {
    find_best_fit_segment(
        candidates,
        HORIZONTAL_ANGLE,
        MAX_BEST_FIT_LINE_ERROR,
        |a, b| {
            let a = &a.marks;
            let b = &b.marks;
            match a.len().cmp(&b.len()) {
                Ordering::Equal => {
                    // if the counts are equal, sort by bottom (where we want the largest value)
                    average(a.iter().map(|c| c.rect().bottom()))
                        .cmp(&average(b.iter().map(|c| c.rect().bottom())))
                }
                cmp => cmp,
            }
        },
    )
}

/// Compare two sets of candidate timing marks along a vertical border,
/// sorting by the difference from the expected number of timing marks,
/// then by the sum of the mark and padding scores.
fn cmp_vertical_border_candidates(
    geometry: &Geometry,
    a: &[&CandidateTimingMark],
    b: &[&CandidateTimingMark],
) -> Ordering {
    // compare by the difference from the expected number of timing marks.
    // we can do this because the side columns should be completely filled
    let a_diff_from_expected = (a.len() as i32 - geometry.grid_size.height).abs();
    let b_diff_from_expected = (b.len() as i32 - geometry.grid_size.height).abs();

    match a_diff_from_expected.cmp(&b_diff_from_expected) {
        Ordering::Equal => {
            // try to pick the one with the highest score sum
            let a_score_sum: f32 = a
                .iter()
                .map(|c| c.scores().mark_score() + c.scores().padding_score())
                .sum();
            let b_score_sum: f32 = b
                .iter()
                .map(|c| c.scores().mark_score() + c.scores().padding_score())
                .sum();

            a_score_sum
                .partial_cmp(&b_score_sum)
                .unwrap_or(Ordering::Equal)
        }
        // swap the ordering because we're using max_by and we want to minimize the diff
        Ordering::Less => Ordering::Greater,
        Ordering::Greater => Ordering::Less,
    }
}

fn average<T: IntoIterator<Item = PixelPosition>>(values: T) -> PixelPosition {
    let mut sum = 0;
    let mut count = 0;
    for value in values {
        sum += value;
        count += 1;
    }
    if count == 0 {
        0
    } else {
        sum / count
    }
}

/// Finds the best fit line segment for a set of timing marks, restricting the
/// angle of the line segment to be within a tolerance of the desired angle.
pub fn find_best_fit_segment(
    marks: &[CandidateTimingMark],
    angle: impl Into<Radians>,
    tolerance: impl Into<Radians>,
    compare: impl Fn(&BestFit, &BestFit) -> Ordering,
) -> BestFitSearchResult {
    let start = Instant::now();
    let angle = angle.into();
    let tolerance = tolerance.into();
    let mark_extent = marks
        .iter()
        .fold(Rect::zero(), |rect, container| rect.union(container.rect()));
    let mut best_fit = None;
    let mut searched = vec![];

    for (a, b) in marks.iter().tuple_combinations() {
        let segment = Segment::new(a.rect().center(), b.rect().center());
        // Extend the segment to the extent containing all containers. This makes the line segment
        // essentially infinitely long, and allows including timing marks whose line angle might be
        // slightly outside the tolerance.
        let segment = segment.extend_within_rect(mark_extent).unwrap_or(segment);

        if angle_diff(segment.angle(), angle) > tolerance {
            // The line between the two rectangles is not within the
            // tolerance of the desired angle, so skip this pair.
            continue;
        }

        searched.push(segment.clone());

        // Find all rectangles in line with the pair of rectangles.
        let best_fit_marks = marks
            .iter()
            .filter(|r| r.rect().intersects_line(&segment))
            .collect_vec();

        let new_best_fit = BestFit {
            segment,
            marks: best_fit_marks,
        };

        match best_fit {
            Some(ref previous_best_fit) => {
                if compare(&new_best_fit, previous_best_fit) == Ordering::Greater {
                    best_fit = Some(new_best_fit);
                }
            }
            None => {
                best_fit = Some(new_best_fit);
            }
        }
    }

    match best_fit {
        Some(best_fit) => BestFitSearchResult::Found {
            best_fit,
            searched,
            duration: start.elapsed(),
        },
        None => BestFitSearchResult::NotFound {
            searched,
            duration: start.elapsed(),
        },
    }
}
