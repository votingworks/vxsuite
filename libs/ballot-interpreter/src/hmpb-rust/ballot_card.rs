use std::{cmp::Ordering, io, ops::Range};

use image::GrayImage;
use imageproc::contrast::{otsu_level, threshold};
use serde::Serialize;
use types_rs::geometry::PixelUnit;

pub use types_rs::ballot_card::*;

use crate::image_utils::{bleed, Inset, BLACK};

use types_rs::geometry::{GridUnit, Inch, PixelPosition, Rect, Size, SubPixelUnit};

#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize)]
pub enum BallotPaperSize {
    #[serde(rename = "letter")]
    Letter,
    #[serde(rename = "legal")]
    Legal,
    #[serde(rename = "custom-8.5x17")]
    Custom17,
    #[serde(rename = "custom-8.5x18")]
    Custom18,
    #[serde(rename = "custom-8.5x21")]
    Custom21,
    #[serde(rename = "custom-8.5x22")]
    Custom22,
}

impl BallotPaperSize {
    pub const fn dimensions(self) -> Size<Inch> {
        match self {
            BallotPaperSize::Letter => Size {
                width: Inch::new(8.5),
                height: Inch::new(11.0),
            },
            BallotPaperSize::Legal => Size {
                width: Inch::new(8.5),
                height: Inch::new(14.0),
            },
            BallotPaperSize::Custom17 => Size {
                width: Inch::new(8.5),
                height: Inch::new(17.0),
            },
            BallotPaperSize::Custom18 => Size {
                width: Inch::new(8.5),
                height: Inch::new(18.0),
            },
            BallotPaperSize::Custom21 => Size {
                width: Inch::new(8.5),
                height: Inch::new(21.0),
            },
            BallotPaperSize::Custom22 => Size {
                width: Inch::new(8.5),
                height: Inch::new(22.0),
            },
        }
    }
}

pub struct BallotImage {
    pub image: GrayImage,
    pub threshold: u8,
    pub border_inset: Inset,
}
pub struct BallotPage {
    pub ballot_image: BallotImage,
    pub geometry: Geometry,
}

pub struct BallotCard {
    pub side_a: BallotImage,
    pub side_b: BallotImage,
    pub geometry: Geometry,
}

/// Ballot card orientation.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize)]
pub enum Orientation {
    /// The ballot card is portrait and right-side up.
    #[serde(rename = "portrait")]
    Portrait,

    /// The ballot card is portrait and upside down.
    #[serde(rename = "portrait-reversed")]
    PortraitReversed,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[must_use]
pub struct Geometry {
    pub ballot_paper_size: BallotPaperSize,
    pub pixels_per_inch: PixelUnit,
    pub canvas_size: Size<Inch>,
    pub content_area: Rect,
    pub timing_mark_size: Size<Inch>,
    pub timing_mark_vertical_spacing: Inch,
    pub timing_mark_horizontal_spacing: Inch,
    pub grid_size: Size<GridUnit>,
}

impl Geometry {
    /// Gets the width of the canvas in pixels.
    #[must_use]
    pub fn canvas_width_pixels(&self) -> SubPixelUnit {
        self.canvas_size.width.pixels(self.pixels_per_inch)
    }

    /// Gets the height of the canvas in pixels.
    #[must_use]
    pub fn canvas_height_pixels(&self) -> SubPixelUnit {
        self.canvas_size.height.pixels(self.pixels_per_inch)
    }

    /// Gets the width of a timing mark in pixels.
    #[must_use]
    pub fn timing_mark_width_pixels(&self) -> SubPixelUnit {
        self.timing_mark_size.width.pixels(self.pixels_per_inch)
    }

    /// Gets the height of a timing mark in pixels.
    #[must_use]
    pub fn timing_mark_height_pixels(&self) -> SubPixelUnit {
        self.timing_mark_size.height.pixels(self.pixels_per_inch)
    }

    /// Gets the distance from the center of one timing mark to the center of
    /// one of its horizontal neighbors, in pixels.
    #[must_use]
    pub fn horizontal_timing_mark_center_to_center_pixel_distance(&self) -> SubPixelUnit {
        (self.timing_mark_horizontal_spacing + self.timing_mark_size.width)
            .pixels(self.pixels_per_inch)
    }

    /// Gets the distance from the center of one timing mark to the center of
    /// one of its vertical neighbors, in pixels.
    #[must_use]
    pub fn vertical_timing_mark_center_to_center_pixel_distance(&self) -> SubPixelUnit {
        (self.timing_mark_vertical_spacing + self.timing_mark_size.height)
            .pixels(self.pixels_per_inch)
    }
}

/// Expected PPI for scanned ballot cards.
const SCAN_PIXELS_PER_INCH: PixelUnit = 200;

/// Scanned margins for the front and back of the ballot card in inches.
/// Include 5mm margins by default to create room for an imprinting ID.
/// Margins meet or exceed 404 and 4001 series HP printer recommendations.
const BALLOT_CARD_SCAN_MARGINS: Inset<Inch> = Inset {
    top: Inch::new(1.0 / 6.0),    // 12pt
    bottom: Inch::new(1.0 / 6.0), // 12pt
    left: Inch::new(5.0 / 25.4),  // 5mm
    right: Inch::new(5.0 / 25.4), // 5mm
};

const TIMING_MARK_SIZE: Size<Inch> = Size {
    width: Inch::new(3.0 / 16.0),
    height: Inch::new(1.0 / 16.0),
};

#[derive(Debug, Copy, Clone, PartialEq)]
#[must_use]
pub struct PaperInfo {
    pub size: BallotPaperSize,
    pub margins: Inset<Inch>,
    pub pixels_per_inch: PixelUnit,
}

impl PaperInfo {
    /// Returns info for a letter-sized scanned ballot card.
    pub const fn scanned_letter() -> Self {
        Self {
            size: BallotPaperSize::Letter,
            margins: BALLOT_CARD_SCAN_MARGINS,
            pixels_per_inch: SCAN_PIXELS_PER_INCH,
        }
    }

    /// Returns info for a legal-sized scanned ballot card.
    pub const fn scanned_legal() -> Self {
        Self {
            size: BallotPaperSize::Legal,
            margins: BALLOT_CARD_SCAN_MARGINS,
            pixels_per_inch: SCAN_PIXELS_PER_INCH,
        }
    }

    pub const fn scanned_custom17() -> Self {
        Self {
            size: BallotPaperSize::Custom17,
            margins: BALLOT_CARD_SCAN_MARGINS,
            pixels_per_inch: SCAN_PIXELS_PER_INCH,
        }
    }

    pub const fn scanned_custom18() -> Self {
        Self {
            size: BallotPaperSize::Custom18,
            margins: BALLOT_CARD_SCAN_MARGINS,
            pixels_per_inch: SCAN_PIXELS_PER_INCH,
        }
    }

    pub const fn scanned_custom21() -> Self {
        Self {
            size: BallotPaperSize::Custom21,
            margins: BALLOT_CARD_SCAN_MARGINS,
            pixels_per_inch: SCAN_PIXELS_PER_INCH,
        }
    }

    pub const fn scanned_custom22() -> Self {
        Self {
            size: BallotPaperSize::Custom22,
            margins: BALLOT_CARD_SCAN_MARGINS,
            pixels_per_inch: SCAN_PIXELS_PER_INCH,
        }
    }

    /// Returns info for all supported scanned paper sizes.
    pub const fn scanned() -> [Self; 6] {
        [
            Self::scanned_letter(),
            Self::scanned_legal(),
            Self::scanned_custom17(),
            Self::scanned_custom18(),
            Self::scanned_custom21(),
            Self::scanned_custom22(),
        ]
    }

    pub fn compute_geometry(&self) -> Geometry {
        let ballot_paper_size = self.size;
        let margins = self.margins;
        let pixels_per_inch = self.pixels_per_inch;
        let canvas_size = ballot_paper_size.dimensions();
        let content_area_width = canvas_size.width - margins.left - margins.right;
        let content_area_height = canvas_size.height - margins.top - margins.bottom;
        let content_area = Rect::new(
            margins.left.pixels(pixels_per_inch) as PixelPosition,
            margins.top.pixels(pixels_per_inch) as PixelPosition,
            content_area_width.pixels(pixels_per_inch).round() as PixelUnit,
            content_area_height.pixels(pixels_per_inch).round() as PixelUnit,
        );
        // Corresponds to the NH Accuvote ballot grid, which we also use in VX
        // ballots. This formula is also defined in libs/hmpb.
        let columns_per_inch = 4.0;
        let rows_per_inch = 4.0;
        let grid_size = Size {
            width: (columns_per_inch * canvas_size.width.get()) as GridUnit,
            height: (rows_per_inch * canvas_size.height.get()) as GridUnit - 3,
        };

        let timing_mark_vertical_spacing = (content_area_height
            - grid_size.height as SubPixelUnit * TIMING_MARK_SIZE.height)
            / (grid_size.height as SubPixelUnit - 1.0);
        let timing_mark_horizontal_spacing = (content_area_width
            - grid_size.width as SubPixelUnit * TIMING_MARK_SIZE.width)
            / (grid_size.width as SubPixelUnit - 1.0);

        Geometry {
            ballot_paper_size,
            pixels_per_inch,
            canvas_size,
            content_area,
            timing_mark_size: TIMING_MARK_SIZE,
            timing_mark_vertical_spacing,
            timing_mark_horizontal_spacing,
            grid_size,
        }
    }
}

#[must_use]
pub fn get_matching_paper_info_for_image_size(
    size: (PixelUnit, PixelUnit),
    possible_paper_info: &[PaperInfo],
) -> Option<PaperInfo> {
    /// Allow a fairly small deviation of the width due to possible rotation of
    /// the ballot. This isn't the direction images are scanned in, so there
    /// should not be any stretching of the image.
    const WIDTH_ERROR_THRESHOLD_RANGE: Range<f32> = -0.05..0.05;

    /// Allow a small negative deviation but a higher positive deviation due to
    /// height being the direction we scan in, which can lead to stretching of
    /// the ballot image in that direction. We don't allow a higher negative
    /// deviation because compression of the ballot image doesn't seem to
    /// happen, and also this range ensures that we don't have overlap in
    /// acceptable heights of the different allowed paper sizes.
    const HEIGHT_ERROR_THRESHOLD_RANGE: Range<f32> = -0.05..0.15;

    possible_paper_info
        .iter()
        .map(|paper_info| {
            let geometry = paper_info.compute_geometry();
            (paper_info, {
                let (expected_width, expected_height) = (
                    geometry.canvas_size.width.pixels(geometry.pixels_per_inch),
                    geometry.canvas_size.height.pixels(geometry.pixels_per_inch),
                );
                let (actual_width, actual_height) = size;
                (
                    (actual_width as f32 - expected_width) / expected_width,
                    (actual_height as f32 - expected_height) / expected_height,
                )
            })
        })
        .filter(|(_, (width_error, height_error))| {
            WIDTH_ERROR_THRESHOLD_RANGE.contains(width_error)
                && HEIGHT_ERROR_THRESHOLD_RANGE.contains(height_error)
        })
        .min_by(|(_, (_, height_error1)), (_, (_, height_error2))| {
            height_error1
                .partial_cmp(height_error2)
                .unwrap_or(Ordering::Equal)
        })
        .map(|(paper_info, _)| *paper_info)
}

/// Load the ballot scan bubble image.
///
/// # Errors
///
/// Returns an error if the image cannot be loaded or converted to grayscale.
pub fn load_ballot_scan_bubble_image() -> Result<GrayImage, image::ImageError> {
    let bubble_image_bytes = include_bytes!("../../data/bubble_scan.png");
    let inner = io::Cursor::new(bubble_image_bytes);
    let image = image::load(inner, image::ImageFormat::Png).map(|image| image.to_luma8())?;
    Ok(bleed(&threshold(&image, otsu_level(&image)), BLACK))
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn test_get_scanned_ballot_card_geometry() {
        assert_eq!(
            get_matching_paper_info_for_image_size((1696, 2200), &PaperInfo::scanned()),
            Some(PaperInfo::scanned_letter())
        );
        assert_eq!(
            get_matching_paper_info_for_image_size((1696, 2800), &PaperInfo::scanned()),
            Some(PaperInfo::scanned_legal())
        );
        assert_eq!(
            get_matching_paper_info_for_image_size((1500, 1500), &PaperInfo::scanned()),
            None
        );
    }

    #[test]
    fn test_compute_geometry() {
        let allowed_spacing_error = Inch::new(0.06);
        let expected_timing_mark_spacing = TIMING_MARK_SIZE.width + TIMING_MARK_SIZE.height;

        for paper_info in PaperInfo::scanned() {
            let geometry = paper_info.compute_geometry();
            let diff = (geometry.timing_mark_vertical_spacing - expected_timing_mark_spacing).abs();
            assert!(
                diff <= allowed_spacing_error,
                "timing mark vertical spacing ({}) is too far from expected value ({}) with a difference of {diff} for paper info: {paper_info:?}",
                geometry.timing_mark_vertical_spacing,
                expected_timing_mark_spacing,
            );
        }
    }

    #[test]
    fn test_load_bubble_template() {
        load_ballot_scan_bubble_image().unwrap();
    }
}
