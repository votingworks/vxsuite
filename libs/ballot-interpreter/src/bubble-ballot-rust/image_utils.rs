use std::fmt::Display;
use std::io::Cursor;
use std::mem::swap;
use std::ops::RangeInclusive;
use std::str::FromStr;

use image::{GrayImage, Luma, Rgb};
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use types_rs::geometry::{PixelPosition, PixelUnit};
use types_rs::{election::UnitIntervalValue, geometry::Quadrilateral};

use crate::ballot_card::BallotImage;
use crate::{debug, scoring::UnitIntervalScore};

pub const BLACK: Luma<u8> = Luma([0]);
pub const WHITE_RGB: Rgb<u8> = Rgb([255, 255, 255]);
pub const RED: Rgb<u8> = Rgb([255, 0, 0]);
pub const DARK_RED: Rgb<u8> = Rgb([127, 0, 0]);
pub const GREEN: Rgb<u8> = Rgb([0, 255, 0]);
pub const DARK_GREEN: Rgb<u8> = Rgb([0, 127, 0]);
pub const BLUE: Rgb<u8> = Rgb([0, 0, 255]);
pub const DARK_BLUE: Rgb<u8> = Rgb([0, 0, 127]);
pub const ORANGE: Rgb<u8> = Rgb([255, 127, 0]);
pub const YELLOW: Rgb<u8> = Rgb([255, 255, 0]);
pub const INDIGO: Rgb<u8> = Rgb([75, 0, 130]);
pub const VIOLET: Rgb<u8> = Rgb([143, 0, 255]);
pub const CYAN: Rgb<u8> = Rgb([0, 255, 255]);
pub const DARK_CYAN: Rgb<u8> = Rgb([0, 127, 127]);
pub const PINK: Rgb<u8> = Rgb([255, 0, 255]);
pub const RAINBOW: [Rgb<u8>; 7] = [RED, ORANGE, YELLOW, GREEN, BLUE, INDIGO, VIOLET];
pub const DARK_RAINBOW: [Rgb<u8>; 5] = [DARK_RED, DARK_GREEN, DARK_CYAN, DARK_BLUE, INDIGO];

pub fn rainbow() -> impl Iterator<Item = Rgb<u8>> {
    RAINBOW.iter().copied().cycle()
}

pub fn dark_rainbow() -> impl Iterator<Item = Rgb<u8>> {
    DARK_RAINBOW.iter().copied().cycle()
}

/// An inset is a set of offsets from the edges of an image.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Inset<T = PixelUnit> {
    /// The number of units to remove from the top of the image.
    pub top: T,

    /// The number of units to remove from the bottom of the image.
    pub bottom: T,

    /// The number of units to remove from the left of the image.
    pub left: T,

    /// The number of units to remove from the right of the image.
    pub right: T,
}

impl<T> Default for Inset<T>
where
    T: Default,
{
    fn default() -> Self {
        Self {
            top: T::default(),
            bottom: T::default(),
            left: T::default(),
            right: T::default(),
        }
    }
}

impl<T> Inset<T>
where
    T: Default + PartialEq,
{
    pub fn is_zero(&self) -> bool {
        self.top == T::default()
            && self.bottom == T::default()
            && self.left == T::default()
            && self.right == T::default()
    }

    /// Rotates in place, swapping left/right and top/bottom.
    pub fn rotate180(&mut self) {
        swap(&mut self.left, &mut self.right);
        swap(&mut self.top, &mut self.bottom);
    }
}

/// Bleed the given luma value outwards from any pixels that match it.
pub fn bleed(img: &GrayImage, luma: Luma<u8>) -> GrayImage {
    let mut out = img.clone();
    for (x, y, pixel) in img.enumerate_pixels() {
        if *pixel != luma {
            continue;
        }

        if x > 0 {
            out.put_pixel(x - 1, y, *pixel);
        }
        if x < img.width() - 1 {
            out.put_pixel(x + 1, y, *pixel);
        }
        if y > 0 {
            out.put_pixel(x, y - 1, *pixel);
        }
        if y < img.height() - 1 {
            out.put_pixel(x, y + 1, *pixel);
        }
    }

    out
}

/// Contains the result of examining an image for pixels that match a given
/// criterion.
#[derive(Debug, Clone, Copy, Default)]
pub struct CountedPixels {
    /// The number of pixels examined, e.g. the number of pixels in the shape or
    /// region of interest.
    pub examined: usize,

    /// The number of pixels that matched the criterion.
    pub matched: usize,
}

impl CountedPixels {
    /// Returns the ratio of matched pixels to examined pixels.
    pub fn ratio(&self) -> f32 {
        self.matched as f32 / self.examined as f32
    }
}

/// Determines the number of pixels in an image that match the given luma.
pub fn count_pixels(img: &GrayImage, luma: Luma<u8>) -> CountedPixels {
    CountedPixels {
        examined: img.width() as usize * img.height() as usize,
        matched: img.pixels().filter(|p| **p == luma).count(),
    }
}

/// Count the number of pixels in an image that are within the given shape and
/// at or below the given threshold.
pub fn count_pixels_in_shape(ballot_image: &BallotImage, shape: &Quadrilateral) -> CountedPixels {
    let mut counted = CountedPixels::default();
    let bounds = shape.bounds();
    let width = ballot_image.width() as usize;
    let raw = ballot_image.image().as_raw();
    let thresh = ballot_image.threshold();
    let x_range = bounds.left().max(0)..bounds.right().min(ballot_image.width() as i32);
    let y_range = bounds.top().max(0)..bounds.bottom().min(ballot_image.height() as i32);
    // Iterate rows in the outer loop since the image data is stored row-major.
    for y in y_range {
        let row = &raw[y as usize * width..(y as usize + 1) * width];
        for x in x_range.clone() {
            if shape.contains_subpixel(x as f32 + 0.5, y as f32 + 0.5) {
                counted.examined += 1;
                if row[x as usize] <= thresh {
                    counted.matched += 1;
                }
            }
        }
    }
    counted
}

/// Copies a rectangular region of the given image into a new image.
///
/// Equivalent to `image.view(x, y, width, height).to_image()`, but copies
/// whole rows at a time rather than pixel by pixel, which measures about an
/// order of magnitude faster.
///
/// # Panics
///
/// Panics if the region extends beyond the image bounds.
pub(crate) fn crop_to_image(
    image: &GrayImage,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> GrayImage {
    assert!(
        x + width <= image.width() && y + height <= image.height(),
        "crop region must be within the image bounds"
    );
    let src_stride = image.width() as usize;
    let raw = image.as_raw();
    let mut out = Vec::with_capacity(width as usize * height as usize);
    for row in 0..height as usize {
        let start = (y as usize + row) * src_stride + x as usize;
        out.extend_from_slice(&raw[start..start + width as usize]);
    }
    GrayImage::from_vec(width, height, out).expect("buffer length matches dimensions")
}

/// Finds the inset of a scanned document in an image such that each side of the
/// inset has more than `min_ratio_above_threshold` of its pixels above the
/// given threshold.
#[allow(clippy::similar_names)]
pub fn find_scanned_document_inset(
    image: &GrayImage,
    threshold: u8,
    min_ratio_above_threshold: UnitIntervalValue,
) -> Option<Inset> {
    // Determines whether more than `required` of the pixels yielded by the
    // given iterator are above the threshold, stopping as soon as the answer
    // is known rather than counting every pixel.
    fn has_enough_above_threshold(
        pixels: impl Iterator<Item = u8>,
        threshold: u8,
        required: usize,
    ) -> bool {
        let mut count = 0;
        for luma in pixels {
            if luma > threshold {
                count += 1;
                if count > required {
                    return true;
                }
            }
        }
        false
    }

    let (width, height) = image.dimensions();
    let (max_x, max_y) = (width - 1, height - 1);
    let raw = image.as_raw();

    let row_pixels = |y: u32| {
        let row_start = y as usize * width as usize;
        raw[row_start..row_start + width as usize].iter().copied()
    };
    let column_pixels = |x: u32| raw[x as usize..].iter().step_by(width as usize).copied();

    let required_per_row = (width as f32 * min_ratio_above_threshold) as usize;
    let required_per_column = (height as f32 * min_ratio_above_threshold) as usize;

    let min_y_above_threshold = (0..height)
        .find(|y| has_enough_above_threshold(row_pixels(*y), threshold, required_per_row));
    let max_y_above_threshold = (0..height)
        .rev()
        .find(|y| has_enough_above_threshold(row_pixels(*y), threshold, required_per_row));
    let min_x_above_threshold = (0..width)
        .find(|x| has_enough_above_threshold(column_pixels(*x), threshold, required_per_column));
    let max_x_above_threshold = (0..width)
        .rev()
        .find(|x| has_enough_above_threshold(column_pixels(*x), threshold, required_per_column));

    match (
        min_x_above_threshold,
        min_y_above_threshold,
        max_x_above_threshold,
        max_y_above_threshold,
    ) {
        (
            Some(min_x_above_threshold),
            Some(min_y_above_threshold),
            Some(max_x_above_threshold),
            Some(max_y_above_threshold),
        ) => Some(Inset {
            top: min_y_above_threshold,
            bottom: max_y - max_y_above_threshold,
            left: min_x_above_threshold,
            right: max_x - max_x_above_threshold,
        }),
        _ => None,
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct VerticalStreak {
    pub(crate) x_range: RangeInclusive<PixelPosition>,
    pub(crate) scores: Vec<UnitIntervalScore>,
    pub(crate) longest_white_gaps: Vec<PixelUnit>,
}

impl VerticalStreak {
    /// Merges two streaks if they are adjacent or overlapping.
    #[allow(clippy::result_large_err)]
    fn coalesce(self, other: Self) -> Result<Self, (Self, Self)> {
        let (left, right) = if *self.x_range.start() <= *other.x_range.start() {
            (self, other)
        } else {
            (other, self)
        };

        // No overlap
        if *left.x_range.end() + 1 < *right.x_range.start() {
            return Err((left, right));
        }

        // Left fully contains right — nothing new to add.
        if *right.x_range.end() <= *left.x_range.end() {
            return Ok(left);
        }

        let overlap_size = (*left.x_range.end() + 1 - *right.x_range.start()) as usize;
        Ok(Self {
            x_range: *left.x_range.start()..=*right.x_range.end(),
            scores: [&left.scores, &right.scores[overlap_size..]].concat(),
            longest_white_gaps: [
                &left.longest_white_gaps,
                &right.longest_white_gaps[overlap_size..],
            ]
            .concat(),
        })
    }

    pub(crate) fn rotate180(&mut self, ballot_image_width: u32) {
        self.x_range = (ballot_image_width as i32 - 1 - *self.x_range.end())
            ..=(ballot_image_width as i32 - 1 - *self.x_range.start());
        self.scores.reverse();
        self.longest_white_gaps.reverse();
    }
}

/**
 * Detects vertical streaks in the given image (presumably resulting from debris
 * on the scanner glass).
 */
pub fn detect_vertical_streaks(ballot_image: &BallotImage) -> Vec<VerticalStreak> {
    // Look at each column of pixels in the image (ignoring
    // BORDER_COLUMNS_TO_EXCLUDE on either side).
    const BORDER_COLUMNS_TO_EXCLUDE: PixelUnit = 20;

    // If more than MIN_ONE_COLUMN_STREAK_SCORE percent of pixels in the column
    // are black pixel, it might be a streak. Since some thin streaks end
    // distributed across two columns when binarized, also check that more than
    // MIN_TWO_COLUMN_STREAK_SCORE percent of pixels are black pixels when
    // considering this column and the next column.
    //
    // Note: MIN_TWO_COLUMN_STREAK_SCORE is the main threshold that determines
    // what constitutes a streak.  MIN_ONE_COLUMN_STREAK_SCORE helps us ensure
    // that non-streak columns don't accidentally get included in streaks when
    // looking at adjacent pairs of columns.
    const MIN_ONE_COLUMN_STREAK_SCORE: UnitIntervalScore = UnitIntervalScore(0.25);
    const MIN_TWO_COLUMN_STREAK_SCORE: UnitIntervalScore = UnitIntervalScore(0.75);
    assert!(
        MIN_ONE_COLUMN_STREAK_SCORE * 2.0 <= MIN_TWO_COLUMN_STREAK_SCORE,
        "To ensure that we don't miss streaks that are distributed across two
        columns, MIN_ONE_COLUMN_STREAK_SCORE may be at most half of
        MIN_TWO_COLUMN_STREAK_SCORE"
    );

    // Filter out streaks that have gaps of white that are greater than
    // MAX_WHITE_GAP_PIXELS, since these are probably printed features, not
    // streaks. This relies on the invariant that there are no printed features
    // that span the entire page top to bottom without a gap greater than
    // MAX_WHITE_GAP_PIXELS.
    #[allow(clippy::items_after_statements)]
    const MAX_WHITE_GAP_PIXELS: PixelUnit = 15;

    let (width, height) = ballot_image.dimensions();
    let height_usize = height as usize;
    let width_usize = width as usize;
    let x_range = BORDER_COLUMNS_TO_EXCLUDE - 1..width - BORDER_COLUMNS_TO_EXCLUDE;
    let raw = ballot_image.image().as_raw();
    let thresh = ballot_image.threshold();

    // Count the black pixels in every column in a single row-major pass (the
    // image data is stored row-major, so walking columns directly would miss
    // cache on nearly every access). Only columns whose count clears
    // MIN_ONE_COLUMN_STREAK_SCORE — usually none — need the detailed
    // two-column analysis below, which reads just those columns.
    let mut column_black_counts = vec![0u32; width_usize];
    for row in raw.chunks_exact(width_usize) {
        for (count, &p) in column_black_counts.iter_mut().zip(row.iter()) {
            *count += u32::from(p <= thresh);
        }
    }

    // Two reusable buffers for binarized column data of candidate columns.
    let mut cur_col = vec![false; height_usize];
    let mut next_col = vec![false; height_usize];

    let fill_column = |buf: &mut [bool], x: usize| {
        let mut idx = x;
        for slot in buf.iter_mut() {
            *slot = raw[idx] <= thresh;
            idx += width_usize;
        }
    };

    let mut uncoalesced: Vec<VerticalStreak> = Vec::new();
    for x in x_range.start..=x_range.end - 2 {
        debug_assert!(x_range.contains(&(x + 1)));
        let cur_black_count = column_black_counts[x as usize];

        let column_streak_score = UnitIntervalScore(cur_black_count as f32 / height as f32);
        if column_streak_score >= MIN_ONE_COLUMN_STREAK_SCORE {
            fill_column(&mut cur_col, x as usize);
            fill_column(&mut next_col, (x + 1) as usize);

            // Compute two-column stats inline without allocating.
            let mut num_two_column_black = 0u32;
            let mut longest_white_gap: PixelUnit = 0;
            let mut current_white_gap: PixelUnit = 0;
            for y in 0..height_usize {
                if cur_col[y] || next_col[y] {
                    num_two_column_black += 1;
                    if current_white_gap > longest_white_gap {
                        longest_white_gap = current_white_gap;
                    }
                    current_white_gap = 0;
                } else {
                    current_white_gap += 1;
                }
            }
            longest_white_gap = longest_white_gap.max(current_white_gap);

            let two_column_streak_score =
                UnitIntervalScore(num_two_column_black as f32 / height as f32);
            if two_column_streak_score >= MIN_TWO_COLUMN_STREAK_SCORE
                && longest_white_gap <= MAX_WHITE_GAP_PIXELS
            {
                let next_black_count = column_black_counts[(x + 1) as usize];
                let next_column_streak_score =
                    UnitIntervalScore(next_black_count as f32 / height as f32);
                if next_column_streak_score < MIN_ONE_COLUMN_STREAK_SCORE {
                    uncoalesced.push(VerticalStreak {
                        x_range: x as PixelPosition..=x as PixelPosition,
                        scores: vec![two_column_streak_score],
                        longest_white_gaps: vec![longest_white_gap],
                    });
                } else {
                    uncoalesced.push(VerticalStreak {
                        x_range: x as PixelPosition..=(x + 1) as PixelPosition,
                        scores: vec![two_column_streak_score, next_column_streak_score],
                        longest_white_gaps: vec![longest_white_gap, longest_white_gap],
                    });
                }
            }
        }
    }

    let streaks = uncoalesced
        .into_iter()
        .coalesce(VerticalStreak::coalesce)
        .collect_vec();

    ballot_image.debug().write("vertical_streaks", |canvas| {
        debug::draw_vertical_streaks_debug_image_mut(
            canvas,
            ballot_image.threshold(),
            x_range,
            &streaks,
        );
    });

    streaks
}

/// Builds a luma histogram of the given pixels.
///
/// Accumulates into several interleaved shard histograms and sums them at the
/// end. Scanned ballots contain long runs of identical pixel values (blank
/// paper, black borders), and with a single histogram every increment in such
/// a run depends on the store of the previous one, so the CPU executes them
/// serially. Sharding gives each of the `HISTOGRAM_SHARDS` consecutive pixels
/// an independent histogram to increment, breaking the dependency chain. This
/// measured about twice as fast as a single histogram on real ballot scans.
/// The result is identical to a single histogram since the counts commute.
pub(crate) fn histogram(pixels: &[u8]) -> GrayHistogram {
    const HISTOGRAM_SHARDS: usize = 8;

    let mut shards: [GrayHistogram; _] = [[0; 256]; HISTOGRAM_SHARDS];
    let (chunks, remainder) = pixels.as_chunks::<HISTOGRAM_SHARDS>();
    for chunk in chunks {
        for (shard, &p) in shards.iter_mut().zip(chunk.iter()) {
            shard[p as usize] += 1;
        }
    }
    for &p in remainder {
        shards[0][p as usize] += 1;
    }

    let mut hist: GrayHistogram = [0; 256];
    for i in 0..hist.len() {
        for shard in &shards {
            hist[i] += shard[i];
        }
    }
    hist
}

/// Most distinct luma values an image can have and still be treated as an
/// already-quantized export rather than a grayscale scan.
const MAX_QUANTIZED_LEVELS: usize = 4;

/// Picks the black/white threshold for a ballot image from its histogram.
///
/// A grayscale scan gets Otsu's threshold. An image with at most four
/// distinct luma values is a 1- or 2-bit export (or a synthetic test image),
/// and in an export exactly the pixels that were black when it was first
/// interpreted are luma 0, so 0 is the threshold. Otsu would instead split a
/// 2-bit export's four spikes at the dark-gray level, and would make a blank
/// sheet's single level black.
pub(crate) fn binarization_threshold_from_histogram(hist: &GrayHistogram) -> u8 {
    let levels = hist.iter().filter(|&&count| count > 0).count();
    if levels <= MAX_QUANTIZED_LEVELS {
        0
    } else {
        otsu_level_from_histogram(hist)
    }
}

/// Computes Otsu's threshold for a grayscale image.
pub(crate) fn otsu_level(image: &GrayImage) -> u8 {
    otsu_level_from_histogram(&histogram(image.as_raw()))
}

/// Computes Otsu's threshold from an image histogram.
pub(crate) fn otsu_level_from_histogram(hist: &GrayHistogram) -> u8 {
    let total: f64 = hist.iter().map(|&c| f64::from(c)).sum();
    let sum: f64 = hist
        .iter()
        .enumerate()
        .map(|(i, &c)| i as f64 * f64::from(c))
        .sum();
    let mut sum_b = 0.0f64;
    let mut w_b = 0.0f64;
    let mut max_var = 0.0f64;
    let mut threshold = 0u8;
    for (t, &count) in hist.iter().enumerate() {
        w_b += f64::from(count);
        if w_b == 0.0 {
            continue;
        }
        let w_f = total - w_b;
        if w_f == 0.0 {
            break;
        }
        sum_b += t as f64 * f64::from(count);
        let m_b = sum_b / w_b;
        let m_f = (sum - sum_b) / w_f;
        let var = w_b * w_f * (m_b - m_f).powi(2);
        if var > max_var {
            max_var = var;
            threshold = t as u8;
        }
    }
    threshold
}

/// Applies a binary threshold to a grayscale image.
///
/// Pixels with value `<= thresh` become 0 (black); others become 255 (white).
pub(crate) fn threshold(image: &GrayImage, thresh: u8) -> GrayImage {
    GrayImage::from_fn(image.width(), image.height(), |x, y| {
        let p = image.get_pixel(x, y)[0];
        Luma([if p <= thresh { 0u8 } else { 255u8 }])
    })
}

/// Bit depth of the grayscale PNGs written for scanned ballot images.
///
/// The default must match `DEFAULT_BALLOT_IMAGE_BIT_DEPTH` in
/// `libs/types/src/system_settings.ts`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize)]
#[serde(try_from = "u8")]
pub enum BallotImageBitDepth {
    /// Black and white, split at the Otsu threshold.
    One,
    /// Black, white, and two grays for anti-aliased edges and light marks.
    #[default]
    Two,
    /// The scanned grayscale image as-is.
    Eight,
}

impl BallotImageBitDepth {
    #[must_use]
    pub const fn bits(self) -> u8 {
        match self {
            Self::One => 1,
            Self::Two => 2,
            Self::Eight => 8,
        }
    }

    const fn png_depth(self) -> png::BitDepth {
        match self {
            Self::One => png::BitDepth::One,
            Self::Two => png::BitDepth::Two,
            Self::Eight => png::BitDepth::Eight,
        }
    }
}

impl TryFrom<u8> for BallotImageBitDepth {
    type Error = String;

    fn try_from(bits: u8) -> Result<Self, Self::Error> {
        match bits {
            1 => Ok(Self::One),
            2 => Ok(Self::Two),
            8 => Ok(Self::Eight),
            _ => Err(format!("Unexpected ballot image bit depth: {bits}")),
        }
    }
}

impl Display for BallotImageBitDepth {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.bits())
    }
}

impl FromStr for BallotImageBitDepth {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        s.parse::<u8>()
            .map_err(|err| format!("Unexpected ballot image bit depth: {s}: {err}"))
            .and_then(Self::try_from)
    }
}

/// Upper bounds (inclusive) of the black, dark gray, and light gray levels
/// of a 2-bit quantization; everything above `light` is white.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct GrayLevels {
    pub black: u8,
    pub dark: u8,
    pub light: u8,
}

/// Count of each 8-bit gray luma value from an image.
pub(crate) type GrayHistogram = [u32; 256];

/// White is the top `1/WHITE_RANGE_DIVISOR` of the range between the black
/// threshold and the paper peak. On real scans the paper's luma tails off
/// smoothly below its peak, so this is a trade-off: a smaller share keeps
/// lighter marks visible at the cost of larger files. A quarter keeps pencil
/// marks that are only ~30 luma levels darker than the paper while staying
/// around 2x the 1-bit size.
const WHITE_RANGE_DIVISOR: u32 = 4;

/// Picks the 2-bit gray levels for an image whose Otsu threshold is `black`.
///
/// Black stays exactly as the 1-bit binarization would have it. White is the
/// top quarter of the range from the threshold up to the paper's histogram
/// peak, and the two grays split the rest evenly.
pub(crate) fn gray_levels(hist: &GrayHistogram, black: u8) -> GrayLevels {
    let Some(above_black) = black.checked_add(1) else {
        return GrayLevels {
            black,
            dark: black,
            light: black,
        };
    };
    let paper = (above_black..=u8::MAX)
        .max_by_key(|&v| hist[usize::from(v)])
        .unwrap_or(u8::MAX);
    let light = paper - ((u32::from(paper - black) / WHITE_RANGE_DIVISOR) as u8);
    let dark = black + (light - black) / 2;
    GrayLevels { black, dark, light }
}

/// Encodes a scanned ballot image as a grayscale PNG at the given bit depth.
///
/// `hist` is the histogram of `image`, from which the 2-bit gray levels are
/// derived. Pixels with luma `<= thresh` are black at every bit depth below
/// eight, exactly like [`threshold`], so re-interpreting the saved image
/// binarizes the same way.
pub(crate) fn encode_normalized_png(
    image: &GrayImage,
    hist: &GrayHistogram,
    thresh: u8,
    bit_depth: BallotImageBitDepth,
) -> image::ImageResult<Vec<u8>> {
    match bit_depth {
        BallotImageBitDepth::One => binarize_and_encode_png(image, thresh),
        BallotImageBitDepth::Two => quantize_and_encode_png(image, gray_levels(hist, thresh)),
        BallotImageBitDepth::Eight => write_png(
            image.dimensions(),
            BallotImageBitDepth::Eight,
            image.as_raw(),
        ),
    }
}

/// Binarizes a grayscale image with the given threshold and encodes it as a
/// 1-bit grayscale PNG in memory.
pub(crate) fn binarize_and_encode_png(
    image: &GrayImage,
    thresh: u8,
) -> image::ImageResult<Vec<u8>> {
    let (width, height) = image.dimensions();
    let row_bytes = packed_row_bytes(width, BallotImageBitDepth::One);
    let mut packed = vec![0u8; row_bytes * height as usize];
    for (pixel_row, packed_row) in image
        .as_raw()
        .chunks_exact(width as usize)
        .zip(packed.chunks_exact_mut(row_bytes))
    {
        pack_row::<8>(pixel_row, |luma| u8::from(luma > thresh), packed_row);
    }
    write_png(image.dimensions(), BallotImageBitDepth::One, &packed)
}

/// Quantizes a grayscale image to the given levels and encodes it as a 2-bit
/// grayscale PNG in memory.
///
/// Black is decided per pixel. The gray levels are then smoothed by a 3x3
/// majority vote among non-black pixels: scanner noise and printed halftone
/// shading otherwise speckle between gray and white, which both looks bad and
/// roughly doubles the compressed size. Black pixels neither vote nor change,
/// so ink edges stay crisp, and marks wider than a pixel pass through.
pub(crate) fn quantize_and_encode_png(
    image: &GrayImage,
    levels: GrayLevels,
) -> image::ImageResult<Vec<u8>> {
    let (width, height) = image.dimensions();
    let row_bytes = packed_row_bytes(width, BallotImageBitDepth::Two);
    let mut packed = vec![0u8; row_bytes * height as usize];
    let mut packed_rows = packed.chunks_exact_mut(row_bytes);
    for_each_smoothed_row(image, levels, |smoothed_row| {
        if let Some(packed_row) = packed_rows.next() {
            pack_row::<4>(smoothed_row, |level| level, packed_row);
        }
    });
    write_png(image.dimensions(), BallotImageBitDepth::Two, &packed)
}

fn quantize_pixel(luma: u8, levels: GrayLevels) -> u8 {
    if luma <= levels.black {
        0
    } else {
        1 + u8::from(luma > levels.dark) + u8::from(luma > levels.light)
    }
}

/// Quantizes `image` to `levels` and calls `f` with each row after replacing
/// every non-black level with the median of the non-black levels in its 3x3
/// neighborhood, clamping at the image edges. Black pixels are kept.
///
/// Streams three quantized rows at a time so the quantized and smoothed
/// images never exist in full.
fn for_each_smoothed_row(image: &GrayImage, levels: GrayLevels, mut f: impl FnMut(&[u8])) {
    let (width, height) = (image.width() as usize, image.height() as usize);
    let quantize_row = |y: usize, row: &mut Vec<u8>| {
        row.clear();
        row.extend(
            image.as_raw()[y * width..][..width]
                .iter()
                .map(|&luma| quantize_pixel(luma, levels)),
        );
    };
    let mut above = Vec::with_capacity(width);
    let mut here = Vec::with_capacity(width);
    let mut below = Vec::with_capacity(width);
    quantize_row(0, &mut here);
    above.clone_from(&here);
    quantize_row(1.min(height - 1), &mut below);

    let mut smoothed = vec![0u8; width];
    let mut voters = vec![0u8; width + 2];
    let mut ones = vec![0u8; width + 2];
    let mut twos = vec![0u8; width + 2];
    for y in 0..height {
        if y > 0 {
            swap(&mut above, &mut here);
            swap(&mut here, &mut below);
            quantize_row((y + 1).min(height - 1), &mut below);
        }
        for (x, ((&a, &b), &c)) in above.iter().zip(&here).zip(&below).enumerate() {
            voters[x + 1] = u8::from(a != 0) + u8::from(b != 0) + u8::from(c != 0);
            ones[x + 1] = u8::from(a == 1) + u8::from(b == 1) + u8::from(c == 1);
            twos[x + 1] = u8::from(a == 2) + u8::from(b == 2) + u8::from(c == 2);
        }
        for counts in [&mut voters, &mut ones, &mut twos] {
            counts[0] = counts[1];
            counts[width + 1] = counts[width];
        }
        for ((((out, &center), v), o), t) in smoothed
            .iter_mut()
            .zip(&here)
            .zip(voters.windows(3))
            .zip(ones.windows(3))
            .zip(twos.windows(3))
        {
            let half = (v[0] + v[1] + v[2]) / 2;
            let ones = o[0] + o[1] + o[2];
            let twos = t[0] + t[1] + t[2];
            let level = 1 + u8::from(ones <= half) + u8::from(ones + twos <= half);
            *out = if center == 0 { 0 } else { level };
        }
        f(&smoothed);
    }
}

/// Bytes per PNG row of `width` samples at `bit_depth`, padded to a byte.
fn packed_row_bytes(width: u32, bit_depth: BallotImageBitDepth) -> usize {
    (width as usize * usize::from(bit_depth.bits())).div_ceil(u8::BITS as usize)
}

/// Packs one row of samples, each mapped through `sample`, into big-endian
/// PNG bytes holding `SAMPLES_PER_BYTE` samples apiece.
fn pack_row<const SAMPLES_PER_BYTE: usize>(
    row: &[u8],
    sample: impl Fn(u8) -> u8,
    packed_row: &mut [u8],
) {
    let bits = u8::BITS as usize / SAMPLES_PER_BYTE;
    let pack = |group: &[u8]| {
        group.iter().enumerate().fold(0u8, |byte, (slot, &value)| {
            byte | (sample(value) << (u8::BITS as usize - bits * (slot + 1)))
        })
    };
    let (groups, remainder) = row.as_chunks::<SAMPLES_PER_BYTE>();
    for (packed_byte, group) in packed_row.iter_mut().zip(groups) {
        *packed_byte = pack(group);
    }
    if !remainder.is_empty() {
        packed_row[groups.len()] = pack(remainder);
    }
}

/// Writes `data`, already packed at `bit_depth`, as a grayscale PNG with the
/// dimensions of `image`.
fn write_png(
    (width, height): (u32, u32),
    bit_depth: BallotImageBitDepth,
    data: &[u8],
) -> image::ImageResult<Vec<u8>> {
    let to_image_error =
        |e: png::EncodingError| image::ImageError::IoError(std::io::Error::other(e));

    // Pre-size for the compressed output; ballot images compress to well
    // under half of the packed size.
    let mut buf = Vec::with_capacity(data.len() / 2);
    let mut encoder = png::Encoder::new(Cursor::new(&mut buf), width, height);
    encoder.set_color(png::ColorType::Grayscale);
    encoder.set_depth(bit_depth.png_depth());
    encoder.set_compression(png::Compression::Balanced);
    encoder.set_filter(png::Filter::NoFilter);
    let mut writer = encoder.write_header().map_err(to_image_error)?;
    writer.write_image_data(data).map_err(to_image_error)?;
    writer.finish().map_err(to_image_error)?;
    Ok(buf)
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn test_find_scanned_document_inset_all_black() {
        let image = GrayImage::new(100, 100);
        let inset = find_scanned_document_inset(&image, otsu_level(&image), 0.5);
        assert_eq!(inset, None);
    }

    #[test]
    fn test_find_scanned_document_inset_all_white() {
        let image = GrayImage::from_pixel(100, 100, Luma([u8::MAX]));
        let inset = find_scanned_document_inset(&image, otsu_level(&image), 0.5);
        assert_eq!(
            inset,
            Some(Inset {
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
            })
        );
    }

    fn make_streak(x_range: RangeInclusive<PixelPosition>) -> VerticalStreak {
        VerticalStreak {
            scores: make_scores(x_range.clone()),
            longest_white_gaps: make_longest_white_gaps(x_range.clone()),
            x_range,
        }
    }

    fn make_scores(columns: RangeInclusive<PixelPosition>) -> Vec<UnitIntervalScore> {
        columns
            .map(|x| UnitIntervalScore(x as f32 / 100.0))
            .collect()
    }

    fn make_longest_white_gaps(columns: RangeInclusive<PixelPosition>) -> Vec<PixelUnit> {
        columns.map(|x| x as PixelUnit).collect()
    }

    #[test]
    fn test_coalesce_adjacent_streaks() {
        let result = make_streak(0..=2).coalesce(make_streak(3..=5)).unwrap();
        assert_eq!(result.x_range, 0..=5);
        assert_eq!(result.scores, make_scores(0..=5));
        assert_eq!(result.longest_white_gaps, make_longest_white_gaps(0..=5));
    }

    #[test]
    fn test_coalesce_overlapping_streaks() {
        let result = make_streak(0..=5).coalesce(make_streak(4..=8)).unwrap();
        assert_eq!(result.x_range, 0..=8);
        assert_eq!(result.scores, make_scores(0..=8));
        assert_eq!(result.longest_white_gaps, make_longest_white_gaps(0..=8));
    }

    #[test]
    fn test_coalesce_self_contains_other() {
        let result = make_streak(0..=8).coalesce(make_streak(2..=5)).unwrap();
        assert_eq!(result, make_streak(0..=8));
    }

    #[test]
    fn test_coalesce_other_contains_self() {
        let result = make_streak(2..=5).coalesce(make_streak(0..=8)).unwrap();
        assert_eq!(result, make_streak(0..=8));
    }

    #[test]
    fn test_coalesce_non_adjacent_streaks() {
        let (l, r) = (make_streak(0..=2), make_streak(4..=6));
        let coalesced = l.clone().coalesce(r.clone()).unwrap_err();
        assert_eq!(coalesced, (l, r));
    }

    proptest::proptest! {
        #[test]
        fn coalesce_result_is_consistent(
            a_start in 0..=1000i32,
            a_len in 0..=20u32,
            b_start in 0..=1000i32,
            b_len in 0..=20u32,
        ) {
            let a_end = a_start + a_len as PixelPosition;
            let b_end = b_start + b_len as PixelPosition;
            let a = make_streak(a_start..=a_end);
            let b = make_streak(b_start..=b_end);
            let gap = (*a.x_range.start().max(b.x_range.start()))
                - (*a.x_range.end().min(b.x_range.end()));
            match a.coalesce(b) {
                Ok(merged) => {
                    assert!(gap <= 1, "non-adjacent streaks should not coalesce");
                    assert_eq!(*merged.x_range.start(), a_start.min(b_start));
                    assert_eq!(*merged.x_range.end(), a_end.max(b_end));
                    let expected_len = (*merged.x_range.end() - *merged.x_range.start() + 1) as usize;
                    assert_eq!(merged.scores.len(), expected_len);
                    assert_eq!(merged.longest_white_gaps.len(), expected_len);
                }
                Err(_) => {
                    assert!(gap > 1, "adjacent/overlapping streaks should coalesce");
                }
            }
        }
    }

    proptest::proptest! {
        // Covers all `len % 8` remainder cases via the arbitrary length.
        #[test]
        fn histogram_matches_naive_single_histogram(
            pixels in proptest::collection::vec(proptest::num::u8::ANY, 0..2048),
        ) {
            let mut expected: GrayHistogram = [0; 256];
            for &p in &pixels {
                expected[p as usize] += 1;
            }
            assert_eq!(histogram(&pixels), expected);
        }

        #[test]
        fn crop_to_image_matches_view_to_image(
            img_w in 1u32..50,
            img_h in 1u32..50,
            crop in proptest::num::u32::ANY,
            seed in proptest::collection::vec(proptest::num::u8::ANY, 50 * 50),
        ) {
            use image::GenericImageView;
            let image = GrayImage::from_fn(img_w, img_h, |x, y| {
                Luma([seed[(y * img_w + x) as usize]])
            });
            let x = crop % img_w;
            let y = (crop >> 8) % img_h;
            let width = (crop >> 16) % (img_w - x) + 1;
            let height = (crop >> 24) % (img_h - y) + 1;
            let expected = image.view(x, y, width, height).to_image();
            let actual = crop_to_image(&image, x, y, width, height);
            assert_eq!(actual.as_raw(), expected.as_raw());
        }

        // Arbitrary widths cover the row padding cases (width % 8 != 0).
        #[test]
        fn binarize_and_encode_png_matches_threshold_exactly(
            width in 1u32..40,
            height in 1u32..40,
            thresh in proptest::num::u8::ANY,
            seed in proptest::collection::vec(proptest::num::u8::ANY, 40 * 40),
        ) {
            let image = GrayImage::from_fn(width, height, |x, y| {
                Luma([seed[(y * width + x) as usize]])
            });
            let encoded = binarize_and_encode_png(&image, thresh).unwrap();
            let decoded = image::load_from_memory(&encoded).unwrap().to_luma8();
            assert_eq!(decoded.as_raw(), threshold(&image, thresh).as_raw());
        }

        #[test]
        fn quantize_and_encode_png_keeps_black_and_uses_four_levels(
            width in 1u32..40,
            height in 1u32..40,
            thresh in proptest::num::u8::ANY,
            seed in proptest::collection::vec(proptest::num::u8::ANY, 40 * 40),
        ) {
            let image = GrayImage::from_fn(width, height, |x, y| {
                Luma([seed[(y * width + x) as usize]])
            });
            let levels = gray_levels(&histogram(image.as_raw()), thresh);
            assert!(levels.black <= levels.dark && levels.dark <= levels.light);
            let encoded = quantize_and_encode_png(&image, levels).unwrap();
            let decoded = image::load_from_memory(&encoded).unwrap().to_luma8();
            for (&original, &quantized) in image.as_raw().iter().zip(decoded.as_raw()) {
                assert!([0, 85, 170, 255].contains(&quantized));
                assert_eq!(quantized == 0, original <= thresh);
            }
        }

        #[test]
        fn quantize_and_encode_png_matches_sorting_non_black_levels_in_each_window(
            width in 1u32..12,
            height in 1u32..12,
            seed in proptest::collection::vec(proptest::num::u8::ANY, 12 * 12),
        ) {
            let gray_levels = GrayLevels {
                black: 63,
                dark: 127,
                light: 191,
            };
            let image = GrayImage::from_fn(width, height, |x, y| {
                Luma([seed[(y * width + x) as usize]])
            });
            let levels: Vec<u8> = image
                .as_raw()
                .iter()
                .map(|&luma| quantize_pixel(luma, gray_levels))
                .collect();
            let encoded = quantize_and_encode_png(&image, gray_levels).unwrap();
            let decoded = image::load_from_memory(&encoded).unwrap().to_luma8();
            for y in 0..height {
                for x in 0..width {
                    let center = levels[(y * width + x) as usize];
                    let mut window: Vec<u8> = (-1i64..=1)
                        .flat_map(|dy| (-1i64..=1).map(move |dx| (dx, dy)))
                        .map(|(dx, dy)| {
                            let cx = (i64::from(x) + dx).clamp(0, i64::from(width) - 1) as u32;
                            let cy = (i64::from(y) + dy).clamp(0, i64::from(height) - 1) as u32;
                            levels[(cy * width + cx) as usize]
                        })
                        .filter(|&level| level != 0)
                        .collect();
                    window.sort_unstable();
                    let expected = if center == 0 { 0 } else { window[window.len() / 2] };
                    assert_eq!(decoded.get_pixel(x, y)[0], expected * 85);
                }
            }
        }

        #[test]
        fn eight_bit_encoding_round_trips(
            width in 1u32..40,
            height in 1u32..40,
            seed in proptest::collection::vec(proptest::num::u8::ANY, 40 * 40),
        ) {
            let image = GrayImage::from_fn(width, height, |x, y| {
                Luma([seed[(y * width + x) as usize]])
            });
            let encoded = encode_normalized_png(
                &image,
                &histogram(image.as_raw()),
                0,
                BallotImageBitDepth::Eight,
            )
            .unwrap();
            let decoded = image::load_from_memory(&encoded).unwrap().to_luma8();
            assert_eq!(decoded.as_raw(), image.as_raw());
        }
    }

    #[test]
    fn quantize_and_encode_png_drops_isolated_speckle_but_keeps_edges_crisp() {
        let levels = GrayLevels {
            black: 100,
            dark: 150,
            light: 200,
        };
        let mut image = GrayImage::from_pixel(8, 5, Luma([255]));
        image.put_pixel(6, 2, Luma([160]));
        for y in 0..5 {
            for x in 0..3 {
                image.put_pixel(x, y, Luma([0]));
            }
        }
        let encoded = quantize_and_encode_png(&image, levels).unwrap();
        let decoded = image::load_from_memory(&encoded).unwrap().to_luma8();
        let expected: Vec<u8> = (0..5)
            .flat_map(|_| [0, 0, 0, 255, 255, 255, 255, 255])
            .collect();
        assert_eq!(decoded.as_raw(), &expected);
    }

    #[test]
    fn gray_levels_split_the_range_from_threshold_to_paper_peak() {
        let mut hist: GrayHistogram = [0; 256];
        hist[0] = 1_000;
        hist[200] = 50;
        hist[255] = 10_000;
        assert_eq!(
            gray_levels(&hist, 139),
            GrayLevels {
                black: 139,
                dark: 182,
                light: 226,
            }
        );
        assert_eq!(
            gray_levels(&hist, 255),
            GrayLevels {
                black: 255,
                dark: 255,
                light: 255,
            }
        );
    }

    #[test]
    fn light_marks_survive_two_bit_quantization() {
        let mut image = GrayImage::from_pixel(64, 64, Luma([255]));
        let fill = |image: &mut GrayImage, x0: u32, y0: u32, luma: u8| {
            for y in y0..y0 + 16 {
                for x in x0..x0 + 16 {
                    image.put_pixel(x, y, Luma([luma]));
                }
            }
        };
        fill(&mut image, 0, 0, 0);
        fill(&mut image, 24, 0, 160);
        fill(&mut image, 48, 0, 220);
        fill(&mut image, 0, 32, 245);

        // Otsu threshold typical of real scans; gray levels are 182 and 226.
        let encoded = encode_normalized_png(
            &image,
            &histogram(image.as_raw()),
            139,
            BallotImageBitDepth::Two,
        )
        .unwrap();
        let decoded = image::load_from_memory(&encoded).unwrap().to_luma8();
        assert_eq!(decoded.get_pixel(8, 8)[0], 0);
        assert_eq!(decoded.get_pixel(32, 8)[0], 85);
        assert_eq!(decoded.get_pixel(56, 8)[0], 170);
        assert_eq!(decoded.get_pixel(8, 40)[0], 255);
        assert_eq!(decoded.get_pixel(40, 40)[0], 255);
    }

    #[test]
    fn ballot_image_bit_depth_parses_supported_depths_only() {
        assert_eq!("1".parse(), Ok(BallotImageBitDepth::One));
        assert_eq!("2".parse(), Ok(BallotImageBitDepth::Two));
        assert_eq!("8".parse(), Ok(BallotImageBitDepth::Eight));
        assert!("4".parse::<BallotImageBitDepth>().is_err());
        assert!("two".parse::<BallotImageBitDepth>().is_err());
        assert_eq!(BallotImageBitDepth::default().to_string(), "2");
        assert_eq!(
            serde_json::from_str::<BallotImageBitDepth>("8").unwrap(),
            BallotImageBitDepth::Eight
        );
        assert!(serde_json::from_str::<BallotImageBitDepth>("3").is_err());
    }

    #[test]
    fn test_find_scanned_document_inset_ballot_image() {
        let image_bytes = include_bytes!("../../test/fixtures/scan-inset.jpeg");
        let image = image::load(Cursor::new(image_bytes), image::ImageFormat::Jpeg)
            .unwrap()
            .into_luma8();
        let inset = find_scanned_document_inset(&image, otsu_level(&image), 0.5);
        assert_eq!(
            inset,
            Some(Inset {
                top: 121,
                bottom: 48,
                left: 24,
                right: 0,
            })
        );
    }

    #[test]
    fn binarization_threshold_uses_otsu_for_grayscale() {
        let image = GrayImage::from_fn(64, 64, |x, _| Luma([(x * 4) as u8]));
        let hist = histogram(image.as_raw());
        assert_eq!(
            binarization_threshold_from_histogram(&hist),
            otsu_level_from_histogram(&hist)
        );
    }

    #[test]
    fn binarization_threshold_of_a_quantized_image_keeps_only_luma_zero_black() {
        for levels in [
            &[0u8, 255][..],
            &[0, 85, 170, 255],
            &[0, 170, 255],
            &[170, 255],
            &[255],
        ] {
            let image = GrayImage::from_fn(64, 64, |x, y| {
                Luma([levels[((x + y) as usize) % levels.len()]])
            });
            let hist = histogram(image.as_raw());
            assert_eq!(
                binarization_threshold_from_histogram(&hist),
                0,
                "levels {levels:?}"
            );
        }
    }

    #[test]
    fn binarization_threshold_of_a_blank_white_image_makes_nothing_black() {
        let image = GrayImage::from_pixel(8, 8, Luma([255]));
        let thresh = binarization_threshold_from_histogram(&histogram(image.as_raw()));
        assert!(threshold(&image, thresh).as_raw().iter().all(|&p| p == 255));
    }
}
