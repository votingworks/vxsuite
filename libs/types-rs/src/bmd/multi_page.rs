use std::collections::HashMap;

use bitstream_io::{FromBitStreamWith, ToBitStreamWith};

use crate::{
    ballot_card::BallotType,
    bmd::{
        encoding::{self, BallotAuditId, BallotHeader},
        error::Error,
        votes::ContestVote,
        PartialBallotHash, MULTI_PAGE_PRELUDE,
    },
    coding,
    election::{BallotStyleId, ContestId, Election, PrecinctId},
};

/// Maximum number of pages in a multi-page BMD ballot.
const MAXIMUM_PAGES: u8 = 30;

/// Number of bits needed to encode page number or total pages.
const PAGE_BITS: u32 = coding::const_bit_size(MAXIMUM_PAGES as u64);

/// A single page of a multi-page BMD summary ballot, as encoded in the QR code.
#[derive(Debug, PartialEq, serde::Serialize)]
pub struct MultiPageCastVoteRecord {
    pub ballot_hash: PartialBallotHash,
    pub ballot_style_id: BallotStyleId,
    pub precinct_id: PrecinctId,
    pub page_number: u8,
    pub total_pages: u8,
    pub is_test_mode: bool,
    pub ballot_type: BallotType,
    pub ballot_audit_id: BallotAuditId,
    /// The IDs of contests included on this page.
    pub contest_ids: Vec<ContestId>,
    /// Votes for the contests on this page.
    pub votes: HashMap<ContestId, ContestVote>,
}

impl ToBitStreamWith<'_> for MultiPageCastVoteRecord {
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
        w.write_bytes(MULTI_PAGE_PRELUDE)?;

        let ballot_style = encoding::write_ballot_header(
            w,
            election,
            &self.ballot_hash,
            &self.precinct_id,
            &self.ballot_style_id,
        )?;

        w.write_var::<u8>(PAGE_BITS, self.page_number)?;
        w.write_var::<u8>(PAGE_BITS, self.total_pages)?;
        w.write_bit(self.is_test_mode)?;
        w.build(&self.ballot_type)?;

        w.build(&self.ballot_audit_id)?;

        let all_contests = election.contests_in(&ballot_style);
        let contests_on_page: std::collections::HashSet<&ContestId> =
            self.contest_ids.iter().collect();

        // Write contest bitmap: one bit per contest in the ballot style
        for contest in &all_contests {
            w.write_bit(contests_on_page.contains(contest.id()))?;
        }

        // Collect the contests that are on this page (preserving ballot style order)
        let page_contests: Vec<_> = all_contests
            .into_iter()
            .filter(|c| contests_on_page.contains(c.id()))
            .collect();

        encoding::write_roll_call_and_votes(w, &page_contests, &self.votes)?;

        Ok(())
    }
}

impl FromBitStreamWith<'_> for MultiPageCastVoteRecord {
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
        if &prelude != MULTI_PAGE_PRELUDE {
            return Err(Error::InvalidPrelude(prelude));
        }

        let BallotHeader {
            ballot_hash,
            precinct_id,
            ballot_style,
        } = encoding::read_ballot_header(r, election)?;

        let page_number = r.read_var::<u8>(PAGE_BITS)?;
        let total_pages = r.read_var::<u8>(PAGE_BITS)?;
        let is_test_mode = r.read_bit()?;
        let ballot_type: BallotType = r.parse()?;
        let ballot_audit_id: BallotAuditId = r.parse()?;

        let all_contests = election.contests_in(&ballot_style);

        // Read contest bitmap: which contests are on this page
        let mut contest_ids = Vec::new();
        let mut contests_on_page = Vec::new();
        for contest in &all_contests {
            if r.read_bit()? {
                contest_ids.push(contest.id().clone());
                contests_on_page.push(contest.clone());
            }
        }

        let votes = encoding::read_roll_call_and_votes(r, &contests_on_page)?;

        Ok(Self {
            ballot_hash,
            ballot_style_id: ballot_style.id.clone(),
            precinct_id,
            page_number,
            total_pages,
            is_test_mode,
            ballot_type,
            ballot_audit_id,
            contest_ids,
            votes,
        })
    }
}
