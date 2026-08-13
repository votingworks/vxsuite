use std::fmt::{Debug, Display, Formatter};
use std::num::ParseFloatError;
use std::ops::{Add, Mul};
use std::str::FromStr;

use image::GrayImage;
use rayon::prelude::{IntoParallelRefIterator, ParallelIterator};
use serde::Serialize;
use types_rs::ballot_card::BallotSide;
use types_rs::election::{GridLayout, GridLocation, GridPosition, UnitIntervalValue};
use types_rs::geometry::{PixelPosition, PixelUnit, Point, Quadrilateral, Rect, SubPixelUnit};

use crate::ballot_card::BallotImage;
use crate::debug;
use crate::image_utils::{count_pixels_in_shape, VerticalStreak};
use crate::interpret::{Error, Result};
use crate::timing_marks::TimingMarks;

#[derive(Clone, Copy, Serialize, Default)]
#[must_use]
pub struct UnitIntervalScore(pub UnitIntervalValue);

impl Display for UnitIntervalScore {
    fn fmt(&self, f: &mut Formatter) -> std::fmt::Result {
        write!(
            f,
            "{:.precision$}%",
            self.0 * 100.0,
            precision = f.precision().unwrap_or(2)
        )
    }
}

/// Parses a `UnitIntervalScore` from a bare float (e.g. `"0.5"`) or from a
/// percentage with a `%` suffix (e.g. `"50%"`). The two forms are equivalent:
/// both produce `UnitIntervalScore(0.5)`.
impl FromStr for UnitIntervalScore {
    type Err = ParseFloatError;

    fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
        Ok(Self(match s.strip_suffix('%') {
            Some(prefix) => prefix.parse::<UnitIntervalValue>()? / 100.0,
            None => s.parse::<UnitIntervalValue>()?,
        }))
    }
}

impl core::fmt::Debug for UnitIntervalScore {
    fn fmt(&self, f: &mut Formatter) -> std::fmt::Result {
        write!(
            f,
            "{:.precision$}%",
            self.0 * 100.0,
            precision = f.precision().unwrap_or(2)
        )
    }
}

impl PartialEq for UnitIntervalScore {
    fn eq(&self, other: &Self) -> bool {
        self.0.eq(&other.0)
    }
}

impl PartialOrd for UnitIntervalScore {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        self.0.partial_cmp(&other.0)
    }
}

impl Add for UnitIntervalScore {
    type Output = f32;

    fn add(self, rhs: Self) -> Self::Output {
        self.0 + rhs.0
    }
}

impl Mul<f32> for UnitIntervalScore {
    type Output = Self;

    fn mul(self, rhs: f32) -> Self::Output {
        Self(self.0 * rhs)
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoredBubbleMark {
    /// The location of the bubble mark in the grid. Uses side/column/row, not
    /// x/y.
    pub location: GridLocation,

    /// The score for the match between the source image and the template: the
    /// fraction of the template area where the scan does not contradict the
    /// template. This is the highest value found when looking around
    /// `expected_bounds` for the bubble. 100% is a perfect match, but the score
    /// cannot drop below the template's blank-paper fraction (roughly two
    /// thirds), because those pixels count no matter what the scan holds there.
    /// Only the ordering of these scores across candidate positions is used;
    /// see `BubbleRegion` for what the score does and does not measure.
    pub match_score: UnitIntervalScore,

    /// The score for the fill of the bubble at `matched_bounds`: the fraction of
    /// the template area covered by ink the blank template does not have. Only
    /// the template's blank-paper pixels can contribute, so the score is capped
    /// at that fraction of the template area — roughly two thirds — and a
    /// completely filled bubble scores near that cap rather than at 100%. Mark
    /// thresholds are calibrated on this scale.
    pub fill_score: UnitIntervalScore,

    /// The expected bounds of the bubble mark in the scanned source image.
    pub expected_bounds: Rect,

    /// The bounds of the bubble mark in the scanned source image that was
    /// determined to be the best match.
    pub matched_bounds: Rect,
}

impl Debug for ScoredBubbleMark {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ScoredBubbleMark")
            .field("location", &self.location)
            .field("match_score", &self.match_score)
            .field("fill_score", &self.fill_score)
            .field("expected_bounds", &self.expected_bounds)
            .field("matched_bounds", &self.matched_bounds)
            .finish_non_exhaustive()
    }
}

pub const DEFAULT_MAXIMUM_SEARCH_DISTANCE: u32 = 7;

pub type ScoredBubbleMarks = Vec<(GridPosition, Option<ScoredBubbleMark>)>;

#[allow(clippy::too_many_arguments, clippy::result_large_err)]
pub(crate) fn score_bubble_marks_from_grid_layout(
    ballot_image: &BallotImage,
    label: &str,
    bubble_template: &GrayImage,
    timing_marks: &TimingMarks,
    grid_layout: &GridLayout,
    detected_vertical_streaks: &[VerticalStreak],
    sheet_number: u32,
    side: BallotSide,
) -> Result<ScoredBubbleMarks> {
    let scored_bubbles = grid_layout
        .grid_positions
        .par_iter()
        .filter_map(|grid_position| {
            let location = grid_position.location();

            if !(grid_position.sheet_number() == sheet_number && location.side == side) {
                return None;
            }

            // If a grid position can't be located within the detected
            // timing-mark grid, fail loudly rather than silently dropping the
            // position. Dropping leaves `marks` as a partial subset of the
            // gridLayout, which downstream TS interpretation assumes is
            // complete — see `getAllPossibleAdjudicationReasons` in
            // `libs/ballot-interpreter/src/adjudication_reasons.ts`. The
            // expected_ballot_hash check earlier in the pipeline catches the
            // realistic ways this would otherwise happen (a ballot from a
            // different election or paper size), but we surface a typed error
            // here as a defense-in-depth so any future invariant break is
            // visible rather than producing a crash deep in TS.
            let Some(expected_bubble_center) =
                timing_marks.point_for_location(location.column, location.row)
            else {
                return Some(Err(Error::GridPositionOutsideTimingMarkGrid {
                    label: label.to_owned(),
                    contest_id: grid_position.contest_id(),
                    column: location.column,
                    row: location.row,
                }));
            };

            let scored_bubble_mark = score_bubble_mark(
                ballot_image,
                bubble_template,
                expected_bubble_center,
                &location,
                DEFAULT_MAXIMUM_SEARCH_DISTANCE,
            );

            Some(Ok((grid_position.clone(), scored_bubble_mark)))
        })
        .collect::<Result<Vec<_>>>()?;

    // Check for vertical streaks after collecting
    for (_, scored_bubble_mark) in &scored_bubbles {
        if let Some(scored_bubble_mark) = scored_bubble_mark {
            if detected_vertical_streaks.iter().any(|streak| {
                Rect::new(
                    *streak.x_range.start(),
                    0,
                    (*streak.x_range.end() - *streak.x_range.start() + 1) as u32,
                    ballot_image.height(),
                )
                .intersect(&scored_bubble_mark.matched_bounds)
                .is_some()
            }) {
                return Err(Error::VerticalStreaksDetected {
                    label: label.to_owned(),
                    x_coordinates: detected_vertical_streaks
                        .iter()
                        .flat_map(|streak| streak.x_range.clone())
                        .collect(),
                });
            }
        }
    }

    ballot_image.debug().write("scored_bubble_marks", |canvas| {
        debug::draw_scored_bubble_marks_debug_image_mut(
            canvas,
            &scored_bubbles,
            detected_vertical_streaks,
            timing_marks,
            ballot_image,
            bubble_template,
        );
    });

    Ok(scored_bubbles)
}

/// A region of a ballot image overlaid with a bubble template at a specific
/// position. Provides semantic operations (match scoring, fill scoring, pixel
/// iteration) over raw image buffers without allocating intermediate images.
///
/// See the "Score Bubble Marks" section of `README.md` for details on the
/// template matching and fill scoring algorithms.
///
/// The bubble template is a binarized image of what a blank (unfilled) bubble
/// looks like: **black** pixels are the bubble outline, and **white** pixels
/// are the blank paper inside and outside the bubble.
///
/// ## Match score
///
/// Measures how well the template aligns with the scanned image at this
/// position. A pixel "matches" when the scan agrees with the template:
/// - **Template is white** (blank paper): always matches, since blank paper
///   can appear light if no mark was made or dark if the area was marked
///   by the voter. These are "don't care" pixels for alignment purposes.
/// - **Template is black** (bubble outline): matches only if the scanned
///   pixel is also dark, confirming the outline is where we expect it.
///
/// This gives the condition: `source_is_dark || template_is_white`. A higher
/// match score means the bubble outline in the scan aligns well with the
/// template — used to find the best bubble position within a search window.
///
/// Read the other way around, the *only* pixels that fail that condition are
/// the ones where the template expects the outline but the scan came back
/// light, so maximizing the match score is minimizing that single count. The
/// white pixels contribute the same fixed number at every candidate position,
/// which is what keeps alignment independent of how filled the bubble is: a
/// marked bubble and a blank one at the same position score identically. An
/// equality test (`source_is_dark == template_is_black`) would not — it drags
/// the search off a filled bubble and onto the surrounding margin, looking for
/// the blank paper the template expects inside the outline.
///
/// One consequence of counting the white pixels unconditionally is that the
/// score's absolute value carries little information: they put a floor under it
/// (see [`ScoredBubbleMark::match_score`]). Only the ordering across candidate
/// positions is used, and adding that fixed count to every candidate cannot
/// change it.
///
/// ## Fill score
///
/// Measures how much ink is present where blank paper is expected. A pixel is
/// "filled" when the template is white (expecting blank paper) but the scan
/// is dark (ink present). This gives: `source_is_dark && template_is_white`.
/// A higher fill score means more of the bubble interior has been marked by
/// the voter.
pub(crate) struct BubbleRegion<'a> {
    image_pixels: &'a [u8],
    image_stride: usize,
    template_pixels: &'a [u8],
    width: usize,
    height: usize,
    region_x: usize,
    region_y: usize,
    threshold: u8,
}

impl<'a> BubbleRegion<'a> {
    pub fn new(img: &'a GrayImage, template: &'a GrayImage, x: u32, y: u32, threshold: u8) -> Self {
        Self {
            image_pixels: img.as_raw(),
            image_stride: img.width() as usize,
            template_pixels: template.as_raw(),
            width: template.width() as usize,
            height: template.height() as usize,
            region_x: x as usize,
            region_y: y as usize,
            threshold,
        }
    }

    /// Iterates over each pixel in the region, calling `f(px, py,
    /// source_is_dark, template_is_white)` for each. Coordinates are relative
    /// to the region origin.
    ///
    /// Using `#[inline(always)]` here because this abstraction prevents the
    /// compiler from properly optimizing callers if it is not inlined. I've
    /// measured this using the included project benchmarks on Rust 1.93.
    #[allow(clippy::inline_always)]
    #[inline(always)]
    fn for_each_pixel(&self, mut f: impl FnMut(usize, usize, bool, bool)) {
        let mut img_row_start = self.region_y * self.image_stride + self.region_x;
        for py in 0..self.height {
            let img_row = &self.image_pixels[img_row_start..img_row_start + self.width];
            let tmpl_row = &self.template_pixels[py * self.width..(py + 1) * self.width];
            for (px, (&source_val, &tmpl_val)) in img_row.iter().zip(tmpl_row.iter()).enumerate() {
                f(px, py, source_val <= self.threshold, tmpl_val == 255);
            }
            img_row_start += self.image_stride;
        }
    }

    /// Computes the match score. See [`BubbleRegion`] for details.
    pub fn match_score(&self) -> UnitIntervalScore {
        let mut matching = 0u32;
        self.for_each_pixel(|_, _, source_dark, tmpl_white| {
            if source_dark || tmpl_white {
                matching += 1;
            }
        });
        UnitIntervalScore(matching as f32 / (self.width * self.height) as f32)
    }

    /// Computes the fill score. See [`BubbleRegion`] for details.
    pub fn fill_score(&self) -> UnitIntervalScore {
        let mut filled = 0u32;
        self.for_each_pixel(|_, _, source_dark, tmpl_white| {
            if source_dark && tmpl_white {
                filled += 1;
            }
        });
        UnitIntervalScore(filled as f32 / (self.width * self.height) as f32)
    }

    /// Calls `f(px, py)` for each filled pixel (template white AND source dark).
    /// Coordinates are relative to the region origin.
    pub fn for_each_filled_pixel(&self, mut f: impl FnMut(usize, usize)) {
        self.for_each_pixel(|px, py, source_dark, tmpl_white| {
            if source_dark && tmpl_white {
                f(px, py);
            }
        });
    }
}

/// The best template placement found by a bubble search.
struct BestMatch {
    bounds: Rect,
    score: UnitIntervalScore,
}

/// Bit-packed view of the pixels a bubble search touches: one `u64` per row
/// of the search window with bit `c` set when the pixel at window column `c`
/// is dark, and one `u64` per template row with bit `c` set when the template
/// pixel is white. The match count at offset `(dx, dy)` — the number of
/// pixels where `source_is_dark || template_is_white`, exactly as
/// [`BubbleRegion::match_score`] counts them — is then a `popcount` of
/// `(window_row >> dx) | template_row` per overlapped row, masked to the
/// template width.
struct PackedBubbleWindow {
    window_rows: Vec<u64>,
    template_rows: Vec<u64>,
    template_width_mask: u64,
    /// Number of candidate offsets along each axis (`2 * search distance`).
    offsets_per_axis: usize,
}

impl PackedBubbleWindow {
    /// Packs the search window whose offset `(0, 0)` places the template's
    /// top-left corner at `(left - distance, top - distance)`. Returns `None`
    /// when any candidate placement would fall outside the image (the caller
    /// must handle edge clipping) or when a window row does not fit in a
    /// `u64`.
    fn new(
        img: &GrayImage,
        template: &GrayImage,
        left: PixelPosition,
        top: PixelPosition,
        distance: PixelUnit,
        threshold: u8,
    ) -> Option<Self> {
        fn pack_row(row: &[u8], is_set: impl Fn(u8) -> bool) -> u64 {
            row.iter()
                .enumerate()
                .fold(0u64, |bits, (c, &p)| bits | (u64::from(is_set(p)) << c))
        }

        let (template_width, template_height) = template.dimensions();
        if template_width == 0 || template_height == 0 || distance == 0 {
            return None;
        }
        let offsets_per_axis = distance as usize * 2;
        // Offsets range over `-distance..distance`, so the window spans
        // `template size + 2 * distance - 1` pixels along each axis.
        let window_width = template_width as usize + offsets_per_axis - 1;
        let window_height = template_height as usize + offsets_per_axis - 1;
        if window_width > u64::BITS as usize {
            return None;
        }

        let window_left = left.checked_sub(distance as PixelPosition)?;
        let window_top = top.checked_sub(distance as PixelPosition)?;
        if window_left < 0
            || window_top < 0
            || window_left as usize + window_width > img.width() as usize
            || window_top as usize + window_height > img.height() as usize
        {
            return None;
        }

        let stride = img.width() as usize;
        let pixels = img.as_raw();
        let mut window_rows = Vec::with_capacity(window_height);
        let mut row_start = window_top as usize * stride + window_left as usize;
        for _ in 0..window_height {
            window_rows.push(pack_row(
                &pixels[row_start..row_start + window_width],
                |p| p <= threshold,
            ));
            row_start += stride;
        }

        let template_rows = template
            .as_raw()
            .chunks_exact(template_width as usize)
            .map(|row| pack_row(row, |p| p == 255))
            .collect();

        Some(Self {
            window_rows,
            template_rows,
            template_width_mask: (1u64 << template_width) - 1,
            offsets_per_axis,
        })
    }

    /// Counts matching pixels (`source_is_dark || template_is_white`) with the
    /// template's top-left corner at window offset `(dx, dy)`.
    fn match_count(&self, dx: usize, dy: usize) -> u32 {
        self.window_rows[dy..dy + self.template_rows.len()]
            .iter()
            .zip(&self.template_rows)
            .map(|(&window, &template)| {
                (((window >> dx) | template) & self.template_width_mask).count_ones()
            })
            .sum()
    }

    /// Finds the offset with the highest match count, scoring every offset.
    /// Iterates x-major with a strictly-greater update, matching
    /// [`find_best_match_bytes`]'s tie-breaking exactly.
    fn find_best(&self) -> Option<(usize, usize, u32)> {
        let mut best: Option<(usize, usize, u32)> = None;
        for dx in 0..self.offsets_per_axis {
            for dy in 0..self.offsets_per_axis {
                let count = self.match_count(dx, dy);
                if best.is_none_or(|(_, _, best_count)| count > best_count) {
                    best = Some((dx, dy, count));
                }
            }
        }
        best
    }
}

/// Finds the best template placement using bit-packed rows and `popcount`.
/// Returns `None` when any candidate placement would fall outside the image
/// or a window row would not fit in a `u64`; the caller must then use
/// [`find_best_match_bytes`], which clips candidates instead. When both are
/// applicable they produce bit-identical results (see the property test
/// pinning one against the other).
fn find_best_match_packed(
    img: &GrayImage,
    template: &GrayImage,
    left: PixelPosition,
    top: PixelPosition,
    distance: PixelUnit,
    threshold: u8,
) -> Option<BestMatch> {
    let (width, height) = template.dimensions();
    let packed = PackedBubbleWindow::new(img, template, left, top, distance, threshold)?;
    packed.find_best().map(|(dx, dy, count)| BestMatch {
        bounds: Rect::new(
            left - distance as PixelPosition + dx as PixelPosition,
            top - distance as PixelPosition + dy as PixelPosition,
            width,
            height,
        ),
        score: UnitIntervalScore(count as f32 / (width * height) as f32),
    })
}

/// Finds the best template placement by scoring each candidate with the
/// byte-per-pixel [`BubbleRegion`] loop, skipping candidates that fall
/// outside the image.
fn find_best_match_bytes(
    img: &GrayImage,
    template: &GrayImage,
    left: PixelPosition,
    top: PixelPosition,
    distance: PixelUnit,
    threshold: u8,
) -> Option<BestMatch> {
    let (width, height) = template.dimensions();
    let (img_width, img_height) = img.dimensions();
    let mut best_match: Option<BestMatch> = None;

    for offset_x in -(distance as PixelPosition)..(distance as PixelPosition) {
        let x = left + offset_x;
        if x < 0 || x as u32 + width > img_width {
            continue;
        }

        for offset_y in -(distance as PixelPosition)..(distance as PixelPosition) {
            let y = top + offset_y;
            if y < 0 || y as u32 + height > img_height {
                continue;
            }

            let region = BubbleRegion::new(img, template, x as u32, y as u32, threshold);
            let match_score = region.match_score();

            match best_match {
                None => {
                    best_match = Some(BestMatch {
                        bounds: Rect::new(x, y, width, height),
                        score: match_score,
                    });
                }
                Some(ref mut best_match) => {
                    if match_score > best_match.score {
                        best_match.bounds = Rect::new(x, y, width, height);
                        best_match.score = match_score;
                    }
                }
            }
        }
    }

    best_match
}

/// Scores a bubble mark within a scanned ballot image.
///
/// Compares the source image to the bubble template image at every pixel location
/// within `maximum_search_distance` pixels of `expected_bubble_center` in all
/// directions. This comparison produces a match score in the unit interval for
/// each location. The highest match score is used to determine the bounds of
/// the bubble mark in the source image. The best matching bounds is also where
/// we compute a fill score for the bubble.
///
/// We look for the highest match score in the vicinity of where we expect
/// because the bubble mark may not be exactly where we expect in the scanned
/// image due to stretching or other distortions.
pub(crate) fn score_bubble_mark(
    ballot_image: &BallotImage,
    bubble_template: &GrayImage,
    expected_bubble_center: Point<SubPixelUnit>,
    location: &GridLocation,
    maximum_search_distance: PixelUnit,
) -> Option<ScoredBubbleMark> {
    let center_x = expected_bubble_center.x.round() as PixelPosition;
    let center_y = expected_bubble_center.y.round() as PixelPosition;
    let width = bubble_template.width();
    let height = bubble_template.height();
    let left = center_x - (width / 2) as PixelPosition;
    let top = center_y - (height / 2) as PixelPosition;
    let expected_bounds = Rect::new(left, top, width, height);

    let img = ballot_image.image();
    let threshold_val = ballot_image.threshold();

    // The packed search requires every candidate placement to be inside the
    // image; near the edges it returns `None` and the byte path, which clips
    // candidates instead, takes over. Interior bubbles — all of them, in
    // practice — take the packed path.
    let best_match = find_best_match_packed(
        img,
        bubble_template,
        left,
        top,
        maximum_search_distance,
        threshold_val,
    )
    .or_else(|| {
        find_best_match_bytes(
            img,
            bubble_template,
            left,
            top,
            maximum_search_distance,
            threshold_val,
        )
    })?;
    let best_region = BubbleRegion::new(
        img,
        bubble_template,
        best_match.bounds.left() as u32,
        best_match.bounds.top() as u32,
        threshold_val,
    );
    let fill_score = best_region.fill_score();

    Some(ScoredBubbleMark {
        location: *location,
        match_score: best_match.score,
        fill_score,
        expected_bounds,
        matched_bounds: best_match.bounds,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoredPositionArea {
    pub grid_position: GridPosition,
    pub shape: Quadrilateral,
    pub score: UnitIntervalScore,
}

pub type ScoredPositionAreas = Vec<ScoredPositionArea>;

/// Computes scores for all the write-in areas in a scanned ballot image. This could
/// be used to determine which write-in areas are most likely to contain a write-in
/// vote even if the bubble is not filled in.
pub(crate) fn score_write_in_areas(
    ballot_image: &BallotImage,
    timing_marks: &TimingMarks,
    grid_layout: &GridLayout,
    sheet_number: u32,
    side: BallotSide,
) -> Vec<ScoredPositionArea> {
    let scored_write_in_areas = grid_layout
        .write_in_positions()
        .filter(|grid_position| {
            let location = grid_position.location();
            grid_position.sheet_number() == sheet_number && location.side == side
        })
        .filter_map(|grid_position| score_write_in_area(ballot_image, timing_marks, grid_position))
        .collect();

    ballot_image
        .debug()
        .write("scored_write_in_areas", |canvas| {
            debug::draw_scored_write_in_areas(canvas, &scored_write_in_areas);
        });

    scored_write_in_areas
}

fn score_write_in_area(
    img: &BallotImage,
    timing_marks: &TimingMarks,
    grid_position: &GridPosition,
) -> Option<ScoredPositionArea> {
    let GridPosition::WriteIn { write_in_area, .. } = *grid_position else {
        return None;
    };

    let top_left_corner = timing_marks.point_for_location(write_in_area.x, write_in_area.y)?;
    let top_right_corner =
        timing_marks.point_for_location(write_in_area.x + write_in_area.width, write_in_area.y)?;
    let bottom_left_corner =
        timing_marks.point_for_location(write_in_area.x, write_in_area.y + write_in_area.height)?;
    let bottom_right_corner = timing_marks.point_for_location(
        write_in_area.x + write_in_area.width,
        write_in_area.y + write_in_area.height,
    )?;
    let shape = Quadrilateral {
        top_left: top_left_corner,
        top_right: top_right_corner,
        bottom_left: bottom_left_corner,
        bottom_right: bottom_right_corner,
    };
    let counted = count_pixels_in_shape(img, &shape);
    let score = UnitIntervalScore(counted.ratio());

    Some(ScoredPositionArea {
        grid_position: grid_position.clone(),
        shape,
        score,
    })
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test {
    use super::*;
    use crate::ballot_card::BallotImage;
    use image::{GenericImageView, GrayImage, Luma};
    use proptest::prelude::*;
    use types_rs::ballot_card::BallotSide;
    use types_rs::geometry::Point;

    fn approx_eq(a: f32, b: f32) -> bool {
        (a - b).abs() < 1e-4
    }

    #[test]
    fn unit_interval_score_from_str_parses_bare_float() {
        for (input, expected) in [("0.5", 0.5), ("0", 0.0), ("1", 1.0)] {
            let parsed = input.parse::<UnitIntervalScore>().unwrap();
            assert!(
                approx_eq(parsed.0, expected),
                "{input} parsed to {parsed:?}, expected ~{expected}",
            );
        }
    }

    #[test]
    fn unit_interval_score_from_str_parses_percent_suffix() {
        for (input, expected) in [("50%", 0.5), ("0%", 0.0), ("100%", 1.0), ("12.5%", 0.125)] {
            let parsed = input.parse::<UnitIntervalScore>().unwrap();
            assert!(
                approx_eq(parsed.0, expected),
                "{input} parsed to {parsed:?}, expected ~{expected}",
            );
        }
    }

    #[test]
    fn unit_interval_score_from_str_round_trips_through_display() {
        // `Display` always emits a `%` suffix, and `FromStr` accepts that form.
        for value in [0.0, 0.123_45, 0.5, 0.999, 1.0] {
            let original = UnitIntervalScore(value);
            let rendered = format!("{original}");
            let reparsed: UnitIntervalScore = rendered.parse().unwrap();
            assert!(
                approx_eq(reparsed.0, original.0),
                "{rendered} reparsed to {reparsed:?}, expected ~{original:?}",
            );
        }
    }

    #[test]
    fn unit_interval_score_from_str_rejects_garbage() {
        assert!("".parse::<UnitIntervalScore>().is_err());
        assert!("%".parse::<UnitIntervalScore>().is_err());
        assert!("abc".parse::<UnitIntervalScore>().is_err());
        assert!("50.x%".parse::<UnitIntervalScore>().is_err());
    }

    /// Generates an image from two images where corresponding pixels in `compare`
    /// that are darker than their counterpart in `base` show up with the luminosity
    /// difference between the two. This is useful for determining where a
    /// light-background form was filled out, for example.
    ///
    /// Note that the sizes of the images must be equal.
    ///
    /// ```text
    ///         BASE                  COMPARE                 DIFF
    /// ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
    /// │                   │  │        █ █ ███    │  │        █ █ ███    │
    /// │ █ █               │  │ █ █    ███  █     │  │        ███  █     │
    /// │  █                │  │  █     █ █ ███    │  │        █ █ ███    │
    /// │ █ █ █████████████ │  │ █ █ █████████████ │  │                   │
    /// └───────────────────┘  └───────────────────┘  └───────────────────┘
    /// ```
    fn diff(base: &GrayImage, compare: &GrayImage) -> GrayImage {
        assert_eq!(base.dimensions(), compare.dimensions());
        let mut out = GrayImage::new(base.width(), base.height());
        base.enumerate_pixels().for_each(|(x, y, base_pixel)| {
            let compare_pixel = compare.get_pixel(x, y);
            let d = base_pixel.0[0].saturating_sub(compare_pixel.0[0]);
            out.put_pixel(x, y, Luma([u8::MAX - d]));
        });
        out
    }

    fn make_ballot_image(width: u32, height: u32) -> BallotImage {
        BallotImage::for_testing(
            GrayImage::from_pixel(width, height, image::Luma([200])),
            128,
        )
    }

    fn make_location() -> GridLocation {
        GridLocation::new(BallotSide::Front, 0.0, 0.0)
    }

    #[test]
    fn score_bubble_mark_returns_none_when_bubble_is_entirely_off_image() {
        let ballot_image = make_ballot_image(100, 100);
        let template = GrayImage::new(20, 20);
        let location = make_location();

        // Center way off the right edge
        let result = score_bubble_mark(
            &ballot_image,
            &template,
            Point { x: 200.0, y: 50.0 },
            &location,
            DEFAULT_MAXIMUM_SEARCH_DISTANCE,
        );
        assert!(result.is_none());

        // Center way off the bottom edge
        let result = score_bubble_mark(
            &ballot_image,
            &template,
            Point { x: 50.0, y: 200.0 },
            &location,
            DEFAULT_MAXIMUM_SEARCH_DISTANCE,
        );
        assert!(result.is_none());
    }

    #[test]
    fn score_bubble_mark_does_not_panic_near_edges() {
        let ballot_image = make_ballot_image(100, 100);
        let template = GrayImage::new(20, 20);
        let location = make_location();

        // Near left edge
        let _ = score_bubble_mark(
            &ballot_image,
            &template,
            Point { x: 5.0, y: 50.0 },
            &location,
            DEFAULT_MAXIMUM_SEARCH_DISTANCE,
        );

        // Near top edge
        let _ = score_bubble_mark(
            &ballot_image,
            &template,
            Point { x: 50.0, y: 5.0 },
            &location,
            DEFAULT_MAXIMUM_SEARCH_DISTANCE,
        );

        // Near right edge
        let _ = score_bubble_mark(
            &ballot_image,
            &template,
            Point { x: 95.0, y: 50.0 },
            &location,
            DEFAULT_MAXIMUM_SEARCH_DISTANCE,
        );

        // Near bottom edge
        let _ = score_bubble_mark(
            &ballot_image,
            &template,
            Point { x: 50.0, y: 95.0 },
            &location,
            DEFAULT_MAXIMUM_SEARCH_DISTANCE,
        );
    }

    /// Computes the match score using the original allocating pipeline
    /// (`threshold` -> `diff` -> `count_pixels`) as a reference implementation.
    fn reference_match_score(
        source: &GrayImage,
        template: &GrayImage,
        threshold_val: u8,
    ) -> UnitIntervalScore {
        use crate::image_utils::{count_pixels, threshold};
        let white = image::Luma([255u8]);
        let binarized = threshold(source, threshold_val);
        let match_diff = diff(&binarized, template);
        UnitIntervalScore(count_pixels(&match_diff, white).ratio())
    }

    proptest! {
        #[test]
        fn score_bubble_mark_never_panics(
            img_w in 10u32..200,
            img_h in 10u32..200,
            tmpl_w in 5u32..30,
            tmpl_h in 5u32..30,
            center_x in -20.0f32..220.0,
            center_y in -20.0f32..220.0,
            search_dist in 0u32..15,
        ) {
            let ballot_image = make_ballot_image(img_w, img_h);
            let template = GrayImage::new(tmpl_w, tmpl_h);
            let location = make_location();

            let _ = score_bubble_mark(
                &ballot_image,
                &template,
                Point { x: center_x, y: center_y },
                &location,
                search_dist,
            );
        }

        #[test]
        fn compute_match_score_agrees_with_reference_pipeline_proptest(
            img_pixels in proptest::collection::vec(proptest::num::u8::ANY, 10_000),
            tmpl_pixels in proptest::collection::vec(
                proptest::strategy::Union::new([
                    proptest::strategy::Just(0u8).boxed(),
                    proptest::strategy::Just(255u8).boxed(),
                ]),
                400,
            ),
            threshold_val in 1u8..254,
            x in 0u32..80,
            y in 0u32..80,
        ) {
            let img = GrayImage::from_raw(100, 100, img_pixels).unwrap();
            let template = GrayImage::from_raw(20, 20, tmpl_pixels).unwrap();

            let actual = BubbleRegion::new(&img, &template, x, y, threshold_val).match_score();
            let expected = reference_match_score(
                &img.view(x, y, 20, 20).to_image(),
                &template,
                threshold_val,
            );

            prop_assert!(
                (actual.0 - expected.0).abs() < f32::EPSILON,
                "compute_match_score={} != reference={}", actual.0, expected.0
            );
        }

        #[test]
        fn compute_fill_score_agrees_with_reference_pipeline_proptest(
            img_pixels in proptest::collection::vec(proptest::num::u8::ANY, 10_000),
            tmpl_pixels in proptest::collection::vec(
                proptest::strategy::Union::new([
                    proptest::strategy::Just(0u8).boxed(),
                    proptest::strategy::Just(255u8).boxed(),
                ]),
                400,
            ),
            threshold_val in 1u8..254,
            x in 0u32..80,
            y in 0u32..80,
        ) {
            use crate::image_utils::{count_pixels, threshold};
            let img = GrayImage::from_raw(100, 100, img_pixels).unwrap();
            let template = GrayImage::from_raw(20, 20, tmpl_pixels).unwrap();

            let actual = BubbleRegion::new(&img, &template, x, y, threshold_val).fill_score();

            // Reference: threshold -> diff(template, binarized) -> count black
            let binarized = threshold(&img.view(x, y, 20, 20).to_image(), threshold_val);
            let diff_image = diff(&template, &binarized);
            let expected = UnitIntervalScore(count_pixels(&diff_image, image::Luma([0u8])).ratio());

            prop_assert!(
                (actual.0 - expected.0).abs() < f32::EPSILON,
                "compute_fill_score={} != reference={}", actual.0, expected.0
            );
        }

        /// Whenever the packed search is applicable (the whole search window
        /// is inside the image), it must be bit-identical to the
        /// byte-per-pixel search: same bounds, same score, same tie-breaks.
        /// Placements range past the image edges to also cover the packed
        /// search declining (returning `None`) so the byte path takes over.
        #[test]
        fn packed_search_is_bit_identical_to_byte_search(
            img_pixels in proptest::collection::vec(proptest::num::u8::ANY, 14_400),
            tmpl_pixels in proptest::collection::vec(
                proptest::strategy::Union::new([
                    proptest::strategy::Just(0u8).boxed(),
                    proptest::strategy::Just(255u8).boxed(),
                ]),
                400,
            ),
            threshold_val in 1u8..254,
            left in -20i32..140,
            top in -20i32..140,
            search_dist in 0u32..12,
        ) {
            let img = GrayImage::from_raw(120, 120, img_pixels).unwrap();
            let template = GrayImage::from_raw(20, 20, tmpl_pixels).unwrap();

            if let Some(packed) = find_best_match_packed(
                &img, &template, left, top, search_dist, threshold_val,
            ) {
                let bytes = find_best_match_bytes(
                    &img, &template, left, top, search_dist, threshold_val,
                ).unwrap();
                prop_assert_eq!(bytes.bounds, packed.bounds);
                prop_assert_eq!(bytes.score.0.to_bits(), packed.score.0.to_bits());
            }
        }
    }
}
