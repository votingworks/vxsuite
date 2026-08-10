use std::ops::RangeInclusive;

use image::RgbImage;
use itertools::Itertools;
use types_rs::{
    geometry::{PixelUnit, Point, Rect},
    pair::Pair,
};

use crate::{
    ballot_card::{BallotImage, Geometry},
    image_utils::{rainbow, Inset},
    timing_marks::{
        rect_could_be_timing_mark, shape_finding::shape_list_builder::ShapeListBuilder,
        util::median_filter, CandidateTimingMark, DefaultForGeometry,
    },
};

mod shape_list_builder;

/// Contains possible timing mark shapes found by searching a ballot image
/// within some inset.
pub struct BallotGridBorderShapes {
    pub left: Vec<TimingMarkShape>,
    pub right: Vec<TimingMarkShape>,
}

impl BallotGridBorderShapes {
    /// Searches the given ballot image within the given inset area for timing
    /// mark shapes. Searches each of the four sides independently, so the
    /// resulting shape lists will likely contain duplicates.
    #[must_use]
    pub fn from_ballot_image(
        ballot_image: &BallotImage,
        geometry: &Geometry,
        options: &Options,
    ) -> Self {
        let search_inset = options.search_inset;

        let image = ballot_image.image();
        let (width, height) = image.dimensions();

        let search_areas = Pair::new(
            Rect::new(0, 0, search_inset.left, height),
            Rect::new(
                width as i32 - search_inset.right as i32,
                0,
                search_inset.right,
                height,
            ),
        );

        let (left, right) = search_areas
            .par_map(|search_area| {
                find_timing_mark_shapes(ballot_image, geometry, search_area, options)
            })
            .into();

        Self { left, right }
    }

    pub fn debug_draw(&self, canvas: &mut RgbImage) {
        for (shape, color) in self.left.iter().chain(self.right.iter()).zip(rainbow()) {
            for point in shape.points() {
                canvas.get_pixel_mut(point.x, point.y).0 = color.0;
            }
        }
    }
}

/// Finds all shapes in an image that have roughly timing-mark size, shape, and
/// location in the given search area. Note that this does not try to filter
/// shapes based on their positions relative to each other.
///
/// See [`ShapeListBuilder::add_slice`] for details on how this works.
fn find_timing_mark_shapes(
    ballot_image: &BallotImage,
    geometry: &Geometry,
    search_area: Rect,
    options: &Options,
) -> Vec<TimingMarkShape> {
    let allowed_timing_mark_height_range = options.timing_mark_height_range(geometry);
    let allowed_white_gap_within_timing_mark = (geometry.timing_mark_height_pixels() / 3.0) as u32;

    let mut shape_list_builder = ShapeListBuilder::new(geometry.clone());
    let image_bounds = Rect::new(0, 0, ballot_image.width(), ballot_image.height());

    // Restrict `search_area` to within the image bounds.
    let Some(search_area) = search_area.intersect(&image_bounds) else {
        return vec![];
    };

    let x_start = search_area.left() as u32;
    let y_range = search_area.top() as u32..=search_area.bottom() as u32;
    let column_count = search_area.width() as usize;

    let raw = ballot_image.image().as_raw();
    let image_width = ballot_image.width() as usize;
    let luma_threshold = ballot_image.threshold();

    // The (start, last) y coordinates of the in-progress run of black pixels
    // in each column, relative to `x_start`.
    let mut column_runs: Vec<Option<(u32, u32)>> = vec![None; column_count];
    let mut slices: Vec<(u32, RangeInclusive<u32>)> = vec![];

    // A run of black pixels is a possible vertical slice of a timing mark if
    // it spans more than one pixel and is approximately the height of a
    // timing mark.
    let mut push_slice = |x: u32, start: u32, last: u32| {
        if last > start && allowed_timing_mark_height_range.contains(&(last - start)) {
            slices.push((x, start..=last));
        }
    };

    // Track the current run of black pixels in each column, merging runs that
    // have only a few pixels of white between them. This allows us to detect
    // timing marks that have a fold line through them (fold lines sometimes
    // expose the white paper underneath the black ink).
    for y in y_range {
        let row_start = y as usize * image_width + x_start as usize;
        let row = &raw[row_start..row_start + column_count];
        for (i, (&luma, run)) in row.iter().zip(column_runs.iter_mut()).enumerate() {
            if luma <= luma_threshold {
                match run {
                    Some((_, last)) if y - *last <= allowed_white_gap_within_timing_mark + 1 => {
                        *last = y;
                    }
                    Some((start, last)) => {
                        push_slice(x_start + i as u32, *start, *last);
                        *run = Some((y, y));
                    }
                    None => *run = Some((y, y)),
                }
            }
        }
    }

    for (i, run) in column_runs.into_iter().enumerate() {
        if let Some((start, last)) = run {
            push_slice(x_start + i as u32, start, last);
        }
    }

    // Add the slices in column-major order (matching the order a per-column
    // scan would produce) so the resulting shape list is identical.
    slices.sort_unstable_by_key(|(x, range)| (*x, *range.start()));
    for (x, range) in slices {
        shape_list_builder.add_slice(x, range);
    }

    // These values were chosen based on experimentation to merge timing mark
    // shapes that were split due to streaks. Because streaks are vertical, we
    // don't expect much vertical displacement between the split shapes, so we
    // use a small vertical tolerance and a horizontal tolerance as large as an
    // expected streak width.
    shape_list_builder.combine_adjacent_shapes(4, 2);

    shape_list_builder
        .into_iter()
        .filter_map(|shape| {
            // Smooth out peaks caused by stray marks or debris.
            let shape = shape.smoothed();
            let bounds = shape.bounds();

            // Filter out anything that is not vaguely timing mark size & shape.
            if !rect_could_be_timing_mark(geometry, &bounds) {
                return None;
            }

            // Filter out shapes at the corners of the image, as these are
            // unlikely to be real timing marks. If they are, they won't serve
            // as good reference points for bubble finding, so we'll want to
            // reject the ballot anyway.
            if (bounds.left() == image_bounds.left() && bounds.top() == image_bounds.top())
                || (bounds.left() == image_bounds.left()
                    && bounds.bottom() == image_bounds.bottom())
                || (bounds.right() == image_bounds.right() && bounds.top() == image_bounds.top())
                || (bounds.right() == image_bounds.right()
                    && bounds.bottom() == image_bounds.bottom())
            {
                return None;
            }

            Some(shape)
        })
        .collect()
}

/// The shape of a timing mark detected by scanning columns.
#[derive(Debug, Clone, PartialEq)]
pub struct TimingMarkShape {
    /// The leftmost x coordinate this timing mark shape contains.
    pub x: u32,

    /// The ranges of the y coordinates for each of the x coordinates this
    /// timing mark shape contains, from left to right starting at `self.x`.
    pub y_ranges: Vec<RangeInclusive<u32>>,
}

impl TimingMarkShape {
    /// Iterator for all the points this shape contains. They are all contiguous.
    pub fn points(&self) -> impl Iterator<Item = Point<PixelUnit>> + '_ {
        self.y_ranges
            .iter()
            .cloned()
            .zip(self.x..)
            .flat_map(|(y_range, x)| y_range.map(move |y| Point::new(x, y)))
    }

    /// The smallest bounding rectangle containing all the points in this shape.
    pub fn bounds(&self) -> Rect {
        let (Some(&min_y), Some(&max_y)) = (
            self.y_ranges.iter().map(RangeInclusive::start).min(),
            self.y_ranges.iter().map(RangeInclusive::end).max(),
        ) else {
            return Rect::zero();
        };

        let width = self.y_ranges.len() as u32;

        Rect::new(self.x as i32, min_y as i32, width, max_y - min_y + 1)
    }

    /// The leftmost x coordinate this timing mark shape contains.
    #[must_use]
    pub fn left(&self) -> u32 {
        self.x
    }

    /// The rightmost x coordinate this timing mark shape contains.
    #[must_use]
    pub fn right(&self) -> u32 {
        self.x + self.y_ranges.len() as u32 - 1
    }

    /// The median topmost y coordinate this timing mark shape contains.
    ///
    /// # Panics
    /// Panics if `self.y_ranges` is empty.
    pub fn median_top(&self) -> u32 {
        assert!(!self.y_ranges.is_empty(), "y_ranges must not be empty");
        let mut tops: Vec<u32> = self
            .y_ranges
            .iter()
            .map(RangeInclusive::start)
            .copied()
            .collect();
        tops.sort_unstable();
        tops[tops.len() / 2]
    }

    /// The median bottommost y coordinate this timing mark shape contains.
    ///
    /// # Panics
    /// Panics if `self.y_ranges` is empty.
    pub fn median_bottom(&self) -> u32 {
        assert!(!self.y_ranges.is_empty(), "y_ranges must not be empty");
        let mut bottoms: Vec<u32> = self
            .y_ranges
            .iter()
            .map(RangeInclusive::end)
            .copied()
            .collect();
        bottoms.sort_unstable();
        bottoms[bottoms.len() / 2]
    }

    /// The width of this timing mark shape in pixels.
    #[must_use]
    pub fn width(&self) -> u32 {
        self.right() - self.left() + 1
    }

    /// Builds a new `TimingMarkShape` with the same range of `x` values but
    /// with the `y` values smoothed using a median filter.
    ///
    /// See <https://en.wikipedia.org/wiki/Median_filter>
    #[must_use]
    pub fn smoothed(&self) -> Self {
        /// This window size was chosen to be wide enough to smooth out bumps
        /// of 3-4px wide, which is the maximum I saw that I wanted to be able
        /// to recover from in the TRR corpus.
        const WINDOW_SIZE: usize = 8;

        let top = median_filter(
            &self
                .y_ranges
                .iter()
                .map(RangeInclusive::start)
                .copied()
                .collect_vec(),
            WINDOW_SIZE,
        );
        let bottom = median_filter(
            &self
                .y_ranges
                .iter()
                .map(RangeInclusive::end)
                .copied()
                .collect_vec(),
            WINDOW_SIZE,
        );

        Self {
            x: self.x,
            y_ranges: top
                .into_iter()
                .zip(bottom)
                .map(|(y0, yn)| y0..=yn)
                .collect(),
        }
    }

    /// Converts this shape into a timing mark shape scored according to the
    /// given ballot image and geometry.
    pub fn to_candidate_timing_mark(
        &self,
        ballot_image: &BallotImage,
        geometry: &Geometry,
    ) -> CandidateTimingMark {
        CandidateTimingMark::scored(ballot_image, geometry, self.bounds())
    }
}

pub struct Options {
    /// Ratio range of a timing mark's expected height that we'll allow a
    /// possible vertical slice of a timing mark to be within.
    pub timing_mark_height_ratio_range: RangeInclusive<f32>,

    /// How far into the ballots should we look for shapes?
    pub search_inset: Inset,
}

impl Options {
    #[must_use]
    pub fn timing_mark_height_range(&self, geometry: &Geometry) -> RangeInclusive<PixelUnit> {
        (geometry.timing_mark_height_pixels() * self.timing_mark_height_ratio_range.start()).floor()
            as PixelUnit
            ..=(geometry.timing_mark_height_pixels() * self.timing_mark_height_ratio_range.end())
                .ceil() as PixelUnit
    }
}

impl DefaultForGeometry for Options {
    fn default_for_geometry(geometry: &Geometry) -> Self {
        Self {
            // Note that we later smooth out slice `y` values, so this is intentionally
            // wider than seems wise in order to capture some outliers.
            timing_mark_height_ratio_range: 0.6..=(1.0 + 2.0 / 3.0),

            // 1 inch on each side.
            search_inset: Inset {
                left: geometry.pixels_per_inch,
                right: geometry.pixels_per_inch,
                top: geometry.pixels_per_inch,
                bottom: geometry.pixels_per_inch,
            },
        }
    }
}
