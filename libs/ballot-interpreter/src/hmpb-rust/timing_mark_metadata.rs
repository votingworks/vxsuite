use std::{convert::TryInto, fmt::Debug};

use serde::Serialize;
use types_rs::geometry::Rect;

use crate::ballot_card::Geometry;

/// Expected number of metadata bits encoded in the bottom row of a ballot card.
pub const METADATA_BITS: usize = 32;

/// Metadata bits encoded in the bottom row of a ballot card, right-to-left.
pub type MetadataBits = [bool; METADATA_BITS];

/// Expected number of timing marks comprising the border of a ballot card that
/// encodes the metadata.
pub const METADATA_BORDER_MARK_COUNT: usize = METADATA_BITS + 2;

pub type EnderCode = [bool; 11];

/// Ending sequence of bits encoded on the back of a ballot card.
pub const ENDER_CODE: EnderCode = [
    false, true, true, true, true, false, true, true, true, true, false,
];

/// Metadata encoded by the bottom row of the front of a ballot card.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BallotConfig {
    /// Batch or precinct number from bits 2-14 (13 bits).
    pub batch_or_precinct: u16,

    /// Card number (cardRotID) from bits 15-27 (13 bits).
    pub card: u16,

    /// Sequence number (always 0) from bits 28-30 (3 bits).
    pub sequence: u8,
}

impl BallotConfig {
    const MOD_4_CHECKSUM_OFFSET: usize = 0;
    const BATCH_OR_PRECINCT_OFFSET: usize = 2;
    const CARD_OFFSET: usize = 15;
    const SEQUENCE_OFFSET: usize = 28;
    const START_BIT_OFFSET: usize = 31;

    pub const fn new(batch_or_precinct: u16, card: u16, sequence: u8) -> Self {
        Self {
            batch_or_precinct,
            card,
            sequence,
        }
    }

    /// Decodes the metadata bits assuming it's the front page of a ballot card.
    pub fn decode_bits(bits_rtl: &MetadataBits) -> Result<Self, BallotPageTimingMarkMetadataError> {
        let start_bit = u8::from(bits_rtl[Self::START_BIT_OFFSET]);

        if start_bit != 1 {
            return Err(BallotPageTimingMarkMetadataError::ValueOutOfRange {
                field: "start_bit",
                value: u32::from(start_bit),
                min: 1,
                max: 1,
            });
        }

        let computed_mod_4_checksum = compute_mod_4_checksum(bits_rtl);
        let encoded_mod_4_checksum =
            u8_from_bits(&bits_rtl[Self::MOD_4_CHECKSUM_OFFSET..Self::BATCH_OR_PRECINCT_OFFSET]);

        if computed_mod_4_checksum != encoded_mod_4_checksum {
            return Err(BallotPageTimingMarkMetadataError::InvalidChecksum {
                expected: computed_mod_4_checksum,
                actual: encoded_mod_4_checksum,
            });
        }

        let batch_or_precinct =
            u16_from_bits(&bits_rtl[Self::BATCH_OR_PRECINCT_OFFSET..Self::CARD_OFFSET]);
        let card = u16_from_bits(&bits_rtl[Self::CARD_OFFSET..Self::SEQUENCE_OFFSET]);
        let sequence = u8_from_bits(&bits_rtl[Self::SEQUENCE_OFFSET..Self::START_BIT_OFFSET]);

        Ok(Self::new(batch_or_precinct, card, sequence))
    }

    /// Encodes the metadata as bits.
    #[allow(dead_code)]
    pub fn encode_bits(&self) -> MetadataBits {
        let mut bits_rtl: MetadataBits = [false; METADATA_BITS];
        copy_bits_from(
            &mut bits_rtl[Self::BATCH_OR_PRECINCT_OFFSET..Self::CARD_OFFSET],
            self.batch_or_precinct,
        );
        copy_bits_from(
            &mut bits_rtl[Self::CARD_OFFSET..Self::SEQUENCE_OFFSET],
            self.card,
        );
        copy_bits_from(
            &mut bits_rtl[Self::SEQUENCE_OFFSET..Self::START_BIT_OFFSET],
            self.sequence,
        );

        bits_rtl[Self::START_BIT_OFFSET] = true;

        let mod_4_checksum = compute_mod_4_checksum(&bits_rtl);
        copy_bits_from(
            &mut bits_rtl[Self::MOD_4_CHECKSUM_OFFSET..Self::BATCH_OR_PRECINCT_OFFSET],
            mod_4_checksum,
        );

        bits_rtl
    }
}

fn compute_mod_4_checksum(bits_rtl: &MetadataBits) -> u8 {
    bits_rtl[2..].iter().map(|&bit| u8::from(bit)).sum::<u8>() % 4
}

/// Represents a single capital letter from A-Z represented by a u8 index.
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct IndexedCapitalLetter(u8);

impl TryFrom<u8> for IndexedCapitalLetter {
    type Error = ();

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        if value < (b'Z' - b'A' + 1) {
            Ok(Self(value))
        } else {
            Err(())
        }
    }
}

impl IndexedCapitalLetter {
    pub fn to_char(self) -> char {
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

impl Debug for IndexedCapitalLetter {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_tuple("IndexedCapitalLetter")
            .field(&self.to_char())
            .finish()
    }
}

/// Information encoded by the bottom row of the back of a ballot card.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ElectionInfo {
    /// Election day of month (1..31) from bits 0-4 (5 bits).
    pub day: u8,

    /// Election month (1..12) from bits 5-8 (4 bits).
    pub month: u8,

    /// Election year (2 digits) from bits 9-15 (7 bits).
    pub year: u8,

    /// Election type from bits 16-20 (5 bits).
    ///
    /// # Examples
    ///
    /// ```
    /// # use ballot_interpreter::timing_mark_metadata::{ElectionMetadata, IndexedCapitalLetter};
    /// // General Election
    /// ElectionMetadata::new(1, 1, 24, IndexedCapitalLetter::try_from(b'G'));
    /// ```
    pub type_code: IndexedCapitalLetter,
}

impl ElectionInfo {
    const DAY_OFFSET: usize = 0;
    const MONTH_OFFSET: usize = 5;
    const YEAR_OFFSET: usize = 9;
    const TYPE_CODE_OFFSET: usize = 16;
    const ENDER_CODE_OFFSET: usize = 21;

    fn new(
        day: u8,
        month: u8,
        year: u8,
        type_code: IndexedCapitalLetter,
    ) -> Result<Self, BallotPageTimingMarkMetadataError> {
        if !(1..=31).contains(&day) {
            return Err(BallotPageTimingMarkMetadataError::ValueOutOfRange {
                field: "day",
                value: u32::from(day),
                min: 1,
                max: 31,
            });
        }

        if !(1..=12).contains(&month) {
            return Err(BallotPageTimingMarkMetadataError::ValueOutOfRange {
                field: "month",
                value: u32::from(month),
                min: 1,
                max: 12,
            });
        }

        if year > 99 {
            return Err(BallotPageTimingMarkMetadataError::ValueOutOfRange {
                field: "year",
                value: u32::from(year),
                min: 0,
                max: 99,
            });
        }

        Ok(Self {
            day,
            month,
            year,
            type_code,
        })
    }

    /// Decodes the metadata bits assuming it's the back page of a ballot card.
    pub fn decode_bits(bits_rtl: &MetadataBits) -> Result<Self, BallotPageTimingMarkMetadataError> {
        let day = u8_from_bits(&bits_rtl[Self::DAY_OFFSET..Self::MONTH_OFFSET]);
        let month = u8_from_bits(&bits_rtl[Self::MONTH_OFFSET..Self::YEAR_OFFSET]);
        let year = u8_from_bits(&bits_rtl[Self::YEAR_OFFSET..Self::TYPE_CODE_OFFSET]);
        let type_code = u8_from_bits(&bits_rtl[Self::TYPE_CODE_OFFSET..Self::ENDER_CODE_OFFSET]);

        let type_code: IndexedCapitalLetter = type_code.try_into().map_err(|()| {
            BallotPageTimingMarkMetadataError::ValueOutOfRange {
                field: "type_code",
                value: u32::from(type_code),
                min: 0,
                max: 25,
            }
        })?;

        let ender_code: EnderCode = bits_rtl[Self::ENDER_CODE_OFFSET..]
            .try_into()
            .expect("slice with correct length");

        if ender_code != ENDER_CODE {
            return Err(BallotPageTimingMarkMetadataError::InvalidEnderCode {
                actual: ender_code,
                expected: ENDER_CODE,
            });
        }

        Self::new(day, month, year, type_code)
    }

    /// Encodes the metadata as bits.
    #[allow(dead_code)]
    pub fn encode_bits(&self) -> MetadataBits {
        let mut bits: MetadataBits = [false; METADATA_BITS];

        copy_bits_from(&mut bits[Self::DAY_OFFSET..Self::MONTH_OFFSET], self.day);
        copy_bits_from(&mut bits[Self::MONTH_OFFSET..Self::YEAR_OFFSET], self.month);
        copy_bits_from(
            &mut bits[Self::YEAR_OFFSET..Self::TYPE_CODE_OFFSET],
            self.year,
        );
        copy_bits_from(
            &mut bits[Self::TYPE_CODE_OFFSET..Self::ENDER_CODE_OFFSET],
            self.type_code.0,
        );
        bits[Self::ENDER_CODE_OFFSET..].copy_from_slice(&ENDER_CODE);

        bits
    }
}

fn u8_from_bits(bits: &[bool]) -> u8 {
    bits.iter()
        .rev()
        .fold(0, |acc, &bit| (acc << 1) + u8::from(bit))
}

fn u16_from_bits(bits: &[bool]) -> u16 {
    bits.iter()
        .rev()
        .fold(0, |acc, &bit| (acc << 1) + u16::from(bit))
}

fn copy_bits_from(bits: &mut [bool], value: impl Into<u16>) {
    let value = value.into();
    for (i, bit) in bits.iter_mut().enumerate() {
        *bit = (value >> i) & 0b1 != 0;
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "side", rename_all = "camelCase")]
// Metadata encoded in the bottom row of timing marks on Accuvote-style ballots.
#[allow(clippy::module_name_repetitions)]
pub enum BallotPageTimingMarkMetadata {
    Front(BallotConfig),
    Back(ElectionInfo),
}

impl BallotPageTimingMarkMetadata {
    /// Decodes the ballot page metadata from the timing marks. Uses the difference
    /// between the partial and complete timing marks to determine the metadata
    /// bits.
    pub fn decode_from_timing_marks(
        geometry: &Geometry,
        bottom_timing_marks: &[Option<Rect>],
    ) -> Result<Self, BallotPageTimingMarkMetadataError> {
        {
            let bits = compute_bits_from_bottom_timing_marks(geometry, bottom_timing_marks)?;

            let front_metadata_result = BallotConfig::decode_bits(&bits);
            let back_metadata_result = ElectionInfo::decode_bits(&bits);

            match (front_metadata_result, back_metadata_result) {
                (Ok(front_metadata), Ok(back_metadata)) => {
                    Err(BallotPageTimingMarkMetadataError::AmbiguousMetadata {
                        front_metadata,
                        back_metadata,
                    })
                }
                (Ok(front_metadata), Err(_)) => Ok(Self::Front(front_metadata)),
                (Err(_), Ok(back_metadata)) => Ok(Self::Back(back_metadata)),
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
        field: &'static str,
        value: u32,
        min: u32,
        max: u32,
    },
    #[error("invalid checksum: expected {expected}, got {actual}")]
    InvalidChecksum { expected: u8, actual: u8 },
    #[error("invalid ender code: expected {expected:?}, got {actual:?}")]
    InvalidEnderCode {
        expected: EnderCode,
        actual: EnderCode,
    },
    #[error("invalid number of timing marks: expected {expected}, got {actual}")]
    InvalidTimingMarkCount { expected: usize, actual: usize },
    #[error("ambiguous metadata: front={front_metadata:?}, back={back_metadata:?}")]
    AmbiguousMetadata {
        front_metadata: BallotConfig,
        back_metadata: ElectionInfo,
    },
}

/// Computes the metadata bits from the bottom row of a ballot page.
pub fn compute_bits_from_bottom_timing_marks(
    geometry: &Geometry,
    bottom_timing_marks: &[Option<Rect>],
) -> Result<MetadataBits, BallotPageTimingMarkMetadataError> {
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
#[allow(clippy::unwrap_used)]
mod test {
    use proptest::{prop_compose, proptest};

    use super::*;

    proptest! {
        #[test]
        fn test_decode_ballot_config_does_not_panic(bits: MetadataBits) {
            let _ = BallotConfig::decode_bits(&bits);
        }

        #[test]
        fn test_decode_election_info_does_not_panic(bits: MetadataBits) {
            let _ = ElectionInfo::decode_bits(&bits);
        }

        #[test]
        fn test_ballot_config_coding(
            batch_or_precinct in 0u16..(1 << (BallotConfig::CARD_OFFSET - BallotConfig::BATCH_OR_PRECINCT_OFFSET)),
            card in 0u16..(1 << (BallotConfig::SEQUENCE_OFFSET - BallotConfig::CARD_OFFSET)),
            sequence in 0u8..(1 << (BallotConfig::START_BIT_OFFSET - BallotConfig::SEQUENCE_OFFSET)),
        ) {
            let metadata = BallotConfig::new(
                batch_or_precinct,
                card,
                sequence,
            );

            let bits = metadata.encode_bits();
            let decoded_metadata = BallotConfig::decode_bits(&bits).unwrap();

            assert_eq!(decoded_metadata, metadata);
        }

        #[test]
        fn test_election_info_metadata(
            day in 1u8..=31,
            month in 1u8..=12,
            year in 0u8..100,
            type_code in indexed_capital_letter(),
        ) {
            let original_metadata = ElectionInfo::new(
                day,
                month,
                year,
                type_code,
            ).unwrap();

            let bits = original_metadata.encode_bits();
            let decoded_metadata = ElectionInfo::decode_bits(&bits).unwrap();

            assert_eq!(decoded_metadata, original_metadata);
        }
    }

    prop_compose! {
        fn indexed_capital_letter()(
            value in b'A'..=b'Z'
        ) -> IndexedCapitalLetter {
            IndexedCapitalLetter::try_from(value - b'A').unwrap()
        }
    }
}
