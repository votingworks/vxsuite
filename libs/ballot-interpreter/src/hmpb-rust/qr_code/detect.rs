use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{DynamicImage, GenericImageView, GrayImage};
use serde::Serialize;
use types_rs::geometry::{PixelUnit, Point, Rect, Size};

use crate::{
    ballot_card::Orientation,
    debug::{self, ImageDebugWriter},
};

use super::{rqrr, zbar};

/// An area in a ballot image to be searched for QR codes.
pub struct DetectionArea {
    origin: Point<PixelUnit>,
    orientation: Orientation,
    image: GrayImage,
}

impl DetectionArea {
    /// Crops the given image at the specified point and size. Records that this
    /// detection area represents a particular orientation.
    #[must_use]
    pub fn with_crop(
        img: &GrayImage,
        origin: Point<PixelUnit>,
        size: Size<PixelUnit>,
        orientation: Orientation,
    ) -> Self {
        let cropped_img = DynamicImage::from(
            img.view(origin.x, origin.y, size.width, size.height)
                .to_image(),
        )
        .into_luma8();
        Self {
            origin,
            image: cropped_img,
            orientation,
        }
    }

    pub const fn origin(&self) -> Point<PixelUnit> {
        self.origin
    }

    pub fn bounds(&self) -> Rect {
        Rect::new(
            self.origin.x as i32,
            self.origin.y as i32,
            self.image.width(),
            self.image.height(),
        )
    }

    pub const fn orientation(&self) -> Orientation {
        self.orientation
    }

    pub const fn image(&self) -> &GrayImage {
        &self.image
    }
}

/// Gets the areas of the image to try to detect QR codes. Currently assumes
/// that the QR codes are in the top-right or bottom-left corners.
pub fn get_detection_areas(img: &GrayImage) -> Vec<DetectionArea> {
    let (width, height) = img.dimensions();
    let crop_size = Size {
        width: width / 4,
        // Yes, the detection area height is based on the ballot width.
        // We don't want to search more of the image in a taller ballot
        // because the QR code is anchored to the bottom anyway.
        height: width / 4,
    };
    let bottom_left_origin = Point::new(0, height - crop_size.height);
    let top_right_origin = Point::new(width - crop_size.width, 0);

    vec![
        DetectionArea::with_crop(img, bottom_left_origin, crop_size, Orientation::Portrait),
        DetectionArea::with_crop(
            img,
            top_right_origin,
            crop_size,
            Orientation::PortraitReversed,
        ),
    ]
}

#[derive(Debug, Clone, Copy)]
pub enum Detector {
    Rqrr,
    Zbar,
}

/// Information about a QR code found in an image.
#[derive(Debug, Clone)]
pub struct DetectedQrCode {
    detector: Detector,
    detection_areas: Vec<Rect>,
    bytes: Vec<u8>,
    bounds: Rect,
    orientation: Orientation,
}

impl DetectedQrCode {
    pub const fn new(
        detector: Detector,
        detection_areas: Vec<Rect>,
        bytes: Vec<u8>,
        bounds: Rect,
        orientation: Orientation,
    ) -> Self {
        Self {
            detector,
            detection_areas,
            bytes,
            bounds,
            orientation,
        }
    }

    /// The detector that was used to find the QR code.
    pub const fn detector(&self) -> Detector {
        self.detector
    }

    /// Gets the data decoded from the detected QR code.
    pub fn bytes(&self) -> &Vec<u8> {
        self.bytes.as_ref()
    }

    /// Gets the bounding box of the detected QR code.
    pub const fn bounds(&self) -> Rect {
        self.bounds
    }

    /// The orientation of the ballot as determined by the QR code position.
    pub const fn orientation(&self) -> Orientation {
        self.orientation
    }

    /// The areas of the image that were searched for QR codes.
    pub fn detection_areas(&self) -> &[Rect] {
        &self.detection_areas
    }
}

#[derive(Debug, Clone, Serialize, thiserror::Error)]
pub enum Error {
    #[error("failed to decode QR code: {message}")]
    DecodeFailed {
        detection_areas: Vec<Rect>,
        message: String,
    },
    #[error("failed to detect QR code: {message}")]
    DetectFailed {
        detection_areas: Vec<Rect>,
        message: String,
    },
    #[error("no QR code detected")]
    NoQrCodeDetected { detection_areas: Vec<Rect> },
}

impl Error {
    fn detection_areas(&self) -> &[Rect] {
        match self {
            Self::DecodeFailed {
                detection_areas, ..
            } => detection_areas,
            Self::DetectFailed {
                detection_areas, ..
            } => detection_areas,
            Self::NoQrCodeDetected { detection_areas } => detection_areas,
        }
    }
}

pub type Result = std::result::Result<DetectedQrCode, Error>;

/// Detect a QR code in the given ballot image. The QR code is assumed to be in either
/// the top-right or bottom-left corner and will be cropped to limit the amount of the
/// image that must be searched in order to improve performance.
///
/// If the data read from the QR code can be read as base64, then the decoded data will
/// be returned instead of the original base64 data.
pub fn detect(img: &GrayImage, debug: &ImageDebugWriter) -> Result {
    let rqrr_result = rqrr::detect(img);
    let detect_result = rqrr_result.or_else(|_| zbar::detect(img));
    let detection_areas = match detect_result {
        Ok(ref qr_code) => qr_code.detection_areas().to_vec(),
        Err(ref e) => e.detection_areas().to_vec(),
    };

    debug.write("qr_code", |canvas| {
        debug::draw_qr_code_debug_image_mut(canvas, detect_result.as_ref().ok(), &detection_areas);
    });

    detect_result.map(|qr_code| {
        // attempt to base64 decode the data
        let bytes = STANDARD
            .decode(qr_code.bytes())
            .unwrap_or_else(|_| qr_code.bytes().clone());
        DetectedQrCode::new(
            qr_code.detector(),
            qr_code.detection_areas().to_vec(),
            bytes,
            qr_code.bounds(),
            qr_code.orientation(),
        )
    })
}

#[cfg(test)]
mod test {
    use std::path::PathBuf;
    use types_rs::geometry::Rect;

    use crate::ballot_card::Orientation;

    use super::*;

    #[test]
    fn test_detect_qr_code() {
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test/fixtures");
        let scan_side_a_path = fixture_path.join("all-bubble-side-a.jpeg");
        let scan_side_a = image::open(scan_side_a_path).unwrap().into_luma8();
        let qr_code = detect(&scan_side_a, &ImageDebugWriter::disabled()).unwrap();
        assert_eq!(
            qr_code.bytes().to_vec(),
            vec![
                0x56, 0x50, 0x02, 0x80, 0xb5, 0x64, 0x55, 0xf9, 0x61, 0x95, 0x22, 0x39, 0xeb, 0x01,
                0x01, 0x02, 0x03, 0x00
            ]
        );
        assert_eq!(qr_code.bounds(), Rect::new(97, 2016, 108, 107));
        assert_eq!(qr_code.orientation(), Orientation::Portrait);
    }

    #[test]
    fn test_detect_qr_code_in_skewed_image() {
        let fixture_path =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test/fixtures/alameda-test");
        let scan_side_a_path = fixture_path.join("scan-skewed-side-a.jpeg");
        let scan_side_b_path = fixture_path.join("scan-skewed-side-b.jpeg");
        detect(
            &image::open(scan_side_a_path).unwrap().into_luma8(),
            &ImageDebugWriter::disabled(),
        )
        .expect("side A QR code should be detected");
        detect(
            &image::open(scan_side_b_path).unwrap().into_luma8(),
            &ImageDebugWriter::disabled(),
        )
        .expect("side B QR code should be detected");
    }
}
