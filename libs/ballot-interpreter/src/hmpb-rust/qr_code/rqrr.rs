use image::GrayImage;
use rqrr::PreparedImage;
use types_rs::geometry::{PixelUnit, Point, Rect};

use super::detect::{get_detection_areas, Detected, DetectionArea, Detector, Error, Result};

/// Uses the `rqrr` QR code library to detect a QR code in the given ballot
/// image. Crops the image to improve performance.
pub fn detect(img: &GrayImage) -> Result {
    let detection_areas = get_detection_areas(img);
    let detection_area_rects = detection_areas.iter().map(DetectionArea::bounds).collect();
    for area in detection_areas {
        let mut prepared_img = PreparedImage::prepare(area.image().clone());
        if let Some(grid) = prepared_img.detect_grids().first() {
            let mut bytes = Vec::new();
            return match grid.decode_to(&mut bytes) {
                Ok(_) => Ok(Detected::new(
                    Detector::Rqrr,
                    detection_area_rects,
                    bytes,
                    get_original_bounds_rqrr(area.origin(), grid),
                    area.orientation(),
                )),
                Err(e) => Err(Error::DecodeFailed {
                    detection_areas: detection_area_rects,
                    message: e.to_string(),
                }),
            };
        }
    }

    Err(Error::NoQrCodeDetected {
        detection_areas: detection_area_rects,
    })
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
