use std::path::PathBuf;

use image::{GenericImageView, GrayImage};
use imageproc::contrast::otsu_level;
use logging_timer::time;
use rayon::prelude::{IntoParallelRefIterator, ParallelIterator};
use types_rs::geometry::Rect;

use crate::{
    ballot_card::load_ballot_scan_bubble_image,
    debug::{draw_diagnostic_cells, ImageDebugWriter},
    image_utils::{ratio, BLACK},
};

const FAIL_SCORE: f32 = 0.05;
const CROP_BORDER_PIXELS: u32 = 20;

fn generate_cells(
    left_start: u32,
    top_start: u32,
    left_end: u32,
    top_end: u32,
    cell_width: u32,
    cell_height: u32,
) -> Vec<Rect> {
    let mut cells: Vec<Rect> = Vec::new();
    let mut cell_left = left_start;
    while cell_left + cell_width <= left_end {
        let mut cell_top = top_start;
        while cell_top + cell_height <= top_end {
            let rect = Rect::new(cell_left as i32, cell_top as i32, cell_width, cell_height);
            cells.push(rect);

            cell_top += cell_height;

            // for the last cell, we need to make sure we don't go past the edge of the image
            if cell_top < top_end && cell_top + cell_height > top_end {
                cell_top = top_end - cell_height;
            }
        }

        cell_left += cell_width;

        // for the last cell, we need to make sure we don't go past the edge of the image
        if cell_left < left_end && cell_left + cell_width > left_end {
            cell_left = left_end - cell_width;
        }
    }

    cells
}

fn inspect_cells(
    img: &GrayImage,
    cells: &[Rect],
    foreground_threshold: u8,
) -> (Vec<Rect>, Vec<Rect>) {
    let (failed_cells, passed_cells) = cells.par_iter().partition(|cell| {
        let cropped = img
            .view(
                cell.left() as u32,
                cell.top() as u32,
                cell.width(),
                cell.height(),
            )
            .to_image();
        let cropped_and_thresholded =
            imageproc::contrast::threshold(&cropped, foreground_threshold);
        let match_score = ratio(&cropped_and_thresholded, BLACK);
        match_score > FAIL_SCORE
    });

    (passed_cells, failed_cells)
}

#[time]
pub fn run_blank_paper_diagnostic(img: GrayImage, debug_path: Option<PathBuf>) -> bool {
    let debug = debug_path.map_or_else(ImageDebugWriter::disabled, |base| {
        ImageDebugWriter::new(base, img.clone())
    });

    let bubble_img = load_ballot_scan_bubble_image().expect("loaded bubble image");
    let cell_width = bubble_img.width();
    let cell_height = bubble_img.height();
    let foreground_threshold = otsu_level(&bubble_img);

    let starting_offsets: [(u32, u32); 4] = [
        (CROP_BORDER_PIXELS, CROP_BORDER_PIXELS),
        (CROP_BORDER_PIXELS + cell_width / 2, CROP_BORDER_PIXELS),
        (CROP_BORDER_PIXELS, CROP_BORDER_PIXELS + cell_height / 2),
        (
            CROP_BORDER_PIXELS + cell_width / 2,
            CROP_BORDER_PIXELS + cell_height / 2,
        ),
    ];

    let mut cells: Vec<Rect> = Vec::new();
    for (left_start, top_start) in &starting_offsets {
        cells.append(&mut generate_cells(
            *left_start,
            *top_start,
            img.width() - CROP_BORDER_PIXELS,
            img.height() - CROP_BORDER_PIXELS,
            cell_width,
            cell_height,
        ));
    }

    let (passed_cells, failed_cells) = inspect_cells(&img, &cells, foreground_threshold);

    debug.write("diagnostic", |canvas| {
        draw_diagnostic_cells(canvas, passed_cells.as_slice(), failed_cells.as_slice());
    });

    failed_cells.is_empty()
}

#[cfg(test)]
mod test {
    use super::*;
    use image::DynamicImage;
    use std::fs::read_dir;

    #[test]
    fn test_blank_20lb_white_passes() {
        let paths = read_dir("./test/fixtures/diagnostic/blank/20lb").unwrap();
        for path in paths {
            let img = image::open(path.unwrap().path())
                .ok()
                .map(DynamicImage::into_luma8)
                .unwrap();
            assert_eq!(run_blank_paper_diagnostic(img, None), true);
        }
    }

    #[test]
    fn test_blank_40lb_white_passes() {
        let paths = read_dir("./test/fixtures/diagnostic/blank/40lb").unwrap();
        for path in paths {
            let img = image::open(path.unwrap().path())
                .ok()
                .map(DynamicImage::into_luma8)
                .unwrap();
            assert_eq!(run_blank_paper_diagnostic(img, None), true);
        }
    }

    #[test]
    fn test_blank_manilla_passes() {
        let paths = read_dir("./test/fixtures/diagnostic/blank/manilla").unwrap();
        for path in paths {
            let img = image::open(path.unwrap().path())
                .ok()
                .map(DynamicImage::into_luma8)
                .unwrap();
            assert_eq!(run_blank_paper_diagnostic(img, None), true);
        }
    }

    #[test]
    fn test_streaked_paper_fails() {
        let paths = read_dir("./test/fixtures/diagnostic/streaked").unwrap();
        for path_result in paths {
            let path = path_result.unwrap().path();
            dbg!(&path);
            let img = image::open(path)
                .ok()
                .map(DynamicImage::into_luma8)
                .unwrap();
            assert_eq!(run_blank_paper_diagnostic(img, None), false);
        }
    }

    #[test]
    fn test_non_blank_paper_fails() {
        let img = image::open("./test/fixtures/all-bubble-side-a.jpeg")
            .ok()
            .map(DynamicImage::into_luma8)
            .unwrap();
        assert_eq!(run_blank_paper_diagnostic(img, None), false);
    }
}
