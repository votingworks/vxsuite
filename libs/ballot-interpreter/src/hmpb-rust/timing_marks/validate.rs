use ab_glyph::PxScale;
use imageproc::drawing::{draw_filled_rect_mut, draw_text_mut, text_size};
use itertools::Itertools;
use types_rs::geometry::{Degrees, Radians, Segment, SubPixelUnit};

use crate::{
    ballot_card::Geometry,
    debug::{imageproc_rect_from_rect, monospace_font, ImageDebugWriter},
    image_utils::{DARK_RED, RED},
    scoring::UnitIntervalScore,
};

use super::{Border, CandidateTimingMark, ConsecutiveMarkValidation, TimingMarkScore};

pub fn validate_consecutive_timing_marks2(
    border: Border,
    candidate_marks: &Vec<CandidateTimingMark>,
    options: &ValidateConsecutiveTimingMarksOptions,
    debug: &ImageDebugWriter,
) {
    let highest_scoring_timing_mark_index = candidate_marks
        .iter()
        .position_max_by(|m, m2| {
            (m.scores().mark_score().0
                + m.scores().horizontal_padding_score().0
                + m.scores().vertical_padding_score().0)
                .total_cmp(
                    &(m2.scores().mark_score().0
                        + m2.scores().horizontal_padding_score().0
                        + m2.scores().vertical_padding_score().0),
                )
        })
        .unwrap();

    let highest_scoring_timing_mark = candidate_marks[highest_scoring_timing_mark_index];

    debug.write(
        format!("highest_scoring_timing_mark_{border:?}"),
        |canvas| {
            draw_filled_rect_mut(
                canvas,
                imageproc_rect_from_rect(highest_scoring_timing_mark.rect()),
                RED,
            );

            fn draw_scores_for_iter<'a>(
                canvas: &mut image::ImageBuffer<image::Rgb<u8>, Vec<u8>>,
                initial_scores: TimingMarkScore,
                marks: impl Iterator<Item = &'a CandidateTimingMark>,
            ) {
                let scale = PxScale::from(20.0);
                let font = monospace_font();
                let mut last_scores = initial_scores;
                for mark in marks {
                    let this_scores = mark.scores();
                    let mark_score_diff =
                        UnitIntervalScore(this_scores.mark_score().0 - last_scores.mark_score().0);
                    last_scores = this_scores;

                    let text = format!("{mark_score_diff:+?} = {}", this_scores.mark_score());
                    let (width, height) = text_size(scale, &font, &text);
                    let padding = 10;
                    draw_text_mut(
                        canvas,
                        DARK_RED,
                        if mark.rect().left() - width as i32 - padding < 0 {
                            mark.rect().right() + padding
                        } else {
                            mark.rect().left() - width as i32 - padding
                        },
                        mark.rect().center().y as i32 - height as i32 / 2,
                        scale,
                        &font,
                        &text,
                    );
                }
            }

            draw_scores_for_iter(
                canvas,
                highest_scoring_timing_mark.scores(),
                candidate_marks[0..highest_scoring_timing_mark_index]
                    .iter()
                    .rev(),
            );
            draw_scores_for_iter(
                canvas,
                highest_scoring_timing_mark.scores(),
                candidate_marks[highest_scoring_timing_mark_index + 1..].iter(),
            );
        },
    );
}

pub fn validate_consecutive_timing_marks(
    border: Border,
    candidate_marks: Vec<CandidateTimingMark>,
    options: &ValidateConsecutiveTimingMarksOptions,
    debug: &ImageDebugWriter,
) -> ConsecutiveMarkValidation {
    validate_consecutive_timing_marks2(border, &candidate_marks, options, debug);

    let low_scoring_candidate_marks = candidate_marks
        .iter()
        .copied()
        .enumerate()
        .filter_map(|(i, mark)| {
            let min_scores = if i == 0 || i == candidate_marks.len() - 1 {
                options.min_exterior_scores
            } else {
                options.min_interior_scores
            };

            if mark.scores().mark_score() >= min_scores.mark_score()
                && mark.scores().vertical_padding_score() >= min_scores.vertical_padding_score()
                && mark.scores().horizontal_padding_score() >= min_scores.horizontal_padding_score()
            {
                None
            } else {
                Some(mark)
            }
        })
        .collect_vec();

    let consecutive_segments = candidate_marks
        .iter()
        .tuple_windows()
        .map(|(a, b)| Segment::new(a.rect().center(), b.rect().center()))
        .collect_vec();

    let invalid_segment_pairs = consecutive_segments
        .iter()
        .cloned()
        .tuple_windows()
        .filter(|(ab, bc)| {
            let angle_diff = (ab.angle() - bc.angle()).abs();
            if angle_diff > options.max_allowed_middle_mark_angle_diff {
                return true;
            }

            let distance_diff = (ab.length() - bc.length()).abs();
            if distance_diff > options.max_allowed_center_to_center_distance_diff {
                return true;
            }

            false
        })
        .collect_vec();

    if invalid_segment_pairs.is_empty() && low_scoring_candidate_marks.is_empty() {
        ConsecutiveMarkValidation::Valid {
            candidate_marks,
            consecutive_segments,
        }
    } else {
        ConsecutiveMarkValidation::Invalid {
            candidate_marks,
            low_scoring_candidate_marks,
            consecutive_segments,
            invalid_segment_pairs,
        }
    }
}

pub struct ValidateConsecutiveTimingMarksOptions {
    pub max_allowed_middle_mark_angle_diff: Radians,
    pub max_allowed_center_to_center_distance_diff: SubPixelUnit,
    pub min_exterior_scores: TimingMarkScore,
    pub min_interior_scores: TimingMarkScore,
}

impl ValidateConsecutiveTimingMarksOptions {
    pub fn default_for_geometry(geometry: &Geometry) -> Self {
        Self {
            max_allowed_middle_mark_angle_diff: Degrees::new(5.0).to_radians(),
            max_allowed_center_to_center_distance_diff: geometry.timing_mark_size.height,
            min_exterior_scores: TimingMarkScore {
                mark_score: UnitIntervalScore(0.4),
                vertical_padding_score: UnitIntervalScore(0.0),
                horizontal_padding_score: UnitIntervalScore(0.0),
            },
            min_interior_scores: TimingMarkScore {
                mark_score: UnitIntervalScore(0.5),
                vertical_padding_score: UnitIntervalScore(0.0),
                horizontal_padding_score: UnitIntervalScore(0.0),
            },
        }
    }
}
