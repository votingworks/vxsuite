use std::collections::HashMap;

use bitstream_io::{FromBitStreamWith, ToBitStreamWith};

use crate::{
    ballot_card::BallotType,
    bmd::{
        encoding::{self, BallotAuditId, BallotHeader},
        error::Error,
        votes::ContestVote,
        PartialBallotHash, SINGLE_PAGE_PRELUDE,
    },
    election::{BallotStyleId, ContestId, Election, PrecinctId},
};

/// A cast vote record as encoded on a BMD summary ballot's QR code.
#[derive(Debug, PartialEq, serde::Serialize)]
pub struct CastVoteRecord {
    pub ballot_hash: PartialBallotHash,
    pub ballot_style_id: BallotStyleId,
    pub precinct_id: PrecinctId,
    pub votes: HashMap<ContestId, ContestVote>,
    pub is_test_mode: bool,
    pub ballot_type: BallotType,
    // Not currently used in BMD ballots, but we do try to read them.
    pub ballot_audit_id: Option<BallotAuditId>,
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
        w.write_bytes(SINGLE_PAGE_PRELUDE)?;

        let ballot_style = encoding::write_ballot_header(
            w,
            election,
            &self.ballot_hash,
            &self.precinct_id,
            &self.ballot_style_id,
        )?;

        w.write_bit(self.is_test_mode)?;
        w.build(&self.ballot_type)?;

        match self.ballot_audit_id {
            Some(ref ballot_audit_id) => {
                w.write_bit(true)?;
                w.build(ballot_audit_id)?;
            }

            None => w.write_bit(false)?,
        }

        let contests = election.contests_in(&ballot_style);
        encoding::write_roll_call_and_votes(w, &contests, &self.votes)?;

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
        if &prelude != SINGLE_PAGE_PRELUDE {
            return Err(Error::InvalidPrelude(prelude));
        }

        let BallotHeader {
            ballot_hash,
            precinct_id,
            ballot_style,
        } = encoding::read_ballot_header(r, election)?;

        let is_test_mode = r.read_bit()?;
        let ballot_type: BallotType = r.parse()?;

        let ballot_audit_id = if r.read_bit()? {
            Some(r.parse()?)
        } else {
            None
        };

        let contests = election.contests_in(&ballot_style);
        let votes = encoding::read_roll_call_and_votes(r, &contests)?;

        Ok(CastVoteRecord {
            ballot_hash,
            ballot_style_id: ballot_style.id.clone(),
            precinct_id,
            votes,
            is_test_mode,
            ballot_type,
            ballot_audit_id,
        })
    }
}
