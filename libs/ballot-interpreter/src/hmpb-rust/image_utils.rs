use image::{
    imageops::{resize, FilterType::Lanczos3},
    GenericImage, GenericImageView, GrayImage, ImageError, Luma, Rgb,
};
use logging_timer::time;
use serde::Serialize;
use types_rs::election::UnitIntervalValue;
use types_rs::geometry::{PixelUnit, Size, SubPixelUnit};

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
pub fn count_pixels(img: &GrayImage, luma: Luma<u8>) -> usize {
    img.pixels().filter(|p| **p == luma).count()
}

/// Determines the ratio of pixels in an image that match the given luma.
pub fn ratio(img: &GrayImage, luma: Luma<u8>) -> f32 {
    let total = img.width() * img.height();
    count_pixels(img, luma) as f32 / total as f32
}

/// Resizes an image to fit within the given dimensions while maintaining the
/// aspect ratio.
#[time]
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
#[time]
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
#[time]
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
/// inset has more than half of its pixels above the given threshold.
#[allow(clippy::similar_names)]
pub fn find_scanned_document_inset(image: &GrayImage, threshold: u8) -> Option<Inset> {
    let (width, height) = image.dimensions();
    let (max_x, max_y) = (width - 1, height - 1);

    let min_y_above_threshold = (0..height).find(|y| {
        (0..width)
            .filter(|x| image.get_pixel(*x, *y)[0] > threshold)
            .count()
            > (width / 2) as usize
    });
    let max_y_above_threshold = (0..height).rev().find(|y| {
        (0..width)
            .filter(|x| image.get_pixel(*x, *y)[0] > threshold)
            .count()
            > (width / 2) as usize
    });
    let min_x_above_threshold = (0..width).find(|x| {
        (0..height)
            .filter(|y| image.get_pixel(*x, *y)[0] > threshold)
            .count()
            > (height / 2) as usize
    });
    let max_x_above_threshold = (0..width).rev().find(|x| {
        (0..height)
            .filter(|y| image.get_pixel(*x, *y)[0] > threshold)
            .count()
            > (height / 2) as usize
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

/// Calculates the degree to which the given image matches the given template,
/// where 0.0 means the images are perfect inverses of each other and 1.0 means
/// the images are identical. Panics if the image and template do not have the
/// same dimensions.
pub fn match_template<
    I: GenericImageView<Pixel = Luma<u8>>,
    T: GenericImageView<Pixel = Luma<u8>>,
>(
    image: &I,
    template: &T,
) -> UnitIntervalValue {
    assert_eq!(image.dimensions(), template.dimensions());

    let mut diff = 0.0;
    for (image_pixel, template_pixel) in image.pixels().zip(template.pixels()) {
        let image_luma = f32::from(image_pixel.2[0]);
        let template_luma = f32::from(template_pixel.2[0]);
        diff += (image_luma - template_luma).abs();
    }
    1.0 - (diff / (image.width() * image.height()) as f32 / f32::from(u8::MAX))
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
        let inset = find_scanned_document_inset(&image, otsu_level(&image));
        assert_eq!(inset, None);
    }

    #[test]
    fn test_find_scanned_document_inset_all_white() {
        let image = GrayImage::from_pixel(100, 100, Luma([u8::MAX]));
        let inset = find_scanned_document_inset(&image, otsu_level(&image));
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
        let inset = find_scanned_document_inset(&image, otsu_level(&image));
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
    fn test_match_template_identical_images() {
        let image = GrayImage::from_pixel(100, 100, Luma([0]));
        let template = GrayImage::from_pixel(100, 100, Luma([0]));
        let match_value = match_template(&image, &template);
        assert!((match_value - 1.0).abs() < f32::EPSILON);
    }

    #[test]
    fn test_match_template_inverse_images() {
        let image = GrayImage::from_pixel(100, 100, Luma([0]));
        let template = GrayImage::from_pixel(100, 100, Luma([u8::MAX]));
        let match_value = match_template(&image, &template);
        assert!((match_value - 0.0).abs() < f32::EPSILON);
    }

    #[test]
    fn test_match_template_half_black_half_white_images() {
        let image = GrayImage::from_pixel(100, 100, Luma([0]));
        let template = GrayImage::from_pixel(100, 100, Luma([u8::MAX / 2]));
        let match_value = match_template(&image, &template);
        assert!((match_value - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_match_template_panics_if_image_dimensions_do_not_match() {
        let image = GrayImage::from_pixel(100, 100, Luma([0]));
        let template = GrayImage::from_pixel(100, 101, Luma([0]));
        assert!(std::panic::catch_unwind(|| match_template(&image, &template)).is_err());
    }
}
