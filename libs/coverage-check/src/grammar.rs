//! The directive grammar, applied to comment text. Deliberately strict:
//! anything that is not exactly `@coverage-(exclude|defer)[-file|-else][: reason]`
//! is not a directive (the lint rule catches near-misses; the checker must not
//! guess). The `@` prefix is required — prose comments that merely mention
//! coverage-exclude are never directives.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Label {
    Exclude,
    Defer,
}

impl Label {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Label::Exclude => "exclude",
            Label::Defer => "defer",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Form {
    Default,
    File,
    Else,
}

impl Form {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Form::Default => "default",
            Form::File => "file",
            Form::Else => "else",
        }
    }

    /// The directive-name suffix for this form (e.g. `-file`), as written in
    /// source.
    #[must_use]
    pub fn suffix(self) -> &'static str {
        match self {
            Form::Default => "",
            Form::File => "-file",
            Form::Else => "-else",
        }
    }
}

#[derive(Debug, Clone)]
pub struct ParsedDirective {
    pub label: Label,
    pub form: Form,
    pub reason: Option<String>,
}

#[must_use]
pub fn parse_comment_text(text: &str) -> Option<ParsedDirective> {
    let trimmed = text.trim();
    let (label, rest) = if let Some(rest) = trimmed.strip_prefix("@coverage-exclude") {
        (Label::Exclude, rest)
    } else if let Some(rest) = trimmed.strip_prefix("@coverage-defer") {
        (Label::Defer, rest)
    } else {
        return None;
    };
    let (form, rest) = if let Some(rest) = rest.strip_prefix("-file") {
        (Form::File, rest)
    } else if let Some(rest) = rest.strip_prefix("-else") {
        (Form::Else, rest)
    } else {
        (Form::Default, rest)
    };
    if rest.is_empty() {
        return Some(ParsedDirective {
            label,
            form,
            reason: None,
        });
    }
    if let Some(reason) = rest.strip_prefix(':') {
        let reason = reason.trim();
        return Some(ParsedDirective {
            label,
            form,
            reason: if reason.is_empty() {
                None
            } else {
                Some(reason.to_string())
            },
        });
    }
    // e.g. "coverage-excluded" or "coverage-exclude soon" — not a directive.
    None
}
