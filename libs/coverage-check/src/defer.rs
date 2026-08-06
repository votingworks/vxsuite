//! Defer-insertion codemod (spec §7.4): plans `@coverage-defer` directives
//! for uncovered-and-unmarked entities from a fresh coverage report. Each
//! insertion goes on its own line above the tightest node that contains the
//! entity position and starts at the beginning of a line (after indentation),
//! so one directive absorbs every entity inside that node. A file whose every
//! entity is uncovered gets a single `@coverage-defer-file` instead.
//!
//! Inserting lines shifts positions, so the workflow is: run coverage →
//! `defer --write` → rerun coverage + check (the fresh report re-aligns).

use oxc_span::Span;

use crate::attach::ParsedFile;

#[derive(Debug, Clone)]
pub struct Insertion {
    /// Byte offset of the line start where the directive line is inserted
    /// (0 for a `-file` directive).
    pub at: usize,
    /// The full text to insert, including indentation and trailing newline.
    pub text: String,
    /// Number of report entities this insertion absorbs.
    pub covers: usize,
}

#[derive(Debug, Clone)]
pub struct UnplannedEntity {
    pub offset: usize,
}

pub struct FilePlan {
    pub insertions: Vec<Insertion>,
    /// Entity offsets with no line-leading containing node (need a human).
    pub unplanned: Vec<UnplannedEntity>,
}

/// Plan defer insertions for one file given the byte offsets of its FAIL
/// entities. `whole_file` requests a single `-file` directive instead.
#[must_use]
pub fn plan_file_defers(
    source: &str,
    file: &ParsedFile,
    fail_offsets: &[usize],
    whole_file: bool,
) -> FilePlan {
    if whole_file && !fail_offsets.is_empty() {
        return FilePlan {
            insertions: vec![Insertion {
                at: 0,
                text: "// @coverage-defer-file\n".to_string(),
                covers: fail_offsets.len(),
            }],
            unplanned: Vec::new(),
        };
    }

    let mut offsets = fail_offsets.to_vec();
    offsets.sort_unstable();
    offsets.dedup();

    let mut insertions: Vec<Insertion> = Vec::new();
    let mut unplanned: Vec<UnplannedEntity> = Vec::new();
    // Node spans already covered by a planned directive.
    let mut planned_spans: Vec<Span> = Vec::new();

    for &off in &offsets {
        if let Some(prev) = planned_spans
            .iter()
            .position(|s| (s.start as usize) <= off && off < (s.end as usize))
        {
            insertions[prev].covers += 1;
            continue;
        }
        let Some(node) = tightest_line_leading_container(source, file, off) else {
            unplanned.push(UnplannedEntity { offset: off });
            continue;
        };
        let line_start = source[..node.start as usize]
            .rfind('\n')
            .map_or(0, |i| i + 1);
        let indent: String = source[line_start..node.start as usize].to_string();
        // Insert above any contiguous leading comment block so we never split
        // line-scoped comments (eslint-disable-next-line, @ts-expect-error)
        // from the node they target.
        let at = above_leading_comments(source, line_start);
        insertions.push(Insertion {
            at,
            text: format!("{indent}// @coverage-defer\n"),
            covers: 1,
        });
        planned_spans.push(node);
    }

    FilePlan {
        insertions,
        unplanned,
    }
}

/// The innermost node span that contains `off` and whose start is preceded
/// only by whitespace on its line (so an own-line directive above it binds
/// it). Case clauses are skipped — a comment between empty fallthrough cases
/// trips `no-fallthrough` — so arms bubble up to the enclosing switch.
fn tightest_line_leading_container(source: &str, file: &ParsedFile, off: usize) -> Option<Span> {
    file.collected
        .spans
        .iter()
        .filter(|s| (s.start as usize) <= off && off < (s.end as usize))
        .filter(|s| !file.collected.case_spans.contains(s))
        .filter(|s| {
            let start = s.start as usize;
            let line_start = source[..start].rfind('\n').map_or(0, |i| i + 1);
            source[line_start..start].trim().is_empty()
        })
        .max_by_key(|s| (s.start, std::cmp::Reverse(s.end)))
        .copied()
}

/// Walk upward from a line start past contiguous own-line comment lines,
/// returning the line start above them.
fn above_leading_comments(source: &str, mut line_start: usize) -> usize {
    loop {
        if line_start == 0 {
            return 0;
        }
        let prev_start = source[..line_start - 1].rfind('\n').map_or(0, |i| i + 1);
        let prev_line = source[prev_start..line_start].trim();
        if prev_line.starts_with("//") || (prev_line.starts_with("/*") && prev_line.ends_with("*/"))
        {
            line_start = prev_start;
        } else {
            return line_start;
        }
    }
}

/// Apply planned insertions to the source (descending offset so earlier
/// offsets stay valid).
#[must_use]
pub fn apply_insertions(source: &str, insertions: &[Insertion]) -> String {
    let mut sorted: Vec<&Insertion> = insertions.iter().collect();
    sorted.sort_by_key(|i| std::cmp::Reverse(i.at));
    let mut out = source.to_string();
    for ins in sorted {
        out.insert_str(ins.at, &ins.text);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::attach::parse_file;
    use oxc_allocator::Allocator;

    fn plan(src: &str, offsets: &[usize], whole_file: bool) -> (String, FilePlan) {
        let allocator = Allocator::default();
        let parsed = parse_file(&allocator, std::path::Path::new("test.ts"), src);
        let plan = plan_file_defers(src, &parsed, offsets, whole_file);
        (apply_insertions(src, &plan.insertions), plan)
    }

    #[test]
    fn inserts_above_uncovered_statement_with_indentation() {
        let src = "function f(): void {\n  doThing();\n}\n";
        let off = src.find("doThing").unwrap();
        let (out, plan) = plan(src, &[off], false);
        assert_eq!(
            out,
            "function f(): void {\n  // @coverage-defer\n  doThing();\n}\n"
        );
        assert_eq!(plan.insertions.len(), 1);
        assert!(plan.unplanned.is_empty());
    }

    #[test]
    fn one_directive_absorbs_entities_in_same_node() {
        let src = "function f(x: boolean): void {\n  if (x) {\n    a();\n    b();\n  }\n}\n";
        let offsets = [
            src.find("if (x)").unwrap(),
            src.find("a();").unwrap(),
            src.find("b();").unwrap(),
        ];
        let (out, plan) = plan(src, &offsets, false);
        assert_eq!(
            out,
            "function f(x: boolean): void {\n  // @coverage-defer\n  if (x) {\n    a();\n    b();\n  }\n}\n"
        );
        assert_eq!(plan.insertions.len(), 1);
        assert_eq!(plan.insertions[0].covers, 3);
    }

    #[test]
    fn mid_expression_entity_binds_enclosing_line_leading_statement() {
        let src = "const x =\n  cond ? a() : b();\n";
        let off = src.find("b()").unwrap();
        let (out, plan) = plan(src, &[off], false);
        // The ternary alternate is mid-line; the tightest line-leading
        // container is the ternary expression itself.
        assert_eq!(
            out,
            "const x =\n  // @coverage-defer\n  cond ? a() : b();\n"
        );
        assert_eq!(plan.insertions.len(), 1);
    }

    #[test]
    fn separate_nodes_get_separate_directives() {
        let src = "function f(): void {\n  a();\n}\nfunction g(): void {\n  b();\n}\n";
        let offsets = [src.find("a();").unwrap(), src.find("b();").unwrap()];
        let (out, _plan) = plan(src, &offsets, false);
        assert_eq!(
            out,
            "function f(): void {\n  // @coverage-defer\n  a();\n}\nfunction g(): void {\n  // @coverage-defer\n  b();\n}\n"
        );
    }

    #[test]
    fn case_arms_bubble_up_to_the_enclosing_switch() {
        let src = "function f(x: string): number {\n  switch (x) {\n    case 'a':\n    case 'b':\n      return 1;\n    default:\n      return 0;\n  }\n}\n";
        let offsets = [src.find("case 'a'").unwrap(), src.find("case 'b'").unwrap()];
        let (out, plan) = plan(src, &offsets, false);
        assert_eq!(
            out,
            "function f(x: string): number {\n  // @coverage-defer\n  switch (x) {\n    case 'a':\n    case 'b':\n      return 1;\n    default:\n      return 0;\n  }\n}\n"
        );
        assert_eq!(plan.insertions.len(), 1);
        assert_eq!(plan.insertions[0].covers, 2);
    }

    #[test]
    fn inserts_above_leading_line_scoped_comments() {
        let src = "function f(): void {\n  // eslint-disable-next-line no-console\n  console.log('x');\n}\n";
        let off = src.find("console.log").unwrap();
        let (out, _plan) = plan(src, &[off], false);
        assert_eq!(
            out,
            "function f(): void {\n  // @coverage-defer\n  // eslint-disable-next-line no-console\n  console.log('x');\n}\n"
        );
    }

    #[test]
    fn whole_file_gets_single_file_directive() {
        let src = "export function f(): void {\n  a();\n}\n";
        let off = src.find("a();").unwrap();
        let (out, plan) = plan(src, &[off], true);
        assert_eq!(
            out,
            "// @coverage-defer-file\nexport function f(): void {\n  a();\n}\n"
        );
        assert_eq!(plan.insertions.len(), 1);
    }

    #[test]
    fn uncovered_object_method_gets_directive_above_property() {
        let src = "const api = {\n  async save(name: string): Promise<void> {\n    await write(name);\n  },\n};\n";
        // Function entities match by body start (corpus finding).
        let off = src.find("{\n    await").unwrap();
        let (out, _plan) = plan(src, &[off], false);
        assert_eq!(
            out,
            "const api = {\n  // @coverage-defer\n  async save(name: string): Promise<void> {\n    await write(name);\n  },\n};\n"
        );
    }
}
