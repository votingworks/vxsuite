#![allow(clippy::cast_precision_loss)]
#![allow(clippy::cast_possible_truncation)]
#![allow(clippy::cast_sign_loss)]
#![allow(clippy::cast_possible_wrap)]

use std::{
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process,
    str::FromStr,
    time::{Duration, Instant},
};

use ballot_interpreter::{
    ballot_card::PaperInfo,
    debug,
    interpret::{self, prepare_ballot_page_image, Error, TimingMarkAlgorithm},
    timing_marks::{contours, corners, DefaultForGeometry, TimingMarks},
};
use clap::Parser;
use color_eyre::owo_colors::OwoColorize;
use itertools::Itertools;

#[derive(Debug, Clone, Copy)]
enum Inference {
    Infer,
    NoInfer,
}

impl FromStr for Inference {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "yes" | "infer" => Ok(Self::Infer),
            "no" | "noinfer" | "no-infer" => Ok(Self::NoInfer),
            _ => Err(format!("Unexpected inference: {s}")),
        }
    }
}

#[derive(Debug, clap::Parser)]
struct Options {
    /// Paths to images of scanned pages.
    scanned_page_paths: Vec<PathBuf>,

    /// A text file where each line is an absolute path to an image that should
    /// fail timing mark detection.
    #[clap(long)]
    expected_failure_manifest: Option<PathBuf>,

    /// Determine how to infer timing marks.
    #[clap(long, default_value = "infer")]
    inference: Inference,

    /// Choose which timing mark finding algorithm to use.
    #[clap(long, default_value = "current")]
    timing_mark_algorithm: TimingMarkAlgorithm,

    /// Should debug images be produced?
    #[clap(long)]
    debug: bool,
}

impl Options {
    fn expected_failure_manifest(&self) -> color_eyre::Result<Vec<PathBuf>> {
        match &self.expected_failure_manifest {
            Some(expected_failure_manifest) => Ok(BufReader::new(
                std::fs::OpenOptions::new()
                    .read(true)
                    .open(expected_failure_manifest)?,
            )
            .lines()
            .map_while(Result::ok)
            .filter_map(|line| {
                let line = line.trim();
                if line.is_empty() {
                    None
                } else {
                    Some(PathBuf::from(line))
                }
            })
            .collect_vec()),
            None => Ok(vec![]),
        }
    }
}

#[allow(clippy::result_large_err)]
fn process_path(
    path: &Path,
    options: &Options,
    load_image_duration: &mut Duration,
    prepare_image_duration: &mut Duration,
    find_timing_marks_duration: &mut Duration,
) -> interpret::Result<TimingMarks> {
    let start = Instant::now();
    let image = image::open(path)
        .map_err(|e| Error::MissingTimingMarks {
            reason: format!("Unable to load image: {e}"),
        })?
        .to_luma8();
    *load_image_duration += start.elapsed();

    let start = Instant::now();
    let ballot_page = prepare_ballot_page_image("image", image, &PaperInfo::scanned())?;
    *prepare_image_duration += start.elapsed();

    let debug = if options.debug {
        debug::ImageDebugWriter::new(path.to_path_buf(), ballot_page.ballot_image.image.clone())
    } else {
        debug::ImageDebugWriter::disabled()
    };

    let start = Instant::now();
    let find_result = match options.timing_mark_algorithm {
        TimingMarkAlgorithm::Contours => contours::find_timing_mark_grid(
            &ballot_page.geometry,
            &ballot_page.ballot_image,
            contours::FindTimingMarkGridOptions {
                allowed_timing_mark_inset_percentage_of_width:
                    contours::ALLOWED_TIMING_MARK_INSET_PERCENTAGE_OF_WIDTH,
                infer_timing_marks: matches!(options.inference, Inference::Infer),
                debug: &mut debug::ImageDebugWriter::disabled(),
            },
        ),
        TimingMarkAlgorithm::Corners => {
            let default_geometry = PaperInfo::scanned_legal().compute_geometry();
            corners::find_timing_mark_grid(
                &ballot_page.ballot_image,
                &ballot_page.geometry,
                &debug,
                &corners::Options::default_for_geometry(&default_geometry),
            )
        }
    };
    *find_timing_marks_duration += start.elapsed();

    match find_result {
        Ok(timing_marks) => {
            debug.write("timing_marks", |canvas| {
                debug::draw_timing_mark_debug_image_mut(
                    canvas,
                    &ballot_page.geometry,
                    &timing_marks.clone().into(),
                );
            });

            Ok(timing_marks)
        }
        Err(e) => Err(e),
    }
}

#[allow(clippy::too_many_lines)]
fn main() -> color_eyre::Result<()> {
    let options = Options::parse();
    let file_count = options.scanned_page_paths.len() as u32;
    let expected_failure_manifest = options.expected_failure_manifest()?;

    let mut expected_success_count = 0;
    let mut unexpected_success_count = 0;
    let mut expected_failure_count = 0;
    let mut load_image_duration = Duration::ZERO;
    let mut prepare_image_duration = Duration::ZERO;
    let mut find_timing_marks_duration = Duration::ZERO;

    for path in &options.scanned_page_paths {
        let expected_failure = expected_failure_manifest.contains(&path.canonicalize()?);

        match process_path(
            path,
            &options,
            &mut load_image_duration,
            &mut prepare_image_duration,
            &mut find_timing_marks_duration,
        ) {
            Ok(_) => {
                if expected_failure {
                    unexpected_success_count += 1;
                    println!(
                        "{}: {path} (not expected)",
                        "OK".bold(),
                        path = path.display().red()
                    );
                } else {
                    expected_success_count += 1;
                    println!("{}: {path}", "OK".bold(), path = path.display());
                }
            }
            Err(e) => {
                if expected_failure {
                    expected_failure_count += 1;
                    println!(
                        "{}",
                        format!("NOT OK: {path} (expected)", path = path.display()).dimmed(),
                    );
                } else {
                    println!(
                        "{}: {path}: {e}",
                        "NOT OK".bold(),
                        path = path.display(),
                        e = e.red()
                    );
                }
            }
        }
    }

    println!(
        "⚡ Load images: {load_image_duration:.2?} ({avg:.2?} avg.)",
        avg = load_image_duration / file_count
    );
    println!(
        "⚡ Prepare images: {prepare_image_duration:.2?} ({avg:.2?} avg.)",
        avg = prepare_image_duration / file_count
    );
    println!(
        "⚡ Find timing marks: {find_timing_marks_duration:.2?} ({avg:.2?} avg.)",
        avg = find_timing_marks_duration / file_count
    );
    println!();
    println!(
        "Unexpected failures: {}, expected failures: {}, unexpected successes: {}, successes: {}",
        (file_count - expected_failure_count - expected_success_count - unexpected_success_count)
            .red(),
        expected_failure_count.yellow(),
        unexpected_success_count.yellow(),
        expected_success_count.green()
    );

    process::exit(i32::from(
        expected_success_count + unexpected_success_count + expected_failure_count != file_count,
    ))
}
