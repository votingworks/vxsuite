#![allow(clippy::similar_names, clippy::unwrap_used)]

use std::{fmt::Display, path::PathBuf};

use ballot_interpreter::interpret::{
    ScanInterpreter, VerticalStreakDetection, WriteInScoring, DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH,
    DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD,
};
use divan::{black_box, Bencher};
use image::GrayImage;
use sha2::{Digest, Sha256};
use types_rs::{bubble_ballot::PartialBallotHash, election::Election};

fn main() {
    // Run registered benchmarks.
    divan::main();
}

/// A ballot card from `libs/hmpb/fixtures`. These fixtures are regenerated
/// alongside the current metadata encoding, so their QR codes can be decoded
/// end-to-end (unlike the field-captured fixtures in `test/fixtures`, whose
/// QR codes predate the current encoding).
#[derive(Debug, Clone, Copy)]
struct InterpretFixture {
    /// Directory under `libs/hmpb/fixtures` containing rendered
    /// `<ballot>-p<N>.jpg` page images.
    dir: &'static str,

    /// Path to the election definition the ballots were generated from,
    /// relative to this crate's root.
    election_json: &'static str,

    /// Ballot file prefix, e.g. `blank-ballot` or `marked-ballot`.
    ballot: &'static str,

    /// Page number of the card's front page; the back page is the next page.
    starting_page_number: usize,
}

impl InterpretFixture {
    const fn new(
        dir: &'static str,
        election_json: &'static str,
        ballot: &'static str,
        starting_page_number: usize,
    ) -> Self {
        Self {
            dir,
            election_json,
            ballot,
            starting_page_number,
        }
    }

    fn load(&self) -> color_eyre::Result<(GrayImage, GrayImage, ScanInterpreter)> {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let fixture_path = manifest_dir.join("../hmpb/fixtures").join(self.dir);
        let election_bytes = std::fs::read(manifest_dir.join(self.election_json))?;
        let election: Election = serde_json::from_slice(&election_bytes)?;

        // The ballot hash is the SHA-256 of the election.json bytes, matching
        // the TS `sha256(electionData)` convention used when generating the
        // fixtures' QR codes.
        let digest = Sha256::digest(&election_bytes);
        let mut expected_ballot_hash = PartialBallotHash::default();
        let len = expected_ballot_hash.len();
        expected_ballot_hash.copy_from_slice(&digest[..len]);

        let side_a_path = fixture_path.join(format!(
            "{}-p{}.jpg",
            self.ballot, self.starting_page_number
        ));
        let side_b_path = fixture_path.join(format!(
            "{}-p{}.jpg",
            self.ballot,
            self.starting_page_number + 1
        ));
        let side_a_image = image::open(&side_a_path)?.to_luma8();
        let side_b_image = image::open(&side_b_path)?.to_luma8();

        let interpreter = ScanInterpreter::new(
            election,
            expected_ballot_hash,
            WriteInScoring::Enabled,
            VerticalStreakDetection::default(),
            None,
            DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH,
            DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD,
        );
        Ok((side_a_image, side_b_image, interpreter))
    }
}

impl Display for InterpretFixture {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}/{}-p{}",
            self.dir, self.ballot, self.starting_page_number
        )
    }
}

#[divan::bench(args = [
    InterpretFixture::new(
        "vx-general-election/letter-en",
        "../hmpb/fixtures/vx-general-election/letter-en/election.json",
        "blank-ballot",
        1,
    ),
    InterpretFixture::new(
        "vx-general-election/letter-en",
        "../hmpb/fixtures/vx-general-election/letter-en/election.json",
        "blank-ballot",
        3,
    ),
    InterpretFixture::new(
        "vx-famous-names",
        "../fixtures/data/electionFamousNames2021/electionGeneratedWithGridLayoutsEnglishOnly.json",
        "marked-ballot",
        1,
    ),
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

/// Benchmark for ballot page preparation (border cropping) and timing mark
/// finding only, the most pixel-intensive part of interpretation.
#[divan::bench(args = [
    InterpretFixture::new(
        "vx-general-election/letter-en",
        "../hmpb/fixtures/vx-general-election/letter-en/election.json",
        "blank-ballot",
        1,
    ),
    InterpretFixture::new(
        "vx-famous-names",
        "../fixtures/data/electionFamousNames2021/electionGeneratedWithGridLayoutsEnglishOnly.json",
        "marked-ballot",
        1,
    ),
])]
fn find_timing_marks(bencher: Bencher, fixture: InterpretFixture) {
    use ballot_interpreter::ballot_card::{BallotPage, PaperInfo};
    use ballot_interpreter::timing_marks::{self, DefaultForGeometry};

    let (side_a_image, _, _) = fixture.load().unwrap();

    bencher.bench_local(move || {
        let page =
            BallotPage::from_image("side A", side_a_image.clone(), &PaperInfo::scanned(), None)
                .unwrap();
        let options = timing_marks::Options::default_for_geometry(page.geometry());
        black_box(page.find_timing_marks(&options).unwrap());
    });
}

/// Benchmark that includes writing normalized images to disk, which is the
/// real-world path when scanning ballots.
#[divan::bench(args = [
    InterpretFixture::new(
        "vx-general-election/letter-en",
        "../hmpb/fixtures/vx-general-election/letter-en/election.json",
        "blank-ballot",
        1,
    ),
    InterpretFixture::new(
        "vx-famous-names",
        "../fixtures/data/electionFamousNames2021/electionGeneratedWithGridLayoutsEnglishOnly.json",
        "marked-ballot",
        1,
    ),
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
    InterpretFixture::new(
        "vx-general-election/letter-en",
        "../hmpb/fixtures/vx-general-election/letter-en/election.json",
        "blank-ballot",
        1,
    ),
    InterpretFixture::new(
        "vx-famous-names",
        "../fixtures/data/electionFamousNames2021/electionGeneratedWithGridLayoutsEnglishOnly.json",
        "marked-ballot",
        1,
    ),
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
