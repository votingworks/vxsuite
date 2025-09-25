pub mod cvr;
pub mod error;
pub mod votes;
pub mod write_in_name;

/// The number of bytes of the full ballot hash to use in an encoded [`cvr::CastVoteRecord`].
pub const PARTIAL_BALLOT_HASH_BYTE_LENGTH: usize = 10;

/// The partial ballot hash used in an encoded [`cvr::CastVoteRecord`].
pub type PartialBallotHash = [u8; PARTIAL_BALLOT_HASH_BYTE_LENGTH];

/// The first bytes of an encoded [`cvr::CastVoteRecord`].
pub const PRELUDE: &[u8; 3] = b"VX\x02";
