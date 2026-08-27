use std::cell::OnceCell;

use base64::{
    Engine as _,
    engine::general_purpose::{GeneralPurpose, STANDARD, URL_SAFE_NO_PAD},
};
use image::GrayImage;
use serde::Serialize;
use types_rs::{
    bmd, bubble_ballot,
    geometry::{PixelUnit, Point, Rect, Size},
};

use crate::{
    ballot_card::Orientation,
    debug::{self, ImageDebugWriter},
    image_utils::crop_to_image,
};

use super::{rqrr, zedbar};

/// An area in a ballot image to be searched for QR codes.
pub struct DetectionArea<'a> {
    source: &'a GrayImage,
    origin: Point<PixelUnit>,
    size: Size<PixelUnit>,
    orientation: Orientation,
    cropped: OnceCell<GrayImage>,
}

impl<'a> DetectionArea<'a> {
    /// Defines an area of the given image at the specified point and size.
    /// Records that this detection area represents a particular orientation.
    ///
    /// The crop itself happens lazily on first access to
    /// [`DetectionArea::image`], so areas that are never scanned (because a
    /// QR code was already found in an earlier area) are never copied.
    #[must_use]
    pub fn new(
        img: &'a GrayImage,
        origin: Point<PixelUnit>,
        size: Size<PixelUnit>,
        orientation: Orientation,
    ) -> Self {
        Self {
            source: img,
            origin,
            size,
            orientation,
            cropped: OnceCell::new(),
        }
    }

    pub const fn origin(&self) -> Point<PixelUnit> {
        self.origin
    }

    pub fn bounds(&self) -> Rect {
        Rect::new(
            self.origin.x as i32,
            self.origin.y as i32,
            self.size.width,
            self.size.height,
        )
    }

    pub const fn orientation(&self) -> Orientation {
        self.orientation
    }

    pub fn image(&self) -> &GrayImage {
        self.cropped.get_or_init(|| {
            crop_to_image(
                self.source,
                self.origin.x,
                self.origin.y,
                self.size.width,
                self.size.height,
            )
        })
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
pub fn get_hmpb_detection_areas(img: &GrayImage) -> Vec<DetectionArea<'_>> {
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
        DetectionArea::new(img, bottom_left_origin, crop_size, Orientation::Portrait),
        DetectionArea::new(
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
pub fn get_broad_detection_areas(img: &GrayImage) -> Vec<DetectionArea<'_>> {
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
        DetectionArea::new(img, bottom_origin, bottom_size, Orientation::Portrait),
        DetectionArea::new(img, top_origin, top_size, Orientation::PortraitReversed),
    ]
}

/// Gets the detection areas for a given search strategy.
pub fn get_detection_areas_for_strategy(
    img: &GrayImage,
    strategy: SearchStrategy,
) -> Vec<DetectionArea<'_>> {
    match strategy {
        SearchStrategy::BubbleCorners => get_hmpb_detection_areas(img),
        SearchStrategy::Broad => get_broad_detection_areas(img),
    }
}

/// The kind of ballot as determined by the 3-byte QR code prelude.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum QrCodeKind {
    /// `VB\x01` — bubble ballot (hand-marked paper ballot) metadata.
    BubbleBallot,
    /// `VS\x01` — summary (BMD) ballot page.
    SummaryBallot,
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
        Ok(bmd::BMD_PRELUDE) => QrCodeKind::SummaryBallot,
        _ => QrCodeKind::Unknown,
    }
}

/// Whether `bytes` starts with any prelude we have ever printed.
///
/// This is deliberately broader than [`classify_qr_payload`]: classification
/// names the payloads we can parse, while this answers whether a base64 decode
/// produced ballot data at all. The two differ for v4.0 bubble ballots, which
/// we print but no longer decode.
#[must_use]
fn is_vx_payload(bytes: &[u8]) -> bool {
    let Some(prelude) = bytes.get(0..3) else {
        return false;
    };
    matches!(
        prelude.try_into(),
        Ok(bubble_ballot::PRELUDE | bubble_ballot::PRELUDE_V4P0 | bmd::BMD_PRELUDE)
    )
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
    pub fn bytes(&self) -> &[u8] {
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

/// The QR code payload is optionally prefixed so that scanning the QR code
/// with a phone opens an informational page.
const BALLOT_URL_PREFIX: &[u8] = b"https://ballot.page/vx/";

/// Accept standard base64 or URL-safe base64.
const PAYLOAD_ENGINES: [GeneralPurpose; 2] = [STANDARD, URL_SAFE_NO_PAD];

/// The decode is kept only if it produced something with a ballot prelude. A
/// successful decode on its own proves nothing: the base64 alphabet is a
/// superset of the alphabets a QR payload can be drawn from, so a payload that
/// was never base64 can decode without error into garbage. Anything we don't
/// recognize is passed through unchanged so that the prelude check downstream
/// reports the error.
fn unwrap_qr_payload(detected: &Detected) -> Detected {
    let payload = detected.bytes();
    let stripped = payload.strip_prefix(BALLOT_URL_PREFIX).unwrap_or(payload);
    let bytes = PAYLOAD_ENGINES
        .iter()
        .find_map(|engine| engine.decode(stripped).ok().filter(|d| is_vx_payload(d)))
        .unwrap_or_else(|| payload.to_vec());

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
    // Cropping to the strategy's search areas is dramatically cheaper than
    // scanning the whole image: both decoders scale poorly with image area,
    // and the cost of producing the crops themselves is negligible.
    let areas = get_detection_areas_for_strategy(img, strategy);

    // Try zedbar first because on representative ballot images it decodes
    // more QR codes than rqrr and is faster per call. rqrr is kept as a
    // fallback to catch the rare cases zedbar misses.
    let zedbar_result = zedbar::detect_in_areas(&areas);
    let detect_result = zedbar_result.or_else(|_| rqrr::detect_in_areas(&areas));
    let detection_areas = match detect_result {
        Ok(ref qr_code) => qr_code.detection_areas().to_vec(),
        Err(ref e) => e.detection_areas().to_vec(),
    };

    debug.write("qr_code", |canvas| {
        debug::draw_qr_code_debug_image_mut(canvas, detect_result.as_ref().ok(), &detection_areas);
    });

    detect_result.map(|detected| unwrap_qr_payload(&detected))
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
            classify_qr_payload(&[0x56, 0x42, 0x01, 0xff]),
            QrCodeKind::BubbleBallot
        );
    }

    #[test]
    fn test_classify_summary_ballot() {
        assert_eq!(
            classify_qr_payload(&[0x56, 0x53, 0x01, 0xab]),
            QrCodeKind::SummaryBallot
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

    fn detected(bytes: &[u8]) -> Detected {
        Detected::new(
            Detector::Zedbar,
            vec![],
            bytes.to_vec(),
            Rect::new(0, 0, 1, 1),
            Orientation::Portrait,
        )
    }

    #[test]
    fn test_unwrap_base64_wrapped_payload() {
        let raw = [0x56, 0x53, 0x01, 0xab, 0xcd];
        let wrapped = STANDARD.encode(raw);
        assert_eq!(
            unwrap_qr_payload(&detected(wrapped.as_bytes())).bytes(),
            raw
        );
    }

    /// Nothing we print is unwrapped bytes, but a payload that isn't base64 at
    /// all must still reach the prelude check downstream intact rather than
    /// being replaced by whatever a decode attempt produced.
    #[test]
    fn test_unwrap_leaves_undecodable_payload_alone() {
        let raw = [0x56, 0x42, 0x01, 0xab, 0xcd];
        assert_eq!(unwrap_qr_payload(&detected(&raw)).bytes(), raw);
    }

    #[test]
    fn test_unwrap_recognizes_deprecated_v4p0_payload() {
        let raw = [0x56, 0x50, 0x02, 0xab, 0xcd];
        let wrapped = STANDARD.encode(raw);
        assert_eq!(
            unwrap_qr_payload(&detected(wrapped.as_bytes())).bytes(),
            raw
        );
    }

    /// A payload drawn from the base64 alphabet decodes without error even
    /// though it was never base64. Decoding it anyway would silently replace it
    /// with garbage, and only for lengths that happen to be a multiple of 4.
    #[test]
    fn test_unwrap_leaves_incidentally_decodable_payload_alone() {
        for payload in [
            "VXBABCDEFGH01234567",
            "VXBABCDEFGH012345678",
            "VXBABCDEFGH0123456789",
            "1234567890123456",
        ] {
            assert_eq!(
                unwrap_qr_payload(&detected(payload.as_bytes())).bytes(),
                payload.as_bytes(),
                "payload of length {} was modified",
                payload.len()
            );
        }
    }

    proptest! {
        /// Whatever a QR code turns out to contain, unwrapping must either
        /// produce a payload we recognize or leave the bytes untouched.
        #[test]
        fn test_unwrap_never_produces_unrecognized_bytes(bytes: Vec<u8>) {
            let unwrapped = unwrap_qr_payload(&detected(&bytes));
            assert!(is_vx_payload(unwrapped.bytes()) || unwrapped.bytes() == bytes);
        }

        /// Same property, but over payloads drawn from the base64 alphabet,
        /// where an unconditional decode succeeds and quietly returns garbage.
        /// Lengths that are a multiple of 4 are the dangerous ones.
        #[test]
        fn test_unwrap_never_mangles_base64_alphabet_payload(
            payload in "[A-Za-z0-9+/]{0,64}"
        ) {
            let unwrapped = unwrap_qr_payload(&detected(payload.as_bytes()));
            assert!(
                is_vx_payload(unwrapped.bytes()) || unwrapped.bytes() == payload.as_bytes()
            );
        }
    }

    /// Test every form that the payload may take
    #[test]
    fn test_unwrap_accepted_base64_forms() {
        let raw = [0x56, 0x42, 0x01, 0xfb, 0xff];
        assert_eq!(STANDARD.encode(raw), "VkIB+/8=");

        for encoded in [STANDARD.encode(raw), URL_SAFE_NO_PAD.encode(raw)] {
            for payload in [encoded.clone(), format!("https://ballot.page/vx/{encoded}")] {
                let expected: &[u8] = &raw;
                assert_eq!(
                    unwrap_qr_payload(&detected(payload.as_bytes())).bytes(),
                    expected,
                );
            }
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
            qr_code.bytes(),
            vec![
                0x56, 0x50, 0x02, 0xf1, 0x3f, 0x4a, 0xb3, 0x76, 0xfb, 0xaa, 0xf9, 0x14, 0x37, 0x00,
                0x00, 0x00, 0x03, 0x00
            ]
        );
        assert_eq!(qr_code.bounds(), Rect::new(88, 1996, 118, 119));
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
