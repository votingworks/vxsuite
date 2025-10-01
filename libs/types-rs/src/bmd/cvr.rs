use std::collections::HashMap;

use bitstream_io::{FromBitStreamWith, ToBitStreamWith};
use serde::Serialize;

use crate::{
    ballot_card::{BallotAuditIdLength, BallotStyleByIndex, BallotType, PrecinctByIndex},
    bmd::{error::Error, votes::ContestVote, PartialBallotHash, PRELUDE},
    election::{BallotStyleId, ContestId, Election, PrecinctId},
};

/// A cast vote record as encoded on a BMD summary ballot's QR code.
#[derive(Debug, Serialize, PartialEq)]
pub struct CastVoteRecord {
    pub ballot_hash: PartialBallotHash,
    pub ballot_style_id: BallotStyleId,
    pub precinct_id: PrecinctId,
    pub votes: HashMap<ContestId, ContestVote>,
    pub is_test_mode: bool,
    pub ballot_type: BallotType,
    // Not currently used in BMD ballots, but we do try to read them.
    pub ballot_audit_id: Option<String>,
}

impl ToBitStreamWith<'_> for CastVoteRecord {
    type Context = Election;
    type Error = Error;

    fn to_writer<W: bitstream_io::BitWrite + ?Sized>(
        &self,
        w: &mut W,
        election: &Self::Context,
    ) -> Result<(), Self::Error>
    where
        Self: Sized,
    {
        w.write_bytes(PRELUDE)?;
        w.write_bytes(&self.ballot_hash)?;

        let precinct_index = election
            .precinct_index(&self.precinct_id)
            .ok_or_else(|| Error::InvalidPrecinctId(self.precinct_id.clone()))?;
        w.build(&precinct_index)?;

        let ballot_style_index = election
            .ballot_style_index(&self.ballot_style_id)
            .ok_or_else(|| Error::InvalidBallotStyleId(self.ballot_style_id.clone()))?;
        w.build(&ballot_style_index)?;

        let ballot_style = election
            .ballot_styles
            .get(ballot_style_index.get() as usize)
            .ok_or_else(|| Error::InvalidBallotStyleIndex {
                index: ballot_style_index.get() as usize,
                count: election.ballot_styles.len(),
            })?;

        w.write_bit(self.is_test_mode)?;
        w.build(&self.ballot_type)?;

        let contests = election.contests_in(ballot_style);

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

        // write roll call
        for contest in &contests {
            let contest_vote = self.votes.get(contest.id());
            w.write_bit(contest_vote.is_some_and(ContestVote::has_votes))?;
        }

        // write vote data
        for contest in &contests {
            if let Some(contest_vote) = self.votes.get(contest.id()) {
                if contest_vote.has_votes() {
                    w.build_with(contest_vote, contest)?;
                }
            }
        }

        Ok(())
    }
}

impl FromBitStreamWith<'_> for CastVoteRecord {
    type Error = Error;
    type Context = Election;

    fn from_reader<R: bitstream_io::BitRead + ?Sized>(
        r: &mut R,
        election: &Self::Context,
    ) -> Result<Self, Self::Error>
    where
        Self: Sized,
    {
        let prelude: [u8; 3] = r.read_to()?;
        if &prelude != PRELUDE {
            return Err(Error::InvalidPrelude(prelude));
        }

        let ballot_hash: PartialBallotHash = r.read_to()?;
        let precinct_index: PrecinctByIndex = r.parse_with(election)?;
        let ballot_style_index: BallotStyleByIndex = r.parse_with(election)?;
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

        // read roll call
        let contests = election.contests_in(ballot_style);
        let mut contests_with_votes = vec![];

        for contest in contests {
            if r.read_bit()? {
                contests_with_votes.push(contest);
            }
        }

        // read vote data
        let mut votes = HashMap::new();

        for contest in contests_with_votes {
            let vote = r.parse_with(&contest)?;
            votes.insert(contest.id().clone(), vote);
        }

        Ok(CastVoteRecord {
            ballot_hash,
            ballot_style_id: ballot_style.id.clone(),
            precinct_id: precinct.id.clone(),
            votes,
            is_test_mode,
            ballot_type,
            ballot_audit_id,
        })
    }
}
