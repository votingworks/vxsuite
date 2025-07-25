#![allow(clippy::cast_precision_loss)]
#![allow(clippy::cast_possible_truncation)]
#![allow(clippy::cast_sign_loss)]
#![allow(clippy::cast_possible_wrap)]

use std::{
    fs::OpenOptions,
    io::{BufRead, BufReader, BufWriter, Write},
    path::{Path, PathBuf},
    process,
    str::FromStr,
    time::{Duration, Instant},
};

use ballot_interpreter::{
    ballot_card::PaperInfo,
    debug,
    interpret::{prepare_ballot_page_image, Error, TimingMarkAlgorithm},
    timing_marks::{contours, corners, Border, BorderAxis, DefaultForGeometry, TimingMarks},
};
use clap::Parser;
use color_eyre::{eyre::bail, owo_colors::OwoColorize};
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
    #[clap(long, default_value_t = TimingMarkAlgorithm::default())]
    timing_mark_algorithm: TimingMarkAlgorithm,

    /// Should debug images be produced?
    #[clap(long)]
    debug: bool,

    /// Detect and reject timing mark grid scales less than this value.
    #[clap(long)]
    minimum_detected_scale: Option<f32>,

    /// Detect grid scales using the distance between borders along the given
    /// axis.
    #[clap(long)]
    scale_axis: Option<BorderAxis>,

    /// Detect grid scales using the given border.
    #[clap(long)]
    scale_border: Option<Border>,

    /// Path for a CSV with various timing mark stats.
    #[clap(long)]
    stats_path: Option<PathBuf>,
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
fn process_path<W: Write>(
    path: &Path,
    options: &Options,
    load_image_duration: &mut Duration,
    prepare_image_duration: &mut Duration,
    find_timing_marks_duration: &mut Duration,
    stats: &mut Option<W>,
) -> color_eyre::Result<TimingMarks> {
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
        TimingMarkAlgorithm::Corners => corners::find_timing_mark_grid(
            &ballot_page.ballot_image,
            &ballot_page.geometry,
            &debug,
            &corners::Options::default_for_geometry(&ballot_page.geometry),
        ),
    };
    *find_timing_marks_duration += start.elapsed();

    let timing_marks = find_result?;
    debug.write("timing_marks", |canvas| {
        debug::draw_timing_mark_debug_image_mut(
            canvas,
            &ballot_page.geometry,
            &timing_marks.clone().into(),
        );
    });

    if let Some(minimum_detected_scale) = options.minimum_detected_scale {
        if let Some(detected_scale) = match (options.scale_axis, options.scale_border) {
            (None, Some(border)) => timing_marks.compute_scale_based_on_border(border),
            (Some(axis), None) => timing_marks.compute_scale_based_on_axis(axis),
            (None, None) => {
                bail!("Warning: minimum scale set but no scale measurement strategy was provided (border vs. axis)");
            }
            (Some(_), Some(_)) => {
                bail!("Warning: multiple scale measurement strategies were provided; please use only border or axis");
            }
        } {
            if detected_scale.0 < minimum_detected_scale {
                bail!(
                    "Detected scale is too low: {detected_scale} is less than {minimum_detected_scale}",
                    detected_scale = detected_scale.0
                );
            }
        }
    }

    if let Some(stats) = stats {
        let top_edge_median_period = timing_marks
            .compute_scale_based_on_border(Border::Top)
            .unwrap_or_default();
        let bottom_edge_median_period = timing_marks
            .compute_scale_based_on_border(Border::Bottom)
            .unwrap_or_default();
        let left_edge_median_period = timing_marks
            .compute_scale_based_on_border(Border::Left)
            .unwrap_or_default();
        let right_edge_median_period = timing_marks
            .compute_scale_based_on_border(Border::Right)
            .unwrap_or_default();
        let horizontal_axis_scale = timing_marks
            .compute_scale_based_on_axis(BorderAxis::Horizontal)
            .unwrap_or_default();
        let vertical_axis_scale = timing_marks
            .compute_scale_based_on_axis(BorderAxis::Vertical)
            .unwrap_or_default();

        writeln!(
            stats,
            "{},{},{},{},{},{},{}",
            path.display(),
            top_edge_median_period,
            bottom_edge_median_period,
            left_edge_median_period,
            right_edge_median_period,
            horizontal_axis_scale,
            vertical_axis_scale,
        )?;
    }

    Ok(timing_marks)
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

    let stats_file = match &options.stats_path {
        Some(stats_path) => Some(
            OpenOptions::new()
                .create(true)
                .truncate(true)
                .write(true)
                .open(stats_path),
        )
        .transpose(),
        None => Ok(None),
    }?;
    let mut stats = stats_file.map(BufWriter::new);

    if let Some(stats) = &mut stats {
        writeln!(
            stats,
           "path,top edge median period,bottom edge median period,left edge median period,right edge median period,horizontal axis scale,vertical axis scale"
        )?;
    }

    for path in &options.scanned_page_paths {
        let expected_failure = expected_failure_manifest.contains(&path.canonicalize()?);

        match process_path(
            path,
            &options,
            &mut load_image_duration,
            &mut prepare_image_duration,
            &mut find_timing_marks_duration,
            &mut stats,
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

    if let Some(mut stats) = stats {
        stats.flush()?;
    }

    process::exit(i32::from(
        expected_success_count + unexpected_success_count + expected_failure_count != file_count,
    ))
}
