use std::{cmp::Ordering, io, ops::Range, path::PathBuf};

use image::{imageops::rotate180_in_place, GenericImageView, GrayImage};
use imageproc::contrast::{otsu_level, threshold, threshold_mut};
use itertools::Itertools;
use rayon::iter::{IntoParallelRefIterator, ParallelIterator};
use serde::Serialize;

use crate::{
    debug::{self, ImageDebugWriter},
    image_utils::{bleed, detect_vertical_streaks, find_scanned_document_inset, Inset, BLACK},
    interpret::{
        BallotPageAndGeometry, Error, Result, TimingMarkAlgorithm, SIDE_A_LABEL, SIDE_B_LABEL,
    },
    layout::{build_option_layout, InterpretedContestLayout},
    qr_code::{self, Detected},
    scoring::{
        score_bubble_mark, score_write_in_area, ScoredBubbleMarks, ScoredPositionAreas,
        UnitIntervalScore, DEFAULT_MAXIMUM_SEARCH_DISTANCE,
    },
    timing_marks::{
        contours, corners, BallotPageMetadata, BorderAxis, DefaultForGeometry, TimingMarks,
    },
};

use types_rs::{
    ballot_card::{BallotSide, PaperSize},
    coding,
    election::{BallotStyleId, Election, GridLayout, GridPosition},
    geometry::{GridUnit, Inch, PixelPosition, PixelUnit, Rect, Size, SubGridUnit, SubPixelUnit},
    hmpb,
};

#[must_use]
pub struct BallotImage {
    image: GrayImage,
    threshold: u8,
    border_inset: Inset,
    debug: Option<ImageDebugWriter>,
}

impl BallotImage {
    /// This sets the ratio of pixels required to be white (above the threshold) in
    /// a given edge row or column to consider it no longer eligible to be cropped.
    /// This used to be 50%, but we found that too much of the top/bottom of the
    /// actual ballot content was being cropped, especially in the case of a skewed
    /// ballot. In such cases, one of the corners would sometimes be partially or
    /// completely cropped, leading to the ballot being rejected. We chose the new
    /// value by trial and error, in particular by seeing how much cropping occurred
    /// on ballots with significant but still acceptable skew (i.e. 3 degrees).
    const CROP_BORDERS_THRESHOLD_RATIO: f32 = 0.1;

    /// Crops the black edges off all sides of the image and determines an
    /// appropriate black & white threshold.
    pub fn from_image(image: GrayImage, debug_base: impl Into<Option<PathBuf>>) -> Option<Self> {
        let threshold = otsu_level(&image);
        let border_inset =
            find_scanned_document_inset(&image, threshold, Self::CROP_BORDERS_THRESHOLD_RATIO)?;
        let debug_base = debug_base.into();

        if border_inset.is_zero() {
            // Don't bother cropping if there's no inset.
            let debug =
                debug_base.map(|debug_base| ImageDebugWriter::new(debug_base, image.clone()));
            return Some(Self {
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

        let debug = debug_base.map(|debug_base| ImageDebugWriter::new(debug_base, image.clone()));
        Some(Self {
            image,
            threshold,
            border_inset,
            debug,
        })
    }

    /// Create a new `BallotImage` with a threshold that doesn't exceed the given maximum.
    pub fn with_maximum_threshold(self, maximum_threshold: u8) -> Self {
        Self {
            threshold: self.threshold.min(maximum_threshold),
            ..self
        }
    }

    #[must_use]
    pub fn dimensions(&self) -> (PixelUnit, PixelUnit) {
        self.image.dimensions()
    }

    #[must_use]
    pub fn width(&self) -> PixelUnit {
        self.image.width()
    }

    #[must_use]
    pub fn height(&self) -> PixelUnit {
        self.image.height()
    }

    #[must_use]
    pub fn threshold(&self) -> u8 {
        self.threshold
    }

    #[must_use]
    pub fn debug(&self) -> Option<&ImageDebugWriter> {
        self.debug.as_ref()
    }

    #[must_use]
    pub fn get_pixel(&self, x: u32, y: u32) -> BallotPixel {
        // Use <= instead of < to handle the case where OTSU threshold is 0
        // (which happens with already-binarized images). With threshold=0,
        // we need to include pixels with value 0 (black) as foreground.
        if self.image.get_pixel(x, y).0[0] <= self.threshold {
            BallotPixel::Foreground
        } else {
            BallotPixel::Background
        }
    }

    #[must_use]
    pub fn image(&self) -> &GrayImage {
        &self.image
    }

    fn rotate180(&mut self) {
        rotate180_in_place(&mut self.image);
        if let Some(debug) = &mut self.debug {
            debug.rotate180();
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum BallotPixel {
    /// A white pixel.
    Background,

    /// A black pixel.
    Foreground,
}

impl BallotPixel {
    /// Check if this pixel is a foreground (black) pixel.
    ///
    /// # Examples
    ///
    /// ```
    /// use ballot_interpreter::ballot_card::BallotPixel;
    ///
    /// assert!(BallotPixel::Foreground.is_foreground());
    /// assert!(!BallotPixel::Background.is_foreground());
    /// ```
    #[must_use]
    pub fn is_foreground(self) -> bool {
        matches!(self, Self::Foreground)
    }

    /// Check if this pixel is a background (white) pixel.
    ///
    /// # Examples
    ///
    /// ```
    /// use ballot_interpreter::ballot_card::BallotPixel;
    ///
    /// assert!(BallotPixel::Background.is_background());
    /// assert!(!BallotPixel::Foreground.is_background());
    /// ```
    #[must_use]
    pub fn is_background(self) -> bool {
        matches!(self, Self::Background)
    }
}

pub struct BallotPage {
    ballot_image: BallotImage,
    geometry: Geometry,
}

impl BallotPage {
    /// Prepare a ballot page image for interpretation by cropping the black
    /// border.
    ///
    /// # Errors
    ///
    /// Returns an error if the image cannot be cropped or if the paper
    /// information cannot be determined.
    #[allow(clippy::result_large_err)]
    pub fn from_image(
        image: GrayImage,
        label: impl Into<String>,
        possible_paper_infos: &[PaperInfo],
        debug_base: impl Into<Option<PathBuf>>,
    ) -> Result<Self> {
        let Some(ballot_image) = BallotImage::from_image(image, debug_base) else {
            return Err(Error::BorderInsetNotFound {
                label: label.into(),
            });
        };

        let Some(paper_info) =
            get_matching_paper_info_for_image_size(ballot_image.dimensions(), possible_paper_infos)
        else {
            let (width, height) = ballot_image.dimensions();
            return Err(Error::UnexpectedDimensions {
                label: label.into(),
                dimensions: Size { width, height },
            });
        };

        Ok(BallotPage {
            ballot_image,
            geometry: paper_info.compute_geometry(),
        })
    }

    /// Get the geometry information for this ballot page.
    pub fn geometry(&self) -> &Geometry {
        &self.geometry
    }

    #[must_use]
    pub fn border_inset(&self) -> Inset {
        self.ballot_image.border_inset
    }

    /// Get the ballot image for this page.
    pub fn ballot_image(&self) -> &BallotImage {
        &self.ballot_image
    }

    #[must_use]
    pub fn debug(&self) -> Option<&ImageDebugWriter> {
        self.ballot_image.debug()
    }

    /// Find timing marks on this ballot page using the specified algorithm.
    ///
    /// # Errors
    ///
    /// Returns an error if timing marks cannot be found or if the timing mark
    /// detection algorithm fails.
    pub fn find_timing_marks(
        &self,
        timing_mark_algorithm: TimingMarkAlgorithm,
    ) -> Result<TimingMarks> {
        let geometry = self.geometry();
        match timing_mark_algorithm {
            TimingMarkAlgorithm::Contours { inference } => contours::find_timing_mark_grid(
                self,
                &contours::FindTimingMarkGridOptions {
                    allowed_timing_mark_inset_percentage_of_width:
                        contours::ALLOWED_TIMING_MARK_INSET_PERCENTAGE_OF_WIDTH,
                    inference,
                },
            ),
            TimingMarkAlgorithm::Corners => corners::find_timing_mark_grid(
                self,
                &corners::Options::default_for_geometry(geometry),
            ),
        }
    }

    #[must_use]
    pub fn width(&self) -> PixelUnit {
        self.ballot_image.width()
    }

    #[must_use]
    pub fn height(&self) -> PixelUnit {
        self.ballot_image.height()
    }

    /// Rotate this ballot page 180 degrees.
    pub fn rotate180(&mut self) {
        self.ballot_image.rotate180();
    }
}

pub struct BallotCard {
    page_a: BallotPage,
    page_b: BallotPage,
}

impl BallotCard {
    /// Get the geometry information for this ballot card (same for both pages).
    pub fn geometry(&self) -> &Geometry {
        &self.page_a.geometry
    }

    #[must_use]
    pub fn page_a(&self) -> &BallotPage {
        &self.page_a
    }

    #[must_use]
    pub fn page_b(&self) -> &BallotPage {
        &self.page_b
    }

    #[must_use]
    pub fn as_pair(&self) -> Pair<&BallotPage> {
        (&self.page_a, &self.page_b).into()
    }

    /// Get mutable references to both pages as a `Pair`.
    pub fn as_pair_mut(&mut self) -> Pair<&mut BallotPage> {
        (&mut self.page_a, &mut self.page_b).into()
    }

    #[must_use]
    pub fn into_pair(self) -> Pair<BallotPage> {
        (self.page_a, self.page_b).into()
    }

    #[must_use]
    pub fn as_labeled_pair(&self) -> Pair<(&'static str, &BallotPage)> {
        ((SIDE_A_LABEL, &self.page_a), (SIDE_B_LABEL, &self.page_b)).into()
    }

    /// Find timing marks on both pages of this ballot card using the specified algorithm.
    ///
    /// # Errors
    ///
    /// Returns an error if timing marks cannot be found on either page or if the timing mark
    /// detection algorithm fails.
    pub fn find_timing_marks(
        &self,
        timing_mark_algorithm: TimingMarkAlgorithm,
    ) -> Result<Pair<TimingMarks>> {
        self.as_pair()
            .par_map(|page| page.find_timing_marks(timing_mark_algorithm))
            .into_result()
    }

    #[must_use]
    pub fn detect_qr_codes(&self) -> Pair<Result<Detected>> {
        self.as_labeled_pair().map(|(label, page)| {
            qr_code::detect(page.ballot_image()).map_err(|err| Error::InvalidQrCodeMetadata {
                label: label.to_owned(),
                message: err.to_string(),
            })
        })
    }

    /// Decode QR codes from both pages of this ballot card.
    ///
    /// # Errors
    ///
    /// Returns an error if QR codes cannot be detected or decoded on either page,
    /// or if the decoded metadata is invalid.
    pub fn decode_qr_codes(
        &self,
        election: &Election,
    ) -> Result<Pair<(hmpb::Metadata, Orientation)>> {
        Ok(self
            .detect_qr_codes()
            .zip((SIDE_A_LABEL, SIDE_B_LABEL))
            .map(|(result, label)| {
                let qr_code = result?;
                Ok((
                    coding::decode_with::<hmpb::Metadata>(qr_code.bytes(), election).map_err(
                        |e| Error::InvalidQrCodeMetadata {
                            label: label.to_owned(),
                            message: format!(
                                "Unable to decode QR code bytes: {e} (bytes={bytes:?})",
                                bytes = qr_code.bytes()
                            ),
                        },
                    )?,
                    qr_code.orientation(),
                ))
            })
            .join(|result_a, result_b| {
                // If one side has a detected QR code and the other doesn't, we can
                // infer the missing metadata from the detected metadata.
                match (result_a, result_b) {
                    // Both QR codes were read.
                    (Ok(a), Ok(b)) => Ok((a, b)),

                    // Only side B was read.
                    (Err(Error::InvalidQrCodeMetadata { .. }), Ok((metadata_b, orientation_b))) => {
                        let metadata_a = hmpb::infer_missing_page_metadata(&metadata_b);
                        Ok(((metadata_a, orientation_b), (metadata_b, orientation_b)))
                    }

                    // Only side A was read.
                    (Ok((metadata_a, orientation_a)), Err(Error::InvalidQrCodeMetadata { .. })) => {
                        let metadata_b = hmpb::infer_missing_page_metadata(&metadata_a);
                        Ok(((metadata_a, orientation_a), (metadata_b, orientation_a)))
                    }

                    // Neither side could be read.
                    (Err(e), _) | (_, Err(e)) => Err(e),
                }
            })?
            .into())
    }

    /// Detect vertical streaks on both pages of this ballot card.
    ///
    /// # Errors
    ///
    /// Returns an error if vertical streaks are detected on either page.
    pub fn detect_vertical_streaks(&self) -> Result<()> {
        self.as_labeled_pair()
            .par_map(|(label, page)| {
                let streaks = detect_vertical_streaks(page.ballot_image(), page.debug());
                if streaks.is_empty() {
                    Ok(())
                } else {
                    Err(Error::VerticalStreaksDetected {
                        label: (*label).to_string(),
                        x_coordinates: streaks,
                    })
                }
            })
            .into_result()?;
        Ok(())
    }

    pub fn enforce_minimum_scale<'a>(
        &'_ self,
        minimum_scale: UnitIntervalScore,
        timing_marks: impl Into<Pair<&'a TimingMarks>>,
    ) -> Result<()> {
        self.as_labeled_pair()
            .zip(timing_marks)
            .map(|((label, _), timing_marks)| {
                // We use the horizontal axis here because it is perpendicular to
                // the scan direction and therefore stretching should be minimal.
                //
                // See https://votingworks.slack.com/archives/CEL6D3GAD/p1750095447642289 for more context.
                match timing_marks.compute_scale_based_on_axis(BorderAxis::Horizontal) {
                    Some(scale) if scale < minimum_scale => Err(Error::InvalidScale {
                        label: label.to_owned(),
                        scale,
                    }),
                    _ => Ok(()),
                }
            })
            .into_result()?;
        Ok(())
    }
}

pub struct ProcessedBubbleBallotCard {
    front_page: BallotPage,
    back_page: BallotPage,
    front_timing_marks: TimingMarks,
    back_timing_marks: TimingMarks,
    front_metadata: hmpb::Metadata,
    back_metadata: hmpb::Metadata,
    grid_layout: GridLayout,
}

impl ProcessedBubbleBallotCard {
    /// Create a new `ProcessedBubbleBallotCard` from ballot pages, timing marks, and metadata.
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - The precinct IDs don't match between pages
    /// - The ballot style IDs don't match between pages
    /// - The page numbers are not consecutive
    /// - The grid layout is missing from the election
    pub fn new(
        election: &Election,
        pages: impl Into<(BallotPage, BallotPage)>,
        timing_marks: impl Into<(TimingMarks, TimingMarks)>,
        metadatas: impl Into<(hmpb::Metadata, hmpb::Metadata)>,
    ) -> Result<Self> {
        let (page_a, page_b) = pages.into();
        let (timing_marks_a, timing_marks_b) = timing_marks.into();
        let (metadata_a, metadata_b) = metadatas.into();

        if metadata_a.precinct_id != metadata_b.precinct_id {
            return Err(Error::MismatchedPrecincts {
                side_a: metadata_a.precinct_id,
                side_b: metadata_b.precinct_id,
            });
        }
        if metadata_a.ballot_style_id != metadata_b.ballot_style_id {
            return Err(Error::MismatchedBallotStyles {
                side_a: metadata_a.ballot_style_id,
                side_b: metadata_b.ballot_style_id,
            });
        }
        if metadata_a.page_number.opposite() != metadata_b.page_number {
            return Err(Error::NonConsecutivePageNumbers {
                side_a: metadata_a.page_number.get(),
                side_b: metadata_b.page_number.get(),
            });
        }

        let (
            front_page,
            back_page,
            front_timing_marks,
            back_timing_marks,
            front_metadata,
            back_metadata,
        ) = if metadata_a.page_number.is_front() {
            // A = front, B = back
            (
                page_a,
                page_b,
                timing_marks_a,
                timing_marks_b,
                metadata_a,
                metadata_b,
            )
        } else {
            // A = back, B = front
            (
                page_b,
                page_a,
                timing_marks_b,
                timing_marks_a,
                metadata_b,
                metadata_a,
            )
        };

        let grid_layout = match election.grid_layouts {
            Some(ref layouts) => match layouts
                .iter()
                .find(|layout| layout.ballot_style_id == front_metadata.ballot_style_id)
            {
                Some(grid_layout) => grid_layout.clone(),

                None => {
                    return Err(Error::MissingGridLayout {
                        front: BallotPageMetadata::QrCode(front_metadata),
                        back: BallotPageMetadata::QrCode(back_metadata),
                    })
                }
            },

            None => {
                return Err(Error::InvalidElection {
                    message: "required field `gridLayouts` is missing".to_owned(),
                })
            }
        };

        Ok(Self {
            front_page,
            back_page,
            front_timing_marks,
            back_timing_marks,
            front_metadata,
            back_metadata,
            grid_layout: grid_layout.clone(),
        })
    }

    #[must_use]
    pub fn front_page(&self) -> &BallotPage {
        &self.front_page
    }

    #[must_use]
    pub fn back_page(&self) -> &BallotPage {
        &self.back_page
    }

    #[must_use]
    pub fn front_metadata(&self) -> &hmpb::Metadata {
        &self.front_metadata
    }

    #[must_use]
    pub fn back_metadata(&self) -> &hmpb::Metadata {
        &self.back_metadata
    }

    /// Get the ballot style ID for this ballot card.
    pub fn ballot_style_id(&self) -> &BallotStyleId {
        &self.front_metadata.ballot_style_id
    }

    #[must_use]
    pub fn grid_layout(&self) -> &GridLayout {
        &self.grid_layout
    }

    #[must_use]
    pub fn sheet_number(&self) -> u32 {
        u32::from(self.front_metadata.page_number.sheet_number().get())
    }

    /// Score bubble marks on both pages of this ballot card.
    ///
    /// # Errors
    ///
    /// Returns an error if bubble scoring fails or if there are issues with the grid layout.
    pub fn score_bubbles(&self, bubble_template: &GrayImage) -> Result<Pair<ScoredBubbleMarks>> {
        let grid_layout = self.grid_layout();
        let sheet_number = self.sheet_number();

        Pair::new(
            (
                &self.front_page,
                &self.front_timing_marks,
                BallotSide::Front,
            ),
            (&self.back_page, &self.back_timing_marks, BallotSide::Back),
        )
        .map(|(page, timing_marks, side)| {
            let scored_bubbles = grid_layout
                .grid_positions
                .par_iter()
                .flat_map(|grid_position| {
                    let location = grid_position.location();

                    if !(grid_position.sheet_number() == sheet_number && location.side == side) {
                        return vec![];
                    }

                    timing_marks
                        .point_for_location(
                            location.column as SubGridUnit,
                            location.row as SubGridUnit,
                        )
                        .map_or_else(
                            || vec![(grid_position.clone(), None)],
                            |expected_bubble_center| {
                                vec![(
                                    grid_position.clone(),
                                    score_bubble_mark(
                                        page.ballot_image(),
                                        bubble_template,
                                        expected_bubble_center,
                                        &location,
                                        DEFAULT_MAXIMUM_SEARCH_DISTANCE,
                                    ),
                                )]
                            },
                        )
                })
                .collect::<ScoredBubbleMarks>();

            if let Some(debug) = page.debug() {
                debug.write("scored_bubble_marks", |canvas| {
                    debug::draw_scored_bubble_marks_debug_image_mut(canvas, &scored_bubbles);
                });
            }

            Ok(scored_bubbles)
        })
        .into_result()
    }

    /// Layout contests for both pages of this ballot card.
    ///
    /// # Errors
    ///
    /// Returns an error if contest layouts cannot be computed or if there are issues
    /// with the grid layout or timing marks.
    ///
    /// # Panics
    ///
    /// Panics if a contest has no options, which should not happen with valid ballot data.
    pub fn layout_contests(&self) -> Result<Pair<Vec<InterpretedContestLayout>>> {
        let grid_layout = self.grid_layout();
        let sheet_number = self.sheet_number();

        Pair::new(
            (
                &self.front_page,
                &self.front_timing_marks,
                BallotSide::Front,
            ),
            (&self.back_page, &self.back_timing_marks, BallotSide::Back),
        )
        .map(|(page, timing_marks, side)| {
            let contest_ids_in_grid_layout_order = grid_layout
                .grid_positions
                .iter()
                .filter(|grid_position| {
                    grid_position.sheet_number() == sheet_number
                        && grid_position.location().side == side
                })
                .map(GridPosition::contest_id)
                .unique()
                .collect::<Vec<_>>();

            let layouts = contest_ids_in_grid_layout_order
                .iter()
                .map(|contest_id| {
                    let grid_positions = grid_layout
                        .grid_positions
                        .iter()
                        .filter(|grid_position| grid_position.contest_id() == *contest_id)
                        .collect::<Vec<_>>();

                    let options = grid_positions
                        .iter()
                        .map(|grid_position| {
                            build_option_layout(timing_marks, grid_layout, grid_position)
                                .ok_or(Error::CouldNotComputeLayout { side })
                        })
                        .collect::<Result<Vec<_>>>()?;

                    // Use the union of the option bounds as an approximation of the contest bounds
                    let bounds = options
                        .iter()
                        .map(|option| option.bounds)
                        .reduce(|a, b| a.union(&b))
                        .expect("Contest must have options");

                    Ok(InterpretedContestLayout {
                        contest_id: contest_id.clone(),
                        bounds,
                        options,
                    })
                })
                .collect::<Result<Vec<_>>>()?;

            if let Some(debug) = page.debug() {
                debug.write("contest_layouts", |canvas| {
                    debug::draw_contest_layouts_debug_image_mut(canvas, &layouts);
                });
            }

            Ok(layouts)
        })
        .into_result()
    }

    /// Computes scores for all the write-in areas in a scanned ballot image. This could
    /// be used to determine which write-in areas are most likely to contain a write-in
    /// vote even if the bubble is not filled in.
    #[must_use]
    pub fn score_write_in_areas(&self) -> Pair<ScoredPositionAreas> {
        let grid_layout = self.grid_layout();
        let sheet_number = self.sheet_number();

        Pair::new(
            (
                &self.front_page,
                &self.front_timing_marks,
                BallotSide::Front,
            ),
            (&self.back_page, &self.back_timing_marks, BallotSide::Back),
        )
        .map(|(page, timing_marks, side)| {
            let scored_write_in_areas = grid_layout
                .write_in_positions()
                .filter(|grid_position| {
                    let location = grid_position.location();
                    grid_position.sheet_number() == sheet_number && location.side == side
                })
                .filter_map(|grid_position| {
                    score_write_in_area(page.ballot_image(), timing_marks, grid_position)
                })
                .collect();

            if let Some(debug) = page.debug() {
                debug.write("scored_write_in_areas", |canvas| {
                    debug::draw_scored_write_in_areas(canvas, &scored_write_in_areas);
                });
            }

            scored_write_in_areas
        })
    }

    #[must_use]
    pub fn into_parts(self) -> Pair<ProcessedBubbleBallotPageParts> {
        Pair::new(
            (
                self.front_page,
                self.front_timing_marks,
                self.front_metadata,
            ),
            (self.back_page, self.back_timing_marks, self.back_metadata),
        )
        .map(|(mut page, timing_marks, metadata)| {
            threshold_mut(&mut page.ballot_image.image, page.ballot_image.threshold);
            ProcessedBubbleBallotPageParts {
                image: page.ballot_image.image,
                timing_marks,
                metadata,
            }
        })
    }
}

pub struct ProcessedBubbleBallotPageParts {
    pub image: GrayImage,
    pub timing_marks: TimingMarks,
    pub metadata: hmpb::Metadata,
}

pub struct Pair<T> {
    first: T,
    second: T,
}

impl<T> Pair<T> {
    /// Create a new `Pair` with the given first and second elements.
    ///
    /// # Examples
    ///
    /// ```
    /// use ballot_interpreter::ballot_card::Pair;
    ///
    /// let pair = Pair::new(42, 99);
    /// assert_eq!(pair.first(), &42);
    /// assert_eq!(pair.second(), &99);
    /// ```
    pub const fn new(first: T, second: T) -> Self {
        Self { first, second }
    }

    /// Get a reference to the first element.
    ///
    /// # Examples
    ///
    /// ```
    /// use ballot_interpreter::ballot_card::Pair;
    ///
    /// let pair = Pair::new(1, 2);
    /// assert_eq!(pair.first(), &1);
    /// ```
    pub const fn first(&self) -> &T {
        &self.first
    }

    /// Get a reference to the second element.
    ///
    /// # Examples
    ///
    /// ```
    /// use ballot_interpreter::ballot_card::Pair;
    ///
    /// let pair = Pair::new(1, 2);
    /// assert_eq!(pair.second(), &2);
    /// ```
    pub const fn second(&self) -> &T {
        &self.second
    }

    /// Transform both elements of the pair using the given mapper function.
    ///
    /// # Examples
    ///
    /// ```
    /// use ballot_interpreter::ballot_card::Pair;
    ///
    /// let pair = Pair::new(1, 2);
    /// let doubled = pair.map(|x| x * 2);
    /// assert_eq!(doubled.first(), &2);
    /// assert_eq!(doubled.second(), &4);
    /// ```
    pub fn map<U>(self, mapper: impl Fn(T) -> U) -> Pair<U> {
        Pair::new(mapper(self.first), mapper(self.second))
    }

    /// Combine this pair with another pair, creating pairs of tuples.
    ///
    /// # Examples
    ///
    /// ```
    /// use ballot_interpreter::ballot_card::Pair;
    ///
    /// let numbers = Pair::new(1, 2);
    /// let letters = Pair::new('a', 'b');
    /// let combined = numbers.zip(letters);
    /// assert_eq!(combined.first(), &(1, 'a'));
    /// assert_eq!(combined.second(), &(2, 'b'));
    /// ```
    pub fn zip<U>(self, other: impl Into<Pair<U>>) -> Pair<(T, U)> {
        let other = other.into();
        Pair::new((self.first, other.first), (self.second, other.second))
    }

    /// Combine both elements of the pair using the given joiner function.
    ///
    /// # Examples
    ///
    /// ```
    /// use ballot_interpreter::ballot_card::Pair;
    ///
    /// let pair = Pair::new(3, 5);
    /// let sum = pair.join(|a, b| a + b);
    /// assert_eq!(sum, 8);
    ///
    /// let pair = Pair::new("hello", "world");
    /// let combined = pair.join(|a, b| format!("{} {}", a, b));
    /// assert_eq!(combined, "hello world");
    /// ```
    pub fn join<U>(self, joiner: impl Fn(T, T) -> U) -> U {
        joiner(self.first, self.second)
    }
}

impl<T> Pair<T>
where
    T: Send + Sync,
{
    /// Transform both elements of the pair in parallel using the given mapper function.
    pub fn par_map<U, F>(self, mapper: F) -> Pair<U>
    where
        U: Send,
        F: (Fn(T) -> U) + Send + Sync,
    {
        let (first, second) = self.into();
        rayon::join(|| mapper(first), || mapper(second)).into()
    }
}

impl<T> From<(T, T)> for Pair<T> {
    fn from(value: (T, T)) -> Self {
        Pair::new(value.0, value.1)
    }
}

impl<T> From<Pair<T>> for (T, T) {
    fn from(value: Pair<T>) -> Self {
        (value.first, value.second)
    }
}

impl<'a, T> From<&'a Pair<T>> for Pair<&'a T> {
    fn from(value: &'a Pair<T>) -> Self {
        (&value.first, &value.second).into()
    }
}

impl<'a, T> From<&'a mut Pair<T>> for Pair<&'a mut T> {
    fn from(value: &'a mut Pair<T>) -> Self {
        (&mut value.first, &mut value.second).into()
    }
}

impl<T, E> Pair<Result<T, E>> {
    /// Convert a `Pair<Result<T, E>>` into a `Result<Pair<T>, E>`.
    ///
    /// # Errors
    ///
    /// Returns an error if either of the pair's results is an error.
    pub fn into_result(self: Pair<Result<T, E>>) -> Result<Pair<T>, E> {
        let (first, second) = self.into();
        Ok(Pair::new(first?, second?))
    }
}

impl<T> Default for Pair<T>
where
    T: Default,
{
    fn default() -> Self {
        (T::default(), T::default()).into()
    }
}

pub struct RawBallotCard {
    image_a: GrayImage,
    image_b: GrayImage,
}

impl RawBallotCard {
    #[must_use]
    pub fn new(side_a: GrayImage, side_b: GrayImage) -> Self {
        Self {
            image_a: side_a,
            image_b: side_b,
        }
    }

    /// Prepare images from both sides of a ballot card.
    ///
    /// # Errors
    ///
    /// Returns an error if the images could not be loaded or if the ballot card
    /// could not be prepared.
    #[allow(clippy::result_large_err)]
    pub fn into_ballot_card(
        self,
        possible_paper_infos: &[PaperInfo],
        debug_bases: impl Into<Pair<Option<PathBuf>>>,
    ) -> Result<BallotCard> {
        let (page_a, page_b) = Pair::new(self.image_a, self.image_b)
            .zip((SIDE_A_LABEL, SIDE_B_LABEL))
            .zip(debug_bases)
            .par_map(|((image, label), debug_base)| {
                BallotPage::from_image(image, label, possible_paper_infos, debug_base)
            })
            .into_result()?
            .into();

        if page_a.geometry != page_b.geometry {
            return Err(Error::MismatchedBallotCardGeometries {
                side_a: BallotPageAndGeometry {
                    label: SIDE_A_LABEL.to_string(),
                    border_inset: page_a.border_inset(),
                    geometry: page_a.geometry,
                },
                side_b: BallotPageAndGeometry {
                    label: SIDE_B_LABEL.to_string(),
                    border_inset: page_b.border_inset(),
                    geometry: page_b.geometry,
                },
            });
        }

        Ok(BallotCard { page_a, page_b })
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

    /// Compute the geometry information for this paper configuration.
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
