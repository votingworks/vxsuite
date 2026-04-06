use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{DynamicImage, GenericImageView, GrayImage};
use serde::Serialize;
use types_rs::{
    bmd, bubble_ballot,
    geometry::{PixelUnit, Point, Rect, Size},
};

use crate::{
    ballot_card::Orientation,
    debug::{self, ImageDebugWriter},
};

use super::{rqrr, zedbar};

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

/// Strategy for where to search for QR codes in an image.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SearchStrategy {
    /// Search in bottom-left and top-right corners (25% of ballot width).
    /// Optimized for bubble ballot QR code positions.
    BubbleCorners,

    /// Search the bottom 60% and top 50% of the image at full width.
    /// Matches the TypeScript summary ballot search areas, covering summary
    /// ballot QR codes that may be in the center of the page.
    Broad,
}

/// Gets the HMPB-specific detection areas: bottom-left and top-right corners.
pub fn get_hmpb_detection_areas(img: &GrayImage) -> Vec<DetectionArea> {
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

/// Gets the broad detection areas for summary (BMD) ballots: bottom 60% then
/// top 50% of the image at full width. Uses `Portrait` for the bottom area
/// (QR at bottom = right-side up) and `PortraitReversed` for the top area
/// (QR at top = upside down).
pub fn get_broad_detection_areas(img: &GrayImage) -> Vec<DetectionArea> {
    let (width, height) = img.dimensions();
    let height_midpoint = height / 2;

    // Bottom 60%: from 40% to 100% of image height
    let bottom_y = height_midpoint.saturating_sub(height / 10);
    let bottom_height = height.saturating_sub(bottom_y);
    let bottom_origin = Point::new(0, bottom_y);
    let bottom_size = Size {
        width,
        height: bottom_height,
    };

    // Top 50%: from 0% to 50% of image height
    let top_origin = Point::new(0, 0);
    let top_size = Size {
        width,
        height: height_midpoint,
    };

    vec![
        DetectionArea::with_crop(img, bottom_origin, bottom_size, Orientation::Portrait),
        DetectionArea::with_crop(img, top_origin, top_size, Orientation::PortraitReversed),
    ]
}

/// Gets the detection areas for a given search strategy.
pub fn get_detection_areas_for_strategy(
    img: &GrayImage,
    strategy: SearchStrategy,
) -> Vec<DetectionArea> {
    match strategy {
        SearchStrategy::BubbleCorners => get_hmpb_detection_areas(img),
        SearchStrategy::Broad => get_broad_detection_areas(img),
    }
}

/// The kind of ballot as determined by the 3-byte QR code prelude.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum QrCodeKind {
    /// `VP\x02` — Hand-marked paper ballot (bubble ballot) metadata.
    BubbleBallot,
    /// `VX\x02` — Single-page BMD summary ballot.
    SummaryBallot,
    /// `VB\x01` — Multi-page BMD summary ballot page.
    MultiPageSummaryBallot,
    /// Unrecognized prelude.
    Unknown,
}

/// Classifies QR code data by inspecting the 3-byte prelude.
#[must_use]
pub fn classify_qr_payload(bytes: &[u8]) -> QrCodeKind {
    let Some(prelude) = bytes.get(0..3) else {
        return QrCodeKind::Unknown;
    };
    match prelude.try_into() {
        Ok(bubble_ballot::PRELUDE) => QrCodeKind::BubbleBallot,
        Ok(bmd::SINGLE_PAGE_PRELUDE) => QrCodeKind::SummaryBallot,
        Ok(bmd::MULTI_PAGE_PRELUDE) => QrCodeKind::MultiPageSummaryBallot,
        _ => QrCodeKind::Unknown,
    }
}

#[derive(Debug, Clone, Copy)]
#[must_use]
pub enum Detector {
    Rqrr,
    Zedbar,
}

/// Information about a QR code found in an image.
#[derive(Debug, Clone)]
#[must_use]
pub struct Detected {
    detector: Detector,
    detection_areas: Vec<Rect>,
    bytes: Vec<u8>,
    bounds: Rect,
    orientation: Orientation,
}

impl Detected {
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
    #[must_use]
    pub fn bytes(&self) -> &Vec<u8> {
        self.bytes.as_ref()
    }

    /// Gets the bounding box of the detected QR code.
    pub const fn bounds(&self) -> Rect {
        self.bounds
    }

    /// The orientation of the ballot as determined by the QR code position.
    #[must_use]
    pub const fn orientation(&self) -> Orientation {
        self.orientation
    }

    /// The areas of the image that were searched for QR codes.
    pub fn detection_areas(&self) -> &[Rect] {
        &self.detection_areas
    }

    /// Classifies the QR code payload by inspecting the 3-byte prelude.
    #[must_use]
    pub fn kind(&self) -> QrCodeKind {
        classify_qr_payload(&self.bytes)
    }
}

#[derive(Debug, Clone, Serialize, thiserror::Error)]
pub enum Error {
    #[error("failed to decode QR code: {message} (searched {detection_areas:?})")]
    DecodeFailed {
        detection_areas: Vec<Rect>,
        message: String,
    },
    #[error("failed to detect QR code: {message} (searched {detection_areas:?})")]
    DetectFailed {
        detection_areas: Vec<Rect>,
        message: String,
    },
    #[error("no QR code detected (searched {detection_areas:?})")]
    NoQrCodeDetected { detection_areas: Vec<Rect> },
}

impl Error {
    fn detection_areas(&self) -> &[Rect] {
        match self {
            Self::DecodeFailed {
                detection_areas, ..
            }
            | Self::DetectFailed {
                detection_areas, ..
            }
            | Self::NoQrCodeDetected { detection_areas } => detection_areas,
        }
    }
}

pub type Result = std::result::Result<Detected, Error>;

fn base64_decode_if_possible(detected: &Detected) -> Detected {
    let bytes = STANDARD
        .decode(detected.bytes())
        .unwrap_or_else(|_| detected.bytes().clone());
    Detected::new(
        detected.detector(),
        detected.detection_areas().to_vec(),
        bytes,
        detected.bounds(),
        detected.orientation(),
    )
}

/// Detect a QR code using the specified search strategy.
///
/// # Errors
///
/// Returns an `Err` if no QR codes are detected.
pub fn detect_with_strategy(
    img: &GrayImage,
    strategy: SearchStrategy,
    debug: &ImageDebugWriter,
) -> Result {
    let areas = get_detection_areas_for_strategy(img, strategy);
    let rqrr_result = rqrr::detect_in_areas(&areas);
    let detect_result = rqrr_result.or_else(|_| zedbar::detect_in_areas(&areas));
    let detection_areas = match detect_result {
        Ok(ref qr_code) => qr_code.detection_areas().to_vec(),
        Err(ref e) => e.detection_areas().to_vec(),
    };

    debug.write("qr_code", |canvas| {
        debug::draw_qr_code_debug_image_mut(canvas, detect_result.as_ref().ok(), &detection_areas);
    });

    detect_result.map(|detected| base64_decode_if_possible(&detected))
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test {
    use std::path::PathBuf;

    use proptest::proptest;
    use types_rs::geometry::Rect;

    use crate::ballot_card::Orientation;

    use super::*;

    #[test]
    fn test_classify_bubble_ballot() {
        assert_eq!(
            classify_qr_payload(&[0x56, 0x50, 0x02, 0xff]),
            QrCodeKind::BubbleBallot
        );
    }

    #[test]
    fn test_classify_summary_ballot() {
        assert_eq!(
            classify_qr_payload(&[0x56, 0x58, 0x02, 0x00]),
            QrCodeKind::SummaryBallot
        );
    }

    #[test]
    fn test_classify_multi_page_summary_ballot() {
        assert_eq!(
            classify_qr_payload(&[0x56, 0x42, 0x01, 0xab]),
            QrCodeKind::MultiPageSummaryBallot
        );
    }

    #[test]
    fn test_classify_empty() {
        assert_eq!(classify_qr_payload(&[]), QrCodeKind::Unknown);
    }

    #[test]
    fn test_classify_too_short() {
        assert_eq!(classify_qr_payload(&[0x56, 0x50]), QrCodeKind::Unknown);
    }

    #[test]
    fn test_classify_garbage() {
        assert_eq!(
            classify_qr_payload(&[0x00, 0x00, 0x00]),
            QrCodeKind::Unknown
        );
    }

    proptest! {
        #[test]
        fn test_classify_never_panics(bytes: Vec<u8>) {
            let _ = classify_qr_payload(&bytes);
        }
    }

    #[test]
    fn test_hmpb_detection_areas() {
        let image = GrayImage::new(1000, 2000);
        let areas = get_hmpb_detection_areas(&image);
        assert_eq!(areas.len(), 2);

        // Bottom-left corner: 25% width, anchored to bottom
        assert_eq!(areas[0].bounds(), Rect::new(0, 1750, 250, 250));
        assert_eq!(areas[0].orientation(), Orientation::Portrait);

        // Top-right corner: 25% width, anchored to top
        assert_eq!(areas[1].bounds(), Rect::new(750, 0, 250, 250));
        assert_eq!(areas[1].orientation(), Orientation::PortraitReversed);
    }

    #[test]
    fn test_broad_detection_areas() {
        let image = GrayImage::new(1000, 2000);
        let areas = get_broad_detection_areas(&image);
        assert_eq!(areas.len(), 2);

        // Bottom 60%: from 40% to 100% of height, full width
        assert_eq!(areas[0].bounds(), Rect::new(0, 800, 1000, 1200));
        assert_eq!(areas[0].orientation(), Orientation::Portrait);

        // Top 50%: from 0% to 50% of height, full width
        assert_eq!(areas[1].bounds(), Rect::new(0, 0, 1000, 1000));
        assert_eq!(areas[1].orientation(), Orientation::PortraitReversed);
    }

    #[test]
    fn test_detect_qr_code() {
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test/fixtures");
        let image_path = fixture_path.join("all-bubble-ballot/blank-front.jpg");
        let image = image::open(image_path).unwrap().into_luma8();
        let qr_code = detect_with_strategy(
            &image,
            SearchStrategy::BubbleCorners,
            &ImageDebugWriter::disabled(),
        )
        .unwrap();
        assert_eq!(
            qr_code.bytes().clone(),
            vec![
                0x56, 0x50, 0x02, 0xf1, 0x3f, 0x4a, 0xb3, 0x76, 0xfb, 0xaa, 0xf9, 0x14, 0x37, 0x00,
                0x00, 0x00, 0x03, 0x00
            ]
        );
        assert_eq!(qr_code.bounds(), Rect::new(88, 1996, 123, 125));
        assert_eq!(qr_code.orientation(), Orientation::Portrait);
    }

    #[test]
    fn test_detect_qr_code_in_skewed_image() {
        let fixture_path =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test/fixtures/alameda-test");
        let top_path = fixture_path.join("scan-skewed-side-a.jpeg");
        let bottom_path = fixture_path.join("scan-skewed-side-b.jpeg");
        let _ = detect_with_strategy(
            &image::open(top_path).unwrap().into_luma8(),
            SearchStrategy::BubbleCorners,
            &ImageDebugWriter::disabled(),
        )
        .expect("top QR code should be detected");
        let _ = detect_with_strategy(
            &image::open(bottom_path).unwrap().into_luma8(),
            SearchStrategy::BubbleCorners,
            &ImageDebugWriter::disabled(),
        )
        .expect("bottom QR code should be detected");
    }
}
