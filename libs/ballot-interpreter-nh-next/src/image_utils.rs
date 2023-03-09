use image::{
    imageops::{resize, FilterType::Lanczos3},
    GenericImage, GrayImage, ImageError, Luma, Rgb,
};
use logging_timer::time;
use serde::Serialize;

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

/// An inset is a set of pixel offsets from the edges of an image.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Inset {
    pub top: u32,
    pub bottom: u32,
    pub left: u32,
    pub right: u32,
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
/// ```
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

/// Determines the number of pixels in an image that match the given luma.
pub fn count_pixels(img: &GrayImage, luma: Luma<u8>) -> u32 {
    img.pixels().filter(|p| **p == luma).count() as u32
}

/// Determines the ratio of pixels in an image that match the given luma.
pub fn ratio(img: &GrayImage, luma: Luma<u8>) -> f32 {
    let total = img.width() * img.height();
    count_pixels(img, luma) as f32 / total as f32
}

/// Resizes an image to fit within the given dimensions while maintaining the
/// aspect ratio.
#[time]
pub fn size_image_to_fit(img: &GrayImage, max_width: u32, max_height: u32) -> GrayImage {
    let aspect_ratio = img.width() as f32 / img.height() as f32;
    let new_width = if aspect_ratio > 1.0 {
        max_width
    } else {
        (max_height as f32 * aspect_ratio).ceil() as u32
    };
    let new_height = if aspect_ratio > 1.0 {
        (max_width as f32 / aspect_ratio).ceil() as u32
    } else {
        max_height
    };
    resize(img, new_width, new_height, Lanczos3)
}

/// Expands an image by the given number of pixels on all sides.
#[time]
pub fn expand_image(
    img: &GrayImage,
    border_size: u32,
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
/// inset has more than half of its pixels above the given threshold.
pub fn find_scanned_document_inset(image: &GrayImage, threshold: u8) -> Inset {
    let (width, height) = image.dimensions();

    let top = (0..height)
        .find(|y| {
            (0..width)
                .filter(|x| image.get_pixel(*x, *y)[0] > threshold)
                .count()
                > (width / 2) as usize
        })
        .unwrap_or(0);
    let bottom = (0..height)
        .rev()
        .find(|y| {
            (0..width)
                .filter(|x| image.get_pixel(*x, *y)[0] > threshold)
                .count()
                > (width / 2) as usize
        })
        .unwrap_or(0);
    let left = (0..width)
        .find(|x| {
            (0..height)
                .filter(|y| image.get_pixel(*x, *y)[0] > threshold)
                .count()
                > (height / 2) as usize
        })
        .unwrap_or(0);
    let right = (0..width)
        .rev()
        .find(|x| {
            (0..height)
                .filter(|y| image.get_pixel(*x, *y)[0] > threshold)
                .count()
                > (height / 2) as usize
        })
        .unwrap_or(0);

    Inset {
        top,
        bottom,
        left,
        right,
    }
}
