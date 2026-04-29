#![allow(clippy::similar_names, clippy::unwrap_used)]

use std::{fmt::Display, fs::File, io::BufReader, path::PathBuf};

use ballot_interpreter::{
    interpret::{
        ScanInterpreter, VerticalStreakDetection, WriteInScoring,
        DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH, DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD,
    },
    timing_marks::border_finding::GridStrategy,
};
use divan::{black_box, Bencher};
use image::GrayImage;

fn main() {
    // Run registered benchmarks.
    divan::main();
}

#[derive(Debug, Clone, Copy)]
struct InterpretFixture {
    election: &'static str,
    name: &'static str,
    extension: &'static str,
}

impl InterpretFixture {
    const fn new(election: &'static str, name: &'static str, extension: &'static str) -> Self {
        Self {
            election,
            name,
            extension,
        }
    }

    fn load(&self) -> color_eyre::Result<(GrayImage, GrayImage, ScanInterpreter)> {
        self.load_with_strategy(GridStrategy::default())
    }

    fn load_with_strategy(
        &self,
        strategy: GridStrategy,
    ) -> color_eyre::Result<(GrayImage, GrayImage, ScanInterpreter)> {
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test/fixtures");
        let election_path = fixture_path.join(self.election).join("election.json");
        let election: types_rs::election::Election =
            serde_json::from_reader(BufReader::new(File::open(election_path)?))?;
        let interpreter = ScanInterpreter::new(
            election,
            WriteInScoring::Enabled,
            VerticalStreakDetection::default(),
            None,
            DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH,
            DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD,
            strategy,
        );
        let side_a_path = fixture_path
            .join(self.election)
            .join(format!("{}-front{}", self.name, self.extension));
        let side_b_path = fixture_path
            .join(self.election)
            .join(format!("{}-back{}", self.name, self.extension));
        Ok((
            image::open(&side_a_path)?.to_luma8(),
            image::open(&side_b_path)?.to_luma8(),
            interpreter,
        ))
    }
}

impl Display for InterpretFixture {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}/{}", self.election, self.name)
    }
}

#[divan::bench(args = [
    InterpretFixture::new("all-bubble-ballot", "blank", ".jpg"),
    InterpretFixture::new("vxqa-2024-10", "skew", ".png"),
    InterpretFixture::new("22in-ballot-2in-margin", "centered", ".jpeg"),
    InterpretFixture::new("letter-ballot-2in-margin-centered", "centered", ".jpeg"),
])]
fn interpret(bencher: Bencher, fixture: InterpretFixture) {
    let (side_a_image, side_b_image, interpreter) = fixture.load().unwrap();

    bencher.bench_local(move || {
        black_box(
            interpreter
                .interpret(side_a_image.clone(), side_b_image.clone(), None, None)
                .unwrap(),
        );
    });
}

/// Benchmark of [`GridStrategy::FullBorders`] (production strategy). Paired
/// with [`interpret_corners_only`] to measure the perf delta between
/// strategies — chiefly the cost of the wider per-bubble jiggle that
/// CornersOnly uses.
#[divan::bench(args = [
    InterpretFixture::new("all-bubble-ballot", "blank", ".jpg"),
    InterpretFixture::new("vxqa-2024-10", "skew", ".png"),
    InterpretFixture::new("22in-ballot-2in-margin", "centered", ".jpeg"),
    InterpretFixture::new("letter-ballot-2in-margin-centered", "centered", ".jpeg"),
])]
fn interpret_full_borders(bencher: Bencher, fixture: InterpretFixture) {
    let (side_a_image, side_b_image, interpreter) =
        fixture.load_with_strategy(GridStrategy::FullBorders).unwrap();

    bencher.bench_local(move || {
        black_box(
            interpreter
                .interpret(side_a_image.clone(), side_b_image.clone(), None, None)
                .unwrap(),
        );
    });
}

/// Benchmark of [`GridStrategy::CornersOnly`] — paired with
/// [`interpret_full_borders`]. The `vxqa-2024-10/skew` fixture is omitted
/// because its corner quadrilateral exceeds the rectangularity threshold
/// and CornersOnly rejects it (which is intentional behavior, but means it
/// can't be benchmarked under this strategy).
#[divan::bench(args = [
    InterpretFixture::new("all-bubble-ballot", "blank", ".jpg"),
    InterpretFixture::new("22in-ballot-2in-margin", "centered", ".jpeg"),
    InterpretFixture::new("letter-ballot-2in-margin-centered", "centered", ".jpeg"),
])]
fn interpret_corners_only(bencher: Bencher, fixture: InterpretFixture) {
    let (side_a_image, side_b_image, interpreter) =
        fixture.load_with_strategy(GridStrategy::CornersOnly).unwrap();

    bencher.bench_local(move || {
        black_box(
            interpreter
                .interpret(side_a_image.clone(), side_b_image.clone(), None, None)
                .unwrap(),
        );
    });
}

/// Benchmark that includes writing normalized images to disk, which is the
/// real-world path when scanning ballots.
#[divan::bench(args = [
    InterpretFixture::new("all-bubble-ballot", "blank", ".jpg"),
    InterpretFixture::new("vxqa-2024-10", "skew", ".png"),
])]
fn interpret_and_save(bencher: Bencher, fixture: InterpretFixture) {
    let (side_a_image, side_b_image, interpreter) = fixture.load().unwrap();
    let tmp_dir = tempfile::tempdir().unwrap();
    let front_path = tmp_dir.path().join("front.png");
    let back_path = tmp_dir.path().join("back.png");

    bencher.bench_local(move || {
        let result = interpreter
            .interpret(side_a_image.clone(), side_b_image.clone(), None, None)
            .unwrap();

        // Write the pre-encoded normalized images to disk
        std::fs::write(
            &front_path,
            result.front.encoded_normalized_image.as_ref().unwrap(),
        )
        .unwrap();
        std::fs::write(
            &back_path,
            result.back.encoded_normalized_image.as_ref().unwrap(),
        )
        .unwrap();
        black_box(result);
    });
}

/// For comparison: the old sequential approach of saving by re-encoding.
#[divan::bench(args = [
    InterpretFixture::new("all-bubble-ballot", "blank", ".jpg"),
    InterpretFixture::new("vxqa-2024-10", "skew", ".png"),
])]
fn interpret_and_save_sequential(bencher: Bencher, fixture: InterpretFixture) {
    let (side_a_image, side_b_image, interpreter) = fixture.load().unwrap();
    let tmp_dir = tempfile::tempdir().unwrap();
    let front_path = tmp_dir.path().join("front_seq.png");
    let back_path = tmp_dir.path().join("back_seq.png");

    bencher.bench_local(move || {
        let result = interpreter
            .interpret(side_a_image.clone(), side_b_image.clone(), None, None)
            .unwrap();

        // Simulate the old behavior: encode and save sequentially after interpretation
        result.front.normalized_image.save(&front_path).unwrap();
        result.back.normalized_image.save(&back_path).unwrap();
        black_box(result);
    });
}
