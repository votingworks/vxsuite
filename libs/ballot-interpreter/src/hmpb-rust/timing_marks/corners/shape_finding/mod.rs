use std::ops::RangeInclusive;

use image::RgbImage;
use itertools::Itertools;
use types_rs::geometry::{PixelUnit, Point, Rect};

use crate::{
    ballot_card::{BallotImage, Geometry},
    image_utils::{rainbow, Inset},
    impl_edgewise,
    timing_marks::{
        corners::{shape_finding::shape_list_builder::ShapeListBuilder, util::EdgeWise},
        rect_could_be_timing_mark, CandidateTimingMark, DefaultForGeometry,
    },
};

mod shape_list_builder;

/// Contains possible timing mark shapes found by searching a ballot image
/// within some inset.
pub struct BallotGridBorderShapes {
    left: Vec<TimingMarkShape>,
    right: Vec<TimingMarkShape>,
    top: Vec<TimingMarkShape>,
    bottom: Vec<TimingMarkShape>,
}

impl_edgewise!(BallotGridBorderShapes, Vec<TimingMarkShape>);

impl BallotGridBorderShapes {
    /// Searches the given ballot image within the given inset area for timing
    /// mark shapes. Searches each of the four sides independently, so the
    /// resulting shape lists will likely contain duplicates.
    pub fn from_ballot_image(
        ballot_image: &BallotImage,
        geometry: &Geometry,
        options: &Options,
    ) -> Self {
        let search_inset = options.search_inset;

        let image = ballot_image.image();
        let (width, height) = image.dimensions();

        let search_areas = [
            Rect::new(0, 0, search_inset.left, height),
            Rect::new(
                width as i32 - search_inset.right as i32,
                0,
                search_inset.right,
                height,
            ),
            Rect::new(0, 0, width, search_inset.top),
            Rect::new(
                0,
                height as i32 - search_inset.bottom as i32,
                width,
                search_inset.bottom,
            ),
        ];

        search_areas.par_map_edgewise(|search_area| {
            find_timing_mark_shapes(ballot_image, geometry, search_area, options)
        })
    }

    pub fn debug_draw(&self, canvas: &mut RgbImage) {
        for (shape, color) in self
            .left
            .iter()
            .chain(self.right.iter())
            .chain(self.top.iter())
            .chain(self.bottom.iter())
            .zip(rainbow())
        {
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
    let mut shape_list_builder = ShapeListBuilder::new();
    let image_bounds = Rect::new(0, 0, ballot_image.width(), ballot_image.height());

    // Restrict `search_area` to within the image bounds.
    let Some(search_area) = search_area.intersect(&image_bounds) else {
        return vec![];
    };

    let x_range = search_area.left() as u32..=search_area.right() as u32;
    let y_range = search_area.top() as u32..=search_area.bottom() as u32;

    for x in x_range {
        for range in y_range
            .clone()
            .group_by(|&y| ballot_image.get_pixel(x, y).is_foreground())
            .into_iter()
            .filter(|(is_black, _)| *is_black)
            .filter_map(|(_, group)| {
                let group = group.collect_vec();

                let [first, .., last] = group.as_slice() else {
                    return None;
                };

                if !allowed_timing_mark_height_range.contains(&last.abs_diff(*first)) {
                    return None;
                }

                Some((*first)..=(*last))
            })
        {
            shape_list_builder.add_slice(x, range);
        }
    }

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

    /// Builds a new `TimingMarkShape` with the same range of `x` values but
    /// with the `y` values smoothed using a median filter.
    ///
    /// See <https://en.wikipedia.org/wiki/Median_filter>
    pub fn smoothed(&self) -> Self {
        /// This window size was chosen to be wide enough to smooth out bumps
        /// of 3-4px wide, which is the maximum I saw that I wanted to be able
        /// to recover from in the TRR corpus.
        const WINDOW_SIZE: usize = 8;

        fn median_filter(values: &[u32]) -> Vec<u32> {
            let half = WINDOW_SIZE / 2;
            (0..values.len())
                .map(|i| {
                    let start = i.saturating_sub(half);
                    let end = (i + half + 1).min(values.len());
                    let mut window = values[start..end].to_vec();
                    window.sort_unstable();
                    window[window.len() / 2]
                })
                .collect()
        }

        let top = median_filter(
            &self
                .y_ranges
                .iter()
                .map(RangeInclusive::start)
                .copied()
                .collect_vec(),
        );
        let bottom = median_filter(
            &self
                .y_ranges
                .iter()
                .map(RangeInclusive::end)
                .copied()
                .collect_vec(),
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
