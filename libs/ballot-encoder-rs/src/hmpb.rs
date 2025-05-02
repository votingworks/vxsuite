use bitter::BitReader;
use serde::Serialize;
use types_rs::election::{BallotStyleId, Election, PrecinctId};

use crate::{
    coding::{BitDecode, bit_size},
    types::{BallotStyleIndex, PageNumber, PrecinctIndex},
};

#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize)]
pub enum BallotType {
    #[serde(rename = "precinct")]
    Precinct,
    #[serde(rename = "absentee")]
    Absentee,
    #[serde(rename = "provisional")]
    Provisional,
}

impl BallotType {
    const MAX: u32 = 2_u32.pow(4) - 1;
    const BITS: u32 = bit_size(Self::MAX as u64);
}

impl BitDecode for BallotType {
    type Context = ();

    fn bit_decode<R: BitReader>(bits: &mut R, _context: Self::Context) -> Option<Self> {
        Some(match bits.read_bits(Self::BITS)? {
            0 => BallotType::Precinct,
            1 => BallotType::Absentee,
            2 => BallotType::Provisional,
            _ => return None,
        })
    }
}

#[derive(Debug, Serialize, PartialEq, Eq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Metadata {
    pub ballot_hash: String, // Hex string, first BALLOT_HASH_LENGTH characters of the hash
    pub precinct_id: PrecinctId,
    pub ballot_style_id: BallotStyleId,
    pub page_number: PageNumber,
    pub is_test_mode: bool,
    pub ballot_type: BallotType,
}

impl BitDecode for Metadata {
    type Context = Election;

    fn bit_decode<R: BitReader>(bits: &mut R, context: Self::Context) -> Option<Self> {
        let election = context;
        let mut prelude = [0; 3];
        bits.read_bytes(&mut prelude);
        if &prelude != HMPB_PRELUDE {
            return None;
        }

        let mut ballot_hash_bytes = [0; (BALLOT_HASH_LENGTH / HEX_BYTES_PER_CHAR) as usize];
        bits.read_bytes(&mut ballot_hash_bytes);
        let ballot_hash = hex::encode(ballot_hash_bytes);

        let precinct_index = PrecinctIndex::bit_decode(bits, ())?;
        let ballot_style_index = BallotStyleIndex::bit_decode(bits, ())?;
        let page_number = PageNumber::bit_decode(bits, ())?;
        let is_test_mode = bits.read_bit()?;
        let ballot_type = BallotType::bit_decode(bits, ())?;

        let precinct = election.precincts.get(precinct_index.get())?;
        let ballot_style = election.ballot_styles.get(ballot_style_index.get())?;

        Some(Metadata {
            ballot_hash,
            precinct_id: precinct.id.clone(),
            ballot_style_id: ballot_style.id.clone(),
            page_number,
            is_test_mode,
            ballot_type,
        })
    }
}

const BALLOT_HASH_LENGTH: u32 = 20;
const HEX_BYTES_PER_CHAR: u32 = 2;
const HMPB_PRELUDE: &[u8; 3] = b"VP\x02";

#[must_use]
pub fn infer_missing_page_metadata(detected_ballot_metadata: &Metadata) -> Metadata {
    Metadata {
        ballot_hash: detected_ballot_metadata.ballot_hash.clone(),
        ballot_style_id: detected_ballot_metadata.ballot_style_id.clone(),
        precinct_id: detected_ballot_metadata.precinct_id.clone(),
        ballot_type: detected_ballot_metadata.ballot_type,
        is_test_mode: detected_ballot_metadata.is_test_mode,
        page_number: detected_ballot_metadata.page_number.opposite(),
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
    use crate::types::tests::arbitrary_page_number;

    #[test]
    fn test_decode_metadata_bits() {
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test/fixtures/ashland");
        let election_path = fixture_path.join("election.json");
        let election: Election =
            serde_json::from_reader(BufReader::new(File::open(election_path).unwrap())).unwrap();
        // Encoded using libs/ballot-encoder
        /*
          const election = readFileSync('libs/ballot-interpreter/test/fixtures/ashland/election.json', 'utf-8');
          console.log(encodeHmpbBallotPageMetadata(election, {
            ballotHash: 'd27ab6588b1869544cde',
            precinctId: 'town-id-01001-precinct-id-default',
            ballotStyleId: 'card-number-5',
            pageNumber: 1,
            isTestMode: false,
            ballotType: BallotType.Precinct,
          }));
        */
        let bytes = [
            86, 80, 2, 210, 122, 182, 88, 139, 24, 105, 84, 76, 222, 0, 0, 0, 2, 0,
        ];
        assert_eq!(
            Metadata::decode_be_bytes(&bytes, election),
            Some(Metadata {
                ballot_hash: "d27ab6588b1869544cde".to_string(),
                precinct_id: PrecinctId::from("town-id-01001-precinct-id-default".to_string()),
                ballot_style_id: BallotStyleId::from("card-number-5".to_string()),
                page_number: PageNumber::new_unchecked(1),
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
            page_number in arbitrary_page_number(),
            ballot_hash in "[0-9a-f]{20}",
            precinct_id in "[0-9a-z-]{1,100}",
            ballot_style_id in "[0-9a-z-]{1,100}",
            is_test_mode in proptest::bool::ANY,
            ballot_type in arbitrary_ballot_type()
        ) {
            let detected_metadata = Metadata {
                ballot_hash,
                precinct_id: PrecinctId::from(precinct_id),
                ballot_style_id: BallotStyleId::from(ballot_style_id),
                page_number,
                is_test_mode,
                ballot_type,
            };

            // The inferred page number should be one less or one more than the detected page number.
            let inferred_metadata = infer_missing_page_metadata(&detected_metadata);
            assert_eq!(u8::abs_diff(inferred_metadata.page_number.get(), detected_metadata.page_number.get()), 1);

            assert_eq!(inferred_metadata.ballot_hash, detected_metadata.ballot_hash);
            assert_eq!(inferred_metadata.precinct_id, detected_metadata.precinct_id);
            assert_eq!(inferred_metadata.ballot_style_id, detected_metadata.ballot_style_id);
            assert_eq!(inferred_metadata.is_test_mode, detected_metadata.is_test_mode);
            assert_eq!(inferred_metadata.ballot_type, detected_metadata.ballot_type);
        }
    }
}
