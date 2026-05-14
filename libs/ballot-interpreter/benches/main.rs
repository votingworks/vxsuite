#![allow(clippy::similar_names, clippy::unwrap_used)]

use std::{fmt::Display, fs::File, io::BufReader, path::PathBuf};

use ballot_interpreter::{
    debug::ImageDebugWriter,
    interpret::{
        ScanInterpreter, VerticalStreakDetection, WriteInScoring,
        DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH, DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD,
    },
    qr_code,
};
use divan::{black_box, Bencher};
use image::GrayImage;
use types_rs::{
    bubble_ballot::{PartialBallotHash, PARTIAL_BALLOT_HASH_BYTE_LENGTH, PRELUDE},
    election::Election,
};

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
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test/fixtures");
        let election_path = fixture_path.join(self.election).join("election.json");
        let election: Election =
            serde_json::from_reader(BufReader::new(File::open(election_path)?))?;
        let side_a_path = fixture_path
            .join(self.election)
            .join(format!("{}-front{}", self.name, self.extension));
        let side_b_path = fixture_path
            .join(self.election)
            .join(format!("{}-back{}", self.name, self.extension));
        let side_a_image = image::open(&side_a_path)?.to_luma8();
        let side_b_image = image::open(&side_b_path)?.to_luma8();

        // Pull the expected ballot hash out of side A's QR code rather than
        // hashing election.json bytes. Some bench fixtures (e.g.
        // `vxqa-2024-10`) ship an election.json whose SHA-256 doesn't match
        // the hash baked into the ballot QR codes, and we don't want benchmark
        // setup to fail on those. The hash check itself is exercised by unit
        // tests; here we just want to time interpretation.
        let expected_ballot_hash = decode_ballot_hash_from_image(&side_a_image);

        let interpreter = ScanInterpreter::new(
            election,
            expected_ballot_hash,
            WriteInScoring::Enabled,
            VerticalStreakDetection::default(),
            None,
            DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH,
            DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD,
        )?;
        Ok((side_a_image, side_b_image, interpreter))
    }
}

/// Pulls the partial ballot hash out of a ballot image's QR code. See the
/// equivalent helper in `interpret::test` for context.
fn decode_ballot_hash_from_image(image: &GrayImage) -> PartialBallotHash {
    let qr = qr_code::detect(image, &ImageDebugWriter::disabled()).unwrap();
    let (prelude, payload) = qr.bytes().split_at(PRELUDE.len());
    assert_eq!(prelude, PRELUDE);
    let (ballot_hash, _) = payload.split_at(PARTIAL_BALLOT_HASH_BYTE_LENGTH);
    ballot_hash.try_into().unwrap()
}

impl Display for InterpretFixture {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}/{}", self.election, self.name)
    }
}

#[divan::bench(args = [
    InterpretFixture::new("all-bubble-ballot", "blank", ".jpg"),
    InterpretFixture::new("vxqa-2024-10", "skew", ".png"),
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
