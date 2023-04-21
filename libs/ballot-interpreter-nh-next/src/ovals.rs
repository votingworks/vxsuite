use image::{GenericImageView, GrayImage};

use crate::election::GridLocation;
use crate::geometry::SubPixelUnit;
use crate::grid::generate_layout_for_all_grid_positions;
use crate::scoring::OvalMarkScore;
use crate::timing_marks::TimingMarkGrid;

/// Finds ovals matching `target_oval_image` in `ballot_image` at the locations
/// specified by `grid`. Only ovals that match at least `oval_match_threshold`
/// will be returned.
///
/// This function may be useful in automatically generating an election
/// definition from a sample ballot image. The threshold is configurable because
/// the difference between an oval and a blank space in a ballot image may be
/// subtle.
pub fn find_target_ovals_in_ballot_image(
    ballot_image: &GrayImage,
    target_oval_image: &GrayImage,
    grid: &TimingMarkGrid,
    oval_match_threshold: OvalMarkScore,
) -> Vec<GridLocation> {
    let grid_layout = generate_layout_for_all_grid_positions(grid);
    let max_error_pixels = 2;

    grid_layout
        .grid_positions
        .iter()
        .filter_map(|position| {
            let location = position.location();
            let center = grid.point_for_location(location.column, location.row)?;
            let left =
                (center.x - (target_oval_image.width() as SubPixelUnit / 2.0)).round() as u32;
            let top =
                (center.y - (target_oval_image.height() as SubPixelUnit / 2.0)).round() as u32;

            for x in (left - max_error_pixels)..(left + max_error_pixels) {
                for y in (top - max_error_pixels)..(top + max_error_pixels) {
                    let sub_image = ballot_image.view(
                        x,
                        y,
                        target_oval_image.width(),
                        target_oval_image.height(),
                    );
                    let match_score = OvalMarkScore::from(
                        sub_image
                            .pixels()
                            .zip(target_oval_image.pixels())
                            .map(|((_, _, a), b)| {
                                let a = a[0];
                                let b = b[0];
                                (u8::MAX - a.abs_diff(b)) as u32
                            })
                            .sum::<u32>() as f32
                            / (u8::MAX as u32
                                * target_oval_image.width()
                                * target_oval_image.height()) as f32,
                    );
                    if match_score >= oval_match_threshold {
                        return Some(location);
                    }
                }
            }

            None
        })
        .collect()
}
