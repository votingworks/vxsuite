use std::{cmp::Ordering, io, mem::swap, ops::Range, path::PathBuf};

use image::{imageops::rotate180_in_place, GenericImageView, GrayImage};
use imageproc::contrast::{otsu_level, threshold};
use serde::Serialize;

use crate::{
    debug::ImageDebugWriter,
    image_utils::{bleed, detect_vertical_streaks, find_scanned_document_inset, Inset, BLACK},
    interpret::{BallotPageAndGeometry, Error, Result, TimingMarkAlgorithm},
    layout::{build_interpreted_page_layout, InterpretedContestLayout},
    qr_code,
    scoring::{
        score_bubble_marks_from_grid_layout, score_write_in_areas, ScoredBubbleMarks,
        ScoredPositionAreas, UnitIntervalScore,
    },
    timing_marks::{
        self, contours::FindTimingMarkGridOptions, BorderAxis, DefaultForGeometry, TimingMarks,
    },
};

use types_rs::{
    ballot_card::{BallotSide, PaperSize},
    coding,
    election::{Election, GridLayout},
    geometry::{GridUnit, Inch, PixelPosition, PixelUnit, Rect, Size, SubPixelUnit},
    hmpb,
    pair::Pair,
};

/// An image of a ballot after it has had any black areas outside the paper
/// bounds cropped off. Provides access to the underlying image data, but most
/// uses should go through the methods such as [`BallotImage::get_pixel`] rather
/// than comparing the threshold against the underlying image data.
#[must_use]
pub struct BallotImage {
    image: GrayImage,
    threshold: u8,
    border_inset: Inset,
    debug: ImageDebugWriter,
}

impl BallotImage {
    /// Clamps the threshold to the given range. This is useful for situations
    /// where the threshold computed by Otsu's method is too extreme, such as
    /// when most of the image is nearly all one luminosity.
    pub fn clamp_threshold(&mut self, min: u8, max: u8) {
        self.threshold = self.threshold.clamp(min, max);
    }

    /// Rotates the underlying image data, leaving the threshold as-is since
    /// Otsu's method is rotation-independent.
    pub fn rotate180(&mut self) {
        rotate180_in_place(&mut self.image);
        self.border_inset.rotate180();
        self.debug.rotate180();
    }

    /// This sets the ratio of pixels required to be white (above the threshold) in
    /// a given edge row or column to consider it no longer eligible to be cropped.
    /// This used to be 50%, but we found that too much of the top/bottom of the
    /// actual ballot content was being cropped, especially in the case of a skewed
    /// ballot. In such cases, one of the corners would sometimes be partially or
    /// completely cropped, leading to the ballot being rejected. We chose the new
    /// value by trial and error, in particular by seeing how much cropping occurred
    /// on ballots with significant but still acceptable skew (i.e. 3 degrees).
    const CROP_BORDERS_THRESHOLD_RATIO: f32 = 0.1;

    /// Builds a [`BallotImage`] with the black border outside the paper area
    /// cropped off. Returns [`None`] if a valid border inset cannot be
    /// computed.
    #[must_use]
    pub fn from_image(image: GrayImage, debug_base: Option<PathBuf>) -> Option<BallotImage> {
        let threshold = otsu_level(&image);
        let border_inset =
            find_scanned_document_inset(&image, threshold, Self::CROP_BORDERS_THRESHOLD_RATIO)?;

        if border_inset.is_zero() {
            // Don't bother cropping if there's no inset.
            let debug = debug_base.map_or_else(ImageDebugWriter::disabled, |debug_base| {
                ImageDebugWriter::new(debug_base, image.clone())
            });
            return Some(BallotImage {
                image,
                threshold,
                border_inset,
                debug,
            });
        }

        let image = image
            .view(
                border_inset.left,
                border_inset.top,
                image.width() - border_inset.left - border_inset.right,
                image.height() - border_inset.top - border_inset.bottom,
            )
            .to_image();

        // Re-compute the threshold after cropping to ensure future
        // re-interpretations based on the saved image are consistent with the
        // initial one.
        let threshold = otsu_level(&image);
        let debug = debug_base.map_or_else(ImageDebugWriter::disabled, |debug_base| {
            ImageDebugWriter::new(debug_base, image.clone())
        });

        Some(BallotImage {
            image,
            threshold,
            border_inset,
            debug,
        })
    }

    /// Gets the underlying image data. Generally you should try to access
    /// information about the image through the other methods on
    /// [`BallotImage`].
    #[must_use]
    pub fn image(&self) -> &GrayImage {
        &self.image
    }

    /// Gets the image debug writer associated with this ballot image.
    pub fn debug(&self) -> &ImageDebugWriter {
        &self.debug
    }

    /// Gets the computed Otsu threshold. Generally you should try to access
    /// pixel information through [`BallotImage::get_pixel`] rather than
    /// comparing against this value.
    #[must_use]
    pub fn threshold(&self) -> u8 {
        self.threshold
    }

    /// Returns the computed border inset, showing the amount cropped off on
    /// each side.
    #[must_use]
    pub fn border_inset(&self) -> Inset {
        self.border_inset
    }

    /// Gets the width of the image after cropping.
    #[must_use]
    pub fn width(&self) -> u32 {
        self.image.width()
    }

    /// Gets the height of the image after cropping.
    #[must_use]
    pub fn height(&self) -> u32 {
        self.image.height()
    }

    /// Gets the dimensions of the image after cropping.
    #[must_use]
    pub fn dimensions(&self) -> (u32, u32) {
        self.image.dimensions()
    }

    /// Determines whether the pixel at the given coordinate is foreground
    /// or background.
    #[must_use]
    pub fn get_pixel(&self, x: u32, y: u32) -> BallotPixel {
        // This must be `<=` so that binarized images whose threshold is 0
        // still have pixels with luma 0 count as foreground pixels.
        if self.image.get_pixel(x, y)[0] <= self.threshold {
            BallotPixel::Foreground
        } else {
            BallotPixel::Background
        }
    }
}

/// A pixel from a binarized ballot image.
///
/// Note that even though the variants are called "foreground" and
/// "background", black pixels will likely also come from the area outside the
/// scanned sheet where there was no paper. These pixels are not distinguished
/// from "foreground" pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BallotPixel {
    /// A black pixel.
    Foreground,

    /// A white pixel.
    Background,
}

impl BallotPixel {
    /// Determines whether this pixel is a foreground pixel, i.e. black.
    #[must_use]
    pub fn is_foreground(self) -> bool {
        matches!(self, Self::Foreground)
    }

    /// Determines whether this pixel is a background pixel, i.e. white.
    #[must_use]
    pub fn is_background(self) -> bool {
        matches!(self, Self::Background)
    }
}

/// Contains one of the two ballot pages within a [`BallotCard`], though
/// whether it is the front or back is not specified here.
#[must_use]
pub struct BallotPage {
    label: String,
    ballot_image: BallotImage,
    geometry: Geometry,
}

impl BallotPage {
    /// Prepare a ballot page image for interpretation by cropping the black border.
    ///
    /// # Errors
    ///
    /// Returns an error if the image cannot be cropped or if the paper information
    /// cannot be determined.
    #[allow(clippy::result_large_err)]
    pub fn from_image(
        label: &str,
        image: GrayImage,
        possible_paper_infos: &[PaperInfo],
        debug_base: Option<PathBuf>,
    ) -> Result<Self> {
        let Some(ballot_image) = BallotImage::from_image(image, debug_base) else {
            return Err(Error::BorderInsetNotFound {
                label: label.to_owned(),
            });
        };

        let Some(paper_info) =
            get_matching_paper_info_for_image_size(ballot_image.dimensions(), possible_paper_infos)
        else {
            return Err(Error::UnexpectedDimensions {
                label: label.to_owned(),
                dimensions: ballot_image.dimensions().into(),
            });
        };

        Ok(Self {
            label: label.to_owned(),
            ballot_image,
            geometry: paper_info.compute_geometry(),
        })
    }

    /// Finds timing marks in this ballot page with the specified algorithm.
    ///
    /// # Errors
    ///
    /// Fails if the selected timing mark algorithm is unable to find the
    /// timing mark grid within the image.
    #[allow(clippy::result_large_err)]
    pub fn find_timing_marks(
        &self,
        timing_mark_algorithm: TimingMarkAlgorithm,
    ) -> Result<TimingMarks> {
        match timing_mark_algorithm {
            TimingMarkAlgorithm::Corners => timing_marks::corners::find_timing_mark_grid(
                &self.ballot_image,
                &self.geometry,
                &timing_marks::corners::Options::default_for_geometry(&self.geometry),
            ),
            TimingMarkAlgorithm::Contours { inference } => {
                timing_marks::contours::find_timing_mark_grid(
                    &self.geometry,
                    &self.ballot_image,
                    &FindTimingMarkGridOptions {
                        allowed_timing_mark_inset_percentage_of_width:
                            timing_marks::contours::ALLOWED_TIMING_MARK_INSET_PERCENTAGE_OF_WIDTH,
                        inference,
                    },
                )
            }
        }
    }

    /// Gets the ballot geometry information for this page.
    pub fn geometry(&self) -> &Geometry {
        &self.geometry
    }

    /// Gets the ballot image for this page.
    pub fn ballot_image(&self) -> &BallotImage {
        &self.ballot_image
    }

    /// Gets the label for this page, mostly used for debugging purposes.
    #[must_use]
    pub fn label(&self) -> &str {
        &self.label
    }

    /// Gets the debug writer for this page.
    pub fn debug(&self) -> &ImageDebugWriter {
        self.ballot_image.debug()
    }

    /// Gets the dimensions of this page's image after cropping.
    #[must_use]
    pub fn dimensions(&self) -> (u32, u32) {
        self.ballot_image.dimensions()
    }

    /// Gets the width of this page's image after cropping.
    #[must_use]
    pub fn width(&self) -> u32 {
        self.ballot_image.width()
    }

    /// Gets the height of this page's image after cropping.
    #[must_use]
    pub fn height(&self) -> u32 {
        self.ballot_image.height()
    }

    /// Rotates the underlying ballot image.
    pub fn rotate180(&mut self) {
        self.ballot_image.rotate180();
    }
}

/// Contains the two pages of a ballot card. They're accessed via methods
/// labeled front and back, but there is no guarantee that they are actually
/// the front and back of the ballot card. Call [`BallotCard::swap_pages`] if
/// you discover they are actually wrong and would like to switch them.
#[must_use]
pub struct BallotCard {
    front_page: BallotPage,
    back_page: BallotPage,
}

impl BallotCard {
    /// Load both sides of a ballot card image and return the ballot card.
    ///
    /// # Errors
    ///
    /// Returns an error if the images could not be loaded or if the ballot card
    /// could not be prepared.
    #[allow(clippy::result_large_err)]
    pub fn from_pages(front_page: BallotPage, back_page: BallotPage) -> Result<BallotCard> {
        if front_page.geometry() != back_page.geometry() {
            return Err(Error::MismatchedBallotCardGeometries {
                side_a: BallotPageAndGeometry {
                    label: front_page.label,
                    border_inset: front_page.ballot_image.border_inset(),
                    geometry: front_page.geometry,
                },
                side_b: BallotPageAndGeometry {
                    label: back_page.label,
                    border_inset: back_page.ballot_image.border_inset(),
                    geometry: back_page.geometry,
                },
            });
        }

        Ok(Self {
            front_page,
            back_page,
        })
    }

    pub fn swap_pages(&mut self) {
        swap(&mut self.front_page, &mut self.back_page);
    }

    pub fn geometry(&self) -> &Geometry {
        &self.front_page.geometry
    }

    pub fn front_page(&self) -> &BallotPage {
        &self.front_page
    }

    pub fn back_page(&self) -> &BallotPage {
        &self.back_page
    }

    #[must_use]
    pub fn as_pair(&self) -> Pair<&BallotPage> {
        Pair::new(&self.front_page, &self.back_page)
    }

    #[must_use]
    pub fn as_pair_mut(&mut self) -> Pair<&mut BallotPage> {
        Pair::new(&mut self.front_page, &mut self.back_page)
    }

    /// Detects vertical streaks on both sides of the ballot card.
    ///
    /// # Errors
    ///
    /// Fails if vertical streaks are detected on either side.
    #[allow(clippy::result_large_err)]
    pub fn detect_vertical_streaks(&self) -> Result<()> {
        self.as_pair()
            .par_map(|ballot_page| {
                let streaks = detect_vertical_streaks(ballot_page.ballot_image());
                if streaks.is_empty() {
                    Ok(())
                } else {
                    Err(Error::VerticalStreaksDetected {
                        label: ballot_page.label().to_string(),
                        x_coordinates: streaks,
                    })
                }
            })
            .into_result()?;
        Ok(())
    }

    /// Finds timing marks on the ballot card using the given timing mark
    /// algorithm.
    ///
    /// # Errors
    ///
    /// Fails if timing marks cannot be found on one or both ballot pages.
    #[allow(clippy::result_large_err)]
    pub fn find_timing_marks(
        &self,
        timing_mark_algorithm: TimingMarkAlgorithm,
    ) -> Result<Pair<TimingMarks>> {
        self.as_pair()
            .par_map(|ballot_page| ballot_page.find_timing_marks(timing_mark_algorithm))
            .into_result()
    }

    /// Checks the scale of the ballot pages as computed from the timing marks
    /// is at least a given minimum value.
    ///
    /// # Errors
    ///
    /// Fails if the computed scale based on the timing marks for either page is
    /// less than the provided minimum scale.
    #[allow(clippy::result_large_err)]
    pub fn check_minimum_scale<'a>(
        &self,
        timing_marks: impl Into<Pair<&'a TimingMarks>>,
        minimum_scale: UnitIntervalScore,
    ) -> Result<()> {
        self.as_pair()
            .zip(timing_marks)
            .map(|(ballot_page, timing_marks)| {
                // We use the horizontal axis here because it is perpendicular to
                // the scan direction and therefore stretching should be minimal.
                //
                // See https://votingworks.slack.com/archives/CEL6D3GAD/p1750095447642289 for more context.
                if let Some(scale) =
                    timing_marks.compute_scale_based_on_axis(BorderAxis::Horizontal)
                {
                    if scale < minimum_scale {
                        return Err(Error::InvalidScale {
                            label: ballot_page.label().to_owned(),
                            scale,
                        });
                    }
                }

                Ok(())
            })
            .into_result()?;
        Ok(())
    }

    /// Detects and decodes barcodes on the ballot pages and returns the decoded
    /// data. Uses the position of the detected barcodes to determine the
    /// orientation of the ballot pages.
    ///
    /// # Errors
    ///
    /// Fails if the barcodes cannot be located or cannot be decoded.
    #[allow(clippy::result_large_err)]
    pub fn decode_ballot_barcodes(
        &self,
        election: &Election,
    ) -> Result<Pair<(hmpb::Metadata, Orientation)>> {
        self.as_pair()
            .map(|ballot_page| {
                let qr_code =
                    qr_code::detect(ballot_page.ballot_image().image(), ballot_page.debug())
                        .map_err(|e| Error::InvalidQrCodeMetadata {
                            label: ballot_page.label().to_owned(),
                            message: e.to_string(),
                        })?;
                let metadata = coding::decode_with(qr_code.bytes(), election).map_err(|e| {
                    Error::InvalidQrCodeMetadata {
                        label: ballot_page.label().to_owned(),
                        message: format!(
                            "Unable to decode QR code bytes: {e} (bytes={bytes:?})",
                            bytes = qr_code.bytes()
                        ),
                    }
                })?;
                Ok((metadata, qr_code.orientation()))
            })
            .join(|decode_front_result, decode_back_result| {
                // If one side has a detected QR code and the other doesn't, we can
                // infer the missing metadata from the detected metadata.
                match (decode_front_result, decode_back_result) {
                    (Ok(front), Ok(back)) => Ok(Pair::new(front, back)),
                    (
                        Err(Error::InvalidQrCodeMetadata { .. }),
                        Ok((back_metadata, back_orientation)),
                    ) => {
                        let front_metadata = hmpb::infer_missing_page_metadata(&back_metadata);
                        Ok(Pair::new(
                            (front_metadata, back_orientation),
                            (back_metadata, back_orientation),
                        ))
                    }
                    (
                        Ok((front_metadata, front_orientation)),
                        Err(Error::InvalidQrCodeMetadata { .. }),
                    ) => {
                        let back_metadata = hmpb::infer_missing_page_metadata(&front_metadata);
                        Ok(Pair::new(
                            (front_metadata, front_orientation),
                            (back_metadata, front_orientation),
                        ))
                    }
                    (Err(e), _) | (_, Err(e)) => Err(e),
                }
            })?
            .join(
                // Do some validation to check that the two sides agree.
                |(front_metadata, front_orientation), (back_metadata, back_orientation)| {
                    if front_metadata.precinct_id != back_metadata.precinct_id {
                        return Err(Error::MismatchedPrecincts {
                            side_a: front_metadata.precinct_id,
                            side_b: back_metadata.precinct_id,
                        });
                    }
                    if front_metadata.ballot_style_id != back_metadata.ballot_style_id {
                        return Err(Error::MismatchedBallotStyles {
                            side_a: front_metadata.ballot_style_id,
                            side_b: back_metadata.ballot_style_id,
                        });
                    }
                    if front_metadata.page_number.opposite() != back_metadata.page_number {
                        return Err(Error::NonConsecutivePageNumbers {
                            side_a: front_metadata.page_number.get(),
                            side_b: back_metadata.page_number.get(),
                        });
                    }

                    Ok(Pair::new(
                        (front_metadata, front_orientation),
                        (back_metadata, back_orientation),
                    ))
                },
            )
    }

    /// Scores bubble marks on both ballot pages.
    #[must_use]
    pub fn score_bubble_marks<'a>(
        &self,
        timing_marks: impl Into<Pair<&'a TimingMarks>>,
        bubble_template: &GrayImage,
        grid_layout: &GridLayout,
        sheet_number: u32,
    ) -> Pair<ScoredBubbleMarks> {
        self.as_pair()
            .zip(timing_marks)
            .zip((BallotSide::Front, BallotSide::Back))
            .par_map(|((ballot_page, timing_marks), side)| {
                score_bubble_marks_from_grid_layout(
                    ballot_page.ballot_image(),
                    bubble_template,
                    timing_marks,
                    grid_layout,
                    sheet_number,
                    side,
                )
            })
    }

    /// Scores write-in areas in order to detect unmarked write-ins.
    pub fn score_write_in_areas<'a>(
        &self,
        timing_marks: impl Into<Pair<&'a TimingMarks>>,
        grid_layout: &GridLayout,
        sheet_number: u32,
    ) -> Pair<ScoredPositionAreas> {
        self.as_pair()
            .zip(timing_marks)
            .zip((BallotSide::Front, BallotSide::Back))
            .par_map(|((ballot_page, timing_marks), side)| {
                score_write_in_areas(
                    ballot_page.ballot_image(),
                    timing_marks,
                    grid_layout,
                    sheet_number,
                    side,
                )
            })
    }

    /// Determines the bounds of all contest options within the image based on
    /// the timing marks for both ballot pages.
    ///
    /// # Errors
    ///
    /// Fails if either side fails to determine the contest layout.
    #[allow(clippy::result_large_err)]
    pub fn build_page_layout<'a>(
        &self,
        timing_marks: impl Into<Pair<&'a TimingMarks>>,
        grid_layout: &GridLayout,
        sheet_number: u32,
    ) -> Result<Pair<Vec<InterpretedContestLayout>>> {
        self.as_pair()
            .zip(timing_marks)
            .zip((BallotSide::Front, BallotSide::Back))
            .map(|((ballot_page, timing_marks), side)| {
                build_interpreted_page_layout(
                    timing_marks,
                    grid_layout,
                    sheet_number,
                    side,
                    ballot_page.debug(),
                )
                .ok_or(Error::CouldNotComputeLayout { side })
            })
            .into_result()
    }
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
    pub ballot_paper_size: PaperSize,
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

    /// Gets the distance from the center of a left border timing mark to the
    /// center of its corresponding right border timing mark.
    #[must_use]
    pub fn left_to_right_center_to_center_pixel_distance(&self) -> SubPixelUnit {
        ((self.timing_mark_horizontal_spacing + self.timing_mark_size.width)
            * (self.grid_size.width - 1) as f32)
            .pixels(self.pixels_per_inch)
    }

    /// Gets the distance from the center of a top border timing mark to the
    /// center of its corresponding bottom border timing mark.
    #[must_use]
    pub fn top_to_bottom_center_to_center_pixel_distance(&self) -> SubPixelUnit {
        ((self.timing_mark_vertical_spacing + self.timing_mark_size.height)
            * (self.grid_size.height - 1) as f32)
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
    pub size: PaperSize,
    pub margins: Inset<Inch>,
    pub pixels_per_inch: PixelUnit,
}

impl PaperInfo {
    /// Returns info for a letter-sized scanned ballot card.
    pub const fn scanned_letter() -> Self {
        Self {
            size: PaperSize::Letter,
            margins: BALLOT_CARD_SCAN_MARGINS,
            pixels_per_inch: SCAN_PIXELS_PER_INCH,
        }
    }

    /// Returns info for a legal-sized scanned ballot card.
    pub const fn scanned_legal() -> Self {
        Self {
            size: PaperSize::Legal,
            margins: BALLOT_CARD_SCAN_MARGINS,
            pixels_per_inch: SCAN_PIXELS_PER_INCH,
        }
    }

    pub const fn scanned_custom17() -> Self {
        Self {
            size: PaperSize::Custom17,
            margins: BALLOT_CARD_SCAN_MARGINS,
            pixels_per_inch: SCAN_PIXELS_PER_INCH,
        }
    }

    pub const fn scanned_custom19() -> Self {
        Self {
            size: PaperSize::Custom19,
            margins: BALLOT_CARD_SCAN_MARGINS,
            pixels_per_inch: SCAN_PIXELS_PER_INCH,
        }
    }

    pub const fn scanned_custom22() -> Self {
        Self {
            size: PaperSize::Custom22,
            margins: BALLOT_CARD_SCAN_MARGINS,
            pixels_per_inch: SCAN_PIXELS_PER_INCH,
        }
    }

    /// Returns info for all supported scanned paper sizes.
    pub const fn scanned() -> [Self; 5] {
        [
            Self::scanned_letter(),
            Self::scanned_legal(),
            Self::scanned_custom17(),
            Self::scanned_custom19(),
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
    fn test_compute_geometry_custom_8_5_x_19() {
        assert_eq!(
            PaperInfo::scanned_custom19().compute_geometry().grid_size,
            Size {
                width: 34,
                height: 73
            },
        );
    }

    #[test]
    fn test_load_bubble_template() {
        load_ballot_scan_bubble_image().unwrap();
    }
}
