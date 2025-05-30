use std::path::PathBuf;

use image::{GenericImageView, GrayImage};
use rayon::prelude::{IntoParallelRefIterator, ParallelIterator};
use types_rs::geometry::Rect;

use crate::{
    ballot_card::{load_ballot_scan_bubble_image, BallotImage},
    debug::{draw_diagnostic_cells, ImageDebugWriter},
    image_utils::{count_pixels, BLACK},
    interpret::crop_ballot_page_image_borders,
};

const FAIL_SCORE: f32 = 0.05;
const CROP_BORDER_PIXELS: u32 = 20;

/// The threshold computed by `otsu_level` might be unreasonbly high if the
/// scanned image is mostly very white. This can lead to  identifying cells as
/// overly dark that are actually just a slightly darker white/gray. Setting
/// a high but not too high maximum white threshold should prevent this from
/// happening.
const MAX_WHITE_THRESHOLD: u8 = 200;

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
        let match_score = count_pixels(&cropped_and_thresholded, BLACK).ratio();
        match_score > FAIL_SCORE
    });

    (passed_cells, failed_cells)
}

pub fn blank_paper(img: GrayImage, debug_path: Option<PathBuf>) -> bool {
    let bubble_img = load_ballot_scan_bubble_image().expect("loaded bubble image");
    let cell_width = bubble_img.width();
    let cell_height = bubble_img.height();

    let starting_offsets: [(u32, u32); 4] = [
        (CROP_BORDER_PIXELS, CROP_BORDER_PIXELS),
        (CROP_BORDER_PIXELS + cell_width / 2, CROP_BORDER_PIXELS),
        (CROP_BORDER_PIXELS, CROP_BORDER_PIXELS + cell_height / 2),
        (
            CROP_BORDER_PIXELS + cell_width / 2,
            CROP_BORDER_PIXELS + cell_height / 2,
        ),
    ];
    let Some(BallotImage {
        image, threshold, ..
    }) = crop_ballot_page_image_borders(img)
    else {
        return false;
    };

    let cells = starting_offsets
        .into_iter()
        .flat_map(|(left_start, top_start)| {
            generate_cells(
                left_start,
                top_start,
                image.width() - CROP_BORDER_PIXELS,
                image.height() - CROP_BORDER_PIXELS,
                cell_width,
                cell_height,
            )
        })
        .collect::<Vec<_>>();

    let (passed_cells, failed_cells) =
        inspect_cells(&image, &cells, threshold.min(MAX_WHITE_THRESHOLD));

    let debug = debug_path.map_or_else(ImageDebugWriter::disabled, |base| {
        ImageDebugWriter::new(base, image)
    });
    debug.write("diagnostic", |canvas| {
        draw_diagnostic_cells(canvas, &passed_cells, &failed_cells);
    });

    failed_cells.is_empty()
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test {
    use super::*;
    use image::DynamicImage;
    use std::fs::read_dir;

    macro_rules! fixture_test {
        ($test_name:ident, $path:expr, $expected:expr) => {
            #[test]
            fn $test_name() {
                let paths = read_dir($path).unwrap();
                for path in paths {
                    let path = path.unwrap().path();
                    let img = image::open(&path)
                        .ok()
                        .map(DynamicImage::into_luma8)
                        .unwrap();
                    assert_eq!(blank_paper(img, None), $expected, "image path: {path:?}");
                }
            }
        };
    }

    fixture_test!(
        test_blank_20lb_white_passes,
        "./test/fixtures/diagnostic/blank/20lb",
        true
    );

    fixture_test!(
        test_blank_40lb_white_passes,
        "./test/fixtures/diagnostic/blank/40lb",
        true
    );

    fixture_test!(
        test_blank_manilla_passes,
        "./test/fixtures/diagnostic/blank/manilla",
        true
    );

    fixture_test!(
        test_streaked_paper_fails,
        "./test/fixtures/diagnostic/streaked",
        false
    );

    #[test]
    fn test_non_blank_paper_fails() {
        let img = image::open("./test/fixtures/all-bubble-ballot/blank-front.jpg")
            .ok()
            .map(DynamicImage::into_luma8)
            .unwrap();
        assert!(!blank_paper(img, None));
    }
}
