use std::ops::RangeInclusive;

use image::{
    imageops::{resize, FilterType::Lanczos3},
    GenericImage, GrayImage, ImageError, Luma, Rgb,
};
use itertools::Itertools;
use serde::Serialize;
use types_rs::geometry::{PixelUnit, Size, SubPixelUnit};
use types_rs::{election::UnitIntervalValue, geometry::Quadrilateral};

use crate::{
    debug::{self, ImageDebugWriter},
    scoring::UnitIntervalScore,
};

pub const WHITE: Luma<u8> = Luma([255]);
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

/// An inset is a set of pixel offsets from the edges of an image.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Inset {
    /// The number of pixels to remove from the top of the image.
    pub top: PixelUnit,

    /// The number of pixels to remove from the bottom of the image.
    pub bottom: PixelUnit,

    /// The number of pixels to remove from the left of the image.
    pub left: PixelUnit,

    /// The number of pixels to remove from the right of the image.
    pub right: PixelUnit,
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

/// Generates an image from two images where corresponding pixels in `compare`
/// that are darker than their counterpart in `base` show up with the luminosity
/// difference between the two. This is useful for determining where a
/// light-background form was filled out, for example.
///
/// Note that the sizes of the images must be equal.
///
/// ```no_compile
///         BASE                  COMPARE                 DIFF
/// ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
/// │                   │  │        █ █ ███    │  │        █ █ ███    │
/// │ █ █               │  │ █ █    ███  █     │  │        ███  █     │
/// │  █                │  │  █     █ █ ███    │  │        █ █ ███    │
/// │ █ █ █████████████ │  │ █ █ █████████████ │  │                   │
/// └───────────────────┘  └───────────────────┘  └───────────────────┘
/// ```
///
pub fn diff(base: &GrayImage, compare: &GrayImage) -> GrayImage {
    assert_eq!(base.dimensions(), compare.dimensions());

    let mut out = GrayImage::new(base.width(), base.height());

    base.enumerate_pixels().for_each(|(x, y, base_pixel)| {
        let compare_pixel = compare.get_pixel(x, y);
        let diff = if base_pixel.0[0] < compare_pixel.0[0] {
            u8::MIN
        } else {
            base_pixel.0[0] - compare_pixel.0[0]
        };

        out.put_pixel(x, y, Luma([u8::MAX - diff]));
    });

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
pub fn count_pixels_in_shape(
    img: &GrayImage,
    shape: &Quadrilateral,
    threshold: u8,
) -> CountedPixels {
    let mut counted = CountedPixels::default();
    let bounds = shape.bounds();
    for x in bounds.left()..bounds.right() {
        if x < 0 || x >= img.width() as i32 {
            continue;
        }

        for y in bounds.top()..bounds.bottom() {
            if y < 0 || y >= img.height() as i32 {
                continue;
            }

            if shape.contains_subpixel(x as f32 + 0.5, y as f32 + 0.5) {
                counted.examined += 1;
                if img.get_pixel(x as u32, y as u32).0[0] <= threshold {
                    counted.matched += 1;
                }
            }
        }
    }
    counted
}

/// Resizes an image to fit within the given dimensions while maintaining the
/// aspect ratio.
pub fn size_image_to_fit(
    img: &GrayImage,
    max_width: PixelUnit,
    max_height: PixelUnit,
) -> GrayImage {
    let aspect_ratio = img.width() as f32 / img.height() as f32;
    let new_width = if aspect_ratio > 1.0 {
        max_width
    } else {
        (max_height as f32 * aspect_ratio).ceil() as PixelUnit
    };
    let new_height = if aspect_ratio > 1.0 {
        (max_width as f32 / aspect_ratio).ceil() as PixelUnit
    } else {
        max_height
    };
    resize(img, new_width, new_height, Lanczos3)
}

/// Resizes an image to fit within the given dimensions while maintaining the
/// aspect ratio. If the image is already within the given dimensions, it is
/// returned as-is.
pub fn maybe_resize_image_to_fit(image: GrayImage, max_size: Size<PixelUnit>) -> GrayImage {
    let (width, height) = image.dimensions();
    let x_scale = max_size.width as SubPixelUnit / width as SubPixelUnit;
    let y_scale = max_size.height as SubPixelUnit / height as SubPixelUnit;
    let allowed_error = 0.05;
    let x_error = (1.0 - x_scale).abs();
    let y_error = (1.0 - y_scale).abs();

    if x_error <= allowed_error && y_error <= allowed_error {
        image
    } else {
        eprintln!(
            "WARNING: image dimensions do not match expected dimensions: {}x{} vs {}x{}, resizing",
            width, height, max_size.width, max_size.height
        );

        size_image_to_fit(&image, max_size.width, max_size.height)
    }
}

/// Expands an image by the given number of pixels on all sides.
pub fn expand_image(
    img: &GrayImage,
    border_size: PixelUnit,
    background_color: Luma<u8>,
) -> Result<GrayImage, ImageError> {
    let mut out = GrayImage::new(
        img.width() + border_size * 2,
        img.height() + border_size * 2,
    );
    out.fill(background_color.0[0]);
    out.copy_from(img, border_size, border_size)?;
    Ok(out)
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
    let (width, height) = image.dimensions();
    let (max_x, max_y) = (width - 1, height - 1);

    let min_y_above_threshold = (0..height).find(|y| {
        (0..width)
            .filter(|x| image.get_pixel(*x, *y)[0] > threshold)
            .count()
            > (width as f32 * min_ratio_above_threshold) as usize
    });
    let max_y_above_threshold = (0..height).rev().find(|y| {
        (0..width)
            .filter(|x| image.get_pixel(*x, *y)[0] > threshold)
            .count()
            > (width as f32 * min_ratio_above_threshold) as usize
    });
    let min_x_above_threshold = (0..width).find(|x| {
        (0..height)
            .filter(|y| image.get_pixel(*x, *y)[0] > threshold)
            .count()
            > (height as f32 * min_ratio_above_threshold) as usize
    });
    let max_x_above_threshold = (0..width).rev().find(|x| {
        (0..height)
            .filter(|y| image.get_pixel(*x, *y)[0] > threshold)
            .count()
            > (height as f32 * min_ratio_above_threshold) as usize
    });

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

pub struct DetectVerticalStreaksConfiguration {
    pub threshold: u8,
    pub min_score: UnitIntervalScore,
    pub min_column_score: UnitIntervalScore,
    pub max_white_gap_pixel_count: PixelUnit,
    pub border_inset_pixels: PixelUnit,
}

impl DetectVerticalStreaksConfiguration {
    pub const fn new(
        threshold: u8,
        min_score: UnitIntervalScore,
        min_column_score: UnitIntervalScore,
        max_white_gap_pixel_count: PixelUnit,
        border_inset_pixels: PixelUnit,
    ) -> Self {
        Self {
            threshold,
            min_score,
            min_column_score,
            max_white_gap_pixel_count,
            border_inset_pixels,
        }
    }
}

impl Default for DetectVerticalStreaksConfiguration {
    fn default() -> Self {
        Self {
            threshold: 127,
            min_score: UnitIntervalScore(0.75),
            min_column_score: UnitIntervalScore(0.25),
            max_white_gap_pixel_count: 15,
            border_inset_pixels: 20,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Streak {
    x_range: RangeInclusive<u32>,
    longest_white_gap: u32,
    score: UnitIntervalScore,
}

impl Streak {
    pub const fn new(
        x_range: RangeInclusive<u32>,
        longest_white_gap: u32,
        score: UnitIntervalScore,
    ) -> Self {
        Self {
            x_range,
            longest_white_gap,
            score,
        }
    }

    /// The leftmost `x` value containing streak pixels. The streak may extend
    /// an arbitrary number of pixels to the right from here. The corresponding
    /// column in the image may not be majority-black.
    pub const fn x_left(&self) -> u32 {
        *self.x_range.start()
    }

    /// The rightmost `x` value containing streak pixels. The streak may extend
    /// an arbitrary number of pixels to the left from here. The corresponding
    /// column in the image may not be majority-black.
    pub const fn x_right(&self) -> u32 {
        *self.x_range.end()
    }

    /// The number of pixels this streak is wide. Note that it may not be that
    /// the entire width of the streak is majority-black.
    pub const fn width(&self) -> u32 {
        *self.x_range.end() - *self.x_range.start() + 1
    }

    /// The longest number of consecutive rows not considered to have black
    /// pixels.
    pub const fn longest_white_gap(&self) -> u32 {
        self.longest_white_gap
    }

    /// The percentage of rows considered black in the streak area.
    pub const fn score(&self) -> UnitIntervalScore {
        self.score
    }
}

/**
 * Detects vertical streaks in the given image (presumably resulting from debris
 * on the scanner glass). Returns a list of the x-coordinate of each streak.
 */
pub fn detect_vertical_streaks(
    image: &GrayImage,
    debug: &ImageDebugWriter,
    config: DetectVerticalStreaksConfiguration,
) -> Vec<Streak> {
    // Look at columns of pixels in the image (ignoring
    // BORDER_COLUMNS_TO_EXCLUDE on either side), where a "column" is two or
    // more pixels wide. If more than PERCENT_BLACK_PIXELS_IN_STREAK of the rows
    // in the column have a majority of black pixels, it might be a streak.
    // Filter out streaks that have gaps of white that are greater than
    // MAX_WHITE_GAP_PIXELS, since these are probably printed features, not
    // streaks. This relies on the invariant that there are no printed features
    // that span the entire page top to bottom without a gap greater than
    // MAX_WHITE_GAP_PIXELS.

    let (width, height) = image.dimensions();
    let x_range = config.border_inset_pixels - 1..width - config.border_inset_pixels;

    let compute_column_score = |x: u32| {
        let black_pixels_in_column = (0..height)
            .filter(|y| image.get_pixel(x, *y)[0] <= config.threshold)
            .count();
        UnitIntervalScore(black_pixels_in_column as f32 / height as f32)
    };

    let mut streaks = vec![];
    let mut x_start = x_range.start;
    while x_start < x_range.end {
        let mut pending_streak = None;

        if compute_column_score(x_start) >= config.min_column_score {
            for columns in 1.. {
                let x_end = x_start + columns - 1;
                if !x_range.contains(&x_end) {
                    break;
                }

                if x_end != x_start && compute_column_score(x_end) < config.min_column_score {
                    break;
                }

                let column = (0..height)
                    .map(|y| {
                        let black_pixels_in_row = (x_start..=x_end)
                            .filter(|x| image.get_pixel(*x, y)[0] <= config.threshold)
                            .count() as u32;
                        black_pixels_in_row * 2 >= x_end - x_start + 1
                    })
                    .collect_vec();

                let num_black_pixels = column.iter().filter(|is_black| **is_black).count();
                let streak_score = UnitIntervalScore(num_black_pixels as f32 / height as f32);
                if streak_score < config.min_score {
                    if x_start == x_end {
                        // Only 1px wide, try again with at least one more.
                        continue;
                    } else {
                        break;
                    }
                }

                let longest_white_gap_length = column
                    .into_iter()
                    .group_by(|is_black| *is_black)
                    .into_iter()
                    .filter(|(is_black, _)| !*is_black)
                    .map(|(_, white_gap)| white_gap.count() as PixelUnit)
                    .max()
                    .unwrap_or(0);

                if longest_white_gap_length > config.max_white_gap_pixel_count {
                    if x_start == x_end {
                        // Only 1px wide, try again with at least one more.
                        continue;
                    } else {
                        break;
                    }
                }

                pending_streak = Some(Streak::new(
                    x_start..=x_end,
                    longest_white_gap_length,
                    streak_score,
                ));
            }
        }

        if let Some(streak) = pending_streak {
            x_start = streak.x_right() + 1;
            streaks.push(streak);
        } else {
            x_start += 1;
        }
    }

    debug.write("vertical_streaks", |canvas| {
        debug::draw_vertical_streaks_debug_image_mut(canvas, config.threshold, x_range, &streaks);
    });

    streaks
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test {
    use super::*;
    use imageproc::contrast::otsu_level;
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
