use std::mem::swap;

use image::{GenericImage, GrayImage, ImageError, Luma, Rgb};
use itertools::Itertools;
use serde::Serialize;
use types_rs::geometry::{PixelPosition, PixelUnit};
use types_rs::{election::UnitIntervalValue, geometry::Quadrilateral};

use crate::ballot_card::BallotImage;
use crate::{debug, scoring::UnitIntervalScore};

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
pub fn count_pixels_in_shape(ballot_image: &BallotImage, shape: &Quadrilateral) -> CountedPixels {
    let mut counted = CountedPixels::default();
    let bounds = shape.bounds();
    for x in bounds.left()..bounds.right() {
        if x < 0 || x >= ballot_image.width() as i32 {
            continue;
        }

        for y in bounds.top()..bounds.bottom() {
            if y < 0 || y >= ballot_image.height() as i32 {
                continue;
            }

            if shape.contains_subpixel(x as f32 + 0.5, y as f32 + 0.5) {
                counted.examined += 1;
                if ballot_image.get_pixel(x as u32, y as u32).is_foreground() {
                    counted.matched += 1;
                }
            }
        }
    }
    counted
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

/**
 * Detects vertical streaks in the given image (presumably resulting from debris
 * on the scanner glass). Returns a list of the x-coordinate of each streak.
 */
pub fn detect_vertical_streaks(ballot_image: &BallotImage) -> Vec<PixelPosition> {
    const MIN_STREAK_SCORE: UnitIntervalScore = UnitIntervalScore(0.75);
    const MAX_WHITE_GAP_PIXELS: PixelUnit = 15;
    const BORDER_COLUMNS_TO_EXCLUDE: PixelUnit = 20;

    // Look at each column of pixels in the image (ignoring
    // BORDER_COLUMNS_TO_EXCLUDE on either side), where a "column" is two pixels
    // wide. If more than PERCENT_BLACK_PIXELS_IN_STREAK of the rows in the
    // column have a black pixel, it might be a streak. Filter out streaks that
    // have gaps of white that are greater than MAX_WHITE_GAP_PIXELS, since
    // these are probably printed features, not streaks. This relies on the
    // invariant that there are no printed features that span the entire page
    // top to bottom without a gap greater than MAX_WHITE_GAP_PIXELS.

    let (width, height) = ballot_image.dimensions();
    let x_range = BORDER_COLUMNS_TO_EXCLUDE - 1..width - BORDER_COLUMNS_TO_EXCLUDE;
    let binarized_columns = x_range.clone().map(|x| {
        let binarized_column = (0..height)
            .map(|y| {
                ballot_image.get_pixel(x, y).is_foreground()
                    || ballot_image.get_pixel(x + 1, y).is_foreground()
            })
            .collect::<Vec<_>>();
        (x as PixelPosition, binarized_column)
    });

    let streak_columns = binarized_columns.filter_map(|(x, column)| {
        let num_black_pixels = column.iter().filter(|is_black| **is_black).count();
        let streak_score = UnitIntervalScore(num_black_pixels as f32 / height as f32);
        if streak_score < MIN_STREAK_SCORE {
            return None;
        }

        let longest_white_gap_length = column
            .into_iter()
            .group_by(|is_black| *is_black)
            .into_iter()
            .filter(|(is_black, _)| !*is_black)
            .map(|(_, white_gap)| white_gap.count() as PixelUnit)
            .max()
            .unwrap_or(0);
        if longest_white_gap_length <= MAX_WHITE_GAP_PIXELS {
            Some((x, streak_score, longest_white_gap_length))
        } else {
            None
        }
    });

    // If there are adjacent streak columns, just pick one to represent the streak.
    let streaks = streak_columns
        .coalesce(|column1, column2| {
            let (x1, _, _) = column1;
            let (x2, _, _) = column2;
            if x2 - x1 == 1 {
                Ok(column2)
            } else {
                Err((column1, column2))
            }
        })
        .collect::<Vec<_>>();

    ballot_image.debug().write("vertical_streaks", |canvas| {
        debug::draw_vertical_streaks_debug_image_mut(
            canvas,
            ballot_image.threshold(),
            x_range,
            &streaks,
        );
    });

    streaks.into_iter().map(|(x, _, _)| x).collect()
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
