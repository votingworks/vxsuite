use std::{
    ops::RangeInclusive,
    path::{Path, PathBuf},
    time::Instant,
};

use ab_glyph::PxScale;
use ballot_interpreter::{
    ballot_card::{get_matching_paper_info_for_image_size, BallotImage, Geometry, PaperInfo},
    debug::{monospace_font, ImageDebugWriter},
    image_utils::{rainbow, Inset},
    timing_marks::{
        fast, rect_could_be_timing_mark, BestFitSearchResult, Border, CandidateTimingMark,
    },
};
use clap::Parser;
use color_eyre::owo_colors::OwoColorize;
use image::GrayImage;
use imageproc::{
    contrast::otsu_level,
    drawing::{draw_filled_rect_mut, draw_text_mut},
    rect::Rect,
};
use itertools::Itertools;
use types_rs::geometry::{PixelUnit, Point};

#[derive(Debug, Parser)]
struct Options {
    image_paths: Vec<PathBuf>,
}

struct TimingMarkShape {
    x: u32,
    y_ranges: Vec<RangeInclusive<u32>>,
}

impl TimingMarkShape {
    fn points(&self) -> impl Iterator<Item = Point<PixelUnit>> + '_ {
        self.y_ranges
            .iter()
            .cloned()
            .zip(self.x..)
            .flat_map(|(y_range, x)| y_range.map(move |y| Point::new(x, y)))
    }

    fn bounds(&self) -> types_rs::geometry::Rect {
        if self.y_ranges.is_empty() {
            return types_rs::geometry::Rect::zero();
        }

        let mut min_y = u32::MAX;
        let mut max_y = 0;
        for range in &self.y_ranges {
            if *range.start() < min_y {
                min_y = *range.start();
            }
            if *range.end() > max_y {
                max_y = *range.end();
            }
        }
        let width = self.y_ranges.len() as u32;
        types_rs::geometry::Rect::new(
            self.x as i32,
            min_y as i32,
            width as u32,
            (max_y - min_y + 1) as u32,
        )
    }
}

struct TimingMarkShapeListBuilder {
    shapes: Vec<TimingMarkShape>,
}

impl TimingMarkShapeListBuilder {
    fn new() -> Self {
        Self { shapes: vec![] }
    }

    fn add_range(&mut self, x: u32, y_range: RangeInclusive<u32>) {
        if let Some(shape) = self.shapes.iter_mut().find(|shape| {
            shape.x == x + 1
                && shape
                    .y_ranges
                    .first()
                    .map_or(false, |r| ranges_overlap(r, &y_range))
        }) {
            shape.y_ranges.insert(0, y_range);
        } else if let Some(shape) = self.shapes.iter_mut().find(|shape| {
            shape.x + shape.y_ranges.len() as u32 == x
                && shape
                    .y_ranges
                    .last()
                    .map_or(false, |r| ranges_overlap(r, &y_range))
        }) {
            shape.y_ranges.push(y_range);
        } else {
            self.shapes.push(TimingMarkShape {
                x,
                y_ranges: vec![y_range],
            });
        }
    }

    fn into_shapes(self) -> Vec<TimingMarkShape> {
        self.shapes
    }
}

fn ranges_overlap(a: &RangeInclusive<u32>, b: &RangeInclusive<u32>) -> bool {
    a.start() <= b.end() && b.start() <= a.end()
}

fn search_for_vertical_timing_mark_candidates(
    image: &GrayImage,
    threshold: u8,
    geometry: &Geometry,
    x_range: impl Iterator<Item = u32>,
) -> Vec<TimingMarkShape> {
    let allowed_timing_mark_height_range = (geometry.timing_mark_size.height * 0.6).floor() as u32
        ..=(geometry.timing_mark_size.height / 0.6).ceil() as u32;
    let mut candidate_list_builder = TimingMarkShapeListBuilder::new();
    let image_rect = Rect::at(0, 0).of_size(image.width(), image.height());

    for x in x_range {
        (0..image.height())
            .group_by(|&y| image.get_pixel(x, y)[0] <= threshold)
            .into_iter()
            .filter_map(|(is_black, group)| {
                if !is_black {
                    return None;
                }

                if let [first, .., last] = group.collect_vec().as_slice() {
                    if allowed_timing_mark_height_range.contains(&last.abs_diff(*first)) {
                        return Some((*first)..=(*last));
                    }
                }

                None
            })
            .for_each(|range| {
                candidate_list_builder.add_range(x, range);
            });
    }

    candidate_list_builder
        .into_shapes()
        .into_iter()
        .filter(|shape| {
            let rect = shape.bounds();
            rect_could_be_timing_mark(geometry, &rect)
                // filter out shapes at the corners of the image
                && !((rect.left() == image_rect.left() && rect.top() == image_rect.top())
                    || (rect.left() == image_rect.left() && rect.bottom() == image_rect.bottom())
                    || (rect.right() == image_rect.right() && rect.top() == image_rect.top())
                    || (rect.right() == image_rect.right() && rect.bottom() == image_rect.bottom()))
        })
        .collect_vec()
}

fn process_image_path(image_path: &Path) -> color_eyre::Result<bool> {
    print!("{image_path}", image_path = image_path.display());
    let image = image::open(&image_path)?.to_luma8();
    let debug = ImageDebugWriter::new(image_path.to_path_buf(), image.clone());
    let start = Instant::now();
    let threshold = otsu_level(&image);
    print!(", otsu: {:?}", start.elapsed());

    const PPI: u32 = 200;
    const BORDER: u32 = 2 * PPI / 2;

    let geometry =
        get_matching_paper_info_for_image_size(image.dimensions(), &PaperInfo::scanned())
            .unwrap()
            .compute_geometry();

    let start = Instant::now();
    let left_shapes =
        search_for_vertical_timing_mark_candidates(&image, threshold, &geometry, 0..BORDER);
    print!(", scan left: {:?}", start.elapsed());

    let start = Instant::now();
    let right_shapes = search_for_vertical_timing_mark_candidates(
        &image,
        threshold,
        &geometry,
        image.width() - BORDER..image.width(),
    );
    print!(", scan right: {:?}", start.elapsed());

    let ballot_image = BallotImage {
        image: image.clone(),
        border_inset: Inset {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        },
        threshold,
    };

    debug.write("timing_mark_shapes", |canvas| {
        for (shape, color) in left_shapes.iter().chain(right_shapes.iter()).zip(rainbow()) {
            for point in shape.points() {
                canvas.get_pixel_mut(point.x, point.y).0 = color.0;
            }
        }
    });

    let start = Instant::now();
    let left_candidate_marks = left_shapes
        .iter()
        .map(|shape| {
            CandidateTimingMark::scored(
                Some(Border::Left),
                &ballot_image,
                &geometry,
                shape.bounds(),
            )
        })
        .collect_vec();
    let left_timing_marks = fast::find_left_timing_marks(&geometry, &left_candidate_marks, &debug);

    print!(", left best fit: {:?}", start.elapsed());

    let start = Instant::now();
    let right_candidate_marks = right_shapes
        .iter()
        .map(|shape| {
            CandidateTimingMark::scored(
                Some(Border::Right),
                &ballot_image,
                &geometry,
                shape.bounds(),
            )
        })
        .collect_vec();
    let right_timing_marks =
        fast::find_right_timing_marks(&geometry, &right_candidate_marks, &debug);
    print!(", right best fit: {:?}", start.elapsed());

    let success = matches!(left_timing_marks, BestFitSearchResult::Found { .. })
        && matches!(right_timing_marks, BestFitSearchResult::Found { .. });

    debug.write("candidate_marks", |canvas| {
        for (mark, color) in left_candidate_marks
            .iter()
            .chain(right_candidate_marks.iter())
            .zip(rainbow())
        {
            let rect = mark.rect();
            draw_filled_rect_mut(
                canvas,
                Rect::at(rect.left(), rect.top()).of_size(rect.width(), rect.height()),
                color,
            );

            let scale = PxScale::from(20.0);
            let font = monospace_font();
            draw_text_mut(
                canvas,
                color,
                rect.right(),
                rect.top(),
                scale,
                &font,
                &format!("{:?}", mark.scores()),
            );
        }
    });

    println!("{}", if success { " - OK" } else { " - NOT OK" });

    Ok(success)
}

pub fn main() -> color_eyre::Result<()> {
    let options = Options::parse();
    let mut success_count = 0;
    let mut error_count = 0;
    let total_count = options.image_paths.len();

    for image_path in options.image_paths {
        match process_image_path(&image_path) {
            Err(e) => {
                error_count += 1;
                eprintln!("Error processing image {image_path:?}: {e}");
            }
            Ok(success) => {
                if success {
                    success_count += 1;
                }
            }
        }
    }

    println!(
        "Success: {} ({:.02}%), Failure: {} ({:.02}%), Error: {} ({:.02}%), Total: {}",
        success_count.green(),
        100.0 * (success_count as f32) / (total_count as f32),
        (total_count - success_count).yellow(),
        100.0 * ((total_count - success_count) as f32) / (total_count as f32),
        error_count.red(),
        100.0 * (error_count as f32) / (total_count as f32),
        total_count.bold()
    );

    Ok(())
}
