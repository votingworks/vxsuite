//! Rendering of checker findings as diagnostics (spec section 3):
//! oxlint/miette-style graphical output on a TTY — severity glyph +
//! `coverage(<name>)` code hyperlinked to docs, a `╭─[file:line:col]` snippet
//! box with an underline label, and a `help:` line — with a one-line-per-item
//! fallback for non-TTY output.

use std::fmt;

use miette::{Diagnostic, GraphicalReportHandler, LabeledSpan, NamedSource, Severity, SourceCode};

use crate::lines::LineTable;

/// Base URL for `coverage(<name>)` hyperlinks; each diagnostic name is a
/// heading anchor in the README.
pub const DOCS_URL: &str =
    "https://github.com/votingworks/vxsuite/blob/main/libs/coverage-check/README.md";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RenderFormat {
    Graphical,
    Compact,
}

/// One checker finding, positioned in a source file.
#[derive(Debug)]
pub struct Finding {
    pub severity: Severity,
    /// Diagnostic name, e.g. `uncovered-statement`.
    pub name: &'static str,
    /// Headline message.
    pub message: String,
    /// Label for the underlined span.
    pub label: String,
    pub help: Option<String>,
    /// Byte range to underline.
    pub span: (usize, usize),
}

impl Finding {
    /// Span covering the rest of the line from a (line, col) position —
    /// entity end positions are unreliable in remapped reports, so findings
    /// underline from the entity start to end of line.
    #[must_use]
    pub fn line_span(source: &str, table: &LineTable, at: (u32, u32)) -> (usize, usize) {
        let Some(start) = table.offset_of(source, at) else {
            return (0, 0);
        };
        let len = source[start..].find('\n').unwrap_or(source.len() - start);
        (start, len.max(1).min(source.len() - start))
    }
}

struct FindingDiag<'a> {
    finding: &'a Finding,
    // NamedSource requires a 'static source type, so each render owns a copy
    // of the file text (findings render one at a time; the copy is transient).
    src: NamedSource<String>,
}

impl fmt::Display for FindingDiag<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.finding.message)
    }
}

impl fmt::Debug for FindingDiag<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.finding.fmt(f)
    }
}

impl std::error::Error for FindingDiag<'_> {}

impl Diagnostic for FindingDiag<'_> {
    fn code(&self) -> Option<Box<dyn fmt::Display + '_>> {
        Some(Box::new(format!("coverage({})", self.finding.name)))
    }

    fn severity(&self) -> Option<Severity> {
        Some(self.finding.severity)
    }

    fn help(&self) -> Option<Box<dyn fmt::Display + '_>> {
        self.finding
            .help
            .as_ref()
            .map(|h| Box::new(h) as Box<dyn fmt::Display>)
    }

    fn url(&self) -> Option<Box<dyn fmt::Display + '_>> {
        Some(Box::new(format!("{DOCS_URL}#{}", self.finding.name)))
    }

    fn source_code(&self) -> Option<&dyn SourceCode> {
        Some(&self.src)
    }

    fn labels(&self) -> Option<Box<dyn Iterator<Item = LabeledSpan> + '_>> {
        Some(Box::new(std::iter::once(LabeledSpan::new_with_span(
            Some(self.finding.label.clone()),
            self.finding.span,
        ))))
    }
}

/// Render one finding located in `file` (display path) with `source` text.
#[must_use]
pub fn render(finding: &Finding, file: &str, source: &str, format: RenderFormat) -> String {
    match format {
        RenderFormat::Graphical => graphical(finding, file, source, &GraphicalReportHandler::new()),
        RenderFormat::Compact => compact(finding, file, source),
    }
}

fn severity_word(severity: Severity) -> &'static str {
    match severity {
        Severity::Error => "error",
        Severity::Warning => "warning",
        Severity::Advice => "advice",
    }
}

fn line_col(source: &str, offset: usize) -> (u32, u32) {
    LineTable::new(source).pos_of(source, offset.min(source.len()))
}

fn graphical(
    finding: &Finding,
    file: &str,
    source: &str,
    handler: &GraphicalReportHandler,
) -> String {
    let diag = FindingDiag {
        finding,
        src: NamedSource::new(file, source.to_string()),
    };
    let mut out = String::new();
    handler
        .render_report(&mut out, &diag)
        .expect("write to String cannot fail");
    out
}

fn compact(finding: &Finding, file: &str, source: &str) -> String {
    let (line, col) = line_col(source, finding.span.0);
    format!(
        "{} coverage({}): {file}:{line}:{col} {}",
        severity_word(finding.severity),
        finding.name,
        finding.message
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use miette::GraphicalTheme;

    const SOURCE: &str = "const a = 1;\nfoo();\nconst b = 2;\n";

    fn finding() -> Finding {
        Finding {
            severity: Severity::Error,
            name: "uncovered-statement",
            message: "statement is never executed".to_string(),
            label: "not covered by any test".to_string(),
            help: Some("add a test".to_string()),
            span: (13, 6),
        }
    }

    #[test]
    fn compact_format_is_one_line_with_position() {
        assert_eq!(
            render(&finding(), "src/x.ts", SOURCE, RenderFormat::Compact),
            "error coverage(uncovered-statement): src/x.ts:2:0 statement is never executed"
        );
    }

    #[test]
    fn graphical_format_has_code_snippet_box_and_help() {
        let out = graphical(
            &finding(),
            "src/x.ts",
            SOURCE,
            &GraphicalReportHandler::new_themed(GraphicalTheme::unicode_nocolor()),
        );
        assert!(out.contains("coverage(uncovered-statement)"), "{out}");
        assert!(out.contains("src/x.ts:2:1"), "{out}");
        assert!(out.contains("foo();"), "{out}");
        assert!(out.contains("not covered by any test"), "{out}");
        assert!(out.contains("help: add a test"), "{out}");
    }
}
