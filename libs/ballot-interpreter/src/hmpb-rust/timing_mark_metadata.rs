use std::{
    convert::TryInto,
    fmt::{Debug, Formatter},
};

use serde::Serialize;
use types_rs::geometry::Rect;

use crate::ballot_card::Geometry;

/// Expected number of metadata bits encoded in the bottom row of a ballot card.
pub const METADATA_BITS: usize = 32;

/// Expected number of timing marks comprising the border of a ballot card that
/// encodes the metadata.
pub const METADATA_BORDER_MARK_COUNT: usize = METADATA_BITS + 2;

/// Ending sequence of bits encoded on the back of a ballot card.
pub const ENDER_CODE: [bool; 11] = [
    false, true, true, true, true, false, true, true, true, true, false,
];

fn print_boolean_slice_as_binary(slice: &[bool]) -> String {
    slice
        .iter()
        .map(|b| if *b { "1" } else { "0" })
        .collect::<Vec<_>>()
        .join("")
}

/// Metadata encoded by the bottom row of the front of a ballot card.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BallotPageTimingMarkMetadataFront {
    /// Raw bits 0-31 in LSB-MSB order (right to left).
    pub bits: [bool; METADATA_BITS],

    /// Mod 4 check sum from bits 0-1 (2 bits).
    ///
    /// The mod 4 check sum bits are obtained by adding the number of 1’s in bits 2
    /// through 31, then encoding the results of a mod 4 operation in bits 0 and 1.
    /// For example, if bits 2 through 31 have 18 1’s, bits 0 and 1 will hold the
    /// value 2 (18 mod 4 = 2).
    pub mod_4_checksum: u8,

    /// The mod 4 check sum computed from bits 2-31.
    pub computed_mod_4_checksum: u8,

    /// Batch or precinct number from bits 2-14 (13 bits).
    pub batch_or_precinct_number: u16,

    /// Card number (CardRotID) from bits 15-27 (13 bits).
    pub card_number: u16,

    /// Sequence number (always 0) from bits 28-30 (3 bits).
    pub sequence_number: u8,

    /// Start bit (always 1) from bit 31-31 (1 bit).
    pub start_bit: u8,
}

impl BallotPageTimingMarkMetadataFront {
    /// Decodes the metadata bits assuming it's the front page of a ballot card.
    pub fn decode(
        bits_rtl: &[bool; METADATA_BITS],
    ) -> Result<BallotPageTimingMarkMetadataFront, BallotPageTimingMarkMetadataError> {
        let computed_mod_4_checksum =
            bits_rtl[2..].iter().map(|&bit| u8::from(bit)).sum::<u8>() % 4;

        let mod_4_checksum = bits_rtl[0..2]
            .iter()
            .rev()
            .fold(0, |acc, &bit| (acc << 1) + u8::from(bit));

        let batch_or_precinct_number = bits_rtl[2..15]
            .iter()
            .rev()
            .fold(0, |acc, &bit| (acc << 1) + u16::from(bit));

        let card_number = bits_rtl[15..28]
            .iter()
            .rev()
            .fold(0, |acc, &bit| (acc << 1) + u16::from(bit));

        let sequence_number = bits_rtl[28..31]
            .iter()
            .rev()
            .fold(0, |acc, &bit| (acc << 1) + u8::from(bit));

        let start_bit = u8::from(bits_rtl[31]);

        let front_metadata = BallotPageTimingMarkMetadataFront {
            bits: *bits_rtl,
            mod_4_checksum,
            computed_mod_4_checksum,
            batch_or_precinct_number,
            card_number,
            sequence_number,
            start_bit,
        };

        if computed_mod_4_checksum != mod_4_checksum {
            return Err(BallotPageTimingMarkMetadataError::InvalidChecksum {
                metadata: front_metadata,
            });
        }

        if start_bit != 1 {
            return Err(BallotPageTimingMarkMetadataError::ValueOutOfRange {
                field: "start_bit".to_string(),
                value: u32::from(start_bit),
                min: 1,
                max: 1,
                metadata: BallotPageTimingMarkMetadata::Front(front_metadata),
            });
        }

        Ok(front_metadata)
    }
}

impl Debug for BallotPageTimingMarkMetadataFront {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("FrontMetadata")
            .field("bits", &print_boolean_slice_as_binary(&self.bits))
            .field("mod_4_checksum", &self.mod_4_checksum)
            .field("computed_mod_4_checksum", &self.computed_mod_4_checksum)
            .field("batch_or_precinct_number", &self.batch_or_precinct_number)
            .field("card_number", &self.card_number)
            .field("sequence_number", &self.sequence_number)
            .field("start_bit", &self.start_bit)
            .finish()
    }
}

/// Represents a single capital letter from A-Z represented by a u8 index.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IndexedCapitalLetter(u8);

impl From<u8> for IndexedCapitalLetter {
    fn from(value: u8) -> Self {
        Self(value)
    }
}

impl IndexedCapitalLetter {
    pub fn to_char(&self) -> char {
        char::from(b'A' + self.0)
    }
}

impl Serialize for IndexedCapitalLetter {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_char(self.to_char())
    }
}

/// Metadata encoded by the bottom row of the back of a ballot card.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BallotPageTimingMarkMetadataBack {
    /// Raw bits 0-31 in LSB-MSB order (right-to-left).
    pub bits: [bool; METADATA_BITS],

    /// Election day of month (1..31) from bits 0-4 (5 bits).
    pub election_day: u8,

    /// Election month (1..12) from bits 5-8 (4 bits).
    pub election_month: u8,

    /// Election year (2 digits) from bits 9-15 (7 bits).
    pub election_year: u8,

    /// Election type from bits 16-20 (5 bits).
    ///
    /// @example "G" for general election
    pub election_type: IndexedCapitalLetter,

    /// Ender code (binary 01111011110) from bits 21-31 (11 bits).
    pub ender_code: [bool; 11],

    /// Ender code (binary 01111011110) hardcoded to the expected value.
    pub expected_ender_code: [bool; 11],
}

impl BallotPageTimingMarkMetadataBack {
    /// Decodes the metadata bits assuming it's the back page of a ballot card.
    pub fn decode(
        bits_rtl: &[bool; METADATA_BITS],
    ) -> Result<BallotPageTimingMarkMetadataBack, BallotPageTimingMarkMetadataError> {
        let election_day = bits_rtl[0..5]
            .iter()
            .rev()
            .fold(0, |acc, &bit| (acc << 1) + u8::from(bit));

        let election_month = bits_rtl[5..9]
            .iter()
            .rev()
            .fold(0, |acc, &bit| (acc << 1) + u8::from(bit));

        let election_year = bits_rtl[9..16]
            .iter()
            .rev()
            .fold(0, |acc, &bit| (acc << 1) + u8::from(bit));

        let election_type: IndexedCapitalLetter = bits_rtl[16..21]
            .iter()
            .rev()
            .fold(0, |acc, &bit| (acc << 1) + u8::from(bit))
            .into();

        let ender_code: [bool; 11] = bits_rtl[21..32]
            .try_into()
            .expect("slice with correct length");

        let back_metadata = BallotPageTimingMarkMetadataBack {
            bits: *bits_rtl,
            election_day,
            election_month,
            election_year,
            election_type,
            ender_code,
            expected_ender_code: ENDER_CODE,
        };

        if ender_code != ENDER_CODE {
            return Err(BallotPageTimingMarkMetadataError::InvalidEnderCode {
                metadata: back_metadata,
            });
        }

        Ok(back_metadata)
    }
}

impl Debug for BallotPageTimingMarkMetadataBack {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BackMetadata")
            .field("bits", &print_boolean_slice_as_binary(&self.bits))
            .field("election_day", &self.election_day)
            .field("election_month", &self.election_month)
            .field("election_year", &self.election_year)
            .field("election_type", &self.election_type)
            .field(
                "ender_code",
                &print_boolean_slice_as_binary(&self.ender_code),
            )
            .field(
                "expected_ender_code",
                &print_boolean_slice_as_binary(&self.expected_ender_code),
            )
            .finish()
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "side", rename_all = "camelCase")]
// Metadata encoded in the bottom row of timing marks on Accuvote-style ballots.
#[allow(clippy::module_name_repetitions)]
pub enum BallotPageTimingMarkMetadata {
    Front(BallotPageTimingMarkMetadataFront),
    Back(BallotPageTimingMarkMetadataBack),
}

impl BallotPageTimingMarkMetadata {
    /// Decodes the ballot page metadata from the timing marks. Uses the difference
    /// between the partial and complete timing marks to determine the metadata
    /// bits.
    pub fn decode_from_timing_marks(
        geometry: &Geometry,
        bottom_timing_marks: &[Option<Rect>],
    ) -> Result<BallotPageTimingMarkMetadata, BallotPageTimingMarkMetadataError> {
        {
            let bits = compute_bits_from_bottom_timing_marks(geometry, bottom_timing_marks)?;

            let front_metadata_result = BallotPageTimingMarkMetadataFront::decode(&bits);
            let back_metadata_result = BallotPageTimingMarkMetadataBack::decode(&bits);

            match (front_metadata_result, back_metadata_result) {
                (Ok(front_metadata), Ok(back_metadata)) => {
                    Err(BallotPageTimingMarkMetadataError::AmbiguousMetadata {
                        front_metadata,
                        back_metadata,
                    })
                }
                (Ok(front_metadata), Err(_)) => {
                    Ok(BallotPageTimingMarkMetadata::Front(front_metadata))
                }
                (Err(_), Ok(back_metadata)) => {
                    Ok(BallotPageTimingMarkMetadata::Back(back_metadata))
                }
                (Err(front_metadata_error), Err(_)) => Err(front_metadata_error),
            }
        }
    }
}

#[derive(Debug, Serialize, Clone, thiserror::Error)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum BallotPageTimingMarkMetadataError {
    #[error("value {value} for field {field} is out of range [{min}, {max}]")]
    ValueOutOfRange {
        field: String,
        value: u32,
        min: u32,
        max: u32,
        metadata: BallotPageTimingMarkMetadata,
    },
    #[error("invalid checksum: expected {}, got {}", metadata.mod_4_checksum, metadata.computed_mod_4_checksum)]
    InvalidChecksum {
        metadata: BallotPageTimingMarkMetadataFront,
    },
    #[error("invalid ender code: {:?}", metadata.ender_code)]
    InvalidEnderCode {
        metadata: BallotPageTimingMarkMetadataBack,
    },
    #[error("invalid number of timing marks: expected {expected}, got {actual}")]
    InvalidTimingMarkCount { expected: usize, actual: usize },
    #[error("ambiguous metadata: front={front_metadata:?}, back={back_metadata:?}")]
    AmbiguousMetadata {
        front_metadata: BallotPageTimingMarkMetadataFront,
        back_metadata: BallotPageTimingMarkMetadataBack,
    },
}

/// Computes the metadata bits from the bottom row of a ballot page.
pub fn compute_bits_from_bottom_timing_marks(
    geometry: &Geometry,
    bottom_timing_marks: &[Option<Rect>],
) -> Result<[bool; METADATA_BITS], BallotPageTimingMarkMetadataError> {
    // Validate the number of timing marks.
    if bottom_timing_marks.len() != geometry.grid_size.width as usize
        || geometry.grid_size.width as usize != METADATA_BORDER_MARK_COUNT
    {
        return Err(BallotPageTimingMarkMetadataError::InvalidTimingMarkCount {
            expected: geometry.grid_size.width as usize,
            actual: bottom_timing_marks.len(),
        });
    }

    // The first and last timing marks must be present.
    match (bottom_timing_marks.first(), bottom_timing_marks.last()) {
        (Some(Some(_)), Some(Some(_))) => {
            // both timing marks are present
        }
        (Some(None), Some(None)) => {
            return Err(BallotPageTimingMarkMetadataError::InvalidTimingMarkCount {
                expected: 2,
                actual: 0,
            });
        }
        (Some(None), _) | (_, Some(None)) => {
            return Err(BallotPageTimingMarkMetadataError::InvalidTimingMarkCount {
                expected: 2,
                actual: 1,
            });
        }
        _ => unreachable!(),
    }

    let bits: Vec<bool> = bottom_timing_marks
        .iter()
        .skip(1)
        .take(METADATA_BITS)
        .map(Option::is_some)
        .rev()
        .collect();

    let bit_count = bits.len();

    // try to convert the bits into a fixed-size array
    bits.try_into().map_err(
        |_| BallotPageTimingMarkMetadataError::InvalidTimingMarkCount {
            expected: METADATA_BITS,
            actual: bit_count,
        },
    )
}

#[cfg(test)]
mod test {
    use proptest::{prop_compose, proptest};

    use super::*;

    proptest! {
        #[test]
        fn test_decode_front_metadata_from_bits_does_not_panic(bits: [bool; METADATA_BITS]) {
            let _ = BallotPageTimingMarkMetadataFront::decode(&bits);
        }

        #[test]
        fn test_decode_back_metadata_from_bits_does_not_panic(bits: [bool; METADATA_BITS]) {
            let _ = BallotPageTimingMarkMetadataBack::decode(&bits);
        }

        #[test]
        fn test_decode_front_metadata_from_bits(
            batch_or_precinct_number in 0u16..=(1 << 13 - 1),
            card_number in 0u16..=(1 << 13 - 1),
            sequence_number in 0u8..=(1 << 3 - 1),
        ) {
            let mut bits: [bool; METADATA_BITS] = [
                // placeholder for mod 4 checksum
                false,
                false,

                // batch or precinct number
                (batch_or_precinct_number >> 0) & 0b1 != 0,
                (batch_or_precinct_number >> 1) & 0b1 != 0,
                (batch_or_precinct_number >> 2) & 0b1 != 0,
                (batch_or_precinct_number >> 3) & 0b1 != 0,
                (batch_or_precinct_number >> 4) & 0b1 != 0,
                (batch_or_precinct_number >> 5) & 0b1 != 0,
                (batch_or_precinct_number >> 6) & 0b1 != 0,
                (batch_or_precinct_number >> 7) & 0b1 != 0,
                (batch_or_precinct_number >> 8) & 0b1 != 0,
                (batch_or_precinct_number >> 9) & 0b1 != 0,
                (batch_or_precinct_number >> 10) & 0b1 != 0,
                (batch_or_precinct_number >> 11) & 0b1 != 0,
                (batch_or_precinct_number >> 12) & 0b1 != 0,

                // card number
                (card_number >> 0) & 0b1 != 0,
                (card_number >> 1) & 0b1 != 0,
                (card_number >> 2) & 0b1 != 0,
                (card_number >> 3) & 0b1 != 0,
                (card_number >> 4) & 0b1 != 0,
                (card_number >> 5) & 0b1 != 0,
                (card_number >> 6) & 0b1 != 0,
                (card_number >> 7) & 0b1 != 0,
                (card_number >> 8) & 0b1 != 0,
                (card_number >> 9) & 0b1 != 0,
                (card_number >> 10) & 0b1 != 0,
                (card_number >> 11) & 0b1 != 0,
                (card_number >> 12) & 0b1 != 0,

                // sequence number
                (sequence_number >> 0) & 0b1 != 0,
                (sequence_number >> 1) & 0b1 != 0,
                (sequence_number >> 2) & 0b1 != 0,

                // start bit
                true,
            ];

            // compute mod 4 checksum
            let computed_mod_4_checksum = bits[2..].iter().map(|&bit| u8::from(bit)).sum::<u8>() % 4;
            bits[0] = (computed_mod_4_checksum >> 0) & 0b1 != 0;
            bits[1] = (computed_mod_4_checksum >> 1) & 0b1 != 0;

            let metadata = BallotPageTimingMarkMetadataFront::decode(&bits).unwrap();
            assert_eq!(metadata.bits, bits);
            assert_eq!(metadata.batch_or_precinct_number, batch_or_precinct_number);
            assert_eq!(metadata.card_number, card_number);
            assert_eq!(metadata.sequence_number, sequence_number);
        }

        #[test]
        fn test_decode_back_metadata_from_bits(
            election_day in 0u8..=31,
            election_month in 0u8..=12,
            election_year in 0u8..=100,
            election_type in indexed_capital_letter(),
        ) {
            let bits: [bool; METADATA_BITS] = [
                (election_day >> 0) & 0b1 != 0,
                (election_day >> 1) & 0b1 != 0,
                (election_day >> 2) & 0b1 != 0,
                (election_day >> 3) & 0b1 != 0,
                (election_day >> 4) & 0b1 != 0,
                (election_month >> 0) & 0b1 != 0,
                (election_month >> 1) & 0b1 != 0,
                (election_month >> 2) & 0b1 != 0,
                (election_month >> 3) & 0b1 != 0,
                (election_year >> 0) & 0b1 != 0,
                (election_year >> 1) & 0b1 != 0,
                (election_year >> 2) & 0b1 != 0,
                (election_year >> 3) & 0b1 != 0,
                (election_year >> 4) & 0b1 != 0,
                (election_year >> 5) & 0b1 != 0,
                (election_year >> 6) & 0b1 != 0,
                (election_type.0 >> 0) & 0b1 != 0,
                (election_type.0 >> 1) & 0b1 != 0,
                (election_type.0 >> 2) & 0b1 != 0,
                (election_type.0 >> 3) & 0b1 != 0,
                (election_type.0 >> 4) & 0b1 != 0,
                false, true, true, true, true, false, true, true, true, true, false,
            ];
            let metadata = BallotPageTimingMarkMetadataBack::decode(&bits).unwrap();
            assert_eq!(metadata.bits, bits);
            assert_eq!(metadata.election_day, election_day);
            assert_eq!(metadata.election_month, election_month);
            assert_eq!(metadata.election_year, election_year);
            assert_eq!(metadata.election_type, election_type);
        }
    }

    prop_compose! {
        fn indexed_capital_letter()(
            value in b'A'..=b'Z'
        ) -> IndexedCapitalLetter {
            IndexedCapitalLetter::from(value - b'A')
        }
    }
}
