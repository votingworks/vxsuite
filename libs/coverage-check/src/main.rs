//! Thin CLI over the coverage-check core. Intended invocation is
//! `vitest run --coverage && coverage-check check <pkg-dir>` — the `&&` is the
//! primary partial-run guard (never check after a failing or filtered run).

use std::collections::HashSet;
use std::io::IsTerminal;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::time::Instant;

use clap::Parser;
use miette::Severity;

use coverage_check::analyze::{analyze_file, bind_only, has_directive_text};
use coverage_check::attach::BindError;
use coverage_check::classify::{DirectiveVerdict, EntityVerdict, FileAnalysis, Status};
use coverage_check::corpus;
use coverage_check::diagnostics::{render, Finding, RenderFormat};
use coverage_check::grammar::Form;
use coverage_check::lines::LineTable;
use coverage_check::never::{build_registry, source_files};
use coverage_check::report::{load_report, partial_run_signal};

#[derive(Parser)]
#[command(
    name = "coverage-check",
    about = "Per-entity coverage directive checker"
)]
enum Cli {
    /// Check a package's coverage report against its coverage directives
    Check {
        /// Package directory containing coverage/coverage-final.json
        pkg_dir: PathBuf,
        /// Extra directories to scan for never-param function declarations
        /// (e.g. libs/basics for throwIllegalValue)
        #[arg(long = "never-scan")]
        never_scan: Vec<PathBuf>,
        /// Print elapsed time (budget: <1s warm on the largest package)
        #[arg(long)]
        timing: bool,
    },
    /// Print the analyzed golden corpus as JSON (for auditing/regenerating
    /// expected/)
    Dump {
        /// Corpus directory (fixtures/, expected/, coverage/)
        corpus_dir: PathBuf,
    },
}

fn main() -> ExitCode {
    match Cli::parse() {
        Cli::Check {
            pkg_dir,
            never_scan,
            timing,
        } => cmd_check(&pkg_dir, &never_scan, timing, resolve_format()),
        Cli::Dump { corpus_dir } => match corpus::dump(&corpus_dir) {
            Ok(json) => {
                println!("{json}");
                ExitCode::SUCCESS
            }
            Err(e) => {
                eprintln!("{e}");
                ExitCode::from(2)
            }
        },
    }
}

/// Graphical diagnostics on a TTY; one line per finding when piped/captured.
fn resolve_format() -> RenderFormat {
    if std::io::stdout().is_terminal() {
        RenderFormat::Graphical
    } else {
        RenderFormat::Compact
    }
}

#[derive(Default)]
struct Tally {
    fail: usize,
    directive_errors: usize,
    stale: usize,
    excluded: usize,
    deferred: usize,
    never_excluded: usize,
}

fn cmd_check(
    pkg_dir: &Path,
    never_scan: &[PathBuf],
    timing: bool,
    format: RenderFormat,
) -> ExitCode {
    let started = Instant::now();
    // Report paths are absolute; canonicalize so relative-path display works.
    let pkg_dir = &pkg_dir
        .canonicalize()
        .unwrap_or_else(|_| pkg_dir.to_path_buf());
    let report = match load_report(&pkg_dir.join("coverage/coverage-final.json")) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("{e}");
            return ExitCode::from(2);
        }
    };
    if let Some(signal) = partial_run_signal(&report) {
        eprintln!("refusing to check: {signal}");
        return ExitCode::from(2);
    }

    let mut scan_dirs: Vec<&Path> = vec![pkg_dir];
    scan_dirs.extend(never_scan.iter().map(PathBuf::as_path));
    let never_names = build_registry(&scan_dirs);

    let mut tally = Tally::default();

    let mut paths: Vec<&String> = report.keys().collect();
    paths.sort();
    for key in paths {
        let cov = &report[key];
        let path = Path::new(&cov.path);
        let Ok(source) = std::fs::read_to_string(path) else {
            eprintln!("cannot read {}", path.display());
            continue;
        };
        // Skip-most-files invariant: parse only where debt or directives live.
        if !cov.has_uncovered() && !has_directive_text(&source) {
            continue;
        }
        let analysis = analyze_file(path, &source, cov, &never_names);
        let rel = cov
            .path
            .strip_prefix(&format!("{}/", pkg_dir.display()))
            .unwrap_or(&cov.path);
        report_file(rel, &source, &analysis, &mut tally, format);
    }

    tally.directive_errors += report_unlisted_directive_files(pkg_dir, &report, format);

    println!(
        "\nsummary: {} uncovered without directives, {} directive errors, {} stale directives, \
         register: {} excluded / {} deferred / {} never-param",
        tally.fail,
        tally.directive_errors,
        tally.stale,
        tally.excluded,
        tally.deferred,
        tally.never_excluded
    );
    if timing {
        println!("timing: {:.0}ms", started.elapsed().as_secs_f64() * 1000.0);
    }
    if tally.fail > 0 || tally.directive_errors > 0 {
        ExitCode::FAILURE
    } else {
        ExitCode::SUCCESS
    }
}

fn emit(finding: &Finding, file: &str, source: &str, format: RenderFormat) {
    println!("{}", render(finding, file, source, format).trim_end());
    if format == RenderFormat::Graphical {
        println!();
    }
}

/// Render every finding in a file's analysis, updating the tally.
fn report_file(
    rel: &str,
    source: &str,
    analysis: &FileAnalysis,
    tally: &mut Tally,
    format: RenderFormat,
) {
    let table = LineTable::new(source);
    for d in &analysis.directives {
        if let Some(finding) = directive_finding(d, tally) {
            emit(&finding, rel, source, format);
        }
    }
    for e in &analysis.entities {
        if let Some(finding) = entity_finding(e, source, &table, tally) {
            emit(&finding, rel, source, format);
        }
    }
}

fn directive_span(d: &DirectiveVerdict) -> (usize, usize) {
    let (start, end) = d.comment_span;
    (start as usize, (end - start) as usize)
}

fn directive_finding(d: &DirectiveVerdict, tally: &mut Tally) -> Option<Finding> {
    let directive_name = format!("@coverage-{}{}", d.label.as_str(), d.form.suffix());
    if let Some(err) = d.error {
        tally.directive_errors += 1;
        let (name, message, label, help) = match err {
            BindError::Orphan => (
                "orphaned-directive",
                format!("{directive_name} directive has no code to bind to"),
                "nothing bindable before the end of this scope".to_string(),
                "delete it, or move it directly above the code it should mark",
            ),
            BindError::ElseMisuse => (
                "misplaced-else-directive",
                format!("{directive_name} directive targets an `if` with an explicit `else`"),
                "the next `if` has an explicit else arm".to_string(),
                "mark the else arm itself with a plain directive instead",
            ),
            BindError::NotTopOfFile => (
                "misplaced-file-directive",
                format!("{directive_name} directive must appear before the first statement"),
                "code precedes this directive".to_string(),
                "move it to the top of the file, or use a plain directive for a single node",
            ),
        };
        return Some(Finding {
            severity: Severity::Error,
            name,
            message,
            label,
            help: Some(help.to_string()),
            span: directive_span(d),
        });
    }
    if d.stale {
        tally.stale += 1;
        return Some(Finding {
            severity: Severity::Warning,
            name: "stale-directive",
            message: format!("everything this {directive_name} directive marks is covered"),
            label: "no longer needed".to_string(),
            help: Some("delete this directive".to_string()),
            span: directive_span(d),
        });
    }
    None
}

fn entity_finding(
    e: &EntityVerdict,
    source: &str,
    table: &LineTable,
    tally: &mut Tally,
) -> Option<Finding> {
    let at = e.attributed_at.or(e.at)?;
    match e.status {
        Status::Fail => {
            tally.fail += 1;
            let (name, message) = match e.kind {
                "function" => (
                    "uncovered-function",
                    "function is never called in tests".to_string(),
                ),
                "branch" => (
                    "uncovered-branch",
                    format!(
                        "branch arm ({}) is never taken in tests",
                        e.branch_type.as_deref().unwrap_or("branch")
                    ),
                ),
                _ => (
                    "uncovered-statement",
                    "statement is never executed in tests".to_string(),
                ),
            };
            Some(Finding {
                severity: Severity::Error,
                name,
                message,
                label: "not covered by any test".to_string(),
                help: Some(
                    "add a test that exercises this code, or mark it with a directive: \
                     // @coverage-defer: <reason> (should gain tests) or \
                     // @coverage-exclude: <reason> (deliberately untested)"
                        .to_string(),
                ),
                span: Finding::line_span(source, table, at),
            })
        }
        Status::Excluded => {
            tally.excluded += 1;
            None
        }
        Status::Deferred => {
            tally.deferred += 1;
            None
        }
        Status::NeverExcluded => {
            tally.never_excluded += 1;
            None
        }
        Status::Covered => {
            let note = e.note.as_ref()?;
            Some(Finding {
                severity: Severity::Warning,
                name: "exhaustiveness-defeated",
                message: format!("{note} was executed at runtime"),
                label: "exhaustiveness was defeated".to_string(),
                help: Some(
                    "a value escaped TypeScript's narrowing: a bug, or a test deliberately \
                     subverting types — investigate"
                        .to_string(),
                ),
                span: Finding::line_span(source, table, at),
            })
        }
    }
}

/// Directive-bearing source files that never made it into the report (e.g.
/// barrel files with no instrumentable entities) would otherwise hide their
/// directives entirely; surface each directive as an error.
fn report_unlisted_directive_files(
    pkg_dir: &Path,
    report: &coverage_check::report::Report,
    format: RenderFormat,
) -> usize {
    let reported: HashSet<PathBuf> = report
        .values()
        .filter_map(|fc| Path::new(&fc.path).canonicalize().ok())
        .collect();
    let mut errors = 0;
    for path in source_files(pkg_dir) {
        let Ok(canonical) = path.canonicalize() else {
            continue;
        };
        if reported.contains(&canonical) {
            continue;
        }
        let Ok(source) = std::fs::read_to_string(&path) else {
            continue;
        };
        if !has_directive_text(&source) {
            continue;
        }
        let rel = path
            .strip_prefix(pkg_dir)
            .unwrap_or(&path)
            .display()
            .to_string();
        for d in bind_only(&path, &source) {
            errors += 1;
            let directive_name = format!(
                "@coverage-{}{}",
                d.parsed.label.as_str(),
                d.parsed.form.suffix()
            );
            let help = if d.parsed.form == Form::File {
                "this file has no instrumentable code; use coverage.exclude in the vitest \
                 config instead"
            } else {
                "this file has no instrumentable code; delete the directive"
            };
            let finding = Finding {
                severity: Severity::Error,
                name: "useless-file-directive",
                message: format!("{directive_name} directive in a file with no coverage entities"),
                label: "this file is not in the coverage report".to_string(),
                help: Some(help.to_string()),
                span: (
                    d.comment_span.start as usize,
                    d.comment_span.size() as usize,
                ),
            };
            emit(&finding, &rel, &source, format);
        }
    }
    errors
}
