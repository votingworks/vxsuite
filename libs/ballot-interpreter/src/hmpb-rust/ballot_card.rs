use std::{cmp::Ordering, io};

use image::GrayImage;
use logging_timer::time;
use types_rs::geometry::PixelUnit;

pub use types_rs::ballot_card::*;

use crate::interpret::ResizeStrategy;

pub fn get_matching_paper_info_for_image_size(
    size: (PixelUnit, PixelUnit),
    possible_paper_info: &[PaperInfo],
    resize_strategy: ResizeStrategy,
) -> Option<PaperInfo> {
    const THRESHOLD: f32 = 0.05;
    possible_paper_info
        .iter()
        .map(|paper_info| {
            let geometry = paper_info.compute_geometry();
            (
                paper_info,
                resize_strategy.compute_error(
                    (geometry.canvas_size.width, geometry.canvas_size.height),
                    size,
                ),
            )
        })
        .min_by(|(_, error1), (_, error2)| error1.partial_cmp(error2).unwrap_or(Ordering::Equal))
        .filter(|(_, error)| *error < THRESHOLD)
        .map(|(paper_info, _)| *paper_info)
}

#[time]
pub fn load_ballot_scan_bubble_image() -> Option<GrayImage> {
    let bubble_image_bytes = include_bytes!("../../data/bubble_scan.png");
    let inner = io::Cursor::new(bubble_image_bytes);
    image::load(inner, image::ImageFormat::Png)
        .ok()
        .map(|image| image.to_luma8())
}

#[time]
pub fn load_ballot_template_bubble_image() -> Option<GrayImage> {
    let bubble_image_bytes = include_bytes!("../../data/bubble_template.png");
    let inner = io::Cursor::new(bubble_image_bytes);
    image::load(inner, image::ImageFormat::Png)
        .ok()
        .map(|image| image.to_luma8())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_scanned_ballot_card_geometry() {
        assert_eq!(
            get_matching_paper_info_for_image_size(
                (1696, 2200),
                &PaperInfo::scanned(),
                ResizeStrategy::Fit
            ),
            Some(PaperInfo::scanned_letter())
        );
        assert_eq!(
            get_matching_paper_info_for_image_size(
                (1696, 2800),
                &PaperInfo::scanned(),
                ResizeStrategy::Fit
            ),
            Some(PaperInfo::scanned_legal())
        );
        assert_eq!(
            get_matching_paper_info_for_image_size(
                (1500, 1500),
                &PaperInfo::scanned(),
                ResizeStrategy::Fit
            ),
            None
        );
    }

    #[test]
    fn test_load_bubble_template() {
        assert!(load_ballot_scan_bubble_image().is_some());
        assert!(load_ballot_template_bubble_image().is_some());
    }
}
