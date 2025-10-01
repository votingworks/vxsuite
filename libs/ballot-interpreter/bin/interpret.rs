use std::{fmt::Display, path::PathBuf, process, time::Instant};

use ballot_interpreter::{
    interpret::{
        EnabledInterpreterConfig, Error, Inference, InterpretedBallotCard, InterpretedBallotPage,
        ScanInterpreter, TimingMarkAlgorithm, VerticalStreakDetection, WriteInScoring,
    },
    scoring::UnitIntervalScore,
};
use clap::Parser;
use color_eyre::owo_colors::OwoColorize;
use types_rs::{
    bmd::{cvr::CastVoteRecord, votes::ContestVote},
    election::{Contest, Election},
};

#[derive(Debug, clap::Parser)]
#[allow(clippy::struct_excessive_bools)]
struct Options {
    /// Path to an election definition file.
    election_path: PathBuf,

    /// Path to an image of side A of the scanned ballot.
    side_a_path: PathBuf,

    /// Path to an image of side B of the scanned ballot.
    side_b_path: PathBuf,

    /// Output debug images.
    #[clap(long, default_value_t = false)]
    debug: bool,

    /// Output normalized images.
    #[clap(long, default_value_t = false)]
    write_normalized_images: bool,

    /// Determines whether to score write ins.
    #[clap(long, default_value_t = WriteInScoring::Disabled)]
    write_in_scoring: WriteInScoring,

    /// Vertical streak detection setting.
    #[clap(long, short = 'v', default_value_t = Default::default())]
    vertical_streak_detection: VerticalStreakDetection,

    /// Determines whether to disable timing mark inference (only applicable to contours algorithm).
    #[clap(long, default_value_t = Inference::Disabled)]
    timing_mark_inference: Inference,

    /// Which timing mark finding algorithm to use.
    #[clap(long, short = 'a', default_value_t = Default::default())]
    timing_mark_algorithm: TimingMarkAlgorithm,

    /// Detect and reject timing mark grid scales less than this value.
    #[clap(long)]
    minimum_detected_scale: Option<f32>,
}

impl Options {
    fn load_election(&self) -> color_eyre::Result<Election> {
        let file = std::fs::File::open(&self.election_path)?;
        let reader = std::io::BufReader::new(file);
        Ok(serde_json::from_reader(reader)?)
    }

    fn load_side_a_image(&self) -> color_eyre::Result<image::DynamicImage> {
        Ok(image::open(&self.side_a_path)?)
    }

    fn load_side_b_image(&self) -> color_eyre::Result<image::DynamicImage> {
        Ok(image::open(&self.side_b_path)?)
    }
}

fn main() -> color_eyre::Result<()> {
    let options = Options::parse();

    // Apply timing mark inference setting to the algorithm if it's Contours
    let timing_mark_algorithm = match options.timing_mark_algorithm {
        TimingMarkAlgorithm::Contours { .. } => TimingMarkAlgorithm::Contours {
            inference: options.timing_mark_inference,
        },
        TimingMarkAlgorithm::Corners => TimingMarkAlgorithm::Corners,
    };

    let election = options.load_election()?;
    let interpreter = ScanInterpreter::new(
        election.clone(),
        options.vertical_streak_detection,
        EnabledInterpreterConfig::all(
            options.write_in_scoring,
            timing_mark_algorithm,
            options.minimum_detected_scale.map(UnitIntervalScore),
        ),
    )?;

    let start = Instant::now();
    let result = interpreter.interpret(
        options.load_side_a_image()?.into_luma8(),
        options.load_side_b_image()?.into_luma8(),
        options.debug.then_some(options.side_a_path),
        options.debug.then_some(options.side_b_path),
    );
    let duration = start.elapsed();
    let exit_code = i32::from(result.is_err());

    print_result(&election, result);

    println!("⚡ {duration:.2?}");

    process::exit(exit_code)
}

fn print_result(election: &Election, result: Result<InterpretedBallotCard, Error>) {
    match result {
        Ok(InterpretedBallotCard::HandMarkedPaperBallot { front, back }) => {
            let front = *front;
            let back = *back;
            print_hand_marked_paper_ballot_interpretation(front, back);
        }

        Ok(InterpretedBallotCard::SummaryBallot { cvr, .. }) => {
            print_summary_ballot_interpretation(election, &cvr);
        }

        Err(err) => {
            eprintln!("Error: {err}");
        }
    }
}

fn print_hand_marked_paper_ballot_interpretation(
    front: InterpretedBallotPage,
    back: InterpretedBallotPage,
) {
    for page in [front, back] {
        for (position, scored_mark) in page.marks {
            println!(
                "({:05.2}, {:05.2}) ・ {} ・ {} → {}",
                position.location().column,
                position.location().row,
                position.contest_id(),
                position.option_id(),
                match scored_mark {
                    Some(m) => m.fill_score.to_string(),
                    None => "n/a".to_owned(),
                }
            );
        }
    }
}

fn print_summary_ballot_interpretation(election: &Election, cvr: &CastVoteRecord) {
    let ballot_style = election
        .ballot_styles
        .iter()
        .find(|bs| bs.id == cvr.ballot_style_id)
        .expect("ballot style must be present");
    let precinct = election
        .precincts
        .iter()
        .find(|p| p.id == cvr.precinct_id)
        .expect("precinct must be present");

    println!("{}  Summary Ballot", "Interpretation:".bold());
    println!("{}    {id}", "Ballot Style:".bold(), id = ballot_style.id);
    println!(
        "{}        {name} {id}",
        "Precinct:".bold(),
        name = precinct.name,
        id = format!("({})", precinct.id).italic().dimmed()
    );
    println!(
        "{}     {hash}",
        "Ballot Hash:".bold(),
        hash = hex::encode(cvr.ballot_hash)
    );
    println!("{}     {:?}", "Ballot Type:".bold(), cvr.ballot_type);
    println!(
        "{}          {}",
        "Status:".bold(),
        if cvr.is_test_mode {
            "Official"
        } else {
            "Unofficial"
        }
    );
    println!();

    let contests = election.contests_in(ballot_style);
    for contest in contests {
        let Some(votes) = cvr.votes.get(contest.id()) else {
            continue;
        };

        match (contest, votes) {
            (Contest::Candidate(contest), ContestVote::Candidate(candidate_votes)) => {
                println!(
                    "{title} {id}",
                    title = contest.title.bold(),
                    id = format!("({})", contest.id).italic().dimmed()
                );
                for candidate in contest.candidates {
                    let has_vote = candidate_votes
                        .iter()
                        .any(|cv| cv.candidate_id() == candidate.id());
                    if has_vote {
                        print_voted_option(candidate.id(), &candidate);
                    } else {
                        print_unvoted_option(candidate.id(), &candidate);
                    }
                }
                println!();
            }
            (Contest::YesNo(contest), ContestVote::YesNo(option_id)) => {
                if option_id == &contest.yes_option.id {
                    print_voted_option(&contest.yes_option.id, &contest.yes_option.label);
                    print_unvoted_option(&contest.no_option.id, &contest.no_option.label);
                } else if option_id == &contest.no_option.id {
                    print_unvoted_option(&contest.yes_option.id, &contest.yes_option.label);
                    print_voted_option(&contest.no_option.id, &contest.no_option.label);
                } else {
                    unreachable!("option is not yes or no");
                }
            }
            _ => unreachable!("contest/votes type mismatch"),
        }
    }
}

fn print_voted_option(id: impl Display, name: impl Display) {
    println!(
        "☑  {name} {id}",
        name = name.on_bright_green().black(),
        id = format!("({id})").italic().dimmed()
    );
}

fn print_unvoted_option(id: impl Display, name: impl Display) {
    println!(
        "   {name} {id}",
        name = name,
        id = format!("({id})").italic().dimmed()
    );
}
