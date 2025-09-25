use crate::{
    ballot_card::BallotTypeCodingError,
    coding,
    election::{BallotStyleId, PrecinctId},
};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Invalid prelude: {0:?}")]
    InvalidPrelude([u8; 3]),

    #[error("Invalid ballot type: {0}")]
    InvalidBallotType(#[from] BallotTypeCodingError),

    #[error("Invalid precinct index: {index} (count: {count})")]
    InvalidPrecinctIndex { index: usize, count: usize },

    #[error("Invalid precinct ID: {0}")]
    InvalidPrecinctId(PrecinctId),

    #[error("Invalid ballot style index: {index} (count: {count})")]
    InvalidBallotStyleIndex { index: usize, count: usize },

    #[error("Invalid ballot style ID: {0}")]
    InvalidBallotStyleId(BallotStyleId),

    #[error("Invalid ballot audit ID: {0}")]
    InvalidBallotAuditId(String),

    #[error("Invalid votes: {message}")]
    InvalidVotes { message: String },

    #[error("Coding error: {0}")]
    Coding(#[from] coding::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}
