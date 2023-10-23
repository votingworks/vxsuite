use image::GrayImage;
use rqrr::PreparedImage;

use crate::geometry::{PixelUnit, Point, Rect};

use super::detect::{get_detection_areas, DetectedQrCode, Error, Result};

/// Uses the `rqrr` QR code library to detect a QR code in the given ballot
/// image. Crops the image to improve performance.
pub fn detect(img: &GrayImage) -> Result {
    for area in get_detection_areas(img) {
        let mut prepared_img = PreparedImage::prepare(area.image().clone());
        if let Some(grid) = prepared_img.detect_grids().first() {
            let mut bytes = Vec::new();
            grid.decode_to(&mut bytes)
                .map_err(|e| Error::DecodeFailed(e.to_string()))?;
            return Ok(DetectedQrCode::new(
                bytes,
                get_original_bounds_rqrr(area.origin(), grid),
                area.orientation(),
            ));
        }
    }

    Err(Error::NoQrCodeDetected)
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
