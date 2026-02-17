use image::{EncodableLayout, GrayImage};
use types_rs::geometry::{PixelUnit, Point, Rect};
use zedbar::{config, DecoderConfig, Image, Scanner, SymbolType};

use super::detect::{get_detection_areas, Detected, DetectionArea, Detector, Error, Result};

/// Uses the `zedbar` QR code library to detect a QR code in the given ballot
/// image. Crops the image to improve performance.
pub fn detect(img: &GrayImage) -> Result {
    let detection_areas = get_detection_areas(img);
    let detection_area_rects = detection_areas.iter().map(DetectionArea::bounds).collect();
    for area in detection_areas {
        match scan_image_for_qr_codes(area.image()) {
            Ok(qr_codes) => {
                if let Some((data, bounds)) = qr_codes.into_iter().next() {
                    let bounds = offset_bounds(area.origin(), &bounds);
                    return Ok(Detected::new(
                        Detector::Zedbar,
                        detection_area_rects,
                        data,
                        bounds,
                        area.orientation(),
                    ));
                }
            }
            Err(e) => {
                return Err(Error::DetectFailed {
                    detection_areas: detection_area_rects,
                    message: e.to_string(),
                })
            }
        }
    }

    Err(Error::NoQrCodeDetected {
        detection_areas: detection_area_rects,
    })
}

/// Configures a `zedbar` scanner to only look for QR codes and returns the
/// results of the scan.
fn scan_image_for_qr_codes(
    image: &GrayImage,
) -> std::result::Result<Vec<(Vec<u8>, Rect)>, zedbar::Error> {
    let config = DecoderConfig::new().enable(config::QrCode);
    let mut scanner = Scanner::with_config(config);
    let mut img = Image::from_gray(image.as_bytes(), image.width(), image.height())?;
    let symbols = scanner.scan(&mut img);
    Ok(symbols
        .into_iter()
        .filter(|s| s.symbol_type() == SymbolType::QrCode)
        .map(|s| {
            let bounds = Rect::new(0, 0, image.width(), image.height());
            (s.data().to_vec(), bounds)
        })
        .collect())
}

fn offset_bounds(origin: Point<PixelUnit>, bounds: &Rect) -> Rect {
    Rect::new(
        origin.x as i32 + bounds.left(),
        origin.y as i32 + bounds.top(),
        bounds.width(),
        bounds.height(),
    )
}
