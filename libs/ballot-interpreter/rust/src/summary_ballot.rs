use image::{GrayImage, imageops::rotate180_in_place};
use serde::Serialize;
use types_rs::{
    ballot_card::BallotSide,
    bmd::{BMD_PRELUDE, PARTIAL_BALLOT_HASH_BYTE_LENGTH, PartialBallotHash, cvr::CastVoteRecord},
    coding,
    election::Election,
    geometry::Rect,
};

use crate::{
    ballot_card::{BallotImage, Orientation},
    image_utils::{binarization_threshold_from_histogram, histogram},
    qr_code::{self, Detected, Detector},
};

/// Pixels darker than this count as foreground when checking for a blank page.
const MINIMUM_BACKGROUND_LUMA: u8 = 200;

/// A page whose QR code search areas are all at most this dark is blank.
const MAXIMUM_BLANK_PAGE_FOREGROUND_RATIO: f32 = 0.007;

/// Why no summary ballot QR code was found on a page.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PageError {
    BlankPage,
    NoQrCode,
}

/// Where a summary ballot QR code was found on a page.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedQrCode {
    pub detector: Detector,
    pub bounds: Rect,
    pub orientation: Orientation,
}

impl From<&Detected> for DetectedQrCode {
    fn from(detected: &Detected) -> Self {
        Self {
            detector: detected.detector(),
            bounds: detected.bounds(),
            orientation: detected.orientation(),
        }
    }
}

#[derive(Debug, Clone, Serialize, thiserror::Error)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Error {
    #[error("no summary ballot QR code found (side A: {side_a:?}, side B: {side_b:?})")]
    VotesNotFound {
        side_a: PageError,
        side_b: Option<PageError>,
    },

    #[error("summary ballot QR codes found on both sides")]
    MultipleQrCodes {
        side_a: DetectedQrCode,
        side_b: DetectedQrCode,
    },

    #[error("ballot hash mismatch: expected {expected_ballot_hash}, got {actual_ballot_hash}")]
    MismatchedElection {
        expected_ballot_hash: String,
        actual_ballot_hash: String,
    },

    #[error("invalid summary ballot data: {message}")]
    InvalidBallotData { message: String },
}

pub type Result<T, E = Error> = std::result::Result<T, E>;

/// An interpreted summary ballot sheet.
#[derive(Debug)]
#[must_use]
pub struct Interpretation {
    pub record: CastVoteRecord,

    /// The input side holding the summary ballot.
    pub side: BallotSide,

    /// The summary ballot page, cropped to the paper and right side up.
    pub summary_ballot_image: GrayImage,

    /// The other side of the sheet cropped to the paper, if it was scanned.
    pub blank_page_image: Option<GrayImage>,
}

struct Page {
    image: GrayImage,
    qr_code: Result<Detected, PageError>,
}

impl Page {
    fn new(image: GrayImage) -> Self {
        let image = crop_to_document(image);
        let qr_code = detect_qr_code(&image);
        Self { image, qr_code }
    }
}

/// Interprets a summary ballot sheet. Pass `None` for `side_b` when only one
/// side of the sheet was scanned.
///
/// # Errors
///
/// Returns an error if exactly one summary ballot QR code for this election
/// cannot be found and decoded.
pub fn interpret(
    election: &Election,
    expected_ballot_hash: &PartialBallotHash,
    side_a: GrayImage,
    side_b: Option<GrayImage>,
) -> Result<Interpretation> {
    let (page_a, page_b) = match side_b {
        Some(side_b) => {
            let (page_a, page_b) = rayon::join(|| Page::new(side_a), || Page::new(side_b));
            (page_a, Some(page_b))
        }
        None => (Page::new(side_a), None),
    };

    let Page {
        image: image_a,
        qr_code: qr_code_a,
    } = page_a;
    let page_b = page_b.map(|page| (page.qr_code, page.image));

    let (side, mut summary_ballot_image, qr_code, blank_page_image) = match (qr_code_a, page_b) {
        (Ok(side_a), Some((Ok(side_b), _))) => {
            return Err(Error::MultipleQrCodes {
                side_a: (&side_a).into(),
                side_b: (&side_b).into(),
            });
        }
        (Ok(qr_code), page_b) => (
            BallotSide::Front,
            image_a,
            qr_code,
            page_b.map(|(_, image_b)| image_b),
        ),
        (Err(_), Some((Ok(qr_code), image_b))) => {
            (BallotSide::Back, image_b, qr_code, Some(image_a))
        }
        (Err(side_a), None) => {
            return Err(Error::VotesNotFound {
                side_a,
                side_b: None,
            });
        }
        (Err(side_a), Some((Err(side_b), _))) => {
            return Err(Error::VotesNotFound {
                side_a,
                side_b: Some(side_b),
            });
        }
    };

    check_ballot_hash(qr_code.bytes(), expected_ballot_hash)?;

    let record =
        coding::decode_with::<CastVoteRecord>(qr_code.bytes(), election).map_err(|err| {
            Error::InvalidBallotData {
                message: err.to_string(),
            }
        })?;

    if qr_code.orientation() == Orientation::PortraitReversed {
        rotate180_in_place(&mut summary_ballot_image);
    }

    Ok(Interpretation {
        record,
        side,
        summary_ballot_image,
        blank_page_image,
    })
}

fn check_ballot_hash(bytes: &[u8], expected_ballot_hash: &PartialBallotHash) -> Result<()> {
    let actual_ballot_hash =
        bytes.get(BMD_PRELUDE.len()..BMD_PRELUDE.len() + PARTIAL_BALLOT_HASH_BYTE_LENGTH);

    if actual_ballot_hash == Some(expected_ballot_hash.as_slice()) {
        Ok(())
    } else {
        Err(Error::MismatchedElection {
            expected_ballot_hash: hex::encode(expected_ballot_hash),
            actual_ballot_hash: actual_ballot_hash.map_or_else(String::new, hex::encode),
        })
    }
}

fn crop_to_document(image: GrayImage) -> GrayImage {
    let threshold = binarization_threshold_from_histogram(&histogram(image.as_raw()));
    BallotImage::crop_borders(image, threshold).0
}

fn detect_qr_code(image: &GrayImage) -> Result<Detected, PageError> {
    let is_blank = qr_code::get_broad_detection_areas(image)
        .iter()
        .all(|area| foreground_ratio(image, area.bounds()) <= MAXIMUM_BLANK_PAGE_FOREGROUND_RATIO);

    if is_blank {
        return Err(PageError::BlankPage);
    }

    qr_code::detect_summary_ballot(image).map_err(|_| PageError::NoQrCode)
}

fn foreground_ratio(image: &GrayImage, bounds: Rect) -> f32 {
    let pixel_count = bounds.width() as usize * bounds.height() as usize;
    if pixel_count == 0 {
        return 0.0;
    }

    let stride = image.width() as usize;
    let (left, top) = (bounds.left() as usize, bounds.top() as usize);
    let width = bounds.width() as usize;
    let raw = image.as_raw();
    let foreground: usize = (top..top + bounds.height() as usize)
        .map(|y| {
            let start = y * stride + left;
            raw[start..start + width]
                .iter()
                .filter(|&&luma| luma < MINIMUM_BACKGROUND_LUMA)
                .count()
        })
        .sum();

    foreground as f32 / pixel_count as f32
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test {
    use std::path::PathBuf;

    use image::Luma;

    use crate::election_source::{ElectionDefinition, ElectionSource, InMemoryElectionSource};

    use super::*;

    fn fixture_path(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../test/fixtures/famous-names-summary-ballot")
            .join(name)
    }

    fn load_image(name: &str) -> GrayImage {
        image::open(fixture_path(name)).unwrap().into_luma8()
    }

    fn election_definition() -> ElectionDefinition {
        InMemoryElectionSource::from_election_json(
            &std::fs::read(fixture_path("election.json")).unwrap(),
        )
        .unwrap()
        .election_definition()
        .unwrap()
    }

    fn interpret_fixture(side_a: GrayImage, side_b: Option<GrayImage>) -> Result<Interpretation> {
        let ElectionDefinition {
            election,
            ballot_hash,
        } = election_definition();
        interpret(&election, &ballot_hash, side_a, side_b)
    }

    fn rotated180(mut image: GrayImage) -> GrayImage {
        rotate180_in_place(&mut image);
        image
    }

    #[test]
    fn interprets_summary_ballot_on_side_a() {
        let interpretation = interpret_fixture(
            load_image("summary-page.png"),
            Some(load_image("blank-page.png")),
        )
        .unwrap();
        assert_eq!(interpretation.side, BallotSide::Front);
        assert!(!interpretation.record.votes.is_empty());
        assert!(interpretation.blank_page_image.is_some());
    }

    #[test]
    fn interprets_summary_ballot_on_side_b() {
        let interpretation = interpret_fixture(
            load_image("blank-page.png"),
            Some(load_image("summary-page.png")),
        )
        .unwrap();
        assert_eq!(interpretation.side, BallotSide::Back);
    }

    #[test]
    fn interprets_simplex_summary_ballot() {
        let interpretation = interpret_fixture(load_image("summary-page.png"), None).unwrap();
        assert_eq!(interpretation.side, BallotSide::Front);
        assert!(interpretation.blank_page_image.is_none());
    }

    #[test]
    fn rotates_upside_down_summary_ballot() {
        let upright = interpret_fixture(load_image("summary-page.png"), None).unwrap();
        let upside_down =
            interpret_fixture(rotated180(load_image("summary-page.png")), None).unwrap();
        assert_eq!(upside_down.record, upright.record);
        assert_eq!(
            upside_down.summary_ballot_image,
            upright.summary_ballot_image
        );
    }

    #[test]
    fn crops_dark_border_outside_paper() {
        let summary_page = load_image("summary-page.png");
        let (width, height) = summary_page.dimensions();
        let mut scanned = GrayImage::from_pixel(width + 40, height + 60, Luma([0]));
        image::imageops::replace(&mut scanned, &summary_page, 20, 30);

        let interpretation = interpret_fixture(scanned, None).unwrap();
        assert_eq!(interpretation.summary_ballot_image, summary_page);
    }

    #[test]
    fn reports_blank_pages() {
        let error = interpret_fixture(
            load_image("blank-page.png"),
            Some(load_image("blank-page.png")),
        )
        .unwrap_err();
        assert!(matches!(
            error,
            Error::VotesNotFound {
                side_a: PageError::BlankPage,
                side_b: Some(PageError::BlankPage),
            }
        ));
    }

    #[test]
    fn reports_missing_qr_code_on_non_blank_page() {
        let mut page = GrayImage::from_pixel(1700, 2200, Luma([255]));
        for (x, y, pixel) in page.enumerate_pixels_mut() {
            if (200..1500).contains(&x) && (200..400).contains(&y) {
                *pixel = Luma([0]);
            }
        }
        let error = interpret_fixture(page, None).unwrap_err();
        assert!(matches!(
            error,
            Error::VotesNotFound {
                side_a: PageError::NoQrCode,
                side_b: None,
            }
        ));
    }

    #[test]
    fn reports_qr_codes_on_both_sides() {
        let error = interpret_fixture(
            load_image("summary-page.png"),
            Some(load_image("summary-page.png")),
        )
        .unwrap_err();
        assert!(matches!(error, Error::MultipleQrCodes { .. }));
    }

    #[test]
    fn reports_mismatched_election() {
        let ElectionDefinition {
            election,
            ballot_hash,
        } = election_definition();
        let error = interpret(
            &election,
            &[0; PARTIAL_BALLOT_HASH_BYTE_LENGTH],
            load_image("summary-page.png"),
            None,
        )
        .unwrap_err();
        assert!(matches!(
            error,
            Error::MismatchedElection {
                expected_ballot_hash,
                actual_ballot_hash,
            } if expected_ballot_hash == "00000000000000000000"
                && actual_ballot_hash == hex::encode(ballot_hash)
        ));
    }

    #[test]
    fn check_ballot_hash_reports_truncated_payload() {
        let error = check_ballot_hash(BMD_PRELUDE, &[0; PARTIAL_BALLOT_HASH_BYTE_LENGTH]);
        assert!(matches!(
            error,
            Err(Error::MismatchedElection { actual_ballot_hash, .. }) if actual_ballot_hash.is_empty()
        ));
    }

    #[test]
    fn foreground_ratio_of_empty_bounds_is_zero() {
        let image = GrayImage::new(10, 10);
        assert_eq!(foreground_ratio(&image, Rect::new(0, 0, 0, 0)), 0.0);
    }
}
