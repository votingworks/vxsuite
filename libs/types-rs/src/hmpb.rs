use bitstream_io::read::{FromBitStream, FromBitStreamWith};
use serde::Serialize;

use crate::{
    ballot_card::{
        BallotAuditIdLength, BallotStyleIndex, BallotType, PageNumber, ParseBallotTypeError,
        PrecinctIndex,
    },
    coding,
    election::{BallotStyleId, Election, PrecinctId},
};

#[derive(Debug, Serialize, PartialEq, Eq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Metadata {
    pub ballot_hash: String, // Hex string, first BALLOT_HASH_LENGTH characters of the hash
    pub precinct_id: PrecinctId,
    pub ballot_style_id: BallotStyleId,
    pub page_number: PageNumber,
    pub is_test_mode: bool,
    pub ballot_type: BallotType,
    // Only used when SystemSettings.ballotAuditId is enabled
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ballot_audit_id: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Invalid prelude: {0:?}")]
    InvalidPrelude([u8; 3]),

    #[error("Invalid ballot type: {0}")]
    InvalidBallotType(#[from] ParseBallotTypeError),

    #[error("Invalid precinct index: {index} (count: {count})")]
    InvalidPrecinctIndex { index: usize, count: usize },

    #[error("Invalid ballot style index: {index} (count: {count})")]
    InvalidBallotStyleIndex { index: usize, count: usize },

    #[error("Invalid ballot audit ID: {0}")]
    InvalidBallotAuditId(#[from] std::string::FromUtf8Error),

    #[error("Coding error: {0}")]
    Coding(coding::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

impl From<coding::Error> for Error {
    fn from(value: coding::Error) -> Self {
        match value {
            // hoist the `io::Error` up to avoid an extra layer of nesting
            coding::Error::IoError(e) => Error::Io(e),
            coding::Error::InvalidValue(_) => Error::Coding(value),
        }
    }
}

impl FromBitStreamWith<'_> for Metadata {
    type Context = Election;
    type Error = Error;

    fn from_reader<R: bitstream_io::BitRead + ?Sized>(
        r: &mut R,
        election: &Self::Context,
    ) -> Result<Self, Self::Error>
    where
        Self: Sized,
    {
        let prelude: [u8; 3] = r.read_to()?;
        if &prelude != HMPB_PRELUDE {
            return Err(Error::InvalidPrelude(prelude));
        }

        let ballot_hash_bytes: [u8; (BALLOT_HASH_LENGTH / HEX_BYTES_PER_CHAR) as usize] =
            r.read_to()?;
        let ballot_hash = hex::encode(ballot_hash_bytes);

        let precinct_index = PrecinctIndex::from_reader(r)?;
        let ballot_style_index = BallotStyleIndex::from_reader(r)?;
        let page_number = PageNumber::from_reader(r)?;
        let is_test_mode = r.read_bit()?;
        let ballot_type = BallotType::from_reader(r)?;
        let ballot_audit_id = if r.read_bit()? {
            let ballot_audit_id_length = BallotAuditIdLength::from_reader(r)?;
            let ballot_audit_id_bytes = r.read_to_vec(ballot_audit_id_length.get().into())?;
            Some(String::from_utf8(ballot_audit_id_bytes)?)
        } else {
            None
        };

        let precinct = election
            .precincts
            .get(precinct_index.get() as usize)
            .ok_or_else(|| Error::InvalidPrecinctIndex {
                index: precinct_index.get() as usize,
                count: election.precincts.len(),
            })?;
        let ballot_style = election
            .ballot_styles
            .get(ballot_style_index.get() as usize)
            .ok_or_else(|| Error::InvalidBallotStyleIndex {
                index: ballot_style_index.get() as usize,
                count: election.ballot_styles.len(),
            })?;

        Ok(Metadata {
            ballot_hash,
            precinct_id: precinct.id.clone(),
            ballot_style_id: ballot_style.id.clone(),
            page_number,
            is_test_mode,
            ballot_type,
            ballot_audit_id,
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
        ballot_audit_id: detected_ballot_metadata.ballot_audit_id.clone(),
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test {
    use std::{
        fs::File,
        io::{BufReader, Cursor},
        path::PathBuf,
    };

    use bitstream_io::{BigEndian, BitReader};
    use proptest::{
        prop_oneof, proptest,
        strategy::{Just, Strategy},
    };

    use super::*;

    fn arbitrary_page_number() -> impl Strategy<Value = PageNumber> {
        (PageNumber::MIN_VALUE..=PageNumber::MAX_VALUE).prop_map(PageNumber::new_unchecked)
    }

    #[test]
    fn test_decode_metadata_bits() {
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../ballot-interpreter/test/fixtures/alameda-test");
        let election_path = fixture_path.join("election.json");
        let election: Election =
            serde_json::from_reader(BufReader::new(File::open(election_path).unwrap())).unwrap();
        let ballot_audit_id = "test-audit-ballot-id";

        #[rustfmt::skip]
        let bytes = [
            // 3-byte prelude
            b'V', b'P', 2,

            // 10-byte ballot hash
            210, 122, 182, 88, 139, 24, 105, 84, 76, 222,

            // 8 bits for precinct index
            0b0000_0000,
            //PPPP PPPP

            // 5 bits for precinct index, 3 bits for ballot style index
            0b0000_0000,
            //PPPP PBBB

            // 8 bits for ballot style index
            0b0000_0000,
            //BBBB BBBB

            // 2 bits for ballot style index, 5 bits for page number, 1 bit for test mode
            0b0000_0010,
            //BBNN NNNM

            // 4 bits for ballot type, 1 bit for ballot audit ID flag, 3 bits for ballot audit ID length
            0b0000_1000,
            //TTTT FLLL

            // 5 bits for ballot audit ID length, 3 bits start of ballot audit ID
            0b1010_0011,
            //LLLL LIII

            // Rest of ballot audit ID
            163, 43, 155, 161, 107, 11, 171, 35, 75, 161, 107, 19, 11, 99, 99, 123, 161, 107, 75, 32
        ];

        let mut reader = BitReader::endian(Cursor::new(&bytes), BigEndian);
        assert_eq!(
            Metadata::from_reader(&mut reader, &election).unwrap(),
            Metadata {
                ballot_hash: "d27ab6588b1869544cde".to_string(),
                precinct_id: PrecinctId::from("precinct-1".to_string()),
                ballot_style_id: BallotStyleId::from("ballot-style-1-p1".to_string()),
                page_number: PageNumber::new_unchecked(1),
                is_test_mode: false,
                ballot_type: BallotType::Precinct,
                ballot_audit_id: Some(ballot_audit_id.to_string()),
            }
        );
    }

    #[test]
    fn test_error_empty_data() {
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../ballot-interpreter/test/fixtures/alameda-test");
        let election_path = fixture_path.join("election.json");
        let election: Election =
            serde_json::from_reader(BufReader::new(File::open(election_path).unwrap())).unwrap();
        let mut reader = BitReader::endian(Cursor::new(&[]), BigEndian);

        // TODO: use `assert_matches!` once that API is stable.
        assert!(matches!(
            Metadata::from_reader(&mut reader, &election),
            Err(Error::Io(_))
        ));
    }

    #[test]
    fn test_error_invalid_prelude() {
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../ballot-interpreter/test/fixtures/alameda-test");
        let election_path = fixture_path.join("election.json");
        let election: Election =
            serde_json::from_reader(BufReader::new(File::open(election_path).unwrap())).unwrap();
        let mut reader = BitReader::endian(Cursor::new(b"NOT"), BigEndian);

        // TODO: use `assert_matches!` once that API is stable.
        assert!(matches!(
            Metadata::from_reader(&mut reader, &election),
            Err(Error::InvalidPrelude([b'N', b'O', b'T']))
        ));
    }

    #[test]
    fn test_error_invalid_precinct_index() {
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../ballot-interpreter/test/fixtures/alameda-test");
        let election_path = fixture_path.join("election.json");
        let election: Election =
            serde_json::from_reader(BufReader::new(File::open(election_path).unwrap())).unwrap();

        #[rustfmt::skip]
        let bytes = [
            // 3-byte prelude
            b'V', b'P', 2,

            // 10-byte ballot hash
            210, 122, 182, 88, 139, 24, 105, 84, 76, 222,

            // 8 bits for precinct index
            0b0000_0000,
            //PPPP PPPP

            // 5 bits for precinct index, 3 bits for ballot style index
            0b1000_1000,
            //PPPP PBBB

            // 8 bits for ballot style index
            0b0000_0000,
            //BBBB BBBB

            // 2 bits for ballot style index, 5 bits for page number, 1 bit for test mode
            0b0000_0010,
            //BBNN NNNM

            // 4 bits for ballot type, 1 bit for ballot audit ID flag, 3 bits padding
            0b0000_0000,
            //TTTT F---
        ];

        let mut reader = BitReader::endian(Cursor::new(&bytes), BigEndian);
        let result = Metadata::from_reader(&mut reader, &election);
        assert!(
            matches!(
                result,
                Err(Error::InvalidPrecinctIndex {
                    index: 17,
                    count: 2
                })
            ),
            "Result is wrong: {result:?}"
        );
    }

    #[test]
    fn test_error_invalid_ballot_style_index() {
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../ballot-interpreter/test/fixtures/alameda-test");
        let election_path = fixture_path.join("election.json");
        let election: Election =
            serde_json::from_reader(BufReader::new(File::open(election_path).unwrap())).unwrap();

        #[rustfmt::skip]
        let bytes = [
            // 3-byte prelude
            b'V', b'P', 2,

            // 10-byte ballot hash
            210, 122, 182, 88, 139, 24, 105, 84, 76, 222,

            // 8 bits for precinct index
            0b0000_0000,
            //PPPP PPPP

            // 5 bits for precinct index, 3 bits for ballot style index
            0b0000_0000,
            //PPPP PBBB

            // 8 bits for ballot style index
            0b1000_0000,
            //BBBB BBBB

            // 2 bits for ballot style index, 5 bits for page number, 1 bit for test mode
            0b0100_0010,
            //BBNN NNNM

            // 4 bits for ballot type, 1 bit for ballot audit ID flag, 3 bits padding
            0b0000_0000,
            //TTTT F---
        ];

        let mut reader = BitReader::endian(Cursor::new(&bytes), BigEndian);
        let result = Metadata::from_reader(&mut reader, &election);

        // TODO: use `assert_matches!` once that API is stable.
        assert!(
            matches!(
                result,
                Err(Error::InvalidBallotStyleIndex {
                    index: 513,
                    count: 6
                })
            ),
            "Result is wrong: {result:?}"
        );
    }

    #[test]
    fn test_error_invalid_ballot_type() {
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../ballot-interpreter/test/fixtures/alameda-test");
        let election_path = fixture_path.join("election.json");
        let election: Election =
            serde_json::from_reader(BufReader::new(File::open(election_path).unwrap())).unwrap();

        #[rustfmt::skip]
        let bytes = [
            // 3-byte prelude
            b'V', b'P', 2,

            // 10-byte ballot hash
            210, 122, 182, 88, 139, 24, 105, 84, 76, 222,

            // 8 bits for precinct index
            0b0000_0000,
            //PPPP PPPP

            // 5 bits for precinct index, 3 bits for ballot style index
            0b0000_0000,
            //PPPP PBBB

            // 8 bits for ballot style index
            0b0000_0000,
            //BBBB BBBB

            // 2 bits for ballot style index, 5 bits for page number, 1 bit for test mode
            0b0000_0010,
            //BBNN NNNM

            // 4 bits for ballot type, 1 bit for ballot audit ID flag, 3 bits padding
            0b1111_0000,
            //TTTT F---
        ];

        let mut reader = BitReader::endian(Cursor::new(&bytes), BigEndian);
        let result = Metadata::from_reader(&mut reader, &election);

        // TODO: use `assert_matches!` once that API is stable.
        assert!(
            matches!(
                result,
                Err(Error::InvalidBallotType(
                    ParseBallotTypeError::InvalidNumericValue(0b1111)
                ))
            ),
            "Result is wrong: {result:?}"
        );
    }

    #[test]
    fn test_error_invalid_page_number() {
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../ballot-interpreter/test/fixtures/alameda-test");
        let election_path = fixture_path.join("election.json");
        let election: Election =
            serde_json::from_reader(BufReader::new(File::open(election_path).unwrap())).unwrap();

        #[rustfmt::skip]
        let bytes = [
            // 3-byte prelude
            b'V', b'P', 2,

            // 10-byte ballot hash
            210, 122, 182, 88, 139, 24, 105, 84, 76, 222,

            // 8 bits for precinct index
            0b0000_0000,
            //PPPP PPPP

            // 5 bits for precinct index, 3 bits for ballot style index
            0b0000_0000,
            //PPPP PBBB

            // 8 bits for ballot style index
            0b0000_0000,
            //BBBB BBBB

            // 2 bits for ballot style index, 5 bits for page number, 1 bit for test mode
            0b0011_1110,
            //BBNN NNNM

            // 4 bits for ballot type, 1 bit for ballot audit ID flag, 3 bits padding
            0b0000_0000,
            //TTTT F---
        ];

        let mut reader = BitReader::endian(Cursor::new(&bytes), BigEndian);
        let result = Metadata::from_reader(&mut reader, &election);

        // TODO: use `assert_matches!` once that API is stable.
        assert!(matches!(result, Err(Error::Coding(coding::Error::InvalidValue(v))) if v == "31"));
    }

    #[test]
    fn test_error_invalid_ballot_audit_id() {
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../ballot-interpreter/test/fixtures/alameda-test");
        let election_path = fixture_path.join("election.json");
        let election: Election =
            serde_json::from_reader(BufReader::new(File::open(election_path).unwrap())).unwrap();

        #[rustfmt::skip]
        let bytes = [
            // 3-byte prelude
            b'V', b'P', 2,

            // 10-byte ballot hash
            210, 122, 182, 88, 139, 24, 105, 84, 76, 222,

            // 8 bits for precinct index
            0b0000_0000,
            //PPPP PPPP

            // 5 bits for precinct index, 3 bits for ballot style index
            0b0000_0000,
            //PPPP PBBB

            // 8 bits for ballot style index
            0b0000_0000,
            //BBBB BBBB

            // 2 bits for ballot style index, 5 bits for page number, 1 bit for test mode
            0b0000_0010,
            //BBNN NNNM

            // 4 bits for ballot type, 1 bit for ballot audit ID flag, 3 bits for ballot audit ID length
            0b0000_1000,
            //TTTT FLLL

            // 5 bits for ballot audit ID length, 3 bits start of ballot audit ID
            0b1010_0011,
            //LLLL LIII

            // Rest of ballot audit ID (with invalid UTF-8 char at beginning)
            255, 43, 155, 161, 107, 11, 171, 35, 75, 161, 107, 19, 11, 99, 99, 123, 161, 107, 75, 32
        ];

        let mut reader = BitReader::endian(Cursor::new(&bytes), BigEndian);
        let result = Metadata::from_reader(&mut reader, &election);

        // TODO: use `assert_matches!` once that API is stable.
        assert!(matches!(result, Err(Error::InvalidBallotAuditId(_))));
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
            ballot_type in arbitrary_ballot_type(),
            ballot_audit_id in proptest::option::of("[0-9a-z-]{1,100}"),
        ) {
            let detected_metadata = Metadata {
                ballot_hash,
                precinct_id: PrecinctId::from(precinct_id),
                ballot_style_id: BallotStyleId::from(ballot_style_id),
                page_number,
                is_test_mode,
                ballot_type,
                ballot_audit_id
            };

            // The inferred page number should be one less or one more than the detected page number.
            let inferred_metadata = infer_missing_page_metadata(&detected_metadata);
            assert_eq!(u8::abs_diff(inferred_metadata.page_number.get(), detected_metadata.page_number.get()), 1);

            assert_eq!(inferred_metadata.ballot_hash, detected_metadata.ballot_hash);
            assert_eq!(inferred_metadata.precinct_id, detected_metadata.precinct_id);
            assert_eq!(inferred_metadata.ballot_style_id, detected_metadata.ballot_style_id);
            assert_eq!(inferred_metadata.is_test_mode, detected_metadata.is_test_mode);
            assert_eq!(inferred_metadata.ballot_type, detected_metadata.ballot_type);
            assert_eq!(inferred_metadata.ballot_audit_id, detected_metadata.ballot_audit_id);
        }
    }
}
