#![allow(clippy::unwrap_used)]

use std::collections::HashMap;

use proptest::proptest;
use types_rs::ballot_card::BallotType;
use types_rs::bmd::multi_page::MultiPageCastVoteRecord;
use types_rs::bmd::votes::{CandidateVote, ContestVote};
use types_rs::bmd::write_in_name::WriteInName;
use types_rs::bmd::PartialBallotHash;
use types_rs::coding;
use types_rs::election::{Candidate, Contest, DistrictId, Election, OptionId};

use crate::common::{arbitrary_ballot_type, arbitrary_contests, simple_election};

mod common;

#[test]
fn test_multi_page_round_trip_no_votes() {
    let election = simple_election();
    let all_contest_ids: Vec<_> = election.contests.iter().map(|c| c.id().clone()).collect();

    let record = MultiPageCastVoteRecord {
        ballot_hash: [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09],
        ballot_style_id: election.ballot_styles.first().unwrap().id.clone(),
        precinct_id: election.precincts.first().unwrap().id.clone(),
        page_number: 1,
        total_pages: 3,
        is_test_mode: false,
        ballot_type: BallotType::Precinct,
        ballot_audit_id: "audit-1".to_owned(),
        contest_ids: all_contest_ids,
        votes: HashMap::new(),
    };

    let encoded = coding::encode_with(&record, &election).unwrap();
    let decoded: MultiPageCastVoteRecord = coding::decode_with(&encoded, &election).unwrap();
    assert_eq!(decoded, record);
}

#[test]
fn test_multi_page_round_trip_empty_votes() {
    let election = simple_election();

    let record = MultiPageCastVoteRecord {
        ballot_hash: [0xaa; 10],
        ballot_style_id: election.ballot_styles.first().unwrap().id.clone(),
        precinct_id: election.precincts.first().unwrap().id.clone(),
        page_number: 2,
        total_pages: 3,
        is_test_mode: true,
        ballot_type: BallotType::Absentee,
        ballot_audit_id: "test-id-123".to_owned(),
        contest_ids: vec![],
        votes: HashMap::new(),
    };

    let encoded = coding::encode_with(&record, &election).unwrap();
    let decoded: MultiPageCastVoteRecord = coding::decode_with(&encoded, &election).unwrap();
    assert_eq!(decoded, record);
}

#[test]
fn test_multi_page_round_trip_with_votes() {
    let election = simple_election();
    let candidate_contest = election
        .contests
        .iter()
        .find_map(|contest| match contest {
            Contest::Candidate(cc) => Some(cc),
            Contest::YesNo(_) => None,
        })
        .unwrap();

    let record = MultiPageCastVoteRecord {
        ballot_hash: [0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x11, 0x22],
        ballot_style_id: election.ballot_styles.first().unwrap().id.clone(),
        precinct_id: election.precincts.first().unwrap().id.clone(),
        page_number: 1,
        total_pages: 2,
        is_test_mode: false,
        ballot_type: BallotType::Precinct,
        ballot_audit_id: "abc".to_owned(),
        contest_ids: vec![candidate_contest.id.clone()],
        votes: HashMap::from([(
            candidate_contest.id.clone(),
            ContestVote::Candidate(vec![CandidateVote::NamedCandidate {
                candidate_id: candidate_contest.candidates.first().unwrap().id().clone(),
            }]),
        )]),
    };

    let encoded = coding::encode_with(&record, &election).unwrap();
    let decoded: MultiPageCastVoteRecord = coding::decode_with(&encoded, &election).unwrap();
    assert_eq!(decoded, record);
}

#[test]
fn test_multi_page_round_trip_with_write_in() {
    let election = simple_election();
    let candidate_contest = election
        .contests
        .iter()
        .find_map(|contest| match contest {
            Contest::Candidate(cc) => Some(cc),
            Contest::YesNo(_) => None,
        })
        .unwrap();

    let record = MultiPageCastVoteRecord {
        ballot_hash: [0xff; 10],
        ballot_style_id: election.ballot_styles.first().unwrap().id.clone(),
        precinct_id: election.precincts.first().unwrap().id.clone(),
        page_number: 1,
        total_pages: 1,
        is_test_mode: true,
        ballot_type: BallotType::Provisional,
        ballot_audit_id: "write-in-test".to_owned(),
        contest_ids: vec![candidate_contest.id.clone()],
        votes: HashMap::from([(
            candidate_contest.id.clone(),
            ContestVote::Candidate(vec![CandidateVote::WriteInCandidate {
                candidate_id: OptionId::from("write-in-BOB".to_owned()),
                name: WriteInName::new("BOB").unwrap(),
            }]),
        )]),
    };

    let encoded = coding::encode_with(&record, &election).unwrap();
    let decoded: MultiPageCastVoteRecord = coding::decode_with(&encoded, &election).unwrap();
    assert_eq!(decoded, record);
}

#[test]
fn test_multi_page_round_trip_yesno_contest() {
    let election = simple_election();
    let yesno_contest = election
        .contests
        .iter()
        .find_map(|contest| match contest {
            Contest::YesNo(yn) => Some(yn),
            Contest::Candidate(_) => None,
        })
        .unwrap();

    let record = MultiPageCastVoteRecord {
        ballot_hash: [0x55; 10],
        ballot_style_id: election.ballot_styles.first().unwrap().id.clone(),
        precinct_id: election.precincts.first().unwrap().id.clone(),
        page_number: 2,
        total_pages: 2,
        is_test_mode: false,
        ballot_type: BallotType::Precinct,
        ballot_audit_id: "yn-test".to_owned(),
        contest_ids: vec![yesno_contest.id.clone()],
        votes: HashMap::from([(
            yesno_contest.id.clone(),
            ContestVote::YesNo(yesno_contest.yes_option.id.clone()),
        )]),
    };

    let encoded = coding::encode_with(&record, &election).unwrap();
    let decoded: MultiPageCastVoteRecord = coding::decode_with(&encoded, &election).unwrap();
    assert_eq!(decoded, record);
}

#[test]
fn test_multi_page_partial_contests_on_page() {
    let election = simple_election();
    let candidate_contest_id = election
        .contests
        .iter()
        .find_map(|contest| match contest {
            Contest::Candidate(cc) => Some(cc.id.clone()),
            Contest::YesNo(_) => None,
        })
        .unwrap();

    // Only one of two contests is on this page
    let record = MultiPageCastVoteRecord {
        ballot_hash: [0x42; 10],
        ballot_style_id: election.ballot_styles.first().unwrap().id.clone(),
        precinct_id: election.precincts.first().unwrap().id.clone(),
        page_number: 1,
        total_pages: 2,
        is_test_mode: false,
        ballot_type: BallotType::Precinct,
        ballot_audit_id: "partial".to_owned(),
        contest_ids: vec![candidate_contest_id],
        votes: HashMap::new(),
    };

    let encoded = coding::encode_with(&record, &election).unwrap();
    let decoded: MultiPageCastVoteRecord = coding::decode_with(&encoded, &election).unwrap();
    assert_eq!(decoded, record);
}

#[test]
fn test_multi_page_invalid_prelude() {
    let election = simple_election();
    // Data starting with VX\x02 (single-page prelude)
    let encoded = coding::encode_with(
        &types_rs::bmd::cvr::CastVoteRecord {
            ballot_hash: [0; 10],
            ballot_style_id: election.ballot_styles.first().unwrap().id.clone(),
            precinct_id: election.precincts.first().unwrap().id.clone(),
            votes: HashMap::new(),
            is_test_mode: false,
            ballot_type: BallotType::Precinct,
            ballot_audit_id: None,
        },
        &election,
    )
    .unwrap();

    let result = coding::decode_with::<MultiPageCastVoteRecord>(&encoded, &election);
    assert!(result.is_err());
}

proptest! {
    #[test]
    fn test_multi_page_round_trip_arbitrary(
        ballot_hash: PartialBallotHash,
        is_test_mode: bool,
        ballot_type in arbitrary_ballot_type(),
        contests in arbitrary_contests(DistrictId::from("d-1".to_owned())),
    ) {
        let election = simple_election();
        let election = Election { contests, ..election };
        let all_contests = election.contests.clone();

        // Split contests across two pages
        let mid = all_contests.len() / 2;
        let page1_contests: Vec<_> = all_contests.iter().take(mid).collect();
        let page2_contests: Vec<_> = all_contests.iter().skip(mid).collect();

        // Build votes for page 1 contests
        let votes: HashMap<_, _> = page1_contests.iter().map(|contest| match contest {
            Contest::Candidate(cc) => (cc.id.clone(), ContestVote::Candidate(
                cc.candidates.iter()
                    .filter_map(|c| match c {
                        Candidate::Named(n) => Some(n),
                        Candidate::WriteIn(_) => None,
                    })
                    .map(|c| CandidateVote::NamedCandidate { candidate_id: c.id.clone() })
                    .take(cc.seats as usize)
                    .collect()
            )),
            Contest::YesNo(yn) => (yn.id.clone(), ContestVote::YesNo(yn.yes_option.id.clone())),
        }).collect();

        let record = MultiPageCastVoteRecord {
            ballot_hash,
            ballot_style_id: election.ballot_styles.first().unwrap().id.clone(),
            precinct_id: election.precincts.first().unwrap().id.clone(),
            page_number: 1,
            total_pages: 2,
            is_test_mode,
            ballot_type,
            ballot_audit_id: "test".to_owned(),
            contest_ids: page1_contests.iter().map(|c| c.id().clone()).collect(),
            votes,
        };

        let encoded = coding::encode_with(&record, &election).unwrap();
        let decoded: MultiPageCastVoteRecord = coding::decode_with(&encoded, &election).unwrap();
        assert_eq!(decoded, record);

        // Also test page 2 with no votes
        let record2 = MultiPageCastVoteRecord {
            ballot_hash,
            ballot_style_id: election.ballot_styles.first().unwrap().id.clone(),
            precinct_id: election.precincts.first().unwrap().id.clone(),
            page_number: 2,
            total_pages: 2,
            is_test_mode,
            ballot_type,
            ballot_audit_id: "test".to_owned(),
            contest_ids: page2_contests.iter().map(|c| c.id().clone()).collect(),
            votes: HashMap::new(),
        };

        let encoded2 = coding::encode_with(&record2, &election).unwrap();
        let decoded2: MultiPageCastVoteRecord = coding::decode_with(&encoded2, &election).unwrap();
        assert_eq!(decoded2, record2);
    }
}
