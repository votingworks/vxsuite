use std::io::Write;
use std::time::Duration;
use std::{fmt::Debug, path::PathBuf, time::Instant};

use ballot_interpreter::{
    debug::ImageDebugWriter,
    image_utils::{detect_vertical_streaks, DetectVerticalStreaksConfiguration, Streak},
    UnitIntervalScore,
};
use clap::Parser;
use color_eyre::owo_colors::OwoColorize;
use image::{GenericImageView, GrayImage};
use imageproc::contrast::otsu_level;
use itertools::Itertools;
use rayon::iter::{IntoParallelIterator, ParallelBridge, ParallelIterator};
use serde::Serialize;

#[derive(Debug, clap::Parser)]
struct Options {
    /// How many pixels on either side of a streak's sides to capture.
    #[clap(long, default_value = "10")]
    debug_margin_pixels: u32,

    /// What threshold to use to distinguish black from white. Omit to determine dynamically.
    #[clap(long)]
    binarization_threshold: Option<u8>,

    /// How high a score is required to consider a vertical stretch of semi-contiguous black pixels a "streak".
    #[clap(long)]
    min_streak_score: Option<UnitIntervalScore>,

    /// How high a score is required to consider a single pixel column to be considered part of a streak.
    #[clap(long)]
    min_column_streak_score: Option<UnitIntervalScore>,

    /// How many white pixels are allowed between two black pixels before considering the streak broken.
    #[clap(long)]
    max_white_gap_pixel_count: Option<u32>,

    /// How many pixels in from the left and right sides of the image are ignored when looking for streaks.
    #[clap(long)]
    border_inset_pixels: Option<u32>,

    /// Path to write results of the streak detection.
    #[clap(short, long)]
    output: PathBuf,

    /// Path to a directory containing images.
    input: PathBuf,
}

impl Options {
    fn walker(&self) -> ignore::Walk {
        ignore::WalkBuilder::new(&self.input).build()
    }

    fn config_for_detect_vertical_streaks(
        &self,
        image: &GrayImage,
    ) -> DetectVerticalStreaksConfiguration {
        let default_config = DetectVerticalStreaksConfiguration::default();

        DetectVerticalStreaksConfiguration::new(
            self.binarization_threshold
                .unwrap_or_else(|| otsu_level(image)),
            self.min_streak_score.unwrap_or(default_config.min_score),
            self.min_column_streak_score
                .unwrap_or(default_config.min_column_score),
            self.max_white_gap_pixel_count
                .unwrap_or(default_config.max_white_gap_pixel_count),
            self.border_inset_pixels
                .unwrap_or(default_config.border_inset_pixels),
        )
    }
}

#[derive(Serialize)]
struct StreakedBallot {
    ballot_path: PathBuf,
    width: u32,
    height: u32,
    cropped_streaks: Vec<(Streak, PathBuf)>,
    read_image_duration: Duration,
    detect_streaks_duration: Duration,
    write_crops_duration: Duration,
}

impl Debug for StreakedBallot {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("StreakedBallot")
            .field("ballot_path", &self.ballot_path.display())
            .field(
                "cropped_streaks",
                &self
                    .cropped_streaks
                    .iter()
                    .map(|(s, p)| (s, p.display()))
                    .collect_vec(),
            )
            .finish()
    }
}

pub fn main() -> color_eyre::Result<()> {
    let options = Options::parse();
    let start = Instant::now();

    let streaked_ballots = options
        .walker()
        // Run in parallel.
        .par_bridge()
        .into_par_iter()
        // Ignore `ignore::Error` errors.
        .flatten()
        // Filter for images.
        .filter(
            |entry| match entry.path().extension().and_then(|ext| ext.to_str()) {
                Some("png" | "jpeg" | "jpg") => true,
                _ => false,
            },
        )
        // Process each image.
        .filter_map(|entry| {
            let path = entry.path();
            let read_image_start = Instant::now();
            let image = match image::open(path) {
                Ok(image) => image.to_luma8(),
                Err(e) => {
                    eprintln!(
                        "Error: Failed to load image at path {path}: {e}",
                        path = path.display()
                    );
                    return None;
                }
            };
            let read_image_duration = read_image_start.elapsed();

            let detect_streaks_start = Instant::now();
            let streaks = detect_vertical_streaks(
                &image,
                &ImageDebugWriter::disabled(),
                options.config_for_detect_vertical_streaks(&image),
            );
            let detect_streaks_duration = detect_streaks_start.elapsed();

            let write_crops_start = Instant::now();
            let mut cropped_streaks = vec![];

            for streak in streaks {
                let streak_crop = image
                    .view(
                        streak.x_left() - options.debug_margin_pixels,
                        0,
                        streak.width() + options.debug_margin_pixels * 2,
                        image.height(),
                    )
                    .to_image();
                let streak_crop_output_path = options
                    .output
                    .join(path.strip_prefix(&options.input).unwrap())
                    .with_file_name(format!(
                        "{stem}-x={x}.{ext}",
                        stem = path.file_stem().unwrap().to_str().unwrap(),
                        x = streak.x_left(),
                        ext = path.extension().unwrap().to_str().unwrap()
                    ));
                if let Err(e) = std::fs::create_dir_all(streak_crop_output_path.parent().unwrap()) {
                    eprintln!(
                        "Error: Failed to create output path {path}: {e}",
                        path = streak_crop_output_path.parent().unwrap().display()
                    );
                }
                if let Err(e) = streak_crop.save(&streak_crop_output_path) {
                    eprintln!(
                        "Error: Failed to save streak at x={x} from image at path {path}: {e}",
                        x = streak.x_left(),
                        path = path.display()
                    );
                }

                cropped_streaks.push((streak, streak_crop_output_path));
            }

            let write_crops_duration = write_crops_start.elapsed();

            Some(StreakedBallot {
                ballot_path: path.to_path_buf(),
                width: image.width(),
                height: image.height(),
                cropped_streaks,
                read_image_duration,
                detect_streaks_duration,
                write_crops_duration,
            })
        })
        .collect::<Vec<_>>();

    {
        let mut streaks_json = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .open(options.output.join("streaks.json"))?;
        serde_json::to_writer(&mut streaks_json, &streaked_ballots)?;
    }

    {
        let ballot_width = 600;
        let mut streaks_html = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .open(options.output.join("streaks.html"))?;

        writeln!(
            &mut streaks_html,
            r#"<div style="display: flex; flex-direction: column; gap: 1em;">"#
        )?;
        for streaked_ballot in &streaked_ballots {
            if !streaked_ballot.cropped_streaks.is_empty() {
                let scale = ballot_width as f32 / streaked_ballot.width as f32;
                writeln!(
                    &mut streaks_html,
                    r#"
            <div>
                <h3>{src}</h3>
                <div style="position: relative; padding: 0; margin: 0;">
            "#,
                    src = options
                        .input
                        .canonicalize()?
                        .join(&streaked_ballot.ballot_path)
                        .display()
                )?;

                for (streak, _) in &streaked_ballot.cropped_streaks {
                    writeln!(
                        &mut streaks_html,
                        r#"
                    <div style="position: absolute; top: 0; bottom: 0; left: {left}px; width: {width}px; background-color: #ff000066;"></div>
                    <div style="position: absolute; top: -10px; height: 10px; left: {left}px; width: {width}px; background-color: red;"></div>
                        "#,
                        left = scale * streak.x_left() as f32,
                        width = scale * streak.width() as f32,
                    )?;
                }

                writeln!(
                    &mut streaks_html,
                    r#"
                    <img src="file://{src}" style="width: {ballot_width}px; image-rendering: pixelated;">
                </div>
            </div>
            "#,
                    src = options
                        .input
                        .canonicalize()?
                        .join(&streaked_ballot.ballot_path)
                        .display()
                )?;
            }
        }
        writeln!(&mut streaks_html, r#"</div>"#)?;
    }

    let duration = start.elapsed();
    let read_images_duration: Duration =
        streaked_ballots.iter().map(|b| b.read_image_duration).sum();
    let detect_streaks_duration: Duration = streaked_ballots
        .iter()
        .map(|b| b.detect_streaks_duration)
        .sum();
    let write_crops_duration: Duration = streaked_ballots
        .iter()
        .map(|b| b.write_crops_duration)
        .sum();

    let mut ballots_with_streaks = 0u32;
    let mut streak_count = 0u32;

    for streaked_ballot in &streaked_ballots {
        if streaked_ballot.cropped_streaks.is_empty() {
            continue;
        }

        ballots_with_streaks += 1;
        streak_count += streaked_ballot.cropped_streaks.len() as u32;

        println!(
            "{} {}",
            "Ballot:".bold(),
            streaked_ballot.ballot_path.display()
        );
        for (streak, path) in &streaked_ballot.cropped_streaks {
            println!(
                "- x={}..={}, score={}, max gap={}px",
                streak.x_left().yellow(),
                streak.x_right().yellow(),
                streak.score().green(),
                streak.longest_white_gap().purple()
            );
            println!("  {}", path.display());
            println!("");
        }
    }

    println!(
        "{} {} ballot(s), {} streaked, {} total streaks",
        "Summary:".bold(),
        streaked_ballots.len().blue(),
        ballots_with_streaks.blue(),
        streak_count.blue()
    );
    println!("{}", format!("⌛ read images: {read_images_duration:.2?}, detect streaks: {detect_streaks_duration:.2?}, write crops: {write_crops_duration:.2?}, total: {duration:.2?} (parallel)").dimmed());

    Ok(())
}
