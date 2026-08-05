#![allow(dead_code)]

// coverage-check PoC.
//
//   coverage-check dump <corpus-dir>     print the analyzed corpus as JSON
//                                        (for auditing + annotating expected/)
//   coverage-check corpus <corpus-dir>   golden run: compare analysis against
//                                        expected/*.json; nonzero exit on diff
//   coverage-check check <pkg-dir> [--never-scan <dir>]...
//                                        real-package mode over
//                                        <pkg-dir>/coverage/coverage-final.json

mod attach;
mod classify;
mod grammar;
mod lines;
mod never;
mod report;

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::Instant;

use oxc_allocator::Allocator;
use serde::{Deserialize, Serialize};

use attach::{bind_flags, parse_file};
use classify::{classify, FileAnalysis, Status};
use lines::LineTable;

#[derive(Debug, Serialize, Deserialize, PartialEq)]
struct DirectiveRecord {
    line: u32,
    label: String,
    form: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    binds: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    stale: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct EntityRecord {
    id: String,
    kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "type")]
    branch_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    attributed_at: Option<String>,
    hits: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    snippet: Option<String>,
    status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    note: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct FixtureRecord {
    file: String,
    directives: Vec<DirectiveRecord>,
    entities: Vec<EntityRecord>,
}

fn normalize_snippet(text: &str, max_chars: usize) -> String {
    let collapsed: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed.chars().take(max_chars).collect()
}

fn snippet_at(source: &str, table: &LineTable, at: (u32, u32)) -> String {
    // Find the byte offset for a (line, col) and take a short snippet.
    let mut offset = None;
    for (i, _) in source.char_indices() {
        if table.pos_of(source, i) == at {
            offset = Some(i);
            break;
        }
    }
    match offset {
        Some(o) => normalize_snippet(&source[o..], 40),
        None => String::from("<pos not found>"),
    }
}

fn analyze_fixture(
    path: &Path,
    cov: &report::FileCov,
    never_names: &HashSet<String>,
) -> (String, FileAnalysis) {
    let source = std::fs::read_to_string(path).expect("fixture readable");
    let allocator = Allocator::default();
    let parsed = parse_file(&allocator, path, &source);
    let flags = bind_flags(&parsed, u32::try_from(source.len()).unwrap());
    let analysis = classify(&source, &parsed, &flags, cov, never_names);
    (source, analysis)
}

fn to_record(
    file_name: &str,
    source: &str,
    analysis: &FileAnalysis,
    with_dump_fields: bool,
) -> FixtureRecord {
    let table = LineTable::new(source);
    let flags = analysis
        .flags
        .iter()
        .map(|f| DirectiveRecord {
            line: f.line,
            label: f.label.as_str().to_string(),
            form: f.form.as_str().to_string(),
            reason: f.reason.clone(),
            binds: f.binds_range.map(|(start, end)| {
                normalize_snippet(&source[start as usize..end as usize], 60)
            }),
            error: f.error.map(str::to_string),
            stale: f.stale,
        })
        .collect();
    let entities = analysis
        .entities
        .iter()
        .map(|e| EntityRecord {
            id: e.id.clone(),
            kind: e.kind.to_string(),
            branch_type: e.branch_type.clone(),
            at: e.at.map(|(l, c)| format!("{l}:{c}")),
            attributed_at: e.attributed_at.map(|(l, c)| format!("{l}:{c}")),
            hits: e.hits,
            snippet: if with_dump_fields {
                e.at.or(e.attributed_at).map(|p| snippet_at(source, &table, p))
            } else {
                None
            },
            status: e.status.as_str().to_string(),
            note: e.note.clone(),
        })
        .collect();
    FixtureRecord { file: file_name.to_string(), directives: flags, entities }
}

fn corpus_fixtures(corpus_dir: &Path) -> Vec<PathBuf> {
    let mut files = never::source_files(&corpus_dir.join("fixtures"));
    files.sort();
    files
}

fn load_corpus(
    corpus_dir: &Path,
) -> (Vec<PathBuf>, std::collections::HashMap<String, report::FileCov>, HashSet<String>) {
    let report_path = corpus_dir.join("coverage/coverage-final.json");
    let report = report::load_report(&report_path).expect("corpus coverage report");
    let fixtures = corpus_fixtures(corpus_dir);
    let never_names = never::build_registry(&[&corpus_dir.join("fixtures")]);
    (fixtures, report, never_names)
}

fn find_cov<'r>(
    report: &'r std::collections::HashMap<String, report::FileCov>,
    path: &Path,
) -> Option<&'r report::FileCov> {
    let canonical = path.canonicalize().ok()?;
    report
        .values()
        .find(|fc| Path::new(&fc.path).canonicalize().ok().as_deref() == Some(&canonical))
}

fn empty_cov(path: &Path) -> report::FileCov {
    report::FileCov {
        path: path.display().to_string(),
        statement_map: Default::default(),
        fn_map: Default::default(),
        branch_map: Default::default(),
        s: Default::default(),
        f: Default::default(),
        b: Default::default(),
    }
}

fn cmd_dump(corpus_dir: &Path) {
    let (fixtures, report, never_names) = load_corpus(corpus_dir);
    let mut records = Vec::new();
    for path in &fixtures {
        let cov = find_cov(&report, path).cloned().unwrap_or_else(|| empty_cov(path));
        let (source, analysis) = analyze_fixture(path, &cov, &never_names);
        let name = path.file_name().unwrap().to_string_lossy().to_string();
        records.push(to_record(&name, &source, &analysis, true));
    }
    println!("{}", serde_json::to_string_pretty(&records).unwrap());
}

fn cmd_corpus(corpus_dir: &Path) -> i32 {
    let (fixtures, report, never_names) = load_corpus(corpus_dir);
    let mut failures = 0;
    for path in &fixtures {
        let name = path.file_name().unwrap().to_string_lossy().to_string();
        let expected_path = corpus_dir
            .join("expected")
            .join(format!("{}.json", path.file_stem().unwrap().to_string_lossy()));
        let Ok(expected_text) = std::fs::read_to_string(&expected_path) else {
            println!("MISSING expected file for {name}");
            failures += 1;
            continue;
        };
        let expected: FixtureRecord =
            serde_json::from_str(&expected_text).expect("valid expected json");
        let cov = find_cov(&report, path).cloned().unwrap_or_else(|| empty_cov(path));
        let (source, analysis) = analyze_fixture(path, &cov, &never_names);
        let actual = to_record(&name, &source, &analysis, false);

        let mut diffs: Vec<String> = Vec::new();
        if actual.directives != expected.directives {
            for (a, e) in actual.directives.iter().zip(expected.directives.iter()) {
                if a != e {
                    diffs.push(format!("  flag L{}: actual {a:?} != expected {e:?}", a.line));
                }
            }
            if actual.directives.len() != expected.directives.len() {
                diffs.push(format!(
                    "  flag count: actual {} != expected {}",
                    actual.directives.len(),
                    expected.directives.len()
                ));
            }
        }
        for e in &expected.entities {
            match actual.entities.iter().find(|a| a.id == e.id) {
                None => diffs.push(format!("  entity {}: missing in actual", e.id)),
                Some(a) if a.status != e.status => diffs.push(format!(
                    "  entity {} at {:?}: actual status {} != expected {}",
                    e.id, a.at, a.status, e.status
                )),
                _ => {}
            }
        }
        for a in &actual.entities {
            if !expected.entities.iter().any(|e| e.id == a.id) {
                diffs.push(format!(
                    "  entity {} at {:?} ({}, hits {}): not in expected",
                    a.id, a.at, a.status, a.hits
                ));
            }
        }

        if diffs.is_empty() {
            println!("PASS {name}");
        } else {
            failures += 1;
            println!("FAIL {name}");
            for d in diffs {
                println!("{d}");
            }
        }
    }
    if failures == 0 {
        println!("\ncorpus: all fixtures PASS");
        0
    } else {
        println!("\ncorpus: {failures} fixture(s) FAILED");
        1
    }
}

fn cmd_check(pkg_dir: &Path, never_scan: &[PathBuf]) -> i32 {
    let started = Instant::now();
    let report_path = pkg_dir.join("coverage/coverage-final.json");
    let report = match report::load_report(&report_path) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("{e}");
            return 2;
        }
    };
    let mut scan_dirs: Vec<&Path> = vec![pkg_dir];
    for d in never_scan {
        scan_dirs.push(d);
    }
    let never_names = never::build_registry(&scan_dirs);

    let mut fail_count = 0usize;
    let mut stale_flags = 0usize;
    let mut excluded = 0usize;
    let mut deferred = 0usize;
    let mut never_excluded = 0usize;
    let mut flag_errors = 0usize;
    let mut paths: Vec<&String> = report.keys().collect();
    paths.sort();
    for key in paths {
        let cov = &report[key];
        let path = Path::new(&cov.path);
        let Ok(source) = std::fs::read_to_string(path) else {
            eprintln!("cannot read {}", path.display());
            continue;
        };
        let has_uncovered = cov.s.values().any(|v| *v == 0)
            || cov.f.values().any(|v| *v == 0)
            || cov.b.values().any(|arr| arr.iter().any(|v| *v == 0));
        let has_flag_text =
            source.contains("coverage-exclude") || source.contains("coverage-defer");
        if !has_uncovered && !has_flag_text {
            continue;
        }
        let allocator = Allocator::default();
        let parsed = parse_file(&allocator, path, &source);
        let flags = bind_flags(&parsed, u32::try_from(source.len()).unwrap());
        let analysis = classify(&source, &parsed, &flags, cov, &never_names);
        let table = LineTable::new(&source);
        let rel = cov.path.strip_prefix(&format!("{}/", pkg_dir.display())).unwrap_or(&cov.path);
        for f in &analysis.flags {
            if let Some(err) = f.error {
                flag_errors += 1;
                println!("DIRECTIVE ERROR {rel}:{} {} ({})", f.line, err, f.label.as_str());
            } else if f.stale {
                stale_flags += 1;
                println!("STALE      {rel}:{} @coverage-{} directive no longer needed", f.line, f.label.as_str());
            }
        }
        for e in &analysis.entities {
            match e.status {
                Status::Fail => {
                    fail_count += 1;
                    let at = e.attributed_at.or(e.at);
                    let loc = at.map(|(l, c)| format!("{l}:{c}")).unwrap_or_default();
                    let snip = at
                        .map(|p| snippet_at(&source, &table, p))
                        .unwrap_or_default();
                    println!(
                        "FAIL       {rel}:{loc} uncovered {} `{snip}`",
                        e.branch_type.as_deref().unwrap_or(e.kind)
                    );
                }
                Status::Excluded => excluded += 1,
                Status::Deferred => deferred += 1,
                Status::NeverExcluded => never_excluded += 1,
                Status::Covered => {
                    if let Some(note) = &e.note {
                        println!("INFO       {rel}: {note} executed");
                    }
                }
            }
        }
    }
    // Flagged source files that never made it into the report (e.g. barrel
    // files with no instrumentable entities) would otherwise hide their flags.
    let reported: HashSet<PathBuf> = report
        .values()
        .filter_map(|fc| Path::new(&fc.path).canonicalize().ok())
        .collect();
    for path in never::source_files(pkg_dir) {
        let Ok(canonical) = path.canonicalize() else { continue };
        if reported.contains(&canonical) {
            continue;
        }
        let Ok(source) = std::fs::read_to_string(&path) else { continue };
        if !source.contains("coverage-exclude") && !source.contains("coverage-defer") {
            continue;
        }
        let allocator = Allocator::default();
        let parsed = parse_file(&allocator, &path, &source);
        let flags = bind_flags(&parsed, u32::try_from(source.len()).unwrap());
        for f in &flags {
            let form = f.parsed.form;
            flag_errors += 1;
            println!(
                "DIRECTIVE ERROR {}: @coverage-{}{} directive on file with no coverage entities{}",
                path.display(),
                f.parsed.label.as_str(),
                match form {
                    grammar::Form::File => "-file",
                    grammar::Form::Else => "-else",
                    grammar::Form::Default => "",
                },
                if form == grammar::Form::File {
                    " (use coverage.exclude config instead)"
                } else {
                    ""
                }
            );
        }
    }

    println!(
        "\nsummary: {fail_count} uncovered without directives, {flag_errors} directive errors, {stale_flags} stale directives, register: {excluded} excluded / {deferred} deferred / {never_excluded} never-param",
    );
    println!("timing: {:.0}ms", started.elapsed().as_secs_f64() * 1000.0);
    if fail_count > 0 || flag_errors > 0 {
        1
    } else {
        0
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let usage = "usage: coverage-check <dump|corpus|check> <dir> [--never-scan <dir>]...";
    if args.len() < 3 {
        eprintln!("{usage}");
        std::process::exit(2);
    }
    let dir = PathBuf::from(&args[2]);
    match args[1].as_str() {
        "dump" => cmd_dump(&dir),
        "corpus" => std::process::exit(cmd_corpus(&dir)),
        "check" => {
            let mut never_scan = Vec::new();
            let mut i = 3;
            while i < args.len() {
                if args[i] == "--never-scan" && i + 1 < args.len() {
                    never_scan.push(PathBuf::from(&args[i + 1]));
                    i += 2;
                } else {
                    i += 1;
                }
            }
            std::process::exit(cmd_check(&dir, &never_scan));
        }
        _ => {
            eprintln!("{usage}");
            std::process::exit(2);
        }
    }
}
