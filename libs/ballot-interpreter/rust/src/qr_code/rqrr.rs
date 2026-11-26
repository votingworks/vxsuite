use rqrr::PreparedImage;
use types_rs::geometry::{PixelUnit, Point, Rect};

use super::detect::DetectionArea;

/// Decodes every QR code grid in the detection area, with bounds in the
/// coordinates of the source image.
pub fn scan_area(area: &DetectionArea<'_>) -> Vec<Result<(Vec<u8>, Rect), String>> {
    let mut prepared_img = PreparedImage::prepare(area.image().clone());
    prepared_img
        .detect_grids()
        .iter()
        .map(|grid| {
            let mut bytes = Vec::new();
            grid.decode_to(&mut bytes)
                .map(|_| (bytes, get_original_bounds_rqrr(area.origin(), grid)))
                .map_err(|e| e.to_string())
        })
        .collect()
}

const fn get_original_bounds_rqrr<G>(origin: Point<PixelUnit>, qr_code: &rqrr::Grid<G>) -> Rect {
    let [top_left, top_right, _bottom_right, bottom_left] = qr_code.bounds;
    Rect::new(
        origin.x as i32 + top_left.x,
        origin.y as i32 + top_left.y,
        (top_right.x - top_left.x) as u32,
        (bottom_left.y - top_left.y) as u32,
    )
}
