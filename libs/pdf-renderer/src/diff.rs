//! Shared utilities for visual comparison of PDF renders.
//!
//! Used by `compare-pdfs` binary and the visual-comparison integration tests.

use image::{ImageBuffer, Rgb, RgbImage};
use std::path::Path;
use std::process::Command;

pub const DPI: u32 = 150;
const DIFF_AMPLIFY: u8 = 10;

/// Rasterize a PDF file to an RGB image using `pdftoppm`.
///
/// # Panics
///
/// Panics if `pdftoppm` is not found, fails, or produces no output.
#[must_use]
pub fn pdf_to_png(pdf_path: &Path, tmp_prefix: &Path) -> RgbImage {
    let status = Command::new("pdftoppm")
        .args([
            "-png",
            "-r",
            &DPI.to_string(),
            &pdf_path.to_string_lossy(),
            &tmp_prefix.to_string_lossy(),
        ])
        .status()
        .expect("pdftoppm not found — install poppler-utils");
    assert!(status.success(), "pdftoppm failed");

    let png_path = format!("{}-1.png", tmp_prefix.display());
    image::open(&png_path)
        .unwrap_or_else(|e| panic!("failed to open {png_path}: {e}"))
        .to_rgb8()
}

/// Rasterize in-memory PDF bytes to an RGB image.
///
/// Writes the PDF to a temp file, calls `pdftoppm`, returns the image.
///
/// # Panics
///
/// Panics if temp file creation or `pdftoppm` fails.
#[must_use]
pub fn pdf_bytes_to_png(pdf_bytes: &[u8]) -> RgbImage {
    use std::io::Write;

    let tmp_dir = tempfile::tempdir().expect("create temp dir");
    let pdf_path = tmp_dir.path().join("render.pdf");
    let mut f = std::fs::File::create(&pdf_path).expect("create temp pdf");
    f.write_all(pdf_bytes).expect("write temp pdf");
    drop(f);

    let prefix = tmp_dir.path().join("output");
    pdf_to_png(&pdf_path, &prefix)
}

/// Pad an image to a target size with white pixels.
///
/// # Panics
///
/// Panics if the source image is larger than the target size.
#[must_use]
pub fn pad_to_size(img: &RgbImage, width: u32, height: u32) -> RgbImage {
    let mut padded: RgbImage = ImageBuffer::from_pixel(width, height, Rgb([255, 255, 255]));
    image::GenericImage::copy_from(&mut padded, img, 0, 0).expect("copy image");
    padded
}

/// Compute pixel-wise absolute difference between two same-sized images.
///
/// Differences are amplified by 10x for visibility.
///
/// # Panics
///
/// Panics if images have different dimensions.
#[must_use]
pub fn compute_diff(a: &RgbImage, b: &RgbImage) -> RgbImage {
    let (w, h) = a.dimensions();
    assert_eq!((w, h), b.dimensions(), "images must be the same size");
    let mut diff: RgbImage = ImageBuffer::new(w, h);
    for y in 0..h {
        for x in 0..w {
            let pa = a.get_pixel(x, y);
            let pb = b.get_pixel(x, y);
            let dr = pa[0].abs_diff(pb[0]).saturating_mul(DIFF_AMPLIFY);
            let dg = pa[1].abs_diff(pb[1]).saturating_mul(DIFF_AMPLIFY);
            let db = pa[2].abs_diff(pb[2]).saturating_mul(DIFF_AMPLIFY);
            diff.put_pixel(x, y, Rgb([dr, dg, db]));
        }
    }
    diff
}

/// Count the number of pixels that differ between two same-sized images.
///
/// # Panics
///
/// Panics if images have different dimensions.
#[must_use]
pub fn count_different_pixels(a: &RgbImage, b: &RgbImage) -> u64 {
    let (w, h) = a.dimensions();
    assert_eq!((w, h), b.dimensions(), "images must be the same size");
    let mut count = 0u64;
    for y in 0..h {
        for x in 0..w {
            if a.get_pixel(x, y) != b.get_pixel(x, y) {
                count += 1;
            }
        }
    }
    count
}

/// Render HTML with our Rust renderer and return the PDF bytes.
///
/// This is the non-NAPI entry point used by tests and tools.
///
/// # Panics
///
/// Panics if HTML parsing fails.
#[must_use]
pub fn render_html_to_pdf(html: &str) -> Vec<u8> {
    let parsed = crate::dom::parse_html(html).expect("parse HTML");
    let mut styles = crate::style::resolve_styles(&parsed);
    let fonts = crate::fonts::load_fonts(&styles.font_faces);
    let layout_result = crate::layout::compute_layout(&parsed.document, &mut styles, &fonts);
    crate::paint::render_pdf(&layout_result, &styles, &fonts)
}
