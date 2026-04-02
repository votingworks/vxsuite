use std::{collections::HashMap, fmt::Display};

use bitstream_io::{FromBitStream, ToBitStream};
use serde::{Deserialize, Serialize};

use crate::{
    ballot_card::{BallotAuditIdLength, BallotStyleByIndex, PrecinctByIndex},
    election::{BallotStyle, BallotStyleId, Contest, ContestId, Election, PrecinctId},
};

use super::{error::Error, votes::ContestVote, PartialBallotHash};

/// Fields shared by both single-page and multi-page BMD ballot encodings,
/// decoded from the common header portion of the bitstream (ballot hash,
/// precinct index, ballot style index).
pub struct BallotHeader {
    pub ballot_hash: PartialBallotHash,
    pub precinct_id: PrecinctId,
    pub ballot_style: BallotStyle,
}

/// Reads the ballot hash, precinct index, and ballot style index from the
/// bitstream, resolving indices against the election definition.
///
/// # Errors
///
/// Returns an error if the precinct or ballot style index is invalid.
pub fn read_ballot_header<R: bitstream_io::BitRead + ?Sized>(
    r: &mut R,
    election: &Election,
) -> Result<BallotHeader, Error> {
    let ballot_hash: PartialBallotHash = r.read_to()?;
    let precinct_index: PrecinctByIndex = r.parse_with(election)?;
    let ballot_style_index: BallotStyleByIndex = r.parse_with(election)?;

    Ok(BallotHeader {
        ballot_hash,
        precinct_id: precinct_index.precinct().id.clone(),
        ballot_style: ballot_style_index.ballot_style().clone(),
    })
}

/// Writes the ballot hash, precinct index, and ballot style index, returning
/// the resolved ballot style for downstream use (e.g. looking up contests).
///
/// # Errors
///
/// Returns an error if the precinct or ballot style ID is not found in the
/// election definition.
pub fn write_ballot_header<W: bitstream_io::BitWrite + ?Sized>(
    w: &mut W,
    election: &Election,
    ballot_hash: &PartialBallotHash,
    precinct_id: &PrecinctId,
    ballot_style_id: &BallotStyleId,
) -> Result<BallotStyle, Error> {
    w.write_bytes(ballot_hash)?;

    let precinct_index = election
        .precinct_index(precinct_id)
        .ok_or_else(|| Error::InvalidPrecinctId(precinct_id.clone()))?;
    w.build(&precinct_index)?;

    let ballot_style_index = election
        .ballot_style_index(ballot_style_id)
        .ok_or_else(|| Error::InvalidBallotStyleId(ballot_style_id.clone()))?;
    w.build(&ballot_style_index)?;

    election
        .ballot_styles
        .get(ballot_style_index.get() as usize)
        .cloned()
        .ok_or(Error::InvalidBallotStyleIndex {
            index: ballot_style_index.get() as usize,
            count: election.ballot_styles.len(),
        })
}

/// Writes the roll call (one bit per contest indicating votes present) and
/// the vote data for contests that have votes.
///
/// # Errors
///
/// Returns an error if vote data cannot be encoded.
#[allow(clippy::implicit_hasher)]
pub fn write_roll_call_and_votes<W: bitstream_io::BitWrite + ?Sized>(
    w: &mut W,
    contests: &[Contest],
    votes: &HashMap<ContestId, ContestVote>,
) -> Result<(), Error> {
    for contest in contests {
        let contest_vote = votes.get(contest.id());
        w.write_bit(contest_vote.is_some_and(ContestVote::has_votes))?;
    }

    for contest in contests {
        if let Some(contest_vote) = votes.get(contest.id()) {
            if contest_vote.has_votes() {
                w.build_with(contest_vote, contest)?;
            }
        }
    }

    Ok(())
}

/// Reads the roll call and vote data for a list of contests, returning the
/// decoded votes.
///
/// # Errors
///
/// Returns an error if vote data cannot be decoded.
pub fn read_roll_call_and_votes<R: bitstream_io::BitRead + ?Sized>(
    r: &mut R,
    contests: &[Contest],
) -> Result<HashMap<ContestId, ContestVote>, Error> {
    let mut contests_with_votes = Vec::new();
    for contest in contests {
        if r.read_bit()? {
            contests_with_votes.push(contest);
        }
    }

    let mut votes = HashMap::new();
    for contest in contests_with_votes {
        let vote: ContestVote = r.parse_with(contest)?;
        votes.insert(contest.id().clone(), vote);
    }

    Ok(votes)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct BallotAuditId(String);

impl BallotAuditId {
    /// Builds a new `BallotAuditId` if `value` is a valid ballot audit ID.
    ///
    /// # Errors
    ///
    /// Fails if the given ballot audit ID length is out of bounds.
    pub fn new(value: impl Into<String>) -> Result<Self, Error> {
        let value = value.into();
        match BallotAuditIdLength::try_from(value.len()) {
            Err(_) => Err(Error::InvalidBallotAuditId(value)),
            Ok(_) => Ok(Self(value)),
        }
    }
}

impl ToBitStream for BallotAuditId {
    type Error = Error;

    fn to_writer<W: bitstream_io::BitWrite + ?Sized>(&self, w: &mut W) -> Result<(), Self::Error>
    where
        Self: Sized,
    {
        let bytes = self.0.as_bytes();
        let len = BallotAuditIdLength::try_from(bytes.len())
            .expect("BallotAuditId must have valid length");
        w.build(&len)?;
        w.write_bytes(bytes)?;
        Ok(())
    }
}

impl FromBitStream for BallotAuditId {
    type Error = Error;

    fn from_reader<R: bitstream_io::BitRead + ?Sized>(r: &mut R) -> Result<Self, Self::Error>
    where
        Self: Sized,
    {
        let len: BallotAuditIdLength = r.parse()?;
        let bytes = r.read_to_vec(len.get().into())?;
        Ok(Self(String::from_utf8(bytes).map_err(|err| {
            Error::InvalidBallotAuditId(err.to_string())
        })?))
    }
}

impl Display for BallotAuditId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}
