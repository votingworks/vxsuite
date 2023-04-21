use std::{
    convert::TryInto,
    fmt::{Debug, Formatter},
};

use serde::{Deserialize, Serialize};

use crate::{ballot_card::Geometry, geometry::Rect};

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
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BallotPageMetadataFront {
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

impl Debug for BallotPageMetadataFront {
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
#[derive(Clone, Copy, Debug)]
pub struct IndexedCapitalLetter(u8);

impl From<u8> for IndexedCapitalLetter {
    fn from(value: u8) -> Self {
        Self(value)
    }
}

impl From<IndexedCapitalLetter> for u8 {
    fn from(value: IndexedCapitalLetter) -> Self {
        value.0
    }
}

impl From<IndexedCapitalLetter> for char {
    fn from(value: IndexedCapitalLetter) -> Self {
        Self::from(b'A' + value.0)
    }
}

impl From<char> for IndexedCapitalLetter {
    fn from(value: char) -> Self {
        Self(value as u8 - b'A')
    }
}

impl Serialize for IndexedCapitalLetter {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_char((*self).into())
    }
}

impl<'de> Deserialize<'de> for IndexedCapitalLetter {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = char::deserialize(deserializer)?;
        Ok(value.into())
    }
}

/// Metadata encoded by the bottom row of the back of a ballot card.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BallotPageMetadataBack {
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

impl Debug for BallotPageMetadataBack {
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

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "side", rename_all = "camelCase")]
pub enum BallotPageMetadata {
    #[serde(rename = "front")]
    Front(BallotPageMetadataFront),
    #[serde(rename = "back")]
    Back(BallotPageMetadataBack),
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum BallotPageMetadataError {
    ValueOutOfRange {
        field: String,
        value: u32,
        min: u32,
        max: u32,
        metadata: BallotPageMetadata,
    },
    InvalidChecksum {
        metadata: BallotPageMetadataFront,
    },
    InvalidEnderCode {
        metadata: BallotPageMetadataBack,
    },
    InvalidTimingMarkCount {
        expected: usize,
        actual: usize,
    },
    AmbiguousMetadata {
        front_metadata: BallotPageMetadataFront,
        back_metadata: BallotPageMetadataBack,
    },
}

/// Computes the metadata bits from the bottom row of a ballot page.
pub fn compute_bits_from_bottom_timing_marks(
    geometry: &Geometry,
    bottom_timing_marks: &[Option<Rect>],
) -> Result<[bool; METADATA_BITS], BallotPageMetadataError> {
    // Validate the number of timing marks.
    if bottom_timing_marks.len() != geometry.grid_size.width as usize
        || geometry.grid_size.width as usize != METADATA_BORDER_MARK_COUNT
    {
        return Err(BallotPageMetadataError::InvalidTimingMarkCount {
            expected: geometry.grid_size.width as usize,
            actual: bottom_timing_marks.len(),
        });
    }

    // The first and last timing marks must be present.
    match (bottom_timing_marks.first(), bottom_timing_marks.last()) {
        (Some(Some(_)), Some(Some(_))) => {}
        _ => {
            return Err(BallotPageMetadataError::InvalidTimingMarkCount {
                expected: 2,
                actual: bottom_timing_marks
                    .iter()
                    .filter(|&mark| mark.is_some())
                    .count(),
            });
        }
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
    bits.try_into()
        .map_err(|_| BallotPageMetadataError::InvalidTimingMarkCount {
            expected: METADATA_BITS,
            actual: bit_count,
        })
}

/// Decodes the metadata bits assuming it's the front page of a ballot card.
pub fn decode_front_metadata_from_bits(
    bits_rtl: &[bool; METADATA_BITS],
) -> Result<BallotPageMetadataFront, BallotPageMetadataError> {
    let computed_mod_4_checksum = bits_rtl[2..].iter().map(|&bit| u8::from(bit)).sum::<u8>() % 4;

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

    let front_metadata = BallotPageMetadataFront {
        bits: *bits_rtl,
        mod_4_checksum,
        computed_mod_4_checksum,
        batch_or_precinct_number,
        card_number,
        sequence_number,
        start_bit,
    };

    if computed_mod_4_checksum != mod_4_checksum {
        return Err(BallotPageMetadataError::InvalidChecksum {
            metadata: front_metadata,
        });
    }

    if start_bit != 1 {
        return Err(BallotPageMetadataError::ValueOutOfRange {
            field: "start_bit".to_string(),
            value: u32::from(start_bit),
            min: 1,
            max: 1,
            metadata: BallotPageMetadata::Front(front_metadata),
        });
    }

    Ok(front_metadata)
}

/// Decodes the metadata bits assuming it's the back page of a ballot card.
pub fn decode_back_metadata_from_bits(
    bits_rtl: &[bool; METADATA_BITS],
) -> Result<BallotPageMetadataBack, BallotPageMetadataError> {
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

    let back_metadata = BallotPageMetadataBack {
        bits: *bits_rtl,
        election_day,
        election_month,
        election_year,
        election_type,
        ender_code,
        expected_ender_code: ENDER_CODE,
    };

    if ender_code != ENDER_CODE {
        return Err(BallotPageMetadataError::InvalidEnderCode {
            metadata: back_metadata,
        });
    }

    Ok(back_metadata)
}

/// Decodes the ballot page metadata from the timing marks. Uses the difference
/// between the partial and complete timing marks to determine the metadata
/// bits.
pub fn decode_metadata_from_timing_marks(
    geometry: &Geometry,
    bottom_timing_marks: &[Option<Rect>],
) -> Result<BallotPageMetadata, BallotPageMetadataError> {
    let bits = compute_bits_from_bottom_timing_marks(geometry, bottom_timing_marks)?;

    let front_metadata_result = decode_front_metadata_from_bits(&bits);
    let back_metadata_result = decode_back_metadata_from_bits(&bits);

    match (front_metadata_result, back_metadata_result) {
        (Ok(front_metadata), Ok(back_metadata)) => {
            Err(BallotPageMetadataError::AmbiguousMetadata {
                front_metadata,
                back_metadata,
            })
        }
        (Ok(front_metadata), Err(_)) => Ok(BallotPageMetadata::Front(front_metadata)),
        (Err(_), Ok(back_metadata)) => Ok(BallotPageMetadata::Back(back_metadata)),
        (Err(front_metadata_error), Err(_)) => Err(front_metadata_error),
    }
}
