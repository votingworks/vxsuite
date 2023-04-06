#![feature(slice_group_by)]

use std::hash::Hash;
use std::{collections::hash_map::DefaultHasher, hash::Hasher};

use base64::engine::{general_purpose::URL_SAFE_NO_PAD, Engine};
use election::BallotSide;
use serde::Deserialize;

use crate::election::{County, Election, GridLayout};

mod election;

#[derive(Debug, Deserialize)]
struct GridEntryRow {
    #[serde(rename = "Contest Name")]
    contest_name: String,
    #[serde(rename = "Vote for")]
    vote_for: usize,
    #[serde(rename = "Candidate Name")]
    candidate_name: String,
    #[serde(rename = "Ballot Style")]
    ballot_style_id: String,
    #[serde(rename = "Precinct")]
    precinct_id: String,
    #[serde(rename = "Side")]
    side: BallotSide,
    #[serde(rename = "Column")]
    column: usize,
    #[serde(rename = "Row")]
    row: usize,
}

#[derive(Debug)]
struct Ballot {
    ballot_style_id: String,
    precinct_id: String,
    contests: Vec<Contest>,
}

#[derive(Debug, Hash)]
struct Contest {
    name: String,
    candidates: Vec<Candidate>,
    vote_for: usize,
}

#[derive(Debug, Hash)]
struct Candidate {
    name: String,
    side: BallotSide,
    column: usize,
    row: usize,
}

fn convert_csv_contest_to_election_contest(
    ballot: &Ballot,
    contest: &Contest,
) -> election::Contest {
    // create a regex that matches all non-alphanumeric characters
    let re = regex::Regex::new(r"[^a-zA-Z0-9]+").unwrap();
    let (non_write_in_candidates, write_in_candidates): (Vec<_>, Vec<_>) = contest
        .candidates
        .iter()
        .partition(|c| c.name != "Write-In");

    assert!(write_in_candidates.is_empty() || write_in_candidates.len() == contest.vote_for);

    let candidates: Vec<_> = non_write_in_candidates
        .iter()
        .map(|c| {
            let mut hasher = DefaultHasher::new();
            (*c).hash(&mut hasher);

            election::CandidateContestOption {
                id: format!(
                    "{}-{}",
                    re.replace_all(c.name.as_str(), "-"),
                    URL_SAFE_NO_PAD.encode(hasher.finish().to_le_bytes())
                ),
                name: c.name.clone(),
                is_write_in: None,
            }
        })
        .collect();
    let allow_write_ins = !write_in_candidates.is_empty();
    let mut hasher = DefaultHasher::new();
    contest.hash(&mut hasher);
    let contest_id = format!(
        "{}-{}",
        re.replace_all(contest.name.as_str(), "-"),
        URL_SAFE_NO_PAD.encode(hasher.finish().to_le_bytes())
    );

    election::Contest::Candidate(election::CandidateContest {
        id: contest_id,
        district_id: ballot.precinct_id.clone(),
        title: contest.name.clone(),
        description: contest.name.clone(),
        candidates,
        seats: contest.vote_for,
        allow_write_ins,
    })
}

fn main() {
    let path = std::env::args().nth(1).unwrap();
    let mut rdr = csv::Reader::from_path(path.clone()).unwrap();
    let entries: Vec<GridEntryRow> = rdr.deserialize().collect::<Result<_, _>>().unwrap();

    let ballots: Vec<_> = entries
        .group_by(|e1, e2| {
            e1.ballot_style_id == e2.ballot_style_id && e1.precinct_id == e2.precinct_id
        })
        .map(|ballot_entries| Ballot {
            ballot_style_id: ballot_entries[0].ballot_style_id.clone(),
            precinct_id: ballot_entries[0].precinct_id.clone(),
            contests: ballot_entries
                .group_by(|e1, e2| e1.contest_name == e2.contest_name)
                .map(|entries| Contest {
                    name: entries[0].contest_name.to_string(),
                    candidates: entries
                        .iter()
                        .map(|e| Candidate {
                            name: e.candidate_name.to_string(),
                            side: e.side,
                            column: e.column,
                            row: e.row,
                        })
                        .collect(),
                    vote_for: entries[0].vote_for,
                })
                .collect(),
        })
        .collect();

    let grid_layouts = ballots
        .iter()
        .map(|ballot| {
            let election_contests: Vec<election::Contest> = ballot
                .contests
                .iter()
                .map(|c| convert_csv_contest_to_election_contest(ballot, c))
                .collect();
            let grid_positions: Vec<election::GridPosition> = ballot
                .contests
                .iter()
                .zip(&election_contests)
                .flat_map(|(csv_contest, election_contest)| {
                    let election::Contest::Candidate(election_contest) = &election_contest else {
                        panic!("unexpected contest type");
                    };

                    let contest_id = election_contest.id.clone();
                    let mut next_write_in_index = 0;
                    csv_contest
                        .candidates
                        .iter()
                        .zip(&election_contest.candidates)
                        .map(|(csv_candidate, election_candidate)| {
                            if csv_candidate.name == "Write-In" {
                                let write_in_index = next_write_in_index;
                                next_write_in_index += 1;
                                election::GridPosition::WriteIn {
                                    side: csv_candidate.side,
                                    column: csv_candidate.column as u32,
                                    row: csv_candidate.row as u32,
                                    contest_id: contest_id.clone(),
                                    write_in_index,
                                }
                            } else {
                                election::GridPosition::Option {
                                    side: csv_candidate.side,
                                    column: csv_candidate.column as u32,
                                    row: csv_candidate.row as u32,
                                    contest_id: contest_id.clone(),
                                    option_id: election_candidate.id.clone(),
                                }
                            }
                        })
                        .collect::<Vec<_>>()
                })
                .collect();

            GridLayout {
                ballot_style_id: ballot.ballot_style_id.clone(),
                precinct_id: ballot.precinct_id.clone(),
                columns: 34,
                rows: 41,
                grid_positions,
            }
        })
        .collect();
    let ballot_styles: Vec<_> = ballots
        .iter()
        .map(|ballot| election::BallotStyle {
            id: ballot.ballot_style_id.clone(),
            party_id: None,
            districts: vec![ballot.precinct_id.clone()],
            precincts: vec![ballot.precinct_id.clone()],
        })
        .collect();
    let precincts: Vec<_> = ballots
        .iter()
        .map(|ballot| election::Precinct {
            id: ballot.precinct_id.clone(),
            name: ballot.precinct_id.clone(),
        })
        .collect();
    let contests = ballots
        .iter()
        .flat_map(|b| {
            b.contests
                .iter()
                .map(|c| convert_csv_contest_to_election_contest(b, c))
                .collect::<Vec<_>>()
        })
        .collect();

    let parties = vec![];
    let districts: Vec<_> = precincts
        .group_by(|p1, p2| p1.id == p2.id)
        .map(|districts| election::District {
            id: districts[0].id.clone(),
            name: districts[0].name.clone(),
        })
        .collect();
    let precincts: Vec<_> = precincts
        .group_by(|p1, p2| p1.id == p2.id)
        .map(|precincts| precincts[0].clone())
        .collect();
    let ballot_styles: Vec<_> = ballot_styles
        .group_by(|bs1, bs2| bs1.id == bs2.id)
        .map(|ballot_styles| ballot_styles[0].clone())
        .collect();

    // current date in ISO 8601 format
    let date = chrono::Utc::now().format("%Y-%m-%d").to_string();

    let election = Election {
        title: path,
        date,
        county: County {
            id: "TODO".to_string(),
            name: "TODO".to_string(),
        },
        state: "TODO".to_string(),
        districts,
        parties,
        contests,
        ballot_styles,
        precincts,
        ballot_layout: Some(election::BallotLayout {
            paper_size: election::BallotPaperSize::Letter,
            layout_density: None,
            target_mark_position: None,
        }),
        grid_layouts,
        mark_thresholds: None,
    };

    println!("{}", serde_json::to_string_pretty(&election).unwrap());
}
