use std::fmt::{Debug, Formatter};

use serde::{Deserialize, Serialize};

/// Expected number of metadata bits encoded in the bottom row of a ballot card.
pub const METADATA_BITS: usize = 32;

/// Expected number of timing marks comprising the border of a ballot card that
/// encodes the metadata.
pub const METADATA_BORDER_MARK_COUNT: usize = METADATA_BITS + 2;

/// Ending sequence of bits encoded on the back of a ballot card.
pub const ENDER_CODE: [bool; 11] = [
    false, true, true, true, true, false, true, true, true, true, false,
];

/// Metadata encoded by the bottom row of the front of a ballot card.
#[derive(Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BallotPageTimingMarkMetadataFront {
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

impl Debug for BallotPageTimingMarkMetadataFront {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("FrontMetadata")
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
#[derive(Clone, Debug, PartialEq)]
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

impl<'de> Deserialize<'de> for IndexedCapitalLetter {
    fn deserialize<D>(deserializer: D) -> Result<IndexedCapitalLetter, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let c = char::deserialize(deserializer)?;
        if !('A'..='Z').contains(&c) {
            return Err(serde::de::Error::custom("capital letter out of range"));
        }
        Ok(IndexedCapitalLetter(c as u8 - b'A'))
    }
}

/// Metadata encoded by the bottom row of the back of a ballot card.
#[derive(Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BallotPageTimingMarkMetadataBack {
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
}

impl Debug for BallotPageTimingMarkMetadataBack {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BackMetadata")
            .field("election_day", &self.election_day)
            .field("election_month", &self.election_month)
            .field("election_year", &self.election_year)
            .field("election_type", &self.election_type)
            .finish()
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "side", rename_all = "camelCase")]
// Metadata encoded in the bottom row of timing marks on Accuvote-style ballots.
pub enum BallotPageTimingMarkMetadata {
    Front(BallotPageTimingMarkMetadataFront),
    Back(BallotPageTimingMarkMetadataBack),
}
