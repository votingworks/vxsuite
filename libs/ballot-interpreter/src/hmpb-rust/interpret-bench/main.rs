use std::{path::PathBuf, str::FromStr, time::Instant};

use clap::Parser;

use ballot_interpreter::{
    ballot_card::load_ballot_scan_bubble_image,
    interpret::{interpret_ballot_card, Options},
};
use image::ImageFormat;
use types_rs::election::Election;

#[derive(Debug, Parser)]
struct Config {
    #[clap(long)]
    election_path: Option<PathBuf>,
    #[clap(long)]
    side_a_image_path: Option<PathBuf>,
    #[clap(long)]
    side_b_image_path: Option<PathBuf>,
    #[clap(long)]
    preset: Option<Preset>,
    #[clap(long, default_value = "1")]
    count: usize,
}

#[derive(Debug, Clone)]
enum Preset {
    AllBubble,
    NhTest,
    Alameda,
}

impl FromStr for Preset {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "all-bubble" => Ok(Preset::AllBubble),
            "nh-test" => Ok(Preset::NhTest),
            "alameda" => Ok(Preset::Alameda),
            _ => Err(format!("unknown preset: {s}")),
        }
    }
}

#[derive(Debug)]
struct InterpretationInput {
    side_a_image: image::DynamicImage,
    side_b_image: image::DynamicImage,
    election: Election,
}

impl TryFrom<Config> for InterpretationInput {
    type Error = Box<dyn std::error::Error>;

    fn try_from(value: Config) -> Result<Self, Self::Error> {
        match (
            value.preset,
            value.election_path,
            value.side_a_image_path,
            value.side_b_image_path,
        ) {
            (None, Some(election_path), Some(side_a_image_path), Some(side_b_image_path)) => {
                let election = serde_json::from_str(&std::fs::read_to_string(election_path)?)?;
                let side_a_image = image::open(side_a_image_path)?;
                let side_b_image = image::open(side_b_image_path)?;
                Ok(InterpretationInput {
                    side_a_image,
                    side_b_image,
                    election,
                })
            }
            (Some(Preset::AllBubble), None, None, None) => {
                let side_a_image = image::load_from_memory_with_format(
                    include_bytes!("../../../test/fixtures/all-bubble-side-a.jpeg"),
                    ImageFormat::Jpeg,
                )
                .unwrap();
                let side_b_image = image::load_from_memory_with_format(
                    include_bytes!("../../../test/fixtures/all-bubble-side-b.jpeg"),
                    ImageFormat::Jpeg,
                )
                .unwrap();
                let election: Election = serde_json::from_str(include_str!(
                    "../../../../hmpb/render-backend/fixtures/all-bubble-ballot/election.json"
                ))
                .unwrap();
                Ok(InterpretationInput {
                    side_a_image,
                    side_b_image,
                    election,
                })
            }
            (Some(Preset::NhTest), None, None, None) => {
                let side_a_image = image::load_from_memory_with_format(
                    include_bytes!("../../../../fixtures/data/electionGridLayoutNewHampshireTestBallot/scan-marked-front.jpeg"),
                    ImageFormat::Jpeg,
                )
                .unwrap();
                let side_b_image = image::load_from_memory_with_format(
                    include_bytes!("../../../../fixtures/data/electionGridLayoutNewHampshireTestBallot/scan-marked-back.jpeg"),
                    ImageFormat::Jpeg,
                )
                .unwrap();
                let election: Election = serde_json::from_str(include_str!(
                    "../../../../fixtures/data/electionGridLayoutNewHampshireTestBallot/election.json",
                ))
                .unwrap();
                Ok(InterpretationInput {
                    side_a_image,
                    side_b_image,
                    election,
                })
            }
            (Some(Preset::Alameda), None, None, None) => {
                let side_a_image = image::load_from_memory_with_format(
                    include_bytes!("../../../test/fixtures/alameda-test/scan-skewed-side-a.jpeg"),
                    ImageFormat::Jpeg,
                )
                .unwrap();
                let side_b_image = image::load_from_memory_with_format(
                    include_bytes!("../../../test/fixtures/alameda-test/scan-skewed-side-b.jpeg"),
                    ImageFormat::Jpeg,
                )
                .unwrap();
                let election: Election = serde_json::from_str(include_str!(
                    "../../../test/fixtures/alameda-test/election-vxf.json",
                ))
                .unwrap();
                Ok(InterpretationInput {
                    side_a_image,
                    side_b_image,
                    election,
                })
            }
            _ => Err(
                "either --preset or --election-path, --side-a-image-path, and --side-b-image-path must be provided"
            )?,
        }
    }
}

fn main() {
    let start_main = Instant::now();
    let config = Config::parse();
    let count = config.count;
    let input = match InterpretationInput::try_from(config) {
        Ok(input) => input,
        Err(e) => {
            println!("❌ failed to parse input: {e}");
            return;
        }
    };
    let prepare_duration = start_main.elapsed();

    let start_interpret = Instant::now();
    let mut total_marks = 0;
    for _ in 1..=count {
        let interpret_result = interpret_ballot_card(
            input.side_a_image.to_luma8(),
            input.side_b_image.to_luma8(),
            &Options {
                election: input.election.clone(),
                bubble_template: load_ballot_scan_bubble_image().unwrap(),
                debug_side_a_base: None,
                debug_side_b_base: None,
                score_write_ins: false,
            },
        );

        match interpret_result {
            Ok(interpretation) => {
                total_marks += interpretation.front.marks.len() + interpretation.back.marks.len();
            }
            Err(e) => {
                println!("❌ interpretation failed: {e}");
            }
        }
    }
    let interpret_duration = start_interpret.elapsed();
    let total_duration = start_main.elapsed();

    if total_marks > 0 {
        println!("✅ total marks: {total_marks}");
    } else {
        println!("❌ no marks found");
    }

    println!("⌛ prepare time:   {prepare_duration:?}");
    println!(
        "⌛ interpret time: {interpret_duration:?}{}",
        if count > 1 {
            format!(" (avg: {:?})", interpret_duration / count as u32)
        } else {
            "".to_string()
        }
    );
    println!("⌛ total time:     {total_duration:?}");
}
