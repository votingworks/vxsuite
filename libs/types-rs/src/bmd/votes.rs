use bitstream_io::{FromBitStreamWith, ToBitStreamWith};
use serde::Serialize;

use super::error::Error;
use super::write_in_name::WriteInName;
use crate::{
    coding::BitSize,
    election::{Contest, OptionId},
};

#[derive(Debug, PartialEq, Serialize)]
pub enum CandidateVote {
    NamedCandidate {
        candidate_id: OptionId,
    },
    WriteInCandidate {
        candidate_id: OptionId,
        name: WriteInName,
    },
}

impl CandidateVote {
    pub fn candidate_id(&self) -> &OptionId {
        match self {
            Self::NamedCandidate { candidate_id } | Self::WriteInCandidate { candidate_id, .. } => {
                candidate_id
            }
        }
    }
}
pub type YesNoVote = OptionId;

#[derive(Debug, PartialEq, Serialize)]
pub enum ContestVote {
    Candidate(Vec<CandidateVote>),
    YesNo(YesNoVote),
}

impl ToBitStreamWith<'_> for ContestVote {
    type Error = Error;
    type Context = Contest;

    fn to_writer<W: bitstream_io::BitWrite + ?Sized>(
        &self,
        w: &mut W,
        contest: &Self::Context,
    ) -> Result<(), Self::Error>
    where
        Self: Sized,
    {
        match (contest, self) {
            (Contest::Candidate(candidate_contest), Self::Candidate(votes)) => {
                // candidate choices get one bit per candidate
                for candidate in &candidate_contest.candidates {
                    w.write_bit(
                        votes
                            .iter()
                            .any(|candidate_vote| candidate_vote.candidate_id() == candidate.id()),
                    )?;
                }

                if candidate_contest.allow_write_ins {
                    // write write-in data
                    let write_in_count = votes
                        .iter()
                        .filter(|vote| matches!(vote, CandidateVote::WriteInCandidate { .. }))
                        .count();
                    let non_write_in_count = votes.len() - write_in_count;
                    let maximum_write_ins = candidate_contest
                        .seats
                        .saturating_sub(non_write_in_count as u32);

                    if maximum_write_ins > 0 {
                        w.write_unsigned_var(maximum_write_ins.bit_size(), write_in_count as u32)?;

                        for vote in votes {
                            if let CandidateVote::WriteInCandidate { name, .. } = vote {
                                w.build(name)?;
                            }
                        }
                    }
                }
            }

            (Contest::YesNo(yesno_contest), Self::YesNo(vote)) => {
                if vote == &yesno_contest.yes_option.id {
                    w.write_bit(true)?;
                } else if vote == &yesno_contest.no_option.id {
                    w.write_bit(false)?;
                } else {
                    return Err(Error::InvalidVotes {
                        message: format!("Contest '{}' has a vote for option '{vote}', but that is not one of the options for that contest (yes={}, no={})",
                            yesno_contest.id,
                            yesno_contest.yes_option.id,
                            yesno_contest.no_option.id,
                        )
                    });
                }
            }

            _ => {
                return Err(Error::InvalidVotes {
                    message: format!(
                        "Contest '{}' and its associated votes are not the same contest type",
                        contest.id()
                    ),
                })
            }
        }

        Ok(())
    }
}

impl FromBitStreamWith<'_> for ContestVote {
    type Error = Error;
    type Context = Contest;

    fn from_reader<R: bitstream_io::BitRead + ?Sized>(
        r: &mut R,
        contest: &Self::Context,
    ) -> Result<Self, Self::Error>
    where
        Self: Sized,
    {
        match contest {
            Contest::Candidate(candidate_contest) => {
                // candidate choices get one bit per candidate
                let mut votes = Vec::with_capacity(candidate_contest.candidates.len());

                for candidate in &candidate_contest.candidates {
                    if r.read_bit()? {
                        votes.push(CandidateVote::NamedCandidate {
                            candidate_id: candidate.id().clone(),
                        });
                    }
                }

                if candidate_contest.allow_write_ins {
                    // read write-in votes
                    let maximum_write_ins =
                        candidate_contest.seats.saturating_sub(votes.len() as u32);

                    if maximum_write_ins > 0 {
                        let write_in_count: u32 =
                            r.read_unsigned_var(maximum_write_ins.bit_size())?;

                        for _ in 0..write_in_count {
                            let name: WriteInName = r.parse()?;

                            votes.push(CandidateVote::WriteInCandidate {
                                candidate_id: OptionId::from(format!("write-in-{name}")),
                                name,
                            });
                        }
                    }
                }

                Ok(Self::Candidate(votes))
            }
            Contest::YesNo(yesno_contest) => {
                // yesno votes get a single bit
                Ok(Self::YesNo(if r.read_bit()? {
                    yesno_contest.yes_option.id.clone()
                } else {
                    yesno_contest.no_option.id.clone()
                }))
            }
        }
    }
}

impl ContestVote {
    #[must_use]
    pub fn has_votes(&self) -> bool {
        match self {
            Self::Candidate(votes) => !votes.is_empty(),
            Self::YesNo(_) => true,
        }
    }
}
