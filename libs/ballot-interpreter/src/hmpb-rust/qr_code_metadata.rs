use bitter::{BigEndianReader, BitReader};
use image::EncodableLayout;
use serde::Serialize;
use types_rs::election::{BallotStyleId, Election, PrecinctId};

use crate::qr_code;

#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize)]
pub enum BallotType {
    #[serde(rename = "precinct")]
    Precinct,
    #[serde(rename = "absentee")]
    Absentee,
    #[serde(rename = "provisional")]
    Provisional,
}

#[derive(Debug, Serialize, PartialEq, Eq, Clone)]
#[serde(rename_all = "camelCase")]
// Metadata encoded in a QR code. Matches the TS type HmpbBallotPageMetadata.
#[allow(clippy::module_name_repetitions)]
pub struct BallotPageQrCodeMetadata {
    pub ballot_hash: String, // Hex string, first 20 characters of the hash
    pub precinct_id: PrecinctId,
    pub ballot_style_id: BallotStyleId,
    pub page_number: u8,
    pub is_test_mode: bool,
    pub ballot_type: BallotType,
}

#[derive(Debug, Serialize, Clone, thiserror::Error)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum BallotPageQrCodeMetadataError {
    #[error("QR code error: {0}")]
    QrCodeError(#[from] qr_code::Error),
    #[error("invalid metadata: {bytes:?}")]
    InvalidMetadata { bytes: Vec<u8> },
}

const BALLOT_HASH_LENGTH: u32 = 20;
const HEX_BYTES_PER_CHAR: u32 = 2;
const MAXIMUM_PAGE_NUMBERS: u32 = 30;
const BALLOT_TYPE_MAXIMUM_VALUE: u32 = 2_u32.pow(4) - 1;
const HMPB_PRELUDE: &[u8] = b"VP\x02";

pub fn decode_metadata_bits(election: &Election, bytes: &[u8]) -> Option<BallotPageQrCodeMetadata> {
    let mut bits = BigEndianReader::new(bytes);

    let mut prelude = [0; 3];
    bits.read_bytes(&mut prelude);
    if prelude != HMPB_PRELUDE.as_bytes() {
        return None;
    }

    let mut ballot_hash_bytes = [0; (BALLOT_HASH_LENGTH / HEX_BYTES_PER_CHAR) as usize];
    bits.read_bytes(&mut ballot_hash_bytes);
    let ballot_hash = hex::encode(ballot_hash_bytes);

    let precinct_count = bits.read_u8()?;
    let ballot_style_count = bits.read_u8()?;
    let precinct_index = bits.read_bits(bit_size(u32::from(precinct_count) - 1))?;
    let ballot_style_index = bits.read_bits(bit_size(u32::from(ballot_style_count) - 1))?;
    let page_number = bits.read_bits(bit_size(MAXIMUM_PAGE_NUMBERS))? as u8;
    let is_test_mode = bits.read_bit()?;
    let ballot_type: BallotType = match bits.read_bits(bit_size(BALLOT_TYPE_MAXIMUM_VALUE))? {
        0 => BallotType::Precinct,
        1 => BallotType::Absentee,
        2 => BallotType::Provisional,
        _ => return None,
    };

    let precinct = election.precincts.get(precinct_index as usize)?;
    let ballot_style = election.ballot_styles.get(ballot_style_index as usize)?;

    Some(BallotPageQrCodeMetadata {
        ballot_hash,
        precinct_id: precinct.id.clone(),
        ballot_style_id: ballot_style.id.clone(),
        page_number,
        is_test_mode,
        ballot_type,
    })
}

pub fn infer_missing_page_metadata(
    detected_ballot_metadata: &BallotPageQrCodeMetadata,
) -> BallotPageQrCodeMetadata {
    let inferred_page_number = match detected_ballot_metadata.page_number % 2 {
        0 => detected_ballot_metadata.page_number - 1,
        1 => detected_ballot_metadata.page_number + 1,
        _ => unreachable!(),
    };

    BallotPageQrCodeMetadata {
        ballot_hash: detected_ballot_metadata.ballot_hash.clone(),
        ballot_style_id: detected_ballot_metadata.ballot_style_id.clone(),
        precinct_id: detected_ballot_metadata.precinct_id.clone(),
        ballot_type: detected_ballot_metadata.ballot_type,
        is_test_mode: detected_ballot_metadata.is_test_mode,
        page_number: inferred_page_number,
    }
}

const fn bit_size(n: u32) -> u32 {
    if n == 0 {
        1
    } else {
        n.ilog2() + 1
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test {
    use std::{fs::File, io::BufReader, path::PathBuf};

    use proptest::{
        prop_oneof, proptest,
        strategy::{Just, Strategy},
    };

    use super::*;

    #[test]
    fn test_decode_metadata_bits() {
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test/fixtures/ashland");
        let election_path = fixture_path.join("election.json");
        let election: Election =
            serde_json::from_reader(BufReader::new(File::open(election_path).unwrap())).unwrap();
        // TODO update after making all encoding changes
        // Encoded using libs/ballot-encoder
        let bytes = [
            86, 80, 2, 210, 122, 182, 88, 139, 24, 105, 84, 76, 222, 4, 1, 9, 1, 0,
        ];
        assert_eq!(
            decode_metadata_bits(&election, &bytes),
            Some(BallotPageQrCodeMetadata {
                ballot_hash: "d27ab6588b1869544cde".to_string(),
                precinct_id: PrecinctId::from("town-id-01001-precinct-id-default".to_string()),
                ballot_style_id: BallotStyleId::from("card-number-5".to_string()),
                page_number: 1,
                is_test_mode: false,
                ballot_type: BallotType::Precinct,
            })
        );
    }

    fn arbitrary_ballot_type() -> impl Strategy<Value = BallotType> {
        prop_oneof![
            Just(BallotType::Precinct),
            Just(BallotType::Absentee),
            Just(BallotType::Provisional)
        ]
    }

    proptest! {
        #[test]
        fn test_infer_missing_page_metadata(
            page_number in 1u8..100,
            ballot_hash in "[0-9a-f]{20}",
            precinct_id in "[0-9a-z-]{1,100}",
            ballot_style_id in "[0-9a-z-]{1,100}",
            is_test_mode in proptest::bool::ANY,
            ballot_type in arbitrary_ballot_type()
        ) {
            let detected_metadata = BallotPageQrCodeMetadata {
                ballot_hash,
                precinct_id: PrecinctId::from(precinct_id),
                ballot_style_id: BallotStyleId::from(ballot_style_id),
                page_number,
                is_test_mode,
                ballot_type,
            };

            // The inferred page number should be one less or one more than the detected page number.
            let inferred_metadata = infer_missing_page_metadata(&detected_metadata);
            assert_eq!(u8::abs_diff(inferred_metadata.page_number, detected_metadata.page_number), 1);

            assert_eq!(inferred_metadata.ballot_hash, detected_metadata.ballot_hash);
            assert_eq!(inferred_metadata.precinct_id, detected_metadata.precinct_id);
            assert_eq!(inferred_metadata.ballot_style_id, detected_metadata.ballot_style_id);
            assert_eq!(inferred_metadata.is_test_mode, detected_metadata.is_test_mode);
            assert_eq!(inferred_metadata.ballot_type, detected_metadata.ballot_type);
        }
    }
}
