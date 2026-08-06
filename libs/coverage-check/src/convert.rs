//! Hint-conversion codemod (spec §7.2): rewrites `istanbul ignore` hints as
//! `@coverage-exclude` directives, in place. Reasons are preserved verbatim;
//! reasonless hints convert bare (never fabricate a reason). Hints the codemod
//! cannot decide (file hints, unclosed ranges, explicit-else) are flagged for
//! human review and left untouched.

use std::collections::HashSet;

use oxc_span::Span;

use crate::attach::{bind_form, BindError, Binding, ParsedFile};
use crate::grammar::Form;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HintKind {
    Next,
    Else,
    If,
    File,
    Start,
    Stop,
}

impl HintKind {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            HintKind::Next => "next",
            HintKind::Else => "else",
            HintKind::If => "if",
            HintKind::File => "file",
            HintKind::Start => "start",
            HintKind::Stop => "stop",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Hint {
    pub kind: HintKind,
    pub reason: Option<String>,
    pub comment_span: Span,
}

/// Parse a comment's text (delimiters stripped) as an istanbul hint. Trailing
/// text after the keyword becomes the reason, with leading separator
/// punctuation (`-`, `:`, `--`) stripped.
#[must_use]
pub fn parse_hint_text(text: &str) -> Option<(HintKind, Option<String>)> {
    let rest = text.trim().strip_prefix("istanbul")?.trim_start();
    let rest = rest.strip_prefix("ignore")?;
    // Require whitespace between "ignore" and the keyword.
    let rest_trimmed = rest.trim_start();
    if rest_trimmed.len() == rest.len() {
        return None;
    }
    let (kind, rest) = [
        ("next", HintKind::Next),
        ("else", HintKind::Else),
        ("if", HintKind::If),
        ("file", HintKind::File),
        ("start", HintKind::Start),
        ("stop", HintKind::Stop),
    ]
    .iter()
    .find_map(|(kw, kind)| rest_trimmed.strip_prefix(kw).map(|r| (*kind, r)))?;
    // The keyword must end at a word boundary ("ignore nextfoo" is not a hint).
    if rest.chars().next().is_some_and(char::is_alphanumeric) {
        return None;
    }
    let reason = rest
        .trim()
        .trim_start_matches(['-', ':', '\u{2013}', '\u{2014}'])
        .trim();
    let reason = if reason.is_empty() {
        None
    } else {
        Some(reason.to_string())
    };
    Some((kind, reason))
}

#[must_use]
pub fn find_hints(file: &ParsedFile) -> Vec<Hint> {
    let mut hints: Vec<Hint> = file
        .comments
        .iter()
        .filter_map(|(span, text)| {
            parse_hint_text(text).map(|(kind, reason)| Hint {
                kind,
                reason,
                comment_span: *span,
            })
        })
        .collect();
    hints.sort_by_key(|h| h.comment_span.start);
    hints
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Severity {
    /// Applied (or planned) automatically.
    Info,
    /// Left untouched; a human must decide.
    Flag,
    /// Broken input (unclosed range, dangling stop) — must be fixed by hand.
    Error,
}

#[derive(Debug, Clone)]
pub struct Note {
    pub offset: u32,
    pub severity: Severity,
    pub message: String,
}

#[derive(Debug, Clone)]
struct Edit {
    span: Span,
    replacement: String,
}

pub struct FileConversion {
    pub output: String,
    pub changed: bool,
    pub notes: Vec<Note>,
}

/// Plan and apply the conversion for one file. `never_names` holds the
/// (imported) names of never-param functions, matching the checker's
/// auto-exclusion.
#[allow(clippy::implicit_hasher)]
#[must_use]
pub fn convert_file(
    source: &str,
    file: &ParsedFile,
    never_names: &HashSet<String>,
) -> FileConversion {
    let hints = find_hints(file);
    let mut planner = Planner {
        source,
        file,
        source_len: u32::try_from(source.len()).unwrap_or(u32::MAX),
        excused_stmt_spans: excused_call_spans(file, never_names),
        accepted_ranges: Vec::new(),
        edits: Vec::new(),
        notes: Vec::new(),
    };

    let mut range_open = false;
    for (i, hint) in hints.iter().enumerate() {
        match hint.kind {
            HintKind::File => planner.note(
                hint,
                Severity::Flag,
                "ignore-file hint: needs the config-exclude / -file directive / \
                 dissolve-into-entity-directives sort",
            ),
            HintKind::Next => planner.plan_next(hint),
            HintKind::Else => planner.plan_else(hint),
            HintKind::If => {
                planner.rewrite(hint, "");
                planner.note(
                    hint,
                    Severity::Flag,
                    "converted ignore-if to @coverage-exclude on the whole if statement \
                     (marks both arms — review the overshoot)",
                );
            }
            HintKind::Start => planner.plan_start(hint, &hints[i + 1..]),
            HintKind::Stop => {
                if !range_open {
                    planner.note(
                        hint,
                        Severity::Error,
                        "ignore-stop with no open ignore-start — fix by hand",
                    );
                }
            }
        }
        match hint.kind {
            HintKind::Start => range_open = true,
            HintKind::Stop => range_open = false,
            _ => {}
        }
    }

    let output = apply_edits(source, planner.edits);
    let changed = output != source;
    FileConversion {
        output,
        changed,
        notes: planner.notes,
    }
}

struct Planner<'a> {
    source: &'a str,
    file: &'a ParsedFile,
    source_len: u32,
    excused_stmt_spans: Vec<Span>,
    /// Ranges already bound by an accepted directive, for the merge pass.
    accepted_ranges: Vec<Span>,
    edits: Vec<Edit>,
    notes: Vec<Note>,
}

impl Planner<'_> {
    fn note(&mut self, hint: &Hint, severity: Severity, message: impl Into<String>) {
        self.notes.push(Note {
            offset: hint.comment_span.start,
            severity,
            message: message.into(),
        });
    }

    fn rewrite(&mut self, hint: &Hint, suffix: &str) {
        self.edits.push(rewrite_comment(self.source, hint, suffix));
    }

    fn delete(&mut self, span: Span) {
        self.edits.push(delete_comment(self.source, span));
    }

    fn plan_next(&mut self, hint: &Hint) {
        let bound = bind_form(Form::Default, hint.comment_span, self.file, self.source_len);
        let Ok(Binding::Range(range)) = bound else {
            // Unbindable next-hint: convert anyway; the checker reports the
            // orphan at this exact location.
            self.rewrite(hint, "");
            self.note(
                hint,
                Severity::Flag,
                "converted, but nothing bindable follows — checker will report an \
                 orphaned directive here",
            );
            return;
        };
        if self.excused_stmt_spans.contains(&range) {
            self.delete(hint.comment_span);
            self.note(
                hint,
                Severity::Info,
                "deleted: never-param call site is auto-excluded",
            );
        } else if self
            .accepted_ranges
            .iter()
            .any(|r| r.start <= range.start && range.start < r.end)
        {
            self.delete(hint.comment_span);
            self.note(
                hint,
                Severity::Info,
                "deleted: merged into the previous directive's range",
            );
        } else {
            self.rewrite(hint, "");
            self.accepted_ranges.push(range);
            self.note(hint, Severity::Info, "converted to @coverage-exclude");
        }
    }

    fn plan_else(&mut self, hint: &Hint) {
        match bind_form(Form::Else, hint.comment_span, self.file, self.source_len) {
            Err(BindError::ElseMisuse) => self.note(
                hint,
                Severity::Flag,
                "ignore-else on an if with an explicit else — place a directive on the \
                 else arm by hand",
            ),
            Err(_) => self.note(
                hint,
                Severity::Flag,
                "ignore-else with no following if statement",
            ),
            Ok(Binding::ElseArm(if_span)) => {
                let then_terminates = self
                    .file
                    .collected
                    .ifs
                    .iter()
                    .find(|f| f.span == if_span)
                    .is_some_and(|f| f.then_terminates);
                if then_terminates {
                    self.delete(hint.comment_span);
                    self.note(
                        hint,
                        Severity::Info,
                        "deleted: then-arm terminates, so the implicit-else arm is \
                         attributed to the fall-through statement (mark that statement \
                         if the checker flags it)",
                    );
                } else {
                    self.rewrite(hint, "-else");
                    self.note(hint, Severity::Info, "converted to @coverage-exclude-else");
                }
            }
            Ok(_) => self.note(
                hint,
                Severity::Flag,
                "ignore-else did not bind an implicit-else arm",
            ),
        }
    }

    fn plan_start(&mut self, hint: &Hint, rest: &[Hint]) {
        let stop = rest
            .iter()
            .take_while(|h| h.kind != HintKind::Start)
            .find(|h| h.kind == HintKind::Stop);
        let Some(stop) = stop else {
            self.note(
                hint,
                Severity::Error,
                "unclosed ignore-start range (everything to end of file is currently \
                 exempt) — fix by hand",
            );
            return;
        };
        let wrapped = outermost_nodes_between(
            &self.file.collected.spans,
            hint.comment_span.end,
            stop.comment_span.start,
        );
        if wrapped.len() == 1 {
            self.rewrite(hint, "");
            self.delete(stop.comment_span);
            self.note(
                hint,
                Severity::Info,
                "range wraps one node: converted to a single @coverage-exclude",
            );
        } else {
            self.note(
                hint,
                Severity::Flag,
                format!(
                    "ignore-start range wraps {} nodes — split by hand",
                    wrapped.len()
                ),
            );
        }
    }
}

/// Spans of expression statements that are never-param call sites (matching
/// the checker's auto-exclusion, resolved by import binding or local decl).
fn excused_call_spans(file: &ParsedFile, never_names: &HashSet<String>) -> Vec<Span> {
    let excused_name = |callee: &str| -> bool {
        if let Some(import) = file.collected.imports.iter().find(|i| i.local == callee) {
            return never_names.contains(&import.imported);
        }
        if let Some(decl) = file.collected.fn_decls.iter().find(|d| d.name == callee) {
            return decl.has_required_never_param;
        }
        false
    };
    file.collected
        .calls
        .iter()
        .filter(|c| excused_name(&c.callee))
        .filter_map(|c| c.stmt_span)
        .collect()
}

/// Distinct outermost node spans lying entirely within `(start, end)`.
fn outermost_nodes_between(spans: &[Span], start: u32, end: u32) -> Vec<Span> {
    let mut inside: Vec<Span> = spans
        .iter()
        .filter(|s| s.start >= start && s.end <= end)
        .copied()
        .collect();
    inside.sort_by_key(|s| (s.start, std::cmp::Reverse(s.end)));
    inside.dedup();
    let outer: Vec<Span> = inside
        .iter()
        .filter(|s| {
            !inside
                .iter()
                .any(|t| t != *s && t.start <= s.start && s.end <= t.end)
        })
        .copied()
        .collect();
    outer
}

/// Is this comment alone on its line (only whitespace on both sides)?
fn own_line(source: &str, span: Span) -> (bool, bool) {
    let before = &source[..span.start as usize];
    let after = &source[span.end as usize..];
    let before_blank = before
        .rfind('\n')
        .map_or(before, |i| &before[i + 1..])
        .trim()
        .is_empty();
    let after_blank = after
        .find('\n')
        .map_or(after, |i| &after[..i])
        .trim()
        .is_empty();
    (before_blank, after_blank)
}

/// Rewrite a hint comment as a directive comment, preserving inline vs
/// own-line placement. `suffix` is the directive-form suffix (e.g. `-else`).
fn rewrite_comment(source: &str, hint: &Hint, suffix: &str) -> Edit {
    let (_, after_blank) = own_line(source, hint.comment_span);
    let name = format!("@coverage-exclude{suffix}");
    let body = match &hint.reason {
        Some(reason) => format!("{name}: {reason}"),
        None => name,
    };
    let replacement = if after_blank {
        format!("// {body}")
    } else {
        format!("/* {body} */")
    };
    Edit {
        span: hint.comment_span,
        replacement,
    }
}

/// Delete a comment. Own-line comments take their whole line (including the
/// newline); inline comments collapse a doubled space.
fn delete_comment(source: &str, span: Span) -> Edit {
    let (before_blank, after_blank) = own_line(source, span);
    if before_blank && after_blank {
        let line_start = source[..span.start as usize]
            .rfind('\n')
            .map_or(0, |i| i + 1);
        let line_end = source[span.end as usize..]
            .find('\n')
            .map_or(source.len(), |i| span.end as usize + i + 1);
        return Edit {
            span: Span::new(
                u32::try_from(line_start).unwrap_or(span.start),
                u32::try_from(line_end).unwrap_or(span.end),
            ),
            replacement: String::new(),
        };
    }
    let mut end = span.end as usize;
    let before_is_space = source[..span.start as usize].ends_with(' ');
    if before_is_space && source[end..].starts_with(' ') {
        end += 1;
    }
    Edit {
        span: Span::new(span.start, u32::try_from(end).unwrap_or(span.end)),
        replacement: String::new(),
    }
}

fn apply_edits(source: &str, mut edits: Vec<Edit>) -> String {
    edits.sort_by_key(|e| std::cmp::Reverse(e.span.start));
    let mut out = source.to_string();
    for edit in edits {
        out.replace_range(
            edit.span.start as usize..edit.span.end as usize,
            &edit.replacement,
        );
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn convert_src(src: &str, never: &[&str]) -> FileConversion {
        let allocator = oxc_allocator::Allocator::default();
        let parsed = crate::attach::parse_file(&allocator, std::path::Path::new("test.ts"), src);
        let never_names: HashSet<String> = never.iter().map(ToString::to_string).collect();
        convert_file(src, &parsed, &never_names)
    }

    fn severities(c: &FileConversion) -> Vec<Severity> {
        c.notes.iter().map(|n| n.severity).collect()
    }

    #[test]
    fn parses_hint_text() {
        assert!(matches!(
            parse_hint_text(" istanbul ignore next "),
            Some((HintKind::Next, None))
        ));
        let (kind, reason) = parse_hint_text("istanbul ignore next - some reason").unwrap();
        assert_eq!(kind, HintKind::Next);
        assert_eq!(reason.as_deref(), Some("some reason"));
        let (kind, reason) = parse_hint_text("istanbul ignore file").unwrap();
        assert_eq!(kind, HintKind::File);
        assert_eq!(reason, None);
        assert!(parse_hint_text("istanbul ignore nextfoo").is_none());
        assert!(parse_hint_text("istanbul ignorenext").is_none());
        assert!(parse_hint_text("not a hint").is_none());
    }

    #[test]
    fn converts_own_line_hint_with_reason() {
        let src =
            "function f(): number {\n  /* istanbul ignore next - can't happen */\n  return 1;\n}\n";
        let c = convert_src(src, &[]);
        assert_eq!(
            c.output,
            "function f(): number {\n  // @coverage-exclude: can't happen\n  return 1;\n}\n"
        );
        assert_eq!(severities(&c), vec![Severity::Info]);
    }

    #[test]
    fn converts_own_line_bare_hint_bare() {
        let src = "function f(): number {\n  /* istanbul ignore next */\n  return 1;\n}\n";
        let c = convert_src(src, &[]);
        assert_eq!(
            c.output,
            "function f(): number {\n  // @coverage-exclude\n  return 1;\n}\n"
        );
    }

    #[test]
    fn converts_inline_hint_in_place() {
        let src =
            "const x = {\n  getAuthStatus: /* istanbul ignore next */ () => auth.get(),\n};\n";
        let c = convert_src(src, &[]);
        assert_eq!(
            c.output,
            "const x = {\n  getAuthStatus: /* @coverage-exclude */ () => auth.get(),\n};\n"
        );
    }

    #[test]
    fn converts_ternary_arm_inline() {
        let src = "const r = ok\n  ? value\n  : /* istanbul ignore next */ 'unknown';\n";
        let c = convert_src(src, &[]);
        assert_eq!(
            c.output,
            "const r = ok\n  ? value\n  : /* @coverage-exclude */ 'unknown';\n"
        );
    }

    #[test]
    fn merges_hint_covered_by_previous_directive_range() {
        let src = "const iterators = items.map(\n  (it) =>\n    /* istanbul ignore next */\n    (it as A)[Symbol.asyncIterator]?.() ??\n    /* istanbul ignore next */\n    (it as B)[Symbol.iterator]?.()\n);\n";
        let c = convert_src(src, &[]);
        assert_eq!(
            c.output,
            "const iterators = items.map(\n  (it) =>\n    // @coverage-exclude\n    (it as A)[Symbol.asyncIterator]?.() ??\n    (it as B)[Symbol.iterator]?.()\n);\n"
        );
        assert!(c.notes[1].message.contains("merged"));
    }

    #[test]
    fn converts_independent_hints_separately() {
        let src = "function f(): number {\n  /* istanbul ignore next */\n  const a = maybe() ?? 1;\n  /* istanbul ignore next */\n  return a ?? 2;\n}\n";
        let c = convert_src(src, &[]);
        assert_eq!(
            c.output,
            "function f(): number {\n  // @coverage-exclude\n  const a = maybe() ?? 1;\n  // @coverage-exclude\n  return a ?? 2;\n}\n"
        );
        assert_eq!(severities(&c), vec![Severity::Info, Severity::Info]);
    }

    #[test]
    fn deletes_hint_on_imported_never_param_call() {
        let src = "import { throwIllegalValue } from '@votingworks/basics';\nfunction f(x: never): void {\n  switch (x) {\n    default: {\n      /* istanbul ignore next */\n      throwIllegalValue(x);\n    }\n  }\n}\n";
        let c = convert_src(src, &["throwIllegalValue"]);
        assert_eq!(
            c.output,
            "import { throwIllegalValue } from '@votingworks/basics';\nfunction f(x: never): void {\n  switch (x) {\n    default: {\n      throwIllegalValue(x);\n    }\n  }\n}\n"
        );
        assert!(c.notes[0].message.contains("never-param"));
    }

    #[test]
    fn keeps_hint_on_same_named_local_that_is_not_never() {
        let src = "function throwIllegalValue(x: string): void {\n  throw new Error(x);\n}\nfunction f(): void {\n  /* istanbul ignore next */\n  throwIllegalValue('a');\n}\n";
        let c = convert_src(src, &["throwIllegalValue"]);
        assert!(c
            .output
            .contains("// @coverage-exclude\n  throwIllegalValue('a');"));
    }

    #[test]
    fn converts_single_node_range_to_one_directive() {
        let src = "const api = {\n  /* istanbul ignore start */\n  async method(): Promise<number> {\n    return 1;\n  },\n  /* istanbul ignore stop */\n  other: 2,\n};\n";
        let c = convert_src(src, &[]);
        assert_eq!(
            c.output,
            "const api = {\n  // @coverage-exclude\n  async method(): Promise<number> {\n    return 1;\n  },\n  other: 2,\n};\n"
        );
        assert_eq!(severities(&c), vec![Severity::Info]);
    }

    #[test]
    fn flags_unclosed_start_as_error() {
        let src = "/* istanbul ignore start */\nconst a = 1;\nconst b = 2;\n";
        let c = convert_src(src, &[]);
        assert_eq!(c.output, src);
        assert_eq!(severities(&c), vec![Severity::Error]);
    }

    #[test]
    fn flags_dangling_stop_as_error() {
        let src = "const a = 1;\n/* istanbul ignore stop */\nconst b = 2;\n";
        let c = convert_src(src, &[]);
        assert_eq!(c.output, src);
        assert_eq!(severities(&c), vec![Severity::Error]);
    }

    #[test]
    fn flags_multi_node_range() {
        let src =
            "/* istanbul ignore start */\nconst a = 1;\nconst b = 2;\n/* istanbul ignore stop */\n";
        let c = convert_src(src, &[]);
        assert_eq!(c.output, src);
        assert_eq!(severities(&c), vec![Severity::Flag]);
        assert!(c.notes[0].message.contains("2 nodes"));
    }

    #[test]
    fn deletes_else_hint_when_then_terminates() {
        let src = "function f(x: boolean): number {\n  /* istanbul ignore else */\n  if (x) {\n    return 1;\n  }\n  return 2;\n}\n";
        let c = convert_src(src, &[]);
        assert_eq!(
            c.output,
            "function f(x: boolean): number {\n  if (x) {\n    return 1;\n  }\n  return 2;\n}\n"
        );
        assert!(c.notes[0].message.contains("fall-through"));
    }

    #[test]
    fn converts_else_hint_when_then_does_not_terminate() {
        let src = "function f(x: boolean): void {\n  /* istanbul ignore else */\n  if (x) {\n    doThing();\n  }\n  more();\n}\n";
        let c = convert_src(src, &[]);
        assert_eq!(
            c.output,
            "function f(x: boolean): void {\n  // @coverage-exclude-else\n  if (x) {\n    doThing();\n  }\n  more();\n}\n"
        );
    }

    #[test]
    fn flags_else_hint_on_explicit_else() {
        let src = "function f(x: boolean): void {\n  /* istanbul ignore else */\n  if (x) {\n    a();\n  } else {\n    b();\n  }\n}\n";
        let c = convert_src(src, &[]);
        assert_eq!(c.output, src);
        assert_eq!(severities(&c), vec![Severity::Flag]);
    }

    #[test]
    fn converts_if_hint_with_overshoot_flag() {
        let src = "function f(x: boolean): void {\n  /* istanbul ignore if */\n  if (x) {\n    a();\n  }\n}\n";
        let c = convert_src(src, &[]);
        assert_eq!(
            c.output,
            "function f(x: boolean): void {\n  // @coverage-exclude\n  if (x) {\n    a();\n  }\n}\n"
        );
        assert_eq!(severities(&c), vec![Severity::Flag]);
    }

    #[test]
    fn flags_file_hint_untouched() {
        let src = "/* istanbul ignore file */\nexport const a = 1;\n";
        let c = convert_src(src, &[]);
        assert_eq!(c.output, src);
        assert_eq!(severities(&c), vec![Severity::Flag]);
    }

    #[test]
    fn ignores_hint_text_in_string_literals() {
        let src = "const s = 'istanbul ignore next';\n";
        let c = convert_src(src, &[]);
        assert_eq!(c.output, src);
        assert!(c.notes.is_empty());
        assert!(!c.changed);
    }

    #[test]
    fn preserves_line_comment_hints() {
        let src = "function f(): number {\n  // istanbul ignore next: legacy\n  return 1;\n}\n";
        let c = convert_src(src, &[]);
        assert_eq!(
            c.output,
            "function f(): number {\n  // @coverage-exclude: legacy\n  return 1;\n}\n"
        );
    }
}
