// Joins coverage entities against bound flags and never-param exclusions.
// Matching is by entity start (line, col) containment in flag target ranges;
// function entities match by body loc.start (remapped arrow decl positions
// are imprecise — corpus finding); empty implicit-else arms are attributed
// per the terminating-then rule.

use std::collections::HashSet;

use oxc_span::Span;

use crate::attach::{BindError, Binding, BoundFlag, ParsedFile};
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
pub struct FlagVerdict {
    pub line: u32,
    pub label: Label,
    pub form: Form,
    pub reason: Option<String>,
    pub binds_range: Option<(u32, u32)>,
    pub error: Option<&'static str>,
    pub stale: bool,
}

pub struct FileAnalysis {
    pub flags: Vec<FlagVerdict>,
    pub entities: Vec<EntityVerdict>,
}

struct FlagTarget {
    idx: usize,
    label: Label,
    /// Target range in (line, col) space, when Range or WholeFile.
    range: Option<(LinePos, LinePos)>,
    /// The if statement start pos, when ElseArm.
    else_arm_of: Option<LinePos>,
}

pub fn classify(
    source: &str,
    file: &ParsedFile,
    flags: &[BoundFlag],
    cov: &FileCov,
    never_names: &HashSet<String>,
) -> FileAnalysis {
    let table = LineTable::new(source);
    let pos = |offset: u32| table.pos_of(source, offset as usize);
    let span_range = |span: Span| (pos(span.start), pos(span.end));

    // Resolve which local names are never-param (import binding or local decl).
    let excused_name = |callee: &str| -> bool {
        if let Some(import) = file.collected.imports.iter().find(|i| i.local == callee) {
            return never_names.contains(&import.imported);
        }
        if let Some(decl) = file.collected.fn_decls.iter().find(|d| d.name == callee) {
            return decl.has_required_never_param;
        }
        false
    };
    let mut excused_stmt_starts: Vec<LinePos> = Vec::new();
    let mut excused_arm_starts: Vec<LinePos> = Vec::new();
    let mut excused_notes: Vec<(LinePos, String)> = Vec::new();
    for call in &file.collected.calls {
        if !excused_name(&call.callee) {
            continue;
        }
        if let Some(stmt_span) = call.stmt_span {
            let p = pos(stmt_span.start);
            excused_stmt_starts.push(p);
            excused_notes.push((p, format!("never-param call to `{}`", call.callee)));
            if let Some(arm_start) = call.arm_start {
                excused_arm_starts.push(pos(arm_start));
            }
        }
    }

    // Flag targets in (line, col) space.
    let mut targets: Vec<FlagTarget> = flags
        .iter()
        .enumerate()
        .filter_map(|(idx, f)| match &f.binding {
            Ok(Binding::Range(span)) => Some(FlagTarget {
                idx,
                label: f.parsed.label,
                range: Some(span_range(*span)),
                else_arm_of: None,
            }),
            Ok(Binding::WholeFile) => Some(FlagTarget {
                idx,
                label: f.parsed.label,
                range: Some(((0, 0), (u32::MAX, u32::MAX))),
                else_arm_of: None,
            }),
            Ok(Binding::ElseArm(if_span)) => Some(FlagTarget {
                idx,
                label: f.parsed.label,
                range: None,
                else_arm_of: Some(pos(if_span.start)),
            }),
            Err(_) => None,
        })
        .collect();
    // Tightest containing flag wins, so redundant outer flags go stale.
    targets.sort_by_key(|t| {
        t.range.map_or((0i64, 0i64), |((sl, sc), (el, ec))| {
            (i64::from(el) - i64::from(sl), i64::from(ec) - i64::from(sc))
        })
    });

    let match_flag = |p: LinePos, else_arm_of: Option<LinePos>| -> Option<&FlagTarget> {
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
    let mut flag_has_uncovered: HashSet<usize> = HashSet::new();

    let push_entity = |id: String,
                           kind: &'static str,
                           branch_type: Option<String>,
                           at: Option<LinePos>,
                           attributed_at: Option<LinePos>,
                           else_arm_of: Option<LinePos>,
                           hits: i64,
                           entities: &mut Vec<EntityVerdict>,
                           flag_has_uncovered: &mut HashSet<usize>| {
        let match_pos = attributed_at.or(at);
        let covered = hits > 0;
        let flag = match_pos.and_then(|p| match_flag(p, else_arm_of));
        let never = match_pos.is_some_and(|p| {
            excused_stmt_starts.contains(&p) || excused_arm_starts.contains(&p)
        });
        let mut note = None;
        let status = if covered {
            if never {
                note = Some("never-param call site executed".to_string());
            }
            Status::Covered
        } else if never {
            if let Some(p) = match_pos {
                if let Some((_, n)) = excused_notes.iter().find(|(np, _)| *np == p) {
                    note = Some(n.clone());
                }
            }
            Status::NeverExcluded
        } else if let Some(t) = flag {
            flag_has_uncovered.insert(t.idx);
            match t.label {
                Label::Exclude => Status::Excluded,
                Label::Defer => Status::Deferred,
            }
        } else {
            Status::Fail
        };
        entities.push(EntityVerdict {
            id,
            kind,
            branch_type,
            at,
            attributed_at,
            hits,
            status,
            note,
        });
    };

    let mut stmt_keys: Vec<&String> = cov.statement_map.keys().collect();
    stmt_keys.sort_by_key(|k| k.parse::<u64>().unwrap_or(u64::MAX));
    for key in stmt_keys {
        let range = &cov.statement_map[key];
        let hits = *cov.s.get(key).unwrap_or(&0);
        push_entity(
            format!("s{key}"),
            "statement",
            None,
            range.start_pos(),
            None,
            None,
            hits,
            &mut entities,
            &mut flag_has_uncovered,
        );
    }

    let mut fn_keys: Vec<&String> = cov.fn_map.keys().collect();
    fn_keys.sort_by_key(|k| k.parse::<u64>().unwrap_or(u64::MAX));
    for key in fn_keys {
        let f = &cov.fn_map[key];
        let hits = *cov.f.get(key).unwrap_or(&0);
        // Body loc.start is reliable after remapping; decl.start is not.
        let at = f.loc.start_pos().or_else(|| f.decl.start_pos());
        push_entity(
            format!("f{key}"),
            "function",
            None,
            at,
            None,
            None,
            hits,
            &mut entities,
            &mut flag_has_uncovered,
        );
    }

    let mut branch_keys: Vec<&String> = cov.branch_map.keys().collect();
    branch_keys.sort_by_key(|k| k.parse::<u64>().unwrap_or(u64::MAX));
    for key in branch_keys {
        let branch = &cov.branch_map[key];
        let hit_arr = cov.b.get(key);
        for (arm, loc) in branch.locations.iter().enumerate() {
            let hits = hit_arr
                .and_then(|arr| arr.get(arm))
                .copied()
                .unwrap_or(0);
            let at = loc.start_pos();
            let mut attributed_at = None;
            let mut else_arm_of = None;
            if at.is_none() && branch.branch_type == "if" {
                // Implicit-else arm: attribute per the terminating-then rule.
                let if_pos = branch.loc.start_pos();
                if let Some(if_pos) = if_pos {
                    else_arm_of = Some(if_pos);
                    let if_info = file
                        .collected
                        .ifs
                        .iter()
                        .find(|i| pos(i.span.start) == if_pos);
                    attributed_at = match if_info {
                        Some(i) if i.then_terminates => {
                            Some(i.following_start.map(&pos).unwrap_or(if_pos))
                        }
                        _ => Some(if_pos),
                    };
                }
            }
            push_entity(
                format!("b{key}.{arm}"),
                "branch",
                Some(branch.branch_type.clone()),
                at,
                attributed_at,
                else_arm_of,
                hits,
                &mut entities,
                &mut flag_has_uncovered,
            );
        }
    }

    let flag_verdicts: Vec<FlagVerdict> = flags
        .iter()
        .enumerate()
        .map(|(idx, f)| {
            let line = table.pos_of(source, f.comment_span.start as usize).0;
            let (binds_range, error) = match &f.binding {
                Ok(Binding::Range(span)) => (Some((span.start, span.end)), None),
                Ok(Binding::WholeFile) => (None, None),
                Ok(Binding::ElseArm(span)) => (Some((span.start, span.end)), None),
                Err(BindError::Orphan) => (None, Some("orphan")),
                Err(BindError::ElseMisuse) => (None, Some("else-misuse")),
                Err(BindError::NotTopOfFile) => (None, Some("not-top-of-file")),
            };
            FlagVerdict {
                line,
                label: f.parsed.label,
                form: f.parsed.form,
                reason: f.parsed.reason.clone(),
                binds_range,
                error,
                stale: error.is_none() && !flag_has_uncovered.contains(&idx),
            }
        })
        .collect();

    FileAnalysis { flags: flag_verdicts, entities }
}
