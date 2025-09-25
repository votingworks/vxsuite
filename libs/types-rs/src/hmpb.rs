use bitstream_io::{FromBitStreamWith, ToBitStream, ToBitStreamWith};
use serde::{Deserialize, Serialize};

use crate::{
    ballot_card::{
        BallotAuditIdLength, BallotStyleByIndex, BallotType, BallotTypeCodingError, IndexError,
        PageNumber, PrecinctByIndex,
    },
    coding,
    election::{BallotStyleId, Election, PrecinctId},
};

/// Contains metadata about a particular ballot configuration, and is
/// encoded into the QR code for ballots using that configuration.
///
/// Use [`coding::encode_with`] and [`coding::decode_with`] to encode and decode
/// this struct for use in QR codes, using an [`Election`] as the context.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Metadata {
    #[serde(with = "ballot_hash_serde")]
    pub ballot_hash: PartialBallotHash,
    pub precinct_id: PrecinctId,
    pub ballot_style_id: BallotStyleId,
    pub page_number: PageNumber,
    pub is_test_mode: bool,
    pub ballot_type: BallotType,
    // Only used when SystemSettings.ballotAuditId is enabled
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ballot_audit_id: Option<String>,
}

/// Provides serialization and deserialization for [`PartialBallotHash`],
/// primarily for serializing to JSON as a hex string.
///
/// ```
/// # use types_rs::hmpb::PartialBallotHash;
/// # use serde::{Serialize, Deserialize};
/// #[derive(Debug, Serialize, Deserialize)]
/// struct MyContainer {
///     #[serde(with = "types_rs::hmpb::ballot_hash_serde")]
///     hash: PartialBallotHash,
/// }
/// let value = MyContainer { hash: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] };
/// let json = serde_json::to_string(&value).unwrap();
/// assert_eq!(json, "{\"hash\":\"00010203040506070809\"}");
///
/// let deserialized_value: MyContainer = serde_json::from_str(&json).unwrap();
/// assert_eq!(deserialized_value.hash, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
/// ```
pub mod ballot_hash_serde {
    use serde::{Deserialize, Deserializer, Serializer};

    use super::{PartialBallotHash, PARTIAL_BALLOT_HASH_BYTE_LENGTH};

    pub fn serialize<S>(ballot_hash: &PartialBallotHash, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&hex::encode(ballot_hash))
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<PartialBallotHash, D::Error>
    where
        D: Deserializer<'de>,
    {
        let ballot_hash = String::deserialize(deserializer)?;
        match hex::decode(&ballot_hash) {
            Ok(mut ballot_hash_bytes) => {
                ballot_hash_bytes.truncate(PARTIAL_BALLOT_HASH_BYTE_LENGTH);
                PartialBallotHash::try_from(ballot_hash_bytes).map_err(|_| {
                    serde::de::Error::custom(format!("invalid hex string: {ballot_hash}"))
                })
            }
            Err(err) => Err(serde::de::Error::custom(err)),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Invalid prelude: {0:?}")]
    InvalidPrelude([u8; 3]),

    #[error("Invalid ballot type: {0}")]
    InvalidBallotType(#[from] BallotTypeCodingError),

    #[error("Index error: {0}")]
    Index(#[from] IndexError),

    #[error("Invalid precinct ID: {0}")]
    InvalidPrecinctId(PrecinctId),

    #[error("Invalid ballot style ID: {0}")]
    InvalidBallotStyleId(BallotStyleId),

    #[error("Invalid ballot audit ID: {0}")]
    InvalidBallotAuditId(String),

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
        if &prelude != PRELUDE {
            return Err(Error::InvalidPrelude(prelude));
        }

        let ballot_hash: PartialBallotHash = r.read_to()?;
        let precinct_index: PrecinctByIndex = r.parse_with(election)?;
        let ballot_style_index: BallotStyleByIndex = r.parse_with(election)?;
        let page_number: PageNumber = r.parse()?;
        let is_test_mode = r.read_bit()?;
        let ballot_type: BallotType = r.parse()?;
        let ballot_audit_id = if r.read_bit()? {
            let ballot_audit_id_length: BallotAuditIdLength = r.parse()?;
            let ballot_audit_id_bytes = r.read_to_vec(ballot_audit_id_length.get().into())?;
            Some(
                String::from_utf8(ballot_audit_id_bytes)
                    .map_err(|err| Error::InvalidBallotAuditId(err.to_string()))?,
            )
        } else {
            None
        };

        let precinct = precinct_index.precinct();
        let ballot_style = ballot_style_index.ballot_style();

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

impl ToBitStreamWith<'_> for Metadata {
    type Context = Election;
    type Error = Error;

    fn to_writer<W: bitstream_io::BitWrite + ?Sized>(
        &self,
        w: &mut W,
        context: &Self::Context,
    ) -> Result<(), Self::Error>
    where
        Self: Sized,
    {
        w.write_bytes(PRELUDE)?;
        w.write_bytes(&self.ballot_hash)?;

        let precinct_index = context
            .precinct_index(&self.precinct_id)
            .ok_or_else(|| Error::InvalidPrecinctId(self.precinct_id.clone()))?;
        precinct_index.to_writer(w)?;

        let ballot_style_index = context
            .ballot_style_index(&self.ballot_style_id)
            .ok_or_else(|| Error::InvalidBallotStyleId(self.ballot_style_id.clone()))?;
        ballot_style_index.to_writer(w)?;

        self.page_number.to_writer(w)?;
        w.write_bit(self.is_test_mode)?;
        self.ballot_type.to_writer(w)?;

        match self.ballot_audit_id {
            Some(ref ballot_audit_id) => {
                w.write_bit(true)?;
                let Ok(ballot_audit_id_length) = u8::try_from(ballot_audit_id.len()) else {
                    return Err(Error::InvalidBallotAuditId(ballot_audit_id.clone()));
                };
                let Some(ballot_audit_id_length) = BallotAuditIdLength::new(ballot_audit_id_length)
                else {
                    return Err(Error::InvalidBallotAuditId(ballot_audit_id.clone()));
                };
                ballot_audit_id_length.to_writer(w)?;
                w.write_bytes(ballot_audit_id.as_bytes())?;
            }

            None => w.write_bit(false)?,
        }

        Ok(())
    }
}

/// The number of bytes of the full ballot hash to use in an encoded [`Metadata`].
pub const PARTIAL_BALLOT_HASH_BYTE_LENGTH: usize = 10;

/// The partial ballot hash used in an encoded [`Metadata`].
pub type PartialBallotHash = [u8; PARTIAL_BALLOT_HASH_BYTE_LENGTH];

/// The first bytes of an encoded [`Metadata`].
pub const PRELUDE: &[u8; 3] = b"VP\x02";

#[must_use]
pub fn infer_missing_page_metadata(detected_ballot_metadata: &Metadata) -> Metadata {
    Metadata {
        ballot_hash: detected_ballot_metadata.ballot_hash,
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

    use bitstream_io::{BigEndian, BitRead, BitReader, BitWrite};
    use proptest::{
        prop_oneof, proptest,
        strategy::{Just, Strategy},
    };

    use crate::coding::{collect_writes, encode_with};

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
            0x2b, 0xad, 0x6b, 0xe9, 0x35, 0xdd, 0x46, 0xb1, 0x0c, 0x5f,

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
        let metadata: Metadata = reader.parse_with(&election).unwrap();
        assert_eq!(
            metadata,
            Metadata {
                ballot_hash: [0x2b, 0xad, 0x6b, 0xe9, 0x35, 0xdd, 0x46, 0xb1, 0x0c, 0x5f],
                precinct_id: PrecinctId::from("precinct-1".to_owned()),
                ballot_style_id: BallotStyleId::from("ballot-style-1-p1".to_owned()),
                page_number: PageNumber::new_unchecked(1),
                is_test_mode: false,
                ballot_type: BallotType::Precinct,
                ballot_audit_id: Some(ballot_audit_id.to_owned()),
            }
        );
        let reencoded_bytes = encode_with(&metadata, &election).unwrap();
        assert_eq!(reencoded_bytes, bytes);
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
            reader.parse_with::<Metadata>(&election),
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
            reader.parse_with::<Metadata>(&election),
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
            0x2b, 0xad, 0x6b, 0xe9, 0x35, 0xdd, 0x46, 0xb1, 0x0c, 0x5f,

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
        let result = reader.parse_with::<Metadata>(&election);
        assert!(
            matches!(result, Err(Error::Index(IndexError::Precinct(index))) if index.get() == 17),
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
            0x2b, 0xad, 0x6b, 0xe9, 0x35, 0xdd, 0x46, 0xb1, 0x0c, 0x5f,

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
        let result = reader.parse_with::<Metadata>(&election);

        // TODO: use `assert_matches!` once that API is stable.
        assert!(
            matches!(
                result,
                Err(Error::Index(IndexError::BallotStyle(index))) if index.get() == 513
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
            0x2b, 0xad, 0x6b, 0xe9, 0x35, 0xdd, 0x46, 0xb1, 0x0c, 0x5f,

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
        let result = reader.parse_with::<Metadata>(&election);

        // TODO: use `assert_matches!` once that API is stable.
        assert!(
            matches!(
                result,
                Err(Error::InvalidBallotType(
                    BallotTypeCodingError::InvalidNumericValue(0b1111)
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
            0x2b, 0xad, 0x6b, 0xe9, 0x35, 0xdd, 0x46, 0xb1, 0x0c, 0x5f,

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
        let result = reader.parse_with::<Metadata>(&election);

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
            0x2b, 0xad, 0x6b, 0xe9, 0x35, 0xdd, 0x46, 0xb1, 0x0c, 0x5f,

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
        let result = reader.parse_with::<Metadata>(&election);

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
        fn test_ballot_audit_id_coding(ballot_audit_id in "[0-9a-z-]{1,100}") {
            let ballot_audit_id_length = BallotAuditIdLength::new(ballot_audit_id.len() as u8).unwrap();
            let bytes = collect_writes::<coding::Error>(|mut writer| {
                ballot_audit_id_length.to_writer(&mut writer)?;
                Ok(writer.write_bytes(ballot_audit_id.as_bytes())?)
            }).unwrap();

            let mut reader = BitReader::endian(Cursor::new(&bytes), BigEndian);
            let decoded_ballot_audit_id_length: BallotAuditIdLength = reader.parse().unwrap();
            assert_eq!(decoded_ballot_audit_id_length, ballot_audit_id_length);

            let decoded_ballot_audit_id = String::from_utf8(reader.read_to_vec(decoded_ballot_audit_id_length.get() as usize).unwrap()).unwrap();
            assert_eq!(decoded_ballot_audit_id, ballot_audit_id);
        }

        #[test]
        fn test_infer_missing_page_metadata(
            page_number in arbitrary_page_number(),
            ballot_hash: PartialBallotHash,
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
