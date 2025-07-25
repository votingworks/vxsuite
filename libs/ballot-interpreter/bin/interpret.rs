use std::{path::PathBuf, process, time::Instant};

use ballot_interpreter::interpret::{ScanInterpreter, TimingMarkAlgorithm};
use clap::Parser;
use types_rs::election::Election;

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

    /// Determines whether to disable vertical streak detection.
    #[clap(long, default_value = "false")]
    disable_vertical_streak_detection: bool,

    /// Determines whether to disable timing mark inference.
    #[clap(long, default_value = "false")]
    disable_timing_mark_inference: bool,

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

    let interpreter = ScanInterpreter::new(
        options.load_election()?,
        options.score_write_ins,
        options.disable_vertical_streak_detection,
        !options.disable_timing_mark_inference,
        options.timing_mark_algorithm,
        options.minimum_detected_scale,
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

    match result {
        Ok(interpretation) => {
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

        Err(err) => {
            eprintln!("Error: {err:#?}");
        }
    }

    println!("⚡ {duration:.2?}");

    process::exit(exit_code)
}
