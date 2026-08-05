//! Golden-corpus test: every fixture's analysis must match its committed
//! expected verdicts. The corpus data (fixtures, real istanbul coverage
//! report, expected/*.json) lives in `corpus/`; regenerate coverage there
//! with `pnpm install --ignore-workspace && pnpm coverage`, and audit or
//! regenerate expected files with `coverage-check dump corpus/`.

use std::path::Path;

#[test]
fn golden_corpus() {
    let corpus_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("corpus");
    let failures = coverage_check::corpus::run(&corpus_dir).expect("corpus loads");
    assert!(
        failures.is_empty(),
        "golden corpus diverged:\n{}",
        failures.join("\n")
    );
}
