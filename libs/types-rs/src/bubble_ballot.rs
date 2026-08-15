use bitstream_io::{FromBitStreamWith, ToBitStreamWith};
use serde::{Deserialize, Serialize};

use crate::{
    ballot_card::{
        BallotAuditIdLength, BallotStyleByIndex, BallotStyleIndex, BallotStyleIndexV4p0,
        BallotType, BallotTypeCodingError, IndexError, PageNumber, PrecinctByIndex,
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

impl Metadata {
    /// Returns the list of fields whose values differ between `self` and
    /// `other` when interpreted as the two sides of a single bubble ballot
    /// sheet. An empty list means the two sides are consistent.
    #[must_use]
    pub fn match_sheet_with_metadata(&self, other: &Self) -> Vec<MetadataMismatch> {
        let mut mismatches = vec![];

        if self.ballot_hash != other.ballot_hash {
            mismatches.push(MetadataMismatch::BallotHash {
                side_a: self.ballot_hash,
                side_b: other.ballot_hash,
            });
        }

        if self.precinct_id != other.precinct_id {
            mismatches.push(MetadataMismatch::PrecinctId {
                side_a: self.precinct_id.clone(),
                side_b: other.precinct_id.clone(),
            });
        }

        if self.ballot_style_id != other.ballot_style_id {
            mismatches.push(MetadataMismatch::BallotStyleId {
                side_a: self.ballot_style_id.clone(),
                side_b: other.ballot_style_id.clone(),
            });
        }

        if self.page_number != other.page_number.opposite() {
            mismatches.push(MetadataMismatch::PageNumber {
                side_a: self.page_number,
                side_b: other.page_number,
            });
        }

        if self.is_test_mode != other.is_test_mode {
            mismatches.push(MetadataMismatch::IsTestMode {
                side_a: self.is_test_mode,
                side_b: other.is_test_mode,
            });
        }

        if self.ballot_type != other.ballot_type {
            mismatches.push(MetadataMismatch::BallotType {
                side_a: self.ballot_type,
                side_b: other.ballot_type,
            });
        }

        if self.ballot_audit_id != other.ballot_audit_id {
            mismatches.push(MetadataMismatch::BallotAuditId {
                side_a: self.ballot_audit_id.clone(),
                side_b: other.ballot_audit_id.clone(),
            });
        }

        mismatches
    }
}

/// Identifies a single field that differs between the two sides of a bubble
/// ballot sheet, carrying the value found on each side.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum MetadataMismatch {
    #[serde(rename_all = "camelCase")]
    BallotHash {
        #[serde(with = "ballot_hash_serde")]
        side_a: PartialBallotHash,
        #[serde(with = "ballot_hash_serde")]
        side_b: PartialBallotHash,
    },
    #[serde(rename_all = "camelCase")]
    PrecinctId {
        side_a: PrecinctId,
        side_b: PrecinctId,
    },
    #[serde(rename_all = "camelCase")]
    BallotStyleId {
        side_a: BallotStyleId,
        side_b: BallotStyleId,
    },
    #[serde(rename_all = "camelCase")]
    PageNumber {
        side_a: PageNumber,
        side_b: PageNumber,
    },
    #[serde(rename_all = "camelCase")]
    IsTestMode { side_a: bool, side_b: bool },
    #[serde(rename_all = "camelCase")]
    BallotType {
        side_a: BallotType,
        side_b: BallotType,
    },
    #[serde(rename_all = "camelCase")]
    BallotAuditId {
        side_a: Option<String>,
        side_b: Option<String>,
    },
}

/// Provides serialization and deserialization for [`PartialBallotHash`],
/// primarily for serializing to JSON as a hex string.
///
/// ```
/// # use types_rs::bubble_ballot::PartialBallotHash;
/// # use serde::{Serialize, Deserialize};
/// #[derive(Debug, Serialize, Deserialize)]
/// struct MyContainer {
///     #[serde(with = "types_rs::bubble_ballot::ballot_hash_serde")]
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

    /// Serialize a `PartialBallotHash` as a hexadecimal string.
    ///
    /// # Errors
    ///
    /// Returns an error if serialization of the hexadecimal string fails.
    pub fn serialize<S>(ballot_hash: &PartialBallotHash, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&hex::encode(ballot_hash))
    }

    /// Deserialize a `PartialBallotHash` from a hexadecimal string, truncating
    /// it if necessary.
    ///
    /// # Errors
    ///
    /// Returns an error if deserialization of the string fails, or if the
    /// string is not a valid hexadecimal string.
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

/// The `VxSuite` version an encoded [`Metadata`] targets. `VxDesign` still
/// renders v4.0 ballots, which use a different prelude and a narrower ballot
/// style index than v4.1.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum SoftwareVersion {
    #[serde(rename = "v4.0")]
    V4p0,
    #[default]
    #[serde(rename = "v4.1")]
    V4p1,
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Invalid prelude: {0:?}")]
    InvalidPrelude([u8; 3]),

    #[error("Ballot style index {index} is too large to encode as {version:?}")]
    BallotStyleIndexTooLargeForVersion {
        index: BallotStyleIndex,
        version: SoftwareVersion,
    },

    #[error("Invalid ballot type: {0}")]
    InvalidBallotType(#[from] BallotTypeCodingError),

    #[error("Invalid ballot hash: {actual:02x?} (expected {expected:02x?})")]
    InvalidBallotHash {
        expected: PartialBallotHash,
        actual: PartialBallotHash,
    },

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

impl<'a> FromBitStreamWith<'a> for Metadata {
    type Context = (&'a Election, PartialBallotHash);
    type Error = Error;

    fn from_reader<R: bitstream_io::BitRead + ?Sized>(
        r: &mut R,
        (election, expected_ballot_hash): &Self::Context,
    ) -> Result<Self, Self::Error>
    where
        Self: Sized,
    {
        let prelude: [u8; 3] = r.read_to()?;
        if &prelude != PRELUDE {
            return Err(Error::InvalidPrelude(prelude));
        }

        let ballot_hash: PartialBallotHash = r.read_to()?;
        if ballot_hash != *expected_ballot_hash {
            return Err(Error::InvalidBallotHash {
                expected: *expected_ballot_hash,
                actual: ballot_hash,
            });
        }

        let precinct_index: PrecinctByIndex = r.parse_with(*election)?;
        let ballot_style_index: BallotStyleByIndex = r.parse_with(*election)?;
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

impl<'a> ToBitStreamWith<'a> for Metadata {
    type Context = (&'a Election, SoftwareVersion);
    type Error = Error;

    fn to_writer<W: bitstream_io::BitWrite + ?Sized>(
        &self,
        w: &mut W,
        (election, version): &Self::Context,
    ) -> Result<(), Self::Error>
    where
        Self: Sized,
    {
        w.write_bytes(match version {
            SoftwareVersion::V4p0 => PRELUDE_V4P0,
            SoftwareVersion::V4p1 => PRELUDE,
        })?;
        w.write_bytes(&self.ballot_hash)?;

        let precinct_index = election
            .precinct_index(&self.precinct_id)
            .ok_or_else(|| Error::InvalidPrecinctId(self.precinct_id.clone()))?;
        w.build(&precinct_index)?;

        let ballot_style_index = election
            .ballot_style_index(&self.ballot_style_id)
            .ok_or_else(|| Error::InvalidBallotStyleId(self.ballot_style_id.clone()))?;
        match version {
            SoftwareVersion::V4p0 => {
                let ballot_style_index = BallotStyleIndexV4p0::new(ballot_style_index.get())
                    .ok_or(Error::BallotStyleIndexTooLargeForVersion {
                        index: ballot_style_index,
                        version: *version,
                    })?;
                w.build(&ballot_style_index)?;
            }
            SoftwareVersion::V4p1 => w.build(&ballot_style_index)?,
        }

        w.build(&self.page_number)?;
        w.write_bit(self.is_test_mode)?;
        w.build(&self.ballot_type)?;

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
                w.build(&ballot_audit_id_length)?;
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
pub const PRELUDE: &[u8; 3] = b"VB\x01";

/// The first bytes of a v4.0 encoded bubble ballot metadata. [`Metadata`] does
/// not decode this format, but `VxDesign` still renders it, so payloads
/// starting with it can appear on scanned ballots and must be recognized as
/// ours.
pub const PRELUDE_V4P0: &[u8; 3] = b"VP\x02";

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
    use crate::election::BallotStyle;

    use super::*;

    fn arbitrary_page_number() -> impl Strategy<Value = PageNumber> {
        (PageNumber::MIN_VALUE..=PageNumber::MAX_VALUE).prop_map(PageNumber::new_unchecked)
    }

    fn sample_metadata() -> Metadata {
        Metadata {
            ballot_hash: [0; PARTIAL_BALLOT_HASH_BYTE_LENGTH],
            precinct_id: PrecinctId::from("precinct-1".to_owned()),
            ballot_style_id: BallotStyleId::from("ballot-style-1".to_owned()),
            page_number: PageNumber::new_unchecked(1),
            is_test_mode: false,
            ballot_type: BallotType::Precinct,
            ballot_audit_id: None,
        }
    }

    #[test]
    fn test_decode_metadata_bits() {
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../ballot-interpreter/test/fixtures/alameda-test");
        let election_path = fixture_path.join("election.json");
        let election: Election =
            serde_json::from_reader(BufReader::new(File::open(election_path).unwrap())).unwrap();
        let ballot_audit_id = "test-audit-ballot-id";
        let ballot_hash: PartialBallotHash =
            [0x2b, 0xad, 0x6b, 0xe9, 0x35, 0xdd, 0x46, 0xb1, 0x0c, 0x5f];

        let mut bytes = vec![
            // 3-byte prelude
            b'V', b'B', 1,
        ];

        // 10-byte ballot hash
        bytes.extend_from_slice(&ballot_hash);

        #[rustfmt::skip]
        bytes.extend_from_slice(&[
            // 8 bits for precinct index
            0b0000_0000,
            //PPPP PPPP

            // 5 bits for precinct index, 3 bits for ballot style index
            0b0000_0000,
            //PPPP PBBB

            // 8 bits for ballot style index
            0b0000_0000,
            //BBBB BBBB

            // 5 bits for ballot style index, 3 bits for page number
            0b0000_0000,
            //BBBB BNNN

            // 2 bits for page number, 1 bit for test mode, 4 bits for ballot type, 1 bit for ballot audit ID flag
            0b0100_0001,
            //NNMT TTTF

            // 8 bits for ballot audit ID length
            0b0001_0100,
            //LLLL LLLL

            // Ballot audit ID ("test-audit-ballot-id")
            116, 101, 115, 116, 45, 97, 117, 100, 105, 116, 45, 98, 97, 108, 108, 111, 116, 45, 105, 100
        ]);

        let mut reader = BitReader::endian(Cursor::new(&bytes), BigEndian);
        let metadata: Metadata = reader.parse_with(&(&election, ballot_hash)).unwrap();
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
        let reencoded_bytes = encode_with(&metadata, &(&election, SoftwareVersion::V4p1)).unwrap();
        assert_eq!(reencoded_bytes, bytes);
    }

    fn alameda_test_election() -> Election {
        let election_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../ballot-interpreter/test/fixtures/alameda-test/election.json");
        serde_json::from_reader(BufReader::new(File::open(election_path).unwrap())).unwrap()
    }

    /// Expected bytes come from the TypeScript encoder
    /// (`encodeHmpbBallotPageMetadata` in `libs/ballot-encoder`), which is
    /// still the only producer of ballots in the field. v4.0 differs from v4.1
    /// in the prelude and in giving the ballot style index 13 bits rather than
    /// 16, which shifts every field after it.
    #[test]
    fn test_encode_metadata_matches_typescript() {
        let election = alameda_test_election();
        let ballot_hash: PartialBallotHash =
            [0x2b, 0xad, 0x6b, 0xe9, 0x35, 0xdd, 0x46, 0xb1, 0x0c, 0x5f];

        let first = Metadata {
            ballot_hash,
            precinct_id: PrecinctId::from("precinct-1".to_owned()),
            ballot_style_id: BallotStyleId::from("ballot-style-1-p1".to_owned()),
            page_number: PageNumber::new_unchecked(1),
            is_test_mode: false,
            ballot_type: BallotType::Precinct,
            ballot_audit_id: None,
        };

        // ballot style index 0, precinct index 0
        assert_eq!(
            encode_with(&first, &(&election, SoftwareVersion::V4p0)).unwrap(),
            vec![
                0x56, 0x50, 0x02, 0x2b, 0xad, 0x6b, 0xe9, 0x35, 0xdd, 0x46, 0xb1, 0x0c, 0x5f, 0x00,
                0x00, 0x00, 0x02, 0x00
            ]
        );
        assert_eq!(
            encode_with(&first, &(&election, SoftwareVersion::V4p1)).unwrap(),
            vec![
                0x56, 0x42, 0x01, 0x2b, 0xad, 0x6b, 0xe9, 0x35, 0xdd, 0x46, 0xb1, 0x0c, 0x5f, 0x00,
                0x00, 0x00, 0x00, 0x40
            ]
        );

        let second = Metadata {
            ballot_hash,
            precinct_id: PrecinctId::from("precinct-2".to_owned()),
            ballot_style_id: BallotStyleId::from("ballot-style-3-p2".to_owned()),
            page_number: PageNumber::new_unchecked(3),
            is_test_mode: true,
            ballot_type: BallotType::Absentee,
            ballot_audit_id: None,
        };

        // ballot style index 5, precinct index 1: a nonzero index, so the two
        // versions disagree about more than where the later fields land
        assert_eq!(
            encode_with(&second, &(&election, SoftwareVersion::V4p0)).unwrap(),
            vec![
                0x56, 0x50, 0x02, 0x2b, 0xad, 0x6b, 0xe9, 0x35, 0xdd, 0x46, 0xb1, 0x0c, 0x5f, 0x00,
                0x08, 0x01, 0x47, 0x10
            ]
        );
        assert_eq!(
            encode_with(&second, &(&election, SoftwareVersion::V4p1)).unwrap(),
            vec![
                0x56, 0x42, 0x01, 0x2b, 0xad, 0x6b, 0xe9, 0x35, 0xdd, 0x46, 0xb1, 0x0c, 0x5f, 0x00,
                0x08, 0x00, 0x28, 0xe2
            ]
        );
    }

    #[test]
    fn test_v4p0_ballot_style_index_is_narrower() {
        assert_eq!(BallotStyleIndex::BITS, 16);
        assert_eq!(BallotStyleIndexV4p0::BITS, 13);
        assert!(BallotStyleIndexV4p0::new(4096).is_some());
        assert!(BallotStyleIndexV4p0::new(4097).is_none());
    }

    #[test]
    fn test_encode_v4p0_rejects_ballot_style_index_it_cannot_fit() {
        let mut election = alameda_test_election();
        let ballot_style = election.ballot_styles[0].clone();
        let ballot_style_id = BallotStyleId::from("way-out-there".to_owned());
        election.ballot_styles = std::iter::repeat_n(ballot_style, 4097).collect();
        election.ballot_styles.push(BallotStyle {
            id: ballot_style_id.clone(),
            ..election.ballot_styles[0].clone()
        });

        let metadata = Metadata {
            ballot_hash: [0; 10],
            precinct_id: PrecinctId::from("precinct-1".to_owned()),
            ballot_style_id,
            page_number: PageNumber::new_unchecked(1),
            is_test_mode: false,
            ballot_type: BallotType::Precinct,
            ballot_audit_id: None,
        };

        // v4.1 has the bits to spare; v4.0 does not
        assert!(encode_with(&metadata, &(&election, SoftwareVersion::V4p1)).is_ok());
        assert!(matches!(
            encode_with(&metadata, &(&election, SoftwareVersion::V4p0)),
            Err(Error::BallotStyleIndexTooLargeForVersion { .. })
        ));
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
            reader.parse_with::<Metadata>(&(&election, PartialBallotHash::default())),
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
            reader.parse_with::<Metadata>(&(&election, PartialBallotHash::default())),
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
        let ballot_hash: PartialBallotHash =
            [0x2b, 0xad, 0x6b, 0xe9, 0x35, 0xdd, 0x46, 0xb1, 0x0c, 0x5f];

        let mut bytes = vec![
            // 3-byte prelude
            b'V', b'B', 1,
        ];

        // 10-byte ballot hash
        bytes.extend_from_slice(&ballot_hash);

        #[rustfmt::skip]
        bytes.extend_from_slice(&[
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
        ]);

        let mut reader = BitReader::endian(Cursor::new(&bytes), BigEndian);
        let result = reader.parse_with::<Metadata>(&(&election, ballot_hash));
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

        let ballot_hash = [0x2b, 0xad, 0x6b, 0xe9, 0x35, 0xdd, 0x46, 0xb1, 0x0c, 0x5f];

        let mut bytes = vec![
            // 3-byte prelude
            b'V', b'B', 1,
        ];

        // 10-byte ballot hash
        bytes.extend_from_slice(&ballot_hash);

        #[rustfmt::skip]
        bytes.extend_from_slice(&[
            // 8 bits for precinct index
            0b0000_0000,
            //PPPP PPPP

            // 5 bits for precinct index, 3 bits for ballot style index
            0b0000_0000,
            //PPPP PBBB

            // 8 bits for ballot style index
            0b0001_0000,
            //BBBB BBBB

            // 5 bits for ballot style index, 3 bits for page number
            0b0000_1000,
            //BBBB BNNN

            // 2 bits for page number, 1 bit for test mode, 4 bits for ballot type, 1 bit for ballot audit ID flag
            0b0000_0000,
            //NNMT TTTF
        ]);

        let mut reader = BitReader::endian(Cursor::new(&bytes), BigEndian);
        let result = reader.parse_with::<Metadata>(&(&election, ballot_hash));

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
        let ballot_hash = [0x2b, 0xad, 0x6b, 0xe9, 0x35, 0xdd, 0x46, 0xb1, 0x0c, 0x5f];

        let mut bytes = vec![
            // 3-byte prelude
            b'V', b'B', 1,
        ];

        // 10-byte ballot hash
        bytes.extend_from_slice(&ballot_hash);

        #[rustfmt::skip]
        bytes.extend_from_slice(&[
            // 8 bits for precinct index
            0b0000_0000,
            //PPPP PPPP

            // 5 bits for precinct index, 3 bits for ballot style index
            0b0000_0000,
            //PPPP PBBB

            // 8 bits for ballot style index
            0b0000_0000,
            //BBBB BBBB

            // 5 bits for ballot style index, 3 bits for page number
            0b0000_0000,
            //BBBB BNNN

            // 2 bits for page number, 1 bit for test mode, 4 bits for ballot type, 1 bit for ballot audit ID flag
            0b0101_1110,
            //NNMT TTTF
        ]);

        let mut reader = BitReader::endian(Cursor::new(&bytes), BigEndian);
        let result = reader.parse_with::<Metadata>(&(&election, ballot_hash));

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
        let ballot_hash = [0x2b, 0xad, 0x6b, 0xe9, 0x35, 0xdd, 0x46, 0xb1, 0x0c, 0x5f];

        let mut bytes = vec![
            // 3-byte prelude
            b'V', b'B', 1,
        ];

        // 10-byte ballot hash
        bytes.extend_from_slice(&ballot_hash);

        #[rustfmt::skip]
        bytes.extend_from_slice(&[
            // 8 bits for precinct index
            0b0000_0000,
            //PPPP PPPP

            // 5 bits for precinct index, 3 bits for ballot style index
            0b0000_0000,
            //PPPP PBBB

            // 8 bits for ballot style index
            0b0000_0000,
            //BBBB BBBB

            // 5 bits for ballot style index, 3 bits for page number
            0b0000_0111,
            //BBBB BNNN

            // 2 bits for page number, 1 bit for test mode, 4 bits for ballot type, 1 bit for ballot audit ID flag
            0b1100_0000,
            //NNMT TTTF
        ]);

        let mut reader = BitReader::endian(Cursor::new(&bytes), BigEndian);
        let result = reader.parse_with::<Metadata>(&(&election, ballot_hash));

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
        let ballot_hash = [0x2b, 0xad, 0x6b, 0xe9, 0x35, 0xdd, 0x46, 0xb1, 0x0c, 0x5f];

        let mut bytes = vec![
            // 3-byte prelude
            b'V', b'B', 1,
        ];

        // 10-byte ballot hash
        bytes.extend_from_slice(&ballot_hash);

        #[rustfmt::skip]
        bytes.extend_from_slice(&[
            // 8 bits for precinct index
            0b0000_0000,
            //PPPP PPPP

            // 5 bits for precinct index, 3 bits for ballot style index
            0b0000_0000,
            //PPPP PBBB

            // 8 bits for ballot style index
            0b0000_0000,
            //BBBB BBBB

            // 5 bits for ballot style index, 3 bits for page number
            0b0000_0000,
            //BBBB BNNN

            // 2 bits for page number, 1 bit for test mode, 4 bits for ballot type, 1 bit for ballot audit ID flag
            0b0100_0001,
            //NNMT TTTF

            // 8 bits for ballot audit ID length
            0b0001_0100,
            //LLLL LLLL

            // Ballot audit ID (with invalid UTF-8 char at beginning)
            255, 101, 115, 116, 45, 97, 117, 100, 105, 116, 45, 98, 97, 108, 108, 111, 116, 45, 105, 100
        ]);

        let mut reader = BitReader::endian(Cursor::new(&bytes), BigEndian);
        let result = reader.parse_with::<Metadata>(&(&election, ballot_hash));

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

    #[test]
    fn test_match_sheet_with_metadata_no_mismatches() {
        let front = sample_metadata();
        let back = Metadata {
            page_number: front.page_number.opposite(),
            ..front.clone()
        };
        assert!(front.match_sheet_with_metadata(&back).is_empty());
        // The relation is symmetric: it doesn't matter which side calls.
        assert!(back.match_sheet_with_metadata(&front).is_empty());
    }

    #[test]
    fn test_match_sheet_with_metadata_identical_sides_only_mismatch_page_number() {
        // Identical metadata fails only the page-number check, because both
        // sides claim the same page number rather than opposite ones.
        let m = sample_metadata();
        let mismatches = m.match_sheet_with_metadata(&m);
        assert!(
            matches!(
                mismatches.as_slice(),
                [MetadataMismatch::PageNumber { side_a, side_b }]
                    if *side_a == m.page_number && *side_b == m.page_number
            ),
            "unexpected mismatches: {mismatches:?}"
        );
    }

    #[test]
    fn test_match_sheet_with_metadata_ballot_hash_mismatch() {
        let front = sample_metadata();
        let back = Metadata {
            ballot_hash: [0xff; PARTIAL_BALLOT_HASH_BYTE_LENGTH],
            page_number: front.page_number.opposite(),
            ..front.clone()
        };
        let mismatches = front.match_sheet_with_metadata(&back);
        assert!(
            matches!(
                mismatches.as_slice(),
                [MetadataMismatch::BallotHash { side_a, side_b }]
                    if *side_a == front.ballot_hash && *side_b == back.ballot_hash
            ),
            "unexpected mismatches: {mismatches:?}"
        );
    }

    #[test]
    fn test_match_sheet_with_metadata_precinct_id_mismatch() {
        let front = sample_metadata();
        let back = Metadata {
            precinct_id: PrecinctId::from("precinct-2".to_owned()),
            page_number: front.page_number.opposite(),
            ..front.clone()
        };
        let mismatches = front.match_sheet_with_metadata(&back);
        assert!(
            matches!(
                mismatches.as_slice(),
                [MetadataMismatch::PrecinctId { side_a, side_b }]
                    if *side_a == front.precinct_id && *side_b == back.precinct_id
            ),
            "unexpected mismatches: {mismatches:?}"
        );
    }

    #[test]
    fn test_match_sheet_with_metadata_ballot_style_id_mismatch() {
        let front = sample_metadata();
        let back = Metadata {
            ballot_style_id: BallotStyleId::from("ballot-style-2".to_owned()),
            page_number: front.page_number.opposite(),
            ..front.clone()
        };
        let mismatches = front.match_sheet_with_metadata(&back);
        assert!(
            matches!(
                mismatches.as_slice(),
                [MetadataMismatch::BallotStyleId { side_a, side_b }]
                    if *side_a == front.ballot_style_id && *side_b == back.ballot_style_id
            ),
            "unexpected mismatches: {mismatches:?}"
        );
    }

    #[test]
    fn test_match_sheet_with_metadata_page_number_from_different_sheets() {
        // Front is page 1 (sheet 1), back is page 4 (sheet 2): not opposite.
        let front = sample_metadata();
        let back = Metadata {
            page_number: PageNumber::new_unchecked(4),
            ..front.clone()
        };
        let mismatches = front.match_sheet_with_metadata(&back);
        assert!(
            matches!(
                mismatches.as_slice(),
                [MetadataMismatch::PageNumber { side_a, side_b }]
                    if *side_a == front.page_number && *side_b == back.page_number
            ),
            "unexpected mismatches: {mismatches:?}"
        );
    }

    #[test]
    fn test_match_sheet_with_metadata_is_test_mode_mismatch() {
        let front = sample_metadata();
        let back = Metadata {
            is_test_mode: !front.is_test_mode,
            page_number: front.page_number.opposite(),
            ..front.clone()
        };
        let mismatches = front.match_sheet_with_metadata(&back);
        assert!(
            matches!(
                mismatches.as_slice(),
                [MetadataMismatch::IsTestMode { side_a, side_b }]
                    if *side_a == front.is_test_mode && *side_b == back.is_test_mode
            ),
            "unexpected mismatches: {mismatches:?}"
        );
    }

    #[test]
    fn test_match_sheet_with_metadata_ballot_type_mismatch() {
        let front = sample_metadata();
        let back = Metadata {
            ballot_type: BallotType::Absentee,
            page_number: front.page_number.opposite(),
            ..front.clone()
        };
        let mismatches = front.match_sheet_with_metadata(&back);
        assert!(
            matches!(
                mismatches.as_slice(),
                [MetadataMismatch::BallotType { side_a, side_b }]
                    if *side_a == front.ballot_type && *side_b == back.ballot_type
            ),
            "unexpected mismatches: {mismatches:?}"
        );
    }

    #[test]
    fn test_match_sheet_with_metadata_ballot_audit_id_mismatch() {
        let front = sample_metadata();
        let back = Metadata {
            ballot_audit_id: Some("audit-id".to_owned()),
            page_number: front.page_number.opposite(),
            ..front.clone()
        };
        let mismatches = front.match_sheet_with_metadata(&back);
        assert!(
            matches!(
                mismatches.as_slice(),
                [MetadataMismatch::BallotAuditId { side_a, side_b }]
                    if *side_a == front.ballot_audit_id && *side_b == back.ballot_audit_id
            ),
            "unexpected mismatches: {mismatches:?}"
        );
    }

    #[test]
    fn test_match_sheet_with_metadata_accumulates_mismatches_in_declaration_order() {
        let front = sample_metadata();
        let back = Metadata {
            ballot_hash: [0xff; PARTIAL_BALLOT_HASH_BYTE_LENGTH],
            precinct_id: PrecinctId::from("precinct-other".to_owned()),
            ballot_style_id: BallotStyleId::from("ballot-style-other".to_owned()),
            // Page 5 is on sheet 3; not opposite of page 1.
            page_number: PageNumber::new_unchecked(5),
            is_test_mode: !front.is_test_mode,
            ballot_type: BallotType::Absentee,
            ballot_audit_id: Some("audit-id".to_owned()),
        };
        let mismatches = front.match_sheet_with_metadata(&back);
        assert!(
            matches!(
                mismatches.as_slice(),
                [
                    MetadataMismatch::BallotHash { .. },
                    MetadataMismatch::PrecinctId { .. },
                    MetadataMismatch::BallotStyleId { .. },
                    MetadataMismatch::PageNumber { .. },
                    MetadataMismatch::IsTestMode { .. },
                    MetadataMismatch::BallotType { .. },
                    MetadataMismatch::BallotAuditId { .. },
                ]
            ),
            "unexpected mismatches: {mismatches:?}"
        );
    }

    proptest! {
        #[test]
        fn test_ballot_audit_id_coding(ballot_audit_id in "[0-9a-z-]{1,100}") {
            let ballot_audit_id_length = BallotAuditIdLength::new(ballot_audit_id.len() as u8).unwrap();
            let bytes = collect_writes::<coding::Error>(|writer| {
                writer.build(&ballot_audit_id_length)?;
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

        /// Metadata inferred from the other side of a sheet must always be
        /// considered compatible by `match_sheet_with_metadata`. This ties the
        /// two helpers together: if `infer_missing_page_metadata` ever drifts
        /// from the fields that `match_sheet_with_metadata` checks, this test
        /// catches it.
        #[test]
        fn test_match_sheet_with_inferred_metadata_has_no_mismatches(
            page_number in arbitrary_page_number(),
            ballot_hash: PartialBallotHash,
            precinct_id in "[0-9a-z-]{1,100}",
            ballot_style_id in "[0-9a-z-]{1,100}",
            is_test_mode in proptest::bool::ANY,
            ballot_type in arbitrary_ballot_type(),
            ballot_audit_id in proptest::option::of("[0-9a-z-]{1,100}"),
        ) {
            let detected = Metadata {
                ballot_hash,
                precinct_id: PrecinctId::from(precinct_id),
                ballot_style_id: BallotStyleId::from(ballot_style_id),
                page_number,
                is_test_mode,
                ballot_type,
                ballot_audit_id,
            };
            let inferred = infer_missing_page_metadata(&detected);
            assert!(detected.match_sheet_with_metadata(&inferred).is_empty());
            assert!(inferred.match_sheet_with_metadata(&detected).is_empty());
        }
    }
}
