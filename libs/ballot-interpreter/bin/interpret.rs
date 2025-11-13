use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    process,
    time::Instant,
};

use ballot_interpreter::{
    debug::ImageDebugWriter,
    interpret::{
        Inference, ScanInterpreter, TimingMarkAlgorithm, VerticalStreakDetection, WriteInScoring,
    },
    qr_code,
};
use clap::Parser;
use crossterm::style::Stylize;
use types_rs::{
    bmd::{
        cvr::CastVoteRecord,
        votes::{CandidateVote, ContestVote},
    },
    coding,
    election::{Candidate, Contest, Election},
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
    #[clap(long, default_value = "false")]
    debug: bool,

    /// Determines whether to score write ins.
    #[clap(long, default_value = "false")]
    score_write_ins: bool,

    /// Vertical streak detection setting.
    #[clap(long, short = 'v', default_value_t = Default::default())]
    vertical_streak_detection: VerticalStreakDetection,

    /// Determines whether to disable timing mark inference (only applicable to contours algorithm).
    #[clap(long, default_value = "false")]
    disable_timing_mark_inference: bool,

    /// Which timing mark finding algorithm to use.
    #[clap(long, short = 'a', default_value_t = Default::default())]
    timing_mark_algorithm: TimingMarkAlgorithm,

    /// Detect and reject timing mark grid scales less than this value.
    #[clap(long)]
    minimum_detected_scale: Option<f32>,

    /// Output as JSON instead of pretty-printed format.
    #[clap(long, short = 'j', default_value_t = false)]
    json: bool,
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
    let election = options.load_election()?;

    let start = Instant::now();
    let side_a_image = options.load_side_a_image()?.into_luma8();

    // Try to detect QR code
    let exit_code =
        if let Ok(detected) = qr_code::detect(&side_a_image, &ImageDebugWriter::disabled()) {
            // Try to decode as CVR first (summary ballot)
            if let Ok(cvr) = coding::decode_with::<CastVoteRecord>(detected.bytes(), &election) {
                // Successfully decoded as summary ballot
                if options.json {
                    println!("{}", serde_json::to_string_pretty(&cvr)?);
                } else {
                    pretty_print_cvr(&cvr, &election);
                }
                0
            } else {
                // Not a CVR, fall through to bubble ballot interpretation
                interpret_bubble_ballot(&options, election, side_a_image)?
            }
        } else {
            // No QR code or failed to detect, interpret as bubble ballot
            interpret_bubble_ballot(&options, election, side_a_image)?
        };

    let duration = start.elapsed();
    println!("⚡ {duration:.2?}");

    process::exit(exit_code)
}

macro_rules! stringify_vote {
    ($title:expr, $is_selected:expr $(, $color:ident)? ) => {
        format!(
            "{} {}",
            if $is_selected {
                "✓ ".green()
            } else {
                "○ ".dark_grey()
            },
            if $is_selected {
                $title.stylize()$(.$color())?
            } else {
                $title.dark_grey()
            }
        )
    };
}

fn pretty_print_cvr(cvr: &CastVoteRecord, election: &Election) {
    // Ballot metadata
    println!("{}", "📋 Ballot Information".yellow());

    println!(
        "   {} {}",
        "Ballot Style:".bold(),
        cvr.ballot_style_id.to_string().cyan()
    );
    println!(
        "   {} {}",
        "Precinct:".bold(),
        cvr.precinct_id.to_string().cyan()
    );
    println!(
        "   {} {}",
        "Ballot Type:".bold(),
        format!("{:?}", cvr.ballot_type).cyan()
    );

    println!(
        "   {} {}",
        "Mode:".bold(),
        if cvr.is_test_mode {
            "Test".yellow()
        } else {
            "Official".green()
        }
    );

    if let Some(audit_id) = &cvr.ballot_audit_id {
        println!("   {} {}", "Audit ID:".bold(), audit_id.as_str().cyan());
    }

    // Votes section
    if cvr.votes.is_empty() {
        println!("{}", "🗳️ No votes recorded".yellow());
    } else {
        for (contest_id, vote) in &cvr.votes {
            if let Some(contest) = election.contests.iter().find(|c| c.id() == contest_id) {
                print_contest_vote(contest, vote);
            } else {
                println!(
                    "   {} {}",
                    "Unknown Contest:".bold(),
                    contest_id.to_string().red()
                );
            }
        }
    }
}

fn print_contest_vote(contest: &Contest, vote: &ContestVote) {
    print!("{}", " ▸ ".green());

    match contest {
        Contest::Candidate(candidate_contest) => {
            println!("{}", candidate_contest.title.as_str().bold());

            // Collect selected candidate IDs and write-in names
            let selected_candidate_ids: HashSet<_> =
                if let ContestVote::Candidate(candidate_votes) = vote {
                    candidate_votes
                        .iter()
                        .map(|cv| match cv {
                            CandidateVote::NamedCandidate { candidate_id }
                            | CandidateVote::WriteInCandidate { candidate_id, .. } => candidate_id,
                        })
                        .collect()
                } else {
                    HashSet::new()
                };

            // Get write-in names map
            let write_in_names: HashMap<_, _> =
                if let ContestVote::Candidate(candidate_votes) = vote {
                    candidate_votes
                        .iter()
                        .filter_map(|cv| match cv {
                            CandidateVote::WriteInCandidate { candidate_id, name } => {
                                Some((candidate_id, name))
                            }
                            CandidateVote::NamedCandidate { .. } => None,
                        })
                        .collect()
                } else {
                    HashMap::new()
                };

            // Show all candidates
            for candidate in &candidate_contest.candidates {
                let is_selected = selected_candidate_ids.contains(candidate.id());
                let title = match candidate {
                    Candidate::Named(named) => named.name.as_str(),
                    Candidate::WriteIn(write_in) => {
                        if let Some(name) = write_in_names.get(candidate.id()) {
                            &format!(
                                "{} {} {}",
                                "Write-in: ".italic(),
                                name.to_string().magenta(),
                                format!("(Position {})", write_in.write_in_index + 1).dark_grey()
                            )
                        } else {
                            &format!(
                                "{}",
                                format!("Write-in (Position {})", write_in.write_in_index + 1)
                                    .dark_grey()
                                    .italic()
                            )
                        }
                    }
                };

                println!("   {}", stringify_vote!(title, is_selected));
            }
        }
        Contest::YesNo(yesno_contest) => {
            println!("{}", yesno_contest.title.as_str().bold());

            let selected_option_id = if let ContestVote::YesNo(option_id) = vote {
                Some(option_id)
            } else {
                None
            };

            // Show YES option
            println!(
                "   {}",
                stringify_vote!(
                    yesno_contest.yes_option.label.as_str(),
                    selected_option_id == Some(&yesno_contest.yes_option.id),
                    green
                )
            );

            // Show NO option
            println!(
                "   {}",
                stringify_vote!(
                    yesno_contest.no_option.label.as_str(),
                    selected_option_id == Some(&yesno_contest.no_option.id),
                    red
                )
            );
        }
    }
}

fn interpret_bubble_ballot(
    options: &Options,
    election: Election,
    side_a_image: image::GrayImage,
) -> color_eyre::Result<i32> {
    let timing_mark_algorithm = match options.timing_mark_algorithm {
        TimingMarkAlgorithm::Contours { .. } => TimingMarkAlgorithm::Contours {
            inference: if options.disable_timing_mark_inference {
                Inference::Disabled
            } else {
                Inference::Enabled
            },
        },
        TimingMarkAlgorithm::Corners => TimingMarkAlgorithm::Corners,
    };

    let interpreter = ScanInterpreter::new(
        election,
        if options.score_write_ins {
            WriteInScoring::Enabled
        } else {
            WriteInScoring::Disabled
        },
        options.vertical_streak_detection,
        timing_mark_algorithm,
        options.minimum_detected_scale,
    )?;

    let result = interpreter.interpret(
        side_a_image,
        options.load_side_b_image()?.into_luma8(),
        options.debug.then_some(options.side_a_path.clone()),
        options.debug.then_some(options.side_b_path.clone()),
    );

    match result {
        Ok(interpretation) => {
            if options.json {
                let marks: Vec<_> = [interpretation.front, interpretation.back]
                    .iter()
                    .flat_map(|page| {
                        page.marks.iter().map(|(position, scored_mark)| {
                            serde_json::json!({
                                "column": position.location().column,
                                "row": position.location().row,
                                "contest_id": position.contest_id(),
                                "option_id": position.option_id(),
                                "fill_score": scored_mark.as_ref().map(|m| m.fill_score)
                            })
                        })
                    })
                    .collect();
                println!("{}", serde_json::to_string_pretty(&marks)?);
            } else {
                for page in [interpretation.front, interpretation.back] {
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
            Ok(0)
        }

        Err(err) => {
            eprintln!("Error: {err:#?}");
            Ok(1)
        }
    }
}
