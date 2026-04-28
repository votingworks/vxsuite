use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    process,
    time::Instant,
};

use ballot_interpreter::{
    debug::ImageDebugWriter,
    interpret::{
        ScanInterpreter, VerticalStreakDetection, WriteInScoring,
        DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH, DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD,
    },
    qr_code,
};
use clap::Parser;
use crossterm::style::Stylize;
use types_rs::{
    ballot_card::BallotType,
    bmd::{
        cvr::CastVoteRecord,
        encoding::BallotAuditId,
        multi_page::MultiPageCastVoteRecord,
        votes::{CandidateVote, ContestVote},
    },
    coding,
    election::{BallotStyleId, Candidate, Contest, ContestId, Election, PrecinctId},
};

#[derive(Debug, clap::Parser)]
#[allow(clippy::struct_excessive_bools)]
struct Options {
    /// Path to an election definition file.
    election_path: PathBuf,

    /// Path to an image of the top side of the scanned ballot.
    top_path: PathBuf,

    /// Path to an image of the bottom side of the scanned ballot. If omitted,
    /// only summary ballot interpretation is attempted.
    bottom_path: Option<PathBuf>,

    /// Output debug images.
    #[clap(long, default_value = "false")]
    debug: bool,

    /// Determines whether to score write ins.
    #[clap(long, default_value = "false")]
    score_write_ins: bool,

    /// Vertical streak detection setting.
    #[clap(long, short = 'v', default_value_t = Default::default())]
    vertical_streak_detection: VerticalStreakDetection,

    /// Detect and reject timing mark grid scales less than this value.
    #[clap(long)]
    minimum_detected_scale: Option<f32>,

    /// Maximum cumulative width of vertical streaks in pixels before rejecting ballot.
    /// Default value matches `DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH`.
    #[clap(long, default_value_t = DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH)]
    max_cumulative_streak_width: u32,

    /// Retry streak detection threshold in pixels when timing marks fail.
    /// Default value matches `DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD`.
    #[clap(long, default_value_t = DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD)]
    retry_streak_width_threshold: u32,

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

    fn load_top_image(&self) -> color_eyre::Result<image::DynamicImage> {
        Ok(image::open(&self.top_path)?)
    }

    fn load_bottom_image(&self) -> color_eyre::Result<Option<image::DynamicImage>> {
        match &self.bottom_path {
            Some(path) => Ok(Some(image::open(path)?)),
            None => Ok(None),
        }
    }
}

fn main() -> color_eyre::Result<()> {
    let options = Options::parse();
    let election = options.load_election()?;

    let start = Instant::now();
    let top_image = options.load_top_image()?.into_luma8();

    // Detect QR code once
    let detected = qr_code::detect_with_strategy(
        &top_image,
        qr_code::SearchStrategy::Broad,
        &ImageDebugWriter::disabled(),
    )
    .ok();

    let exit_code = match detected {
        Some(ref d) if d.kind() == qr_code::QrCodeKind::SummaryBallot => {
            let cvr = coding::decode_with::<CastVoteRecord>(d.bytes(), &election)
                .map_err(|e| color_eyre::eyre::eyre!("failed to decode summary ballot: {e}"))?;
            print_result(&options, &cvr, |cvr| pretty_print_cvr(cvr, &election))?;
            0
        }

        Some(ref d) if d.kind() == qr_code::QrCodeKind::MultiPageSummaryBallot => {
            let cvr = coding::decode_with::<MultiPageCastVoteRecord>(d.bytes(), &election)
                .map_err(|e| {
                    color_eyre::eyre::eyre!("failed to decode multi-page summary ballot: {e}")
                })?;
            print_result(&options, &cvr, |cvr| {
                pretty_print_multi_page_cvr(cvr, &election);
            })?;
            0
        }

        _ => {
            if options.bottom_path.is_none() {
                eprintln!("Error: no summary ballot QR code detected");
                1
            } else {
                interpret_bubble_ballot(&options, election, top_image)?
            }
        }
    };

    if !options.json {
        let duration = start.elapsed();
        println!("⚡ {duration:.2?}");
    }

    process::exit(exit_code)
}

fn print_result<T: serde::Serialize>(
    options: &Options,
    value: &T,
    pretty_print: impl FnOnce(&T),
) -> color_eyre::Result<()> {
    if options.json {
        println!("{}", serde_json::to_string_pretty(value)?);
    } else {
        pretty_print(value);
    }
    Ok(())
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

    pretty_print_cvr_header(
        &cvr.ballot_style_id,
        &cvr.precinct_id,
        cvr.ballot_type,
        cvr.is_test_mode,
        &cvr.ballot_audit_id,
    );

    println!();

    pretty_print_contest_votes(&cvr.votes, None, election);
}

fn pretty_print_multi_page_cvr(cvr: &MultiPageCastVoteRecord, election: &Election) {
    // Ballot metadata
    println!(
        "{} (page {}/{})",
        "📋 Ballot Information".yellow(),
        cvr.page_number,
        cvr.total_pages
    );

    pretty_print_cvr_header(
        &cvr.ballot_style_id,
        &cvr.precinct_id,
        cvr.ballot_type,
        cvr.is_test_mode,
        &cvr.ballot_audit_id,
    );

    println!();

    pretty_print_contest_votes(&cvr.votes, Some(&cvr.contest_ids), election);
}

fn pretty_print_cvr_header<'a>(
    ballot_style_id: &BallotStyleId,
    precinct_id: &PrecinctId,
    ballot_type: BallotType,
    is_test_mode: bool,
    ballot_audit_id: impl Into<Option<&'a BallotAuditId>>,
) {
    println!(
        "   {} {}",
        "Ballot Style:".bold(),
        ballot_style_id.to_string().cyan()
    );
    println!(
        "   {} {}",
        "Precinct:".bold(),
        precinct_id.to_string().cyan()
    );
    println!(
        "   {} {}",
        "Ballot Type:".bold(),
        format!("{ballot_type:?}").cyan()
    );

    println!(
        "   {} {}",
        "Mode:".bold(),
        if is_test_mode {
            "Test".yellow()
        } else {
            "Official".green()
        }
    );

    if let Some(audit_id) = ballot_audit_id.into() {
        println!("   {} {}", "Audit ID:".bold(), audit_id.to_string().cyan());
    }
}

fn pretty_print_contest_votes(
    votes: &HashMap<ContestId, ContestVote>,
    contest_ids: Option<&[ContestId]>,
    election: &Election,
) {
    let contests = match contest_ids {
        Some(contest_ids) => election
            .contests
            .iter()
            .filter(|c| contest_ids.contains(c.id()))
            .cloned()
            .collect(),
        None => election.contests.clone(),
    };

    if votes.is_empty() {
        println!("{}", "🗳️ No votes recorded".yellow());
    } else {
        for (contest_id, vote) in votes {
            if let Some(contest) = contests.iter().find(|c| c.id() == contest_id) {
                pretty_print_contest_vote(contest, vote);
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

fn pretty_print_contest_vote(contest: &Contest, vote: &ContestVote) {
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
    top_image: image::GrayImage,
) -> color_eyre::Result<i32> {
    let interpreter = ScanInterpreter::new(
        election,
        if options.score_write_ins {
            WriteInScoring::Enabled
        } else {
            WriteInScoring::Disabled
        },
        options.vertical_streak_detection,
        options.minimum_detected_scale,
        options.max_cumulative_streak_width,
        options.retry_streak_width_threshold,
    );

    let bottom_image = options
        .load_bottom_image()?
        .expect("bubble ballot requires side B image")
        .into_luma8();
    let result = interpreter.interpret(
        top_image,
        bottom_image,
        options.debug.then_some(options.top_path.clone()),
        options.debug.then(|| options.bottom_path.clone()).flatten(),
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
