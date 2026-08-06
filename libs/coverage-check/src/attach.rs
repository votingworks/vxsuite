//! Attachment semantics (spec section 2): a directive binds to the outermost
//! AST node starting at the next token position after the comment; `-file`
//! binds the whole file (top of file only); `-else` binds the implicit-else
//! arm of the next `if` statement. Orphans (nothing bindable before the
//! enclosing scope ends) are checker failures.

use oxc_allocator::Allocator;
use oxc_ast::ast::{Expression, Statement, TSType};
use oxc_ast::AstKind;
use oxc_ast_visit::Visit;
use oxc_parser::Parser;
use oxc_span::{GetSpan, SourceType, Span};

use crate::grammar::{parse_comment_text, Form, ParsedDirective};

#[derive(Debug, Clone)]
pub struct IfInfo {
    pub span: Span,
    pub has_alternate: bool,
    pub then_terminates: bool,
    /// Start of the next sibling statement after this `if`, if any.
    pub following_start: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct CallSite {
    pub callee: String,
    /// The enclosing `ExpressionStatement` span when the call is a whole
    /// statement.
    pub stmt_span: Option<Span>,
    /// Start of the enclosing switch-case clause when the call statement is
    /// the arm's entire body (modulo a trailing `break`).
    pub arm_start: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct ImportBinding {
    pub local: String,
    pub imported: String,
}

#[derive(Debug, Clone)]
pub struct FnDecl {
    pub name: String,
    pub has_required_never_param: bool,
}

#[derive(Default)]
pub struct Collected {
    pub spans: Vec<Span>,
    pub ifs: Vec<IfInfo>,
    pub calls: Vec<CallSite>,
    pub imports: Vec<ImportBinding>,
    pub fn_decls: Vec<FnDecl>,
    /// All switch-case clause spans (directive insertion avoids these:
    /// comments between empty fallthrough cases trip `no-fallthrough`).
    pub case_spans: Vec<Span>,
}

#[derive(Default)]
struct Collector {
    out: Collected,
    /// Case clause spans whose body is a single expression statement
    /// (plus optional break): (`stmt_span_start`, `case_start`).
    single_stmt_arms: Vec<(u32, u32)>,
}

fn statement_terminates(stmt: &Statement) -> bool {
    match stmt {
        Statement::ReturnStatement(_)
        | Statement::ThrowStatement(_)
        | Statement::BreakStatement(_)
        | Statement::ContinueStatement(_) => true,
        Statement::BlockStatement(block) => block.body.last().is_some_and(statement_terminates),
        _ => false,
    }
}

fn record_siblings(out: &mut Vec<(u32, Option<u32>)>, stmts: &[Statement]) {
    for (i, stmt) in stmts.iter().enumerate() {
        if matches!(stmt, Statement::IfStatement(_)) {
            let next = stmts.get(i + 1).map(|s| s.span().start);
            out.push((stmt.span().start, next));
        }
    }
}

impl<'a> Visit<'a> for Collector {
    fn enter_node(&mut self, kind: AstKind<'a>) {
        self.out.spans.push(kind.span());
        match kind {
            AstKind::IfStatement(if_stmt) => {
                self.out.ifs.push(IfInfo {
                    span: if_stmt.span,
                    has_alternate: if_stmt.alternate.is_some(),
                    then_terminates: statement_terminates(&if_stmt.consequent),
                    following_start: None, // filled from sibling info below
                });
            }
            AstKind::SwitchCase(case) => {
                self.out.case_spans.push(case.span);
                let mut body: Vec<&Statement> = case.consequent.iter().collect();
                if let Some(Statement::BreakStatement(_)) = body.last().map(|s| &**s) {
                    body.pop();
                }
                // Unwrap a single block wrapping the arm body (the repo's
                // `default: { throwIllegalValue(x); }` convention).
                while body.len() == 1 {
                    if let Statement::BlockStatement(block) = body[0] {
                        body = block.body.iter().collect();
                        if let Some(Statement::BreakStatement(_)) = body.last().map(|s| &**s) {
                            body.pop();
                        }
                    } else {
                        break;
                    }
                }
                if body.len() == 1 {
                    if matches!(
                        body[0],
                        Statement::ExpressionStatement(_) | Statement::ReturnStatement(_)
                    ) {
                        self.single_stmt_arms
                            .push((body[0].span().start, case.span.start));
                    }
                }
            }
            AstKind::ExpressionStatement(stmt) => {
                if let Expression::CallExpression(call) = &stmt.expression {
                    if let Expression::Identifier(ident) = &call.callee {
                        self.out.calls.push(CallSite {
                            callee: ident.name.to_string(),
                            stmt_span: Some(stmt.span),
                            arm_start: None, // resolved after visit
                        });
                    }
                }
            }
            // `return throwIllegalValue(x)` is still "the call statement"
            // for the never-param rule (spec 1b).
            AstKind::ReturnStatement(stmt) => {
                if let Some(Expression::CallExpression(call)) = &stmt.argument {
                    if let Expression::Identifier(ident) = &call.callee {
                        self.out.calls.push(CallSite {
                            callee: ident.name.to_string(),
                            stmt_span: Some(stmt.span),
                            arm_start: None, // resolved after visit
                        });
                    }
                }
            }
            AstKind::ImportDeclaration(decl) => {
                if let Some(specifiers) = &decl.specifiers {
                    for spec in specifiers {
                        if let oxc_ast::ast::ImportDeclarationSpecifier::ImportSpecifier(s) = spec {
                            self.out.imports.push(ImportBinding {
                                local: s.local.name.to_string(),
                                imported: s.imported.name().to_string(),
                            });
                        }
                    }
                }
            }
            AstKind::Function(func) => {
                if let Some(id) = &func.id {
                    let has_never = func.params.items.iter().any(|param| {
                        let required = !param.optional && param.initializer.is_none();
                        let never = param.type_annotation.as_ref().is_some_and(|ann| {
                            matches!(ann.type_annotation, TSType::TSNeverKeyword(_))
                        });
                        required && never
                    });
                    self.out.fn_decls.push(FnDecl {
                        name: id.name.to_string(),
                        has_required_never_param: has_never,
                    });
                }
            }
            _ => {}
        }
    }
}

pub struct ParsedFile {
    pub collected: Collected,
    pub comments: Vec<(Span, String)>,
    pub first_node_start: Option<u32>,
    pub parse_errors: usize,
}

#[must_use]
pub fn parse_file(allocator: &Allocator, path: &std::path::Path, source: &str) -> ParsedFile {
    let source_type = SourceType::from_path(path).unwrap_or_default();
    let ret = Parser::new(allocator, source, source_type).parse();

    let mut comments = Vec::new();
    for comment in &ret.program.comments {
        let raw = &source[comment.span.start as usize..comment.span.end as usize];
        let text = raw
            .strip_prefix("//")
            .or_else(|| {
                raw.strip_prefix("/*")
                    .map(|t| t.strip_suffix("*/").unwrap_or(t))
            })
            .unwrap_or(raw);
        comments.push((comment.span, text.to_string()));
    }

    let mut collector = Collector::default();
    collector.visit_program(&ret.program);

    // Fill in if-statement sibling info by walking statement lists.
    let mut siblings: Vec<(u32, Option<u32>)> = Vec::new();
    collect_statement_lists(&ret.program, &mut siblings);
    let mut collected = collector.out;
    for if_info in &mut collected.ifs {
        if let Some((_, next)) = siblings
            .iter()
            .find(|(start, _)| *start == if_info.span.start)
        {
            if_info.following_start = *next;
        }
    }
    // Resolve call-site arm enclosure.
    for call in &mut collected.calls {
        if let Some(stmt_span) = call.stmt_span {
            if let Some((_, case_start)) = collector
                .single_stmt_arms
                .iter()
                .find(|(stmt_start, _)| *stmt_start == stmt_span.start)
            {
                call.arm_start = Some(*case_start);
            }
        }
    }

    let first_node_start = ret
        .program
        .body
        .first()
        .map(|stmt| GetSpan::span(stmt).start);

    ParsedFile {
        collected,
        comments,
        first_node_start,
        parse_errors: ret.errors.len(),
    }
}

fn collect_statement_lists(program: &oxc_ast::ast::Program, out: &mut Vec<(u32, Option<u32>)>) {
    // Walk with a dedicated visitor to reach every statement list.
    struct Lists<'v> {
        out: &'v mut Vec<(u32, Option<u32>)>,
    }
    impl<'a> Visit<'a> for Lists<'_> {
        fn enter_node(&mut self, kind: AstKind<'a>) {
            match kind {
                AstKind::Program(p) => record_siblings(self.out, &p.body),
                AstKind::BlockStatement(b) => record_siblings(self.out, &b.body),
                AstKind::FunctionBody(b) => record_siblings(self.out, &b.statements),
                AstKind::SwitchCase(c) => record_siblings(self.out, &c.consequent),
                AstKind::StaticBlock(b) => record_siblings(self.out, &b.body),
                _ => {}
            }
        }
    }
    let mut lists = Lists { out };
    lists.visit_program(program);
}

#[derive(Debug, Clone, PartialEq)]
pub enum Binding {
    /// Byte range [start, end) of the bound node.
    Range(Span),
    /// The implicit-else arm of the `if` statement at this span.
    ElseArm(Span),
    WholeFile,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BindError {
    Orphan,
    ElseMisuse,
    NotTopOfFile,
}

impl BindError {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            BindError::Orphan => "orphan",
            BindError::ElseMisuse => "else-misuse",
            BindError::NotTopOfFile => "not-top-of-file",
        }
    }
}

#[derive(Debug, Clone)]
pub struct BoundDirective {
    pub parsed: ParsedDirective,
    pub comment_span: Span,
    pub binding: Result<Binding, BindError>,
}

#[must_use]
pub fn bind_directives(file: &ParsedFile, source_len: u32) -> Vec<BoundDirective> {
    let mut directives = Vec::new();
    for (span, text) in &file.comments {
        let Some(parsed) = parse_comment_text(text) else {
            continue;
        };
        let binding = bind_form(parsed.form, *span, file, source_len);
        directives.push(BoundDirective {
            parsed,
            comment_span: *span,
            binding,
        });
    }
    directives
}

/// Bind a directive form at a comment position to its target node.
///
/// # Errors
///
/// Returns the binding failure (orphan, else-misuse, not-top-of-file) that
/// the checker reports as a directive error.
///
/// # Panics
///
/// Never in practice: the only `expect` guards a candidate set already
/// checked non-empty.
pub fn bind_form(
    form: Form,
    comment: Span,
    file: &ParsedFile,
    source_len: u32,
) -> Result<Binding, BindError> {
    match form {
        Form::File => {
            let ok = file
                .first_node_start
                .is_none_or(|first| comment.start < first);
            if ok {
                Ok(Binding::WholeFile)
            } else {
                Err(BindError::NotTopOfFile)
            }
        }
        Form::Else => {
            let scope_end = innermost_container(&file.collected.spans, comment, source_len).end;
            let next_if = file
                .collected
                .ifs
                .iter()
                .filter(|i| i.span.start >= comment.end && i.span.start < scope_end)
                .min_by_key(|i| i.span.start);
            match next_if {
                None => Err(BindError::Orphan),
                Some(i) if i.has_alternate => Err(BindError::ElseMisuse),
                Some(i) => Ok(Binding::ElseArm(i.span)),
            }
        }
        Form::Default => {
            let container = innermost_container(&file.collected.spans, comment, source_len);
            let candidates: Vec<Span> = file
                .collected
                .spans
                .iter()
                .filter(|s| s.start >= comment.end && s.start < container.end)
                .copied()
                .collect();
            let Some(min_start) = candidates.iter().map(|s| s.start).min() else {
                return Err(BindError::Orphan);
            };
            let outermost = candidates
                .iter()
                .filter(|s| s.start == min_start)
                .max_by_key(|s| s.end)
                .copied()
                .expect("candidates with min_start is non-empty");
            Ok(Binding::Range(outermost))
        }
    }
}

fn innermost_container(spans: &[Span], comment: Span, source_len: u32) -> Span {
    spans
        .iter()
        .filter(|s| s.start <= comment.start && s.end >= comment.end)
        .min_by_key(|s| s.end - s.start)
        .copied()
        .unwrap_or(Span::new(0, source_len))
}
