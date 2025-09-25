use proptest::prelude::*;

use types_rs::{
    ballot_card::BallotType,
    election::{
        BallotLayout, BallotStyle, BallotStyleGroupId, BallotStyleId, Candidate, CandidateContest,
        Contest, ContestId, DistrictId, Election, MetadataEncoding, NamedCandidate, OptionId,
        Precinct, PrecinctId, YesNoContest, YesNoOption,
    },
};

#[must_use]
pub fn simple_election() -> Election {
    Election {
        title: "Test Election".to_owned(),
        ballot_styles: vec![BallotStyle {
            id: BallotStyleId::from("bs-1".to_owned()),
            group_id: BallotStyleGroupId::from("bsg-1".to_owned()),
            precincts: vec![PrecinctId::from("p-1".to_owned())],
            districts: vec![DistrictId::from("d-1".to_owned())],
            party_id: None,
            languages: vec![],
        }],
        precincts: vec![Precinct {
            id: PrecinctId::from("p-1".to_owned()),
        }],
        grid_layouts: None,
        mark_thresholds: None,
        ballot_layout: BallotLayout {
            metadata_encoding: MetadataEncoding::QrCode,
        },
        contests: vec![
            Contest::Candidate(CandidateContest {
                id: ContestId::from("cc-1".to_owned()),
                district_id: DistrictId::from("d-1".to_owned()),
                title: "Who shall it be?".to_owned(),
                seats: 1,
                candidates: vec![Candidate::Named(NamedCandidate {
                    id: OptionId::from("c-1".to_owned()),
                    name: "Candidate 1".to_owned(),
                    party_ids: None,
                })],
                allow_write_ins: true,
                party_id: None,
                term_description: None,
            }),
            Contest::YesNo(YesNoContest {
                id: ContestId::from("yn-1".to_owned()),
                district_id: DistrictId::from("d-1".to_owned()),
                title: "To be or not to be?".to_owned(),
                description: "That is the question.".to_owned(),
                yes_option: YesNoOption {
                    id: OptionId::from("yn-1-yes".to_owned()),
                    label: "Yes".to_owned(),
                },
                no_option: YesNoOption {
                    id: OptionId::from("yn-1-no".to_owned()),
                    label: "No".to_owned(),
                },
            }),
        ],
    }
}

pub fn arbitrary_ballot_type() -> impl Strategy<Value = BallotType> {
    prop_oneof![
        Just(BallotType::Precinct),
        Just(BallotType::Absentee),
        Just(BallotType::Provisional),
    ]
}

#[derive(Debug, Clone)]
enum ContestConfig {
    Candidate {
        district_id: DistrictId,
        allow_write_ins: bool,
        seats: u32,
    },
    YesNo {
        district_id: DistrictId,
    },
}

/// Generate a random vector of contests for a given district ID.
pub fn arbitrary_contests(district_id: DistrictId) -> impl Strategy<Value = Vec<Contest>> {
    prop::collection::vec(
        prop_oneof![
            (Just(district_id.clone()), prop::bool::ANY, 1u32..=20).prop_map(
                |(district_id, allow_write_ins, seats)| {
                    ContestConfig::Candidate {
                        district_id,
                        allow_write_ins,
                        seats,
                    }
                }
            ),
            Just(ContestConfig::YesNo { district_id }),
        ],
        0..20,
    )
    .prop_map(|contests| {
        contests
            .into_iter()
            .enumerate()
            .map(|(index, config)| match config {
                ContestConfig::Candidate {
                    district_id,
                    allow_write_ins,
                    seats,
                } => Contest::Candidate(CandidateContest {
                    id: ContestId::from(format!("cc-{index}")),
                    district_id: district_id.clone(),
                    title: format!("Candidate Contest {index}"),
                    seats,
                    candidates: vec![Candidate::Named(NamedCandidate {
                        id: OptionId::from(format!("cc-{index}-0")),
                        name: format!("Candidate {index}"),
                        party_ids: None,
                    })],
                    allow_write_ins,
                    party_id: None,
                    term_description: None,
                }),
                ContestConfig::YesNo { district_id } => Contest::YesNo(YesNoContest {
                    id: ContestId::from(format!("yn-{index}")),
                    yes_option: YesNoOption {
                        id: OptionId::from(format!("yn-{index}-yes")),
                        label: "Yes".to_owned(),
                    },
                    no_option: YesNoOption {
                        id: OptionId::from(format!("yn-{index}-no")),
                        label: "No".to_owned(),
                    },
                    district_id: district_id.clone(),
                    title: format!("Yes/No Contest {index}"),
                    description: format!("Description for Yes/No Contest {index}"),
                }),
            })
            .collect()
    })
}
