#![allow(clippy::unwrap_used)]

use proptest::proptest;
use types_rs::ballot_card::BallotType;
use types_rs::bmd::cvr::CastVoteRecord;
use types_rs::bmd::votes::{CandidateVote, ContestVote};
use types_rs::bmd::write_in_name::WriteInName;
use types_rs::bmd::BallotHash;
use types_rs::coding;
use types_rs::election::{Candidate, Contest, DistrictId, Election, OptionId};

use crate::common::{arbitrary_ballot_type, arbitrary_contests, simple_election};

mod common;

#[test]
fn test_cast_vote_record_round_trip_no_votes() {
    let election = simple_election();
    let ballot = CastVoteRecord {
        ballot_hash: [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09],
        ballot_style_id: election.ballot_styles.first().unwrap().id.clone(),
        precinct_id: election.precincts.first().unwrap().id.clone(),
        votes: Vec::new(),
        is_test_mode: true,
        ballot_type: BallotType::Precinct,
        ballot_audit_id: None,
    };

    let encoded_ballot = coding::encode_with(&ballot, &election).unwrap();
    let decoded_ballot: CastVoteRecord = coding::decode_with(&encoded_ballot, &election).unwrap();
    assert_eq!(decoded_ballot, ballot);
}

#[test]
fn test_cast_vote_record_round_trip_write_in_vote() {
    let election = simple_election();
    let candidate_contest = election
        .contests
        .iter()
        .find_map(|contest| match contest {
            Contest::Candidate(candidate_contest) => Some(candidate_contest),
            Contest::YesNo(_) => None,
        })
        .unwrap();
    let ballot = CastVoteRecord {
        ballot_hash: [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09],
        ballot_style_id: election.ballot_styles.first().unwrap().id.clone(),
        precinct_id: election.precincts.first().unwrap().id.clone(),
        votes: vec![ContestVote::Candidate {
            contest_id: candidate_contest.id.clone(),
            votes: vec![CandidateVote::WriteInCandidate {
                candidate_id: OptionId::from("write-in-BOB".to_owned()),
                name: WriteInName::new("BOB").unwrap(),
            }],
        }],
        is_test_mode: true,
        ballot_type: BallotType::Precinct,
        ballot_audit_id: None,
    };

    let encoded_ballot = coding::encode_with(&ballot, &election).unwrap();
    let decoded_ballot: CastVoteRecord = coding::decode_with(&encoded_ballot, &election).unwrap();
    assert_eq!(decoded_ballot, ballot);
}

proptest! {
    #[test]
    fn test_cast_vote_record_round_trip_max_votes(
        ballot_hash: BallotHash,
        is_test_mode: bool,
        ballot_type in arbitrary_ballot_type(),
        contests in arbitrary_contests(DistrictId::from("d-1".to_owned())),
    ) {
        let election = simple_election();
        let election = Election { contests, ..election };
        let ballot = CastVoteRecord {
            ballot_hash,
            ballot_style_id: election.ballot_styles.first().unwrap().id.clone(),
            precinct_id: election.precincts.first().unwrap().id.clone(),
            votes: election.contests.iter().map(|contest| match contest {
                Contest::Candidate(candidate_contest) => ContestVote::Candidate {
                    contest_id: candidate_contest.id.clone(),
                    votes: candidate_contest
                        .candidates
                        .iter()
                        .filter_map(|candidate| match candidate {
                            Candidate::Named(candidate) => Some(candidate),
                            Candidate::WriteIn(_) => None,
                        })
                        .map(|candidate| CandidateVote::NamedCandidate {
                            candidate_id: candidate.id.clone(),
                        })
                        .take(candidate_contest.seats as usize)
                        .collect(),
                },
                Contest::YesNo(yesno_contest) => ContestVote::YesNo {
                    contest_id: yesno_contest.id.clone(),
                    vote: yesno_contest.yes_option.id.clone(),
                },
            }).collect(),
            is_test_mode,
            ballot_type,
            ballot_audit_id: None,
        };

        let encoded_ballot = coding::encode_with(&ballot, &election).unwrap();
        let decoded_ballot: CastVoteRecord = coding::decode_with(&encoded_ballot, &election).unwrap();
        assert_eq!(decoded_ballot, ballot);
    }
}

#[test]
fn test_yesno_contest_vote_round_trip() {
    let election = simple_election();
    let (contest, yesno_contest) = election
        .contests
        .iter()
        .find_map(|contest| match contest {
            Contest::Candidate(_) => None,
            Contest::YesNo(yesno_contest) => Some((contest, yesno_contest)),
        })
        .unwrap();
    let contest_vote = ContestVote::YesNo {
        contest_id: yesno_contest.id.clone(),
        vote: yesno_contest.yes_option.id.clone(),
    };
    let encoded_contest_vote = coding::encode_with(&contest_vote, contest).unwrap();
    let decoded_contest_vote: ContestVote =
        coding::decode_with(&encoded_contest_vote, contest).unwrap();
    assert_eq!(decoded_contest_vote, contest_vote);
}

#[test]
fn test_candidate_contest_vote_round_trip() {
    let election = simple_election();
    let (contest, candidate_contest) = election
        .contests
        .iter()
        .find_map(|contest| match contest {
            Contest::Candidate(candidate_contest) => Some((contest, candidate_contest)),
            Contest::YesNo(_) => None,
        })
        .unwrap();
    let contest_vote = ContestVote::Candidate {
        contest_id: candidate_contest.id.clone(),
        votes: vec![CandidateVote::NamedCandidate {
            candidate_id: candidate_contest.candidates.first().unwrap().id().clone(),
        }],
    };
    let encoded_contest_vote = coding::encode_with(&contest_vote, contest).unwrap();
    let decoded_contest_vote: ContestVote =
        coding::decode_with(&encoded_contest_vote, contest).unwrap();
    assert_eq!(decoded_contest_vote, contest_vote);
}
