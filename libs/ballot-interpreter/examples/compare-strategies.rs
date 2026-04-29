//! Compare full ballot interpretation between `GridStrategy` variants on a
//! corpus of ballot pairs.
//!
//! For each pair of front/back images, runs the full [`ballot_card`]
//! interpretation under all strategies and reports the per-bubble
//! fill-score and match-score deltas, plus aggregate statistics across the
//! corpus.
//!
//! Usage:
//!
//! ```text
//! cargo run --release --example compare-strategies -- \
//!     --election <election.json> \
//!     <path> [path ...]
//! ```
//!
//! Each `<path>` is either a `*-front.{png,jpg,jpeg}` file (its
//! `*-back.*` sibling is paired automatically) or a directory that is
//! recursively scanned for such pairs.

use std::path::{Path, PathBuf};

use ab_glyph::PxScale;
use ballot_interpreter::{
    ballot_card::ballot_scan_bubble_image,
    debug::monospace_font,
    draw_utils::{draw_hollow_rect_mut, draw_line_segment_mut, draw_text_mut, text_size},
    interpret::{
        ballot_card, InterpretedBallotCard, InterpretedBallotPage, Options,
        VerticalStreakDetection, WriteInScoring, DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH,
        DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD,
    },
    scoring::{ScoredBubbleMark, UnitIntervalScore},
    timing_marks::border_finding::GridStrategy,
};
use clap::Parser;
use color_eyre::eyre::{eyre, Context};
use image::{DynamicImage, GrayImage, Rgb, RgbImage};
use rayon::prelude::*;
use types_rs::{election::Election, geometry::Rect};

/// Default per-bubble Δfill threshold above which a bubble is considered
/// to have diverged between strategies (and is drawn on the diff image).
const DEFAULT_DIFF_THRESHOLD: f32 = 0.01;

const COLOR_FULL: Rgb<u8> = Rgb([0, 180, 0]); // green
const COLOR_CORNERS: Rgb<u8> = Rgb([220, 100, 0]); // orange
const COLOR_SIDES: Rgb<u8> = Rgb([0, 100, 220]); // blue
const COLOR_LINK: Rgb<u8> = Rgb([120, 120, 120]); // mid-gray

#[derive(Parser, Debug)]
#[command(
    about = "Compare FullBorders vs CornersOnly vs ScanDirectionBordersOnly grid strategies on ballot pairs."
)]
struct Args {
    /// Path to an election definition file matching the ballots being compared.
    #[arg(long)]
    election: PathBuf,

    /// Paths to either:
    ///   - a `*-front.{png,jpg,jpeg}` file (its `*-back.*` sibling is paired
    ///     automatically), or
    ///   - a directory to recursively scan for such pairs.
    paths: Vec<PathBuf>,

    /// Process pairs in parallel. `ballot_card()` already parallelizes
    /// internally; enabling this on a multi-core box trades CPU for wall
    /// clock when many pairs need to be compared.
    #[arg(long)]
    parallel: bool,

    /// If set, write a diff image for every pair where strategies disagree
    /// on at least one bubble. One PNG per side is emitted under the given
    /// directory, named `<stem>-strategy-diff.png` (where `<stem>` is the
    /// per-side input filename stem). The directory is created if missing.
    #[arg(long)]
    output_dir: Option<PathBuf>,

    /// Per-bubble `Δfill_score` threshold for considering a bubble to have
    /// diverged between strategies. Bubbles below this are treated as
    /// matching and are not drawn on the diff image.
    #[arg(long, default_value_t = DEFAULT_DIFF_THRESHOLD)]
    threshold: f32,
}

fn main() -> color_eyre::Result<()> {
    color_eyre::install()?;
    let args = Args::parse();

    let election = load_election(&args.election)
        .with_context(|| format!("loading election from {}", args.election.display()))?;

    let mut pairs: Vec<BallotPair> = vec![];
    for path in &args.paths {
        collect_pairs(path, &mut pairs)?;
    }
    pairs.sort_by(|a, b| a.front.cmp(&b.front));

    if pairs.is_empty() {
        return Err(eyre!("no ballot pairs found under the given paths"));
    }

    eprintln!("Comparing {} ballot pair(s)...", pairs.len());

    if let Some(dir) = &args.output_dir {
        std::fs::create_dir_all(dir)
            .with_context(|| format!("creating output dir {}", dir.display()))?;
    }

    let process = |pair: &BallotPair| {
        let outcome = run_pair(&election, pair, args.output_dir.as_deref(), args.threshold);
        (pair.clone(), outcome)
    };
    let outcomes: Vec<(BallotPair, Outcome)> = if args.parallel {
        pairs.par_iter().map(process).collect()
    } else {
        pairs.iter().map(process).collect()
    };

    for (pair, outcome) in &outcomes {
        print_outcome(pair, outcome);
    }
    println!();
    print_summary(&outcomes);

    Ok(())
}

fn load_election(path: &Path) -> color_eyre::Result<Election> {
    let file = std::fs::File::open(path)?;
    let reader = std::io::BufReader::new(file);
    Ok(serde_json::from_reader(reader)?)
}

#[derive(Debug, Clone)]
struct BallotPair {
    front: PathBuf,
    back: PathBuf,
}

fn collect_pairs(path: &Path, out: &mut Vec<BallotPair>) -> color_eyre::Result<()> {
    if path.is_dir() {
        for entry in std::fs::read_dir(path)? {
            collect_pairs(&entry?.path(), out)?;
        }
    } else if path.is_file() {
        if let Some(pair) = pair_for_front(path) {
            out.push(pair);
        }
    }
    Ok(())
}

/// If `path` is a `*-front.{png,jpg,jpeg}` whose `*-back.*` sibling exists,
/// returns the pair; otherwise returns `None` (which silently skips other
/// files when recursing).
fn pair_for_front(path: &Path) -> Option<BallotPair> {
    let stem = path.file_name()?.to_str()?;
    let ext = path.extension()?.to_str()?;
    if !matches!(ext.to_ascii_lowercase().as_str(), "png" | "jpg" | "jpeg") {
        return None;
    }
    let base = stem.strip_suffix(&format!("-front.{ext}"))?;
    let back_name = format!("{base}-back.{ext}");
    let back = path.with_file_name(back_name);
    if !back.is_file() {
        return None;
    }
    Some(BallotPair {
        front: path.to_path_buf(),
        back,
    })
}

#[derive(Debug)]
enum Outcome {
    Compared(PairStats),
    LoadFailed(String),
    Failed {
        full: Option<String>,
        corners: Option<String>,
        sides: Option<String>,
    },
}

#[derive(Debug)]
struct PairStats {
    /// Total bubbles compared across both sides.
    n_bubbles: usize,
    /// How many bubbles diverged between strategies — either by
    /// presence mismatch or by `|Δ fill_score| >= threshold`. This is
    /// also the count of bubbles drawn on the diff image.
    diverged_bubbles: usize,
    /// How many bubbles were scored under some strategies but not all.
    presence_mismatch: usize,
    /// Largest `|Δ fill_score|` across all bubbles where all strategies
    /// produced a score.
    max_fill_delta: f32,
    /// Largest `|Δ match_score|`.
    max_match_delta: f32,
    /// Mean `|Δ fill_score|` across paired bubbles.
    mean_fill_delta: f32,
}

fn run_pair(
    election: &Election,
    pair: &BallotPair,
    output_dir: Option<&Path>,
    threshold: f32,
) -> Outcome {
    let front = match load_image(&pair.front) {
        Ok(img) => img,
        Err(e) => return Outcome::LoadFailed(format!("front: {e}")),
    };
    let back = match load_image(&pair.back) {
        Ok(img) => img,
        Err(e) => return Outcome::LoadFailed(format!("back: {e}")),
    };

    let full = ballot_card(
        front.clone(),
        back.clone(),
        &options(election, GridStrategy::FullBorders),
    );
    let corners = ballot_card(
        front.clone(),
        back.clone(),
        &options(election, GridStrategy::CornersOnly),
    );
    let sides = ballot_card(
        front,
        back,
        &options(election, GridStrategy::ScanDirectionBordersOnly),
    );

    match (full, corners, sides) {
        (Ok(f), Ok(c), Ok(s)) => {
            let stats = compare_interpretations(&f, &c, &s, threshold);
            if let Some(dir) = output_dir {
                if stats.diverged_bubbles > 0 {
                    if let Err(e) = write_diff_images(dir, pair, &f, &c, &s, threshold) {
                        eprintln!(
                            "warning: failed to write diff image for {}: {e}",
                            short_label(&pair.front),
                        );
                    }
                }
            }
            Outcome::Compared(stats)
        }
        (full, corners, sides) => Outcome::Failed {
            full: full.err().map(|e| e.to_string()),
            corners: corners.err().map(|e| e.to_string()),
            sides: sides.err().map(|e| e.to_string()),
        },
    }
}

fn write_diff_images(
    output_dir: &Path,
    pair: &BallotPair,
    full: &InterpretedBallotCard,
    corners: &InterpretedBallotCard,
    sides: &InterpretedBallotCard,
    threshold: f32,
) -> color_eyre::Result<()> {
    write_diff_image_for_side(
        output_dir,
        &pair.front,
        &full.front,
        &corners.front,
        &sides.front,
        threshold,
    )?;
    write_diff_image_for_side(
        output_dir,
        &pair.back,
        &full.back,
        &corners.back,
        &sides.back,
        threshold,
    )?;
    Ok(())
}

/// Renders a side-of-ballot diff image. Background is the normalized
/// image; on top, for each bubble whose fill or match score diverges
/// between any pair of strategies by at least `threshold`, draws all
/// three strategies' `matched_bounds` rectangles and a small label with
/// their fill scores. Bubbles where all strategies agree are not drawn,
/// so the surviving annotations are exactly the divergences.
fn write_diff_image_for_side(
    output_dir: &Path,
    input_path: &Path,
    full_page: &InterpretedBallotPage,
    corners_page: &InterpretedBallotPage,
    sides_page: &InterpretedBallotPage,
    threshold: f32,
) -> color_eyre::Result<()> {
    let mut canvas: RgbImage =
        DynamicImage::ImageLuma8(full_page.normalized_image.clone()).to_rgb8();

    let font = monospace_font();
    let scale = PxScale::from(14.0);

    for (((_, full_mark), (_, corners_mark)), (_, sides_mark)) in full_page
        .marks
        .iter()
        .zip(corners_page.marks.iter())
        .zip(sides_page.marks.iter())
    {
        match (full_mark, corners_mark, sides_mark) {
            (Some(f), Some(c), Some(s)) => {
                let max_fill_delta = (f.fill_score.0 - c.fill_score.0)
                    .abs()
                    .max((f.fill_score.0 - s.fill_score.0).abs())
                    .max((c.fill_score.0 - s.fill_score.0).abs());
                let max_match_delta = (f.match_score.0 - c.match_score.0)
                    .abs()
                    .max((f.match_score.0 - s.match_score.0).abs())
                    .max((c.match_score.0 - s.match_score.0).abs());
                if max_fill_delta < threshold && max_match_delta < threshold {
                    continue;
                }
                draw_bubble_diff(&mut canvas, f, c, s, &font, scale);
            }
            // Presence mismatch: draw whichever bounds we have in their
            // own color so it's visually obvious which are missing.
            (f, c, s) => {
                if let Some(f) = f {
                    draw_one_sided(&mut canvas, &f.matched_bounds, COLOR_FULL);
                }
                if let Some(c) = c {
                    draw_one_sided(&mut canvas, &c.matched_bounds, COLOR_CORNERS);
                }
                if let Some(s) = s {
                    draw_one_sided(&mut canvas, &s.matched_bounds, COLOR_SIDES);
                }
            }
        }
    }

    let stem = input_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("ballot");
    let out_path = output_dir.join(format!("{stem}-strategy-diff.png"));
    canvas
        .save(&out_path)
        .with_context(|| format!("saving {}", out_path.display()))?;
    Ok(())
}

fn draw_bubble_diff(
    canvas: &mut RgbImage,
    full: &ScoredBubbleMark,
    corners: &ScoredBubbleMark,
    sides: &ScoredBubbleMark,
    font: &impl ab_glyph::Font,
    scale: PxScale,
) {
    draw_hollow_rect_mut(canvas, full.matched_bounds, COLOR_FULL);
    draw_hollow_rect_mut(canvas, corners.matched_bounds, COLOR_CORNERS);
    draw_hollow_rect_mut(canvas, sides.matched_bounds, COLOR_SIDES);

    // Connect all centers with thin lines so it's clear they represent
    // the same logical bubble.
    let f_center = full.matched_bounds.center();
    let c_center = corners.matched_bounds.center();
    let s_center = sides.matched_bounds.center();
    for (a, b) in [
        (f_center, c_center),
        (f_center, s_center),
        (c_center, s_center),
    ] {
        if a != b {
            draw_line_segment_mut(canvas, (a.x, a.y), (b.x, b.y), COLOR_LINK);
        }
    }

    // Three-line label, anchored just to the right of the widest bounding
    // box. F (full-borders) in green, C (corners-only) in orange,
    // S (sides-only) in blue.
    let label_x = full
        .matched_bounds
        .right()
        .max(corners.matched_bounds.right())
        .max(sides.matched_bounds.right())
        + 4;
    let label_y = full
        .matched_bounds
        .top()
        .min(corners.matched_bounds.top())
        .min(sides.matched_bounds.top());

    let f_text = format_score("F", full.fill_score, full.match_score);
    let c_text = format_score("C", corners.fill_score, corners.match_score);
    let s_text = format_score("S", sides.fill_score, sides.match_score);

    let (_, line_h) = text_size(scale, font, &f_text);
    let line_h: i32 = i32::try_from(line_h).unwrap_or(i32::MAX);
    draw_text_mut(canvas, COLOR_FULL, label_x, label_y, scale, font, &f_text);
    draw_text_mut(
        canvas,
        COLOR_CORNERS,
        label_x,
        label_y + line_h + 1,
        scale,
        font,
        &c_text,
    );
    draw_text_mut(
        canvas,
        COLOR_SIDES,
        label_x,
        label_y + (line_h + 1) * 2,
        scale,
        font,
        &s_text,
    );
}

fn draw_one_sided(canvas: &mut RgbImage, bounds: &Rect, color: Rgb<u8>) {
    draw_hollow_rect_mut(canvas, *bounds, color);
}

fn format_score(prefix: &str, fill: UnitIntervalScore, match_score: UnitIntervalScore) -> String {
    format!("{prefix} f={:.3} m={:.3}", fill.0, match_score.0,)
}

fn load_image(path: &Path) -> Result<GrayImage, image::ImageError> {
    image::open(path).map(|img| img.to_luma8())
}

fn options(election: &Election, strategy: GridStrategy) -> Options {
    Options {
        election: election.clone(),
        bubble_template: ballot_scan_bubble_image(),
        debug_side_a_base: None,
        debug_side_b_base: None,
        write_in_scoring: WriteInScoring::Disabled,
        vertical_streak_detection: VerticalStreakDetection::Enabled,
        minimum_detected_scale: None,
        max_cumulative_streak_width: DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH,
        retry_streak_width_threshold: DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD,
        grid_strategy: strategy,
    }
}

fn compare_interpretations(
    full: &InterpretedBallotCard,
    corners: &InterpretedBallotCard,
    sides: &InterpretedBallotCard,
    threshold: f32,
) -> PairStats {
    let mut max_fill = 0.0f32;
    let mut max_match = 0.0f32;
    let mut sum_fill = 0.0f32;
    let mut paired = 0usize;
    let mut presence_mismatch = 0usize;
    let mut diverged_bubbles = 0usize;
    let mut n_bubbles = 0usize;

    for (f_page, c_page, s_page) in [
        (&full.front, &corners.front, &sides.front),
        (&full.back, &corners.back, &sides.back),
    ] {
        // All strategies use the same election/grid layout, so the
        // emitted bubble sequences should align position-for-position.
        if f_page.marks.len() != c_page.marks.len() || c_page.marks.len() != s_page.marks.len() {
            // Length mismatch is itself a divergence; record it as a
            // presence mismatch on every position past the shared prefix.
            let min_len = f_page
                .marks
                .len()
                .min(c_page.marks.len())
                .min(s_page.marks.len());
            let max_len = f_page
                .marks
                .len()
                .max(c_page.marks.len())
                .max(s_page.marks.len());
            let extra = max_len - min_len;
            presence_mismatch += extra;
            diverged_bubbles += extra;
        }
        for (((f_pos, f_mark), (c_pos, c_mark)), (s_pos, s_mark)) in f_page
            .marks
            .iter()
            .zip(c_page.marks.iter())
            .zip(s_page.marks.iter())
        {
            n_bubbles += 1;
            debug_assert_eq!(
                f_pos.location(),
                c_pos.location(),
                "bubble ordering diverged between strategies",
            );
            debug_assert_eq!(
                f_pos.location(),
                s_pos.location(),
                "bubble ordering diverged between strategies",
            );
            match (f_mark, c_mark, s_mark) {
                (Some(f), Some(c), Some(s)) => {
                    let fd = (f.fill_score.0 - c.fill_score.0)
                        .abs()
                        .max((f.fill_score.0 - s.fill_score.0).abs())
                        .max((c.fill_score.0 - s.fill_score.0).abs());
                    let md = (f.match_score.0 - c.match_score.0)
                        .abs()
                        .max((f.match_score.0 - s.match_score.0).abs())
                        .max((c.match_score.0 - s.match_score.0).abs());
                    max_fill = max_fill.max(fd);
                    max_match = max_match.max(md);
                    sum_fill += fd;
                    paired += 1;
                    if fd >= threshold || md >= threshold {
                        diverged_bubbles += 1;
                    }
                }
                (None, None, None) => {}
                _ => {
                    presence_mismatch += 1;
                    diverged_bubbles += 1;
                }
            }
        }
    }

    PairStats {
        n_bubbles,
        diverged_bubbles,
        presence_mismatch,
        max_fill_delta: max_fill,
        max_match_delta: max_match,
        mean_fill_delta: if paired == 0 {
            0.0
        } else {
            #[allow(clippy::cast_precision_loss)]
            let n = paired as f32;
            sum_fill / n
        },
    }
}

fn print_outcome(pair: &BallotPair, outcome: &Outcome) {
    let label = short_label(&pair.front);
    match outcome {
        Outcome::Compared(s) => {
            let flag = if s.diverged_bubbles == 0 {
                "OK"
            } else {
                "DIFF"
            };
            println!(
                "{flag:>4} {label}  diverged={}/{}  Δfill max={:.4} mean={:.4}  Δmatch max={:.4}  presence-mismatch={}",
                s.diverged_bubbles,
                s.n_bubbles,
                s.max_fill_delta,
                s.mean_fill_delta,
                s.max_match_delta,
                s.presence_mismatch,
            );
        }
        Outcome::LoadFailed(e) => println!("LOAD {label}: {e}"),
        Outcome::Failed {
            full,
            corners,
            sides,
        } => {
            let failed: Vec<&str> = [
                full.as_ref().map(|_| "full"),
                corners.as_ref().map(|_| "corners"),
                sides.as_ref().map(|_| "sides"),
            ]
            .into_iter()
            .flatten()
            .collect();
            let errors: Vec<String> = [
                full.as_ref().map(|e| format!("full: {e}")),
                corners.as_ref().map(|e| format!("corners: {e}")),
                sides.as_ref().map(|e| format!("sides: {e}")),
            ]
            .into_iter()
            .flatten()
            .collect();
            println!(
                "FAIL {label}: {} failed: {}",
                failed.join("+"),
                errors.join(" | "),
            );
        }
    }
}

fn print_summary(outcomes: &[(BallotPair, Outcome)]) {
    let total = outcomes.len();
    let mut compared = 0usize;
    let mut load_failed = 0usize;
    let mut full_failed = 0usize;
    let mut corners_failed = 0usize;
    let mut sides_failed = 0usize;
    let mut all_failed = 0usize;
    let mut max_fills: Vec<f32> = vec![];
    let mut max_matches: Vec<f32> = vec![];
    let mut presence_mismatches = 0usize;
    let mut total_bubbles = 0usize;
    let mut total_diverged = 0usize;
    let mut pairs_with_diff = 0usize;

    for (_, o) in outcomes {
        match o {
            Outcome::Compared(s) => {
                compared += 1;
                max_fills.push(s.max_fill_delta);
                max_matches.push(s.max_match_delta);
                if s.presence_mismatch > 0 {
                    presence_mismatches += 1;
                }
                total_bubbles += s.n_bubbles;
                total_diverged += s.diverged_bubbles;
                if s.diverged_bubbles > 0 {
                    pairs_with_diff += 1;
                }
            }
            Outcome::LoadFailed(_) => load_failed += 1,
            Outcome::Failed {
                full,
                corners,
                sides,
            } => {
                if full.is_some() {
                    full_failed += 1;
                }
                if corners.is_some() {
                    corners_failed += 1;
                }
                if sides.is_some() {
                    sides_failed += 1;
                }
                if full.is_some() && corners.is_some() && sides.is_some() {
                    all_failed += 1;
                }
            }
        }
    }

    let bubble_diff_pct = if total_bubbles == 0 {
        0.0
    } else {
        #[allow(clippy::cast_precision_loss)]
        let n = total_bubbles as f32;
        #[allow(clippy::cast_precision_loss)]
        let d = total_diverged as f32;
        100.0 * d / n
    };

    println!("=== Summary ===");
    println!("  total pairs:                    {total}");
    println!("  all strategies succeeded:       {compared}");
    println!("  full-borders failed:            {full_failed}");
    println!("  corners-only failed:            {corners_failed}");
    println!("  sides-only failed:              {sides_failed}");
    println!("  all strategies failed:          {all_failed}");
    println!("  load failed:                    {load_failed}");
    println!("  pairs with presence mismatches: {presence_mismatches}");
    println!("  pairs with any divergence:      {pairs_with_diff} / {compared}");
    println!(
        "  bubble-position differences:    {total_diverged} / {total_bubbles} ({bubble_diff_pct:.2}%)",
    );

    if !max_fills.is_empty() {
        max_fills.sort_by(f32::total_cmp);
        max_matches.sort_by(f32::total_cmp);
        let max_fill_overall = *max_fills.last().expect("non-empty (just checked)");
        let max_match_overall = *max_matches.last().expect("non-empty (just checked)");
        println!();
        println!("Across compared pairs (max-per-pair distribution):");
        println!(
            "  Δfill_score:  p50={:.4}  p90={:.4}  p99={:.4}  max={:.4}",
            percentile(&max_fills, 0.50),
            percentile(&max_fills, 0.90),
            percentile(&max_fills, 0.99),
            max_fill_overall,
        );
        println!(
            "  Δmatch_score: p50={:.4}  p90={:.4}  p99={:.4}  max={:.4}",
            percentile(&max_matches, 0.50),
            percentile(&max_matches, 0.90),
            percentile(&max_matches, 0.99),
            max_match_overall,
        );
    }
}

#[allow(
    clippy::cast_precision_loss,
    clippy::cast_sign_loss,
    clippy::cast_possible_truncation
)]
fn percentile(sorted: &[f32], p: f32) -> f32 {
    let idx = ((sorted.len() as f32 - 1.0) * p).round() as usize;
    sorted[idx.min(sorted.len() - 1)]
}

/// Short label for a front-side path: the immediate parent dir + the
/// trailing `-front.<ext>` filename. Avoids printing long absolute paths
/// for every line of output.
fn short_label(front: &Path) -> String {
    let parent = front
        .parent()
        .and_then(|p| p.file_name())
        .and_then(|s| s.to_str())
        .unwrap_or("");
    let name = front.file_name().and_then(|s| s.to_str()).unwrap_or("?");
    if parent.is_empty() {
        name.to_owned()
    } else {
        format!("{parent}/{name}")
    }
}
