use std::{convert::TryInto, fmt::Debug};

use serde::Serialize;
use types_rs::{accuvote, geometry::Rect};

use crate::ballot_card::Geometry;

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum BallotPageTimingMarkMetadataError {
    ValueOutOfRange {
        field: String,
        value: u32,
        min: u32,
        max: u32,
        metadata: accuvote::BallotPageTimingMarkMetadata,
    },
    InvalidChecksum {
        metadata: accuvote::BallotPageTimingMarkMetadataFront,
    },
    InvalidEnderCode {
        metadata: accuvote::BallotPageTimingMarkMetadataBack,
        ender_code: [bool; 11],
    },
    InvalidTimingMarkCount {
        expected: usize,
        actual: usize,
    },
    AmbiguousMetadata {
        front_metadata: accuvote::BallotPageTimingMarkMetadataFront,
        back_metadata: accuvote::BallotPageTimingMarkMetadataBack,
    },
}

/// Computes the metadata bits from the bottom row of a ballot page.
pub fn compute_bits_from_bottom_timing_marks(
    geometry: &Geometry,
    bottom_timing_marks: &[Option<Rect>],
) -> Result<[bool; accuvote::METADATA_BITS], BallotPageTimingMarkMetadataError> {
    // Validate the number of timing marks.
    if bottom_timing_marks.len() != geometry.grid_size.width as usize
        || geometry.grid_size.width as usize != accuvote::METADATA_BORDER_MARK_COUNT
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
        .take(accuvote::METADATA_BITS)
        .map(Option::is_some)
        .rev()
        .collect();

    let bit_count = bits.len();

    // try to convert the bits into a fixed-size array
    bits.try_into().map_err(
        |_| BallotPageTimingMarkMetadataError::InvalidTimingMarkCount {
            expected: accuvote::METADATA_BITS,
            actual: bit_count,
        },
    )
}

/// Decodes the metadata bits assuming it's the front page of a ballot card.
pub fn decode_front_metadata_from_bits(
    bits_rtl: &[bool; accuvote::METADATA_BITS],
) -> Result<accuvote::BallotPageTimingMarkMetadataFront, BallotPageTimingMarkMetadataError> {
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

    let front_metadata = accuvote::BallotPageTimingMarkMetadataFront {
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
            metadata: accuvote::BallotPageTimingMarkMetadata::Front(front_metadata),
        });
    }

    Ok(front_metadata)
}

/// Decodes the metadata bits assuming it's the back page of a ballot card.
pub fn decode_back_metadata_from_bits(
    bits_rtl: &[bool; accuvote::METADATA_BITS],
) -> Result<accuvote::BallotPageTimingMarkMetadataBack, BallotPageTimingMarkMetadataError> {
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

    let election_type: accuvote::IndexedCapitalLetter = bits_rtl[16..21]
        .iter()
        .rev()
        .fold(0, |acc, &bit| (acc << 1) + u8::from(bit))
        .into();

    let ender_code: [bool; 11] = bits_rtl[21..32]
        .try_into()
        .expect("slice with correct length");

    let back_metadata = accuvote::BallotPageTimingMarkMetadataBack {
        election_day,
        election_month,
        election_year,
        election_type,
    };

    if ender_code != accuvote::ENDER_CODE {
        return Err(BallotPageTimingMarkMetadataError::InvalidEnderCode {
            metadata: back_metadata,
            ender_code,
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
) -> Result<accuvote::BallotPageTimingMarkMetadata, BallotPageTimingMarkMetadataError> {
    let bits = compute_bits_from_bottom_timing_marks(geometry, bottom_timing_marks)?;

    let front_metadata_result = decode_front_metadata_from_bits(&bits);
    let back_metadata_result = decode_back_metadata_from_bits(&bits);

    match (front_metadata_result, back_metadata_result) {
        (Ok(front_metadata), Ok(back_metadata)) => {
            Err(BallotPageTimingMarkMetadataError::AmbiguousMetadata {
                front_metadata,
                back_metadata,
            })
        }
        (Ok(front_metadata), Err(_)) => Ok(accuvote::BallotPageTimingMarkMetadata::Front(
            front_metadata,
        )),
        (Err(_), Ok(back_metadata)) => {
            Ok(accuvote::BallotPageTimingMarkMetadata::Back(back_metadata))
        }
        (Err(front_metadata_error), Err(_)) => Err(front_metadata_error),
    }
}
