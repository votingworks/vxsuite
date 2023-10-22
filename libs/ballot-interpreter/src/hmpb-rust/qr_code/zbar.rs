use image::{EncodableLayout, GrayImage};
use zbar_rust::{ZBarImageScanResult, ZBarImageScanner, ZBarSymbolType};

use crate::geometry::{PixelUnit, Point, Rect};

use super::detect::{get_detection_areas, DetectedQrCode, Error, Result};

/// Uses the `zbar` QR code library to detect a QR code in the given ballot
/// image. Crops the image to improve performance.
pub fn detect(img: &GrayImage) -> Result {
    for area in get_detection_areas(img) {
        match scan_image_for_qr_codes(area.image()) {
            Ok(qr_codes) => {
                for qr_code in qr_codes {
                    if qr_code.symbol_type == ZBarSymbolType::ZBarQRCode {
                        let bounds = get_original_bounds(area.origin(), &qr_code);
                        return Ok(DetectedQrCode::new(
                            qr_code.data,
                            bounds,
                            area.orientation(),
                        ));
                    }
                }
            }
            Err(e) => return Err(Error::DetectFailed(e.to_string())),
        }
    }

    Err(Error::NoQrCodeDetected)
}

/// Configures a `zbar` scanner to only look for QR codes and returns the
/// results of the scan.
fn scan_image_for_qr_codes(
    image: &GrayImage,
) -> std::result::Result<Vec<ZBarImageScanResult>, &'static str> {
    let mut scanner = ZBarImageScanner::new();
    scanner.set_config(
        ZBarSymbolType::ZBarNone,
        zbar_rust::ZBarConfig::ZBarCfgEnable,
        0,
    )?;
    scanner.set_config(
        ZBarSymbolType::ZBarQRCode,
        zbar_rust::ZBarConfig::ZBarCfgEnable,
        1,
    )?;
    scanner.scan_y800(image.as_bytes(), image.width(), image.height())
}

fn get_original_bounds(origin: Point<PixelUnit>, qr_code: &ZBarImageScanResult) -> Rect {
    let mut min_x = qr_code.points.first().map_or(0, |(x, _)| *x);
    let mut min_y = qr_code.points.first().map_or(0, |(_, y)| *y);
    let mut max_x = min_x;
    let mut max_y = min_y;

    for (x, y) in &qr_code.points {
        min_x = min_x.min(*x);
        min_y = min_y.min(*y);
        max_x = max_x.max(*x);
        max_y = max_y.max(*y);
    }
    Rect::new(
        origin.x as i32 + min_x,
        origin.y as i32 + min_y,
        (max_x - min_x + 1) as u32,
        (max_y - min_y + 1) as u32,
    )
}
