pub mod completed_ballot;
pub mod error;
pub mod votes;
pub mod write_in_name;

pub type BallotHash = [u8; BALLOT_HASH_BYTE_LENGTH];
pub const BALLOT_HASH_BYTE_LENGTH: usize = 10;
pub const PRELUDE: &[u8; 3] = b"VX\x02";
