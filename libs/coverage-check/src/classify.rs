//! Joins coverage entities against bound directives and never-param
//! exclusions. Matching is by entity start (line, col) containment in
//! directive target ranges; function entities match by body `loc.start`
//! (remapped arrow decl positions are imprecise — corpus finding); empty
//! implicit-else arms are attributed per the terminating-then rule.

use std::collections::HashSet;

use oxc_span::Span;

use crate::attach::{BindError, Binding, BoundDirective, ParsedFile};
use crate::grammar::{Form, Label};
use crate::lines::{LinePos, LineTable};
use crate::report::FileCov;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Covered,
    Fail,
    Excluded,
    Deferred,
    NeverExcluded,
}

impl Status {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Status::Covered => "covered",
            Status::Fail => "fail",
            Status::Excluded => "excluded",
            Status::Deferred => "deferred",
            Status::NeverExcluded => "never",
        }
    }
}

#[derive(Debug, Clone)]
pub struct EntityVerdict {
    pub id: String,
    pub kind: &'static str,
    pub branch_type: Option<String>,
    pub at: Option<LinePos>,
    pub attributed_at: Option<LinePos>,
    pub hits: i64,
    pub status: Status,
    pub note: Option<String>,
}

#[derive(Debug, Clone)]
pub struct DirectiveVerdict {
    pub line: u32,
    /// Byte range of the directive comment itself.
    pub comment_span: (u32, u32),
    pub label: Label,
    pub form: Form,
    pub reason: Option<String>,
    pub binds_range: Option<(u32, u32)>,
    pub error: Option<BindError>,
    pub stale: bool,
}

pub struct FileAnalysis {
    pub directives: Vec<DirectiveVerdict>,
    pub entities: Vec<EntityVerdict>,
}

struct DirectiveTarget {
    idx: usize,
    label: Label,
    /// Target range in (line, col) space, when Range or `WholeFile`.
    range: Option<(LinePos, LinePos)>,
    /// The if statement start pos, when `ElseArm`.
    else_arm_of: Option<LinePos>,
}

struct Excused {
    stmt_starts: Vec<LinePos>,
    arm_starts: Vec<LinePos>,
    notes: Vec<(LinePos, String)>,
}

/// One coverage entity, before joining: identity, position, and hit count.
struct Entity {
    id: String,
    kind: &'static str,
    branch_type: Option<String>,
    at: Option<LinePos>,
    attributed_at: Option<LinePos>,
    else_arm_of: Option<LinePos>,
    hits: i64,
}

#[must_use]
#[allow(clippy::implicit_hasher)]
pub fn classify(
    source: &str,
    file: &ParsedFile,
    directives: &[BoundDirective],
    cov: &FileCov,
    never_names: &HashSet<String>,
) -> FileAnalysis {
    let table = LineTable::new(source);
    let pos = |offset: u32| table.pos_of(source, offset as usize);

    let excused = resolve_never_exclusions(file, never_names, pos);
    let targets = directive_targets(directives, pos);

    let match_directive = |p: LinePos, else_arm_of: Option<LinePos>| -> Option<&DirectiveTarget> {
        targets.iter().find(|t| {
            if let Some((start, end)) = t.range {
                p >= start && p < end
            } else if let (Some(if_pos), Some(arm_if)) = (t.else_arm_of, else_arm_of) {
                if_pos == arm_if
            } else {
                false
            }
        })
    };

    let mut entities: Vec<EntityVerdict> = Vec::new();
    let mut directive_has_uncovered: HashSet<usize> = HashSet::new();

    for entity in collect_entities(file, cov, pos) {
        let match_pos = entity.attributed_at.or(entity.at);
        let covered = entity.hits > 0;
        let directive = match_pos.and_then(|p| match_directive(p, entity.else_arm_of));
        let never = match_pos
            .is_some_and(|p| excused.stmt_starts.contains(&p) || excused.arm_starts.contains(&p));
        let mut note = None;
        let status = if covered {
            if never {
                note = Some("never-param call site executed".to_string());
            }
            Status::Covered
        } else if never {
            if let Some(p) = match_pos {
                if let Some((_, n)) = excused.notes.iter().find(|(np, _)| *np == p) {
                    note = Some(n.clone());
                }
            }
            Status::NeverExcluded
        } else if let Some(t) = directive {
            directive_has_uncovered.insert(t.idx);
            match t.label {
                Label::Exclude => Status::Excluded,
                Label::Defer => Status::Deferred,
            }
        } else {
            Status::Fail
        };
        entities.push(EntityVerdict {
            id: entity.id,
            kind: entity.kind,
            branch_type: entity.branch_type,
            at: entity.at,
            attributed_at: entity.attributed_at,
            hits: entity.hits,
            status,
            note,
        });
    }

    let directive_verdicts: Vec<DirectiveVerdict> = directives
        .iter()
        .enumerate()
        .map(|(idx, d)| {
            let line = table.pos_of(source, d.comment_span.start as usize).0;
            let (binds_range, error) = match &d.binding {
                Ok(Binding::Range(span) | Binding::ElseArm(span)) => {
                    (Some((span.start, span.end)), None)
                }
                Ok(Binding::WholeFile) => (None, None),
                Err(e) => (None, Some(*e)),
            };
            DirectiveVerdict {
                line,
                comment_span: (d.comment_span.start, d.comment_span.end),
                label: d.parsed.label,
                form: d.parsed.form,
                reason: d.parsed.reason.clone(),
                binds_range,
                error,
                stale: error.is_none() && !directive_has_uncovered.contains(&idx),
            }
        })
        .collect();

    FileAnalysis {
        directives: directive_verdicts,
        entities,
    }
}

/// Resolve which call sites are excused by the never-param rule (import
/// binding or local decl).
fn resolve_never_exclusions(
    file: &ParsedFile,
    never_names: &HashSet<String>,
    pos: impl Fn(u32) -> LinePos,
) -> Excused {
    let excused_name = |callee: &str| -> bool {
        if let Some(import) = file.collected.imports.iter().find(|i| i.local == callee) {
            return never_names.contains(&import.imported);
        }
        if let Some(decl) = file.collected.fn_decls.iter().find(|d| d.name == callee) {
            return decl.has_required_never_param;
        }
        false
    };
    let mut excused = Excused {
        stmt_starts: Vec::new(),
        arm_starts: Vec::new(),
        notes: Vec::new(),
    };
    for call in &file.collected.calls {
        if !excused_name(&call.callee) {
            continue;
        }
        if let Some(stmt_span) = call.stmt_span {
            let p = pos(stmt_span.start);
            excused.stmt_starts.push(p);
            excused
                .notes
                .push((p, format!("never-param call to `{}`", call.callee)));
            if let Some(arm_start) = call.arm_start {
                excused.arm_starts.push(pos(arm_start));
            }
        }
    }
    excused
}

/// Directive targets in (line, col) space, sorted so the tightest containing
/// directive wins (redundant outer directives go stale).
fn directive_targets(
    directives: &[BoundDirective],
    pos: impl Fn(u32) -> LinePos,
) -> Vec<DirectiveTarget> {
    let span_range = |span: Span| (pos(span.start), pos(span.end));
    let mut targets: Vec<DirectiveTarget> = directives
        .iter()
        .enumerate()
        .filter_map(|(idx, d)| match &d.binding {
            Ok(Binding::Range(span)) => Some(DirectiveTarget {
                idx,
                label: d.parsed.label,
                range: Some(span_range(*span)),
                else_arm_of: None,
            }),
            Ok(Binding::WholeFile) => Some(DirectiveTarget {
                idx,
                label: d.parsed.label,
                range: Some(((0, 0), (u32::MAX, u32::MAX))),
                else_arm_of: None,
            }),
            Ok(Binding::ElseArm(if_span)) => Some(DirectiveTarget {
                idx,
                label: d.parsed.label,
                range: None,
                else_arm_of: Some(pos(if_span.start)),
            }),
            Err(_) => None,
        })
        .collect();
    targets.sort_by_key(|t| {
        t.range.map_or((0i64, 0i64), |((sl, sc), (el, ec))| {
            (i64::from(el) - i64::from(sl), i64::from(ec) - i64::from(sc))
        })
    });
    targets
}

/// Flatten the report's statement / function / branch maps into entities,
/// applying the position rules learned from real remapped reports.
fn collect_entities(file: &ParsedFile, cov: &FileCov, pos: impl Fn(u32) -> LinePos) -> Vec<Entity> {
    let mut entities = Vec::new();

    let mut stmt_keys: Vec<&String> = cov.statement_map.keys().collect();
    stmt_keys.sort_by_key(|k| k.parse::<u64>().unwrap_or(u64::MAX));
    for key in stmt_keys {
        let range = &cov.statement_map[key];
        entities.push(Entity {
            id: format!("s{key}"),
            kind: "statement",
            branch_type: None,
            at: range.start_pos(),
            attributed_at: None,
            else_arm_of: None,
            hits: *cov.s.get(key).unwrap_or(&0),
        });
    }

    let mut fn_keys: Vec<&String> = cov.fn_map.keys().collect();
    fn_keys.sort_by_key(|k| k.parse::<u64>().unwrap_or(u64::MAX));
    for key in fn_keys {
        let f = &cov.fn_map[key];
        // Body loc.start is reliable after remapping; decl.start is not.
        entities.push(Entity {
            id: format!("f{key}"),
            kind: "function",
            branch_type: None,
            at: f.loc.start_pos().or_else(|| f.decl.start_pos()),
            attributed_at: None,
            else_arm_of: None,
            hits: *cov.f.get(key).unwrap_or(&0),
        });
    }

    let mut branch_keys: Vec<&String> = cov.branch_map.keys().collect();
    branch_keys.sort_by_key(|k| k.parse::<u64>().unwrap_or(u64::MAX));
    for key in branch_keys {
        let branch = &cov.branch_map[key];
        let hit_arr = cov.b.get(key);
        for (arm, loc) in branch.locations.iter().enumerate() {
            let hits = hit_arr.and_then(|arr| arr.get(arm)).copied().unwrap_or(0);
            let at = loc.start_pos();
            let mut attributed_at = None;
            let mut else_arm_of = None;
            if at.is_none() && branch.branch_type == "if" {
                // Implicit-else arm: attribute per the terminating-then rule.
                if let Some(if_pos) = branch.loc.start_pos() {
                    else_arm_of = Some(if_pos);
                    let if_info = file
                        .collected
                        .ifs
                        .iter()
                        .find(|i| pos(i.span.start) == if_pos);
                    attributed_at = match if_info {
                        Some(i) if i.then_terminates => {
                            Some(i.following_start.map_or(if_pos, &pos))
                        }
                        _ => Some(if_pos),
                    };
                }
            }
            entities.push(Entity {
                id: format!("b{key}.{arm}"),
                kind: "branch",
                branch_type: Some(branch.branch_type.clone()),
                at,
                attributed_at,
                else_arm_of,
                hits,
            });
        }
    }

    entities
}
