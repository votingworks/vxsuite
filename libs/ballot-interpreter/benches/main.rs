#![allow(clippy::similar_names, clippy::unwrap_used)]

use std::{fmt::Display, fs::File, io::BufReader, path::PathBuf};

use ballot_interpreter::interpret::ScanInterpreter;
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
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test/fixtures");
        let election_path = fixture_path.join(self.election).join("election.json");
        let election: types_rs::election::Election =
            serde_json::from_reader(BufReader::new(File::open(election_path)?))?;
        let interpreter = ScanInterpreter::new(election, true, false)?;
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
    InterpretFixture::new("nh-test-ballot", "grayscale", ".png"),
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
