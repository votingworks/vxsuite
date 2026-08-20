use std::io::Cursor;
use std::mem::swap;
use std::ops::RangeInclusive;

use image::{GrayImage, Luma, Rgb};
use itertools::Itertools;
use serde::Serialize;
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
pub(crate) fn histogram(pixels: &[u8]) -> [u32; 256] {
    const HISTOGRAM_SHARDS: usize = 8;

    let mut shards = [[0u32; 256]; HISTOGRAM_SHARDS];
    let (chunks, remainder) = pixels.as_chunks::<HISTOGRAM_SHARDS>();
    for chunk in chunks {
        for (shard, &p) in shards.iter_mut().zip(chunk.iter()) {
            shard[p as usize] += 1;
        }
    }
    for &p in remainder {
        shards[0][p as usize] += 1;
    }

    let mut hist = [0u32; 256];
    for i in 0..hist.len() {
        for shard in &shards {
            hist[i] += shard[i];
        }
    }
    hist
}

/// Computes Otsu's threshold for a grayscale image.
pub(crate) fn otsu_level(image: &GrayImage) -> u8 {
    let hist = histogram(image.as_raw());
    let total = f64::from(image.width()) * f64::from(image.height());
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

/// Binarizes a grayscale image with the given threshold and encodes it as a
/// 1-bit grayscale PNG in memory, in a single pass over the image.
///
/// Pixels with luma `<= thresh` become black and others white, exactly like
/// [`threshold`], but the bits are packed directly from the source image
/// rather than materializing an intermediate 8-bit binarized image. The
/// 1-bit representation gives the DEFLATE step an eighth of the data an
/// 8-bit encoding would, making encoding faster and files smaller: the `Up`
/// filter with fast compression measured smaller *and* faster than an 8-bit
/// encoding with the `image` crate's defaults on a corpus of real ballot
/// scans.
pub(crate) fn binarize_and_encode_png(
    image: &GrayImage,
    thresh: u8,
) -> image::ImageResult<Vec<u8>> {
    let (width, height) = image.dimensions();
    let row_bytes = width.div_ceil(u8::BITS) as usize;
    let mut packed = vec![0u8; row_bytes * height as usize];
    for (pixel_row, packed_row) in image
        .as_raw()
        .chunks_exact(width as usize)
        .zip(packed.chunks_exact_mut(row_bytes))
    {
        for (pixels, packed_byte) in pixel_row
            .chunks(u8::BITS as usize)
            .zip(packed_row.iter_mut())
        {
            let mut byte = 0u8;
            for (bit, &pixel) in pixels.iter().enumerate() {
                byte |= u8::from(pixel > thresh) << ((u8::BITS - 1) as usize - bit);
            }
            *packed_byte = byte;
        }
    }

    let to_image_error =
        |e: png::EncodingError| image::ImageError::IoError(std::io::Error::other(e));

    // Pre-size for the compressed output; binarized ballot images compress
    // to well under half of the packed size.
    let mut buf = Vec::with_capacity(packed.len() / 2);
    let mut encoder = png::Encoder::new(Cursor::new(&mut buf), width, height);
    encoder.set_color(png::ColorType::Grayscale);
    encoder.set_depth(png::BitDepth::One);
    encoder.set_compression(png::Compression::Fast);
    encoder.set_filter(png::Filter::Up);
    let mut writer = encoder.write_header().map_err(to_image_error)?;
    writer.write_image_data(&packed).map_err(to_image_error)?;
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
            let mut expected = [0u32; 256];
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
}
