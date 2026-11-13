//! Compiles a C probe against the installed `ino.hpp` and checks that `ffi.rs` agrees with it.
//! Skipped when the header is not installed, as in CI, where it cannot be committed.

#![allow(
    clippy::cast_possible_wrap,
    clippy::cast_lossless,
    clippy::unreadable_literal
)]

use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::path::PathBuf;
use std::process::Command;

#[allow(clippy::wildcard_imports)]
use deskpro_scanner::ffi::*;

include!(concat!(env!("OUT_DIR"), "/vendor_header_layout.rs"));

/// Overrides the directory holding `ino.hpp`.
const INCLUDE_DIR_ENV: &str = "DESKPRO_INOAPI_INCLUDE";
const DEFAULT_INCLUDE_DIR: &str = "/opt/inotec/scamaxusb3/include";

#[test]
fn ffi_matches_the_installed_vendor_header() {
    let include = std::env::var_os(INCLUDE_DIR_ENV)
        .map_or_else(|| PathBuf::from(DEFAULT_INCLUDE_DIR), PathBuf::from);
    if !include.join("ino.hpp").exists() {
        eprintln!(
            "skipping: no ino.hpp in {} (set {INCLUDE_DIR_ENV})",
            include.display()
        );
        return;
    }

    let mut probe = String::from(
        "#include <stddef.h>\n#include <stdio.h>\n#include \"ino.hpp\"\nint main(void) {\n",
    );
    for (expression, _) in LAYOUT {
        writeln!(
            probe,
            "  printf(\"%s\\t%lld\\n\", \"{expression}\", (long long)({expression}));"
        )
        .expect("writing to a String");
    }
    probe.push_str("  return 0;\n}\n");

    let dir = std::env::temp_dir().join(format!("deskpro-vendor-header-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("temp dir is writable");
    let source = dir.join("probe.c");
    let binary = dir.join("probe");
    std::fs::write(&source, probe).expect("probe is writable");
    let compiled = Command::new("cc")
        .arg("-x")
        .arg("c")
        .arg(&source)
        .arg("-I")
        .arg(&include)
        .arg("-o")
        .arg(&binary)
        .status()
        .expect("cc runs");
    assert!(
        compiled.success(),
        "the probe did not compile against ino.hpp"
    );
    let output = Command::new(&binary).output().expect("probe runs");
    std::fs::remove_dir_all(&dir).ok();

    let c_values: BTreeMap<String, i128> = String::from_utf8(output.stdout)
        .expect("UTF-8 output")
        .lines()
        .filter_map(|line| {
            let (name, value) = line.split_once('\t')?;
            Some((name.to_owned(), value.parse().ok()?))
        })
        .collect();
    let mismatches: Vec<String> = LAYOUT
        .iter()
        .filter(|(expression, rust)| c_values.get(*expression) != Some(rust))
        .map(|(expression, rust)| {
            format!(
                "{expression}: Rust {rust}, C {:?}",
                c_values.get(*expression)
            )
        })
        .collect();
    assert!(
        mismatches.is_empty(),
        "ffi.rs disagrees with {}:\n{}",
        include.join("ino.hpp").display(),
        mismatches.join("\n")
    );
    eprintln!(
        "checked {} values against {}",
        LAYOUT.len(),
        include.display()
    );
}
