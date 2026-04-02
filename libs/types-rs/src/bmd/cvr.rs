use std::collections::HashMap;

use bitstream_io::{FromBitStreamWith, ToBitStreamWith};

use crate::{
    ballot_card::{BallotAuditIdLength, BallotType},
    bmd::{
        encoding::{self, BallotHeader},
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

        let contests = election.contests_in(&ballot_style);
        let contest_refs: Vec<_> = contests.iter().collect();
        encoding::write_roll_call_and_votes(w, &contest_refs, &self.votes)?;

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
            let ballot_audit_id_length: BallotAuditIdLength = r.parse()?;
            let ballot_audit_id_bytes = r.read_to_vec(ballot_audit_id_length.get().into())?;
            Some(
                String::from_utf8(ballot_audit_id_bytes)
                    .map_err(|err| Error::InvalidBallotAuditId(err.to_string()))?,
            )
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
