import {
  SyntaxKind,
  type Node,
  type SourceFile,
} from '@typescript/native/unstable/ast';
import {
  isIfStatement,
  isJsxExpression,
  isJsxText,
  isTemplateSpan,
} from '@typescript/native/unstable/ast/is';
import {
  astClosestParentNodeForSpan,
  astNodeDescendants,
  collectComments,
  type Span,
} from './typescript.js';
import { throwIllegalValue } from './utils.js';

/**
 * How the coverage checker should treat the code a directive applies to
 */
type DirectiveAction = 'exclude' | 'defer';

/**
 * The scope a directive binds to
 */
type DirectiveScope = 'next' | 'file' | 'else';

/**
 * A parsed directive comment
 */
interface Directive {
  readonly action: DirectiveAction;
  readonly scope: DirectiveScope;
  readonly reason?: string;
}

const PREFIX = '@coverage-';

/**
 * Checks if a source file's text might contain coverage directives.
 */
export function maybeHasDirectives(sourceFileText: string): boolean {
  return sourceFileText.includes(PREFIX);
}

const DIRECTIVE_PATTERN =
  /^@coverage-(exclude|defer)(?:-(file|else))?(?::\s*(.+))?$/s;

/**
 * Parses a comment's inner text as a directive. Returns `undefined` for a
 * comment that is not directive-shaped at all (prose), and a parse error for
 * one that starts with the `@coverage-` prefix (in any case) but does not
 * follow the grammar. A JSDoc-style block comment (each line starting with
 * `*`) reads the same as a plain one.
 */
export function parseDirective(
  commentText: string
): Directive | 'parse-error' | undefined {
  const text = commentText
    .split('\n')
    .map((line) => line.replace(/^\s*\*+ ?/, ''))
    .join('\n')
    .trim();
  if (!text.toLowerCase().startsWith(PREFIX)) return undefined;
  const match = DIRECTIVE_PATTERN.exec(text);
  if (!match) return 'parse-error';
  const [, action, scope, reason] = match;
  return {
    action: action as DirectiveAction,
    scope: (scope as 'file' | 'else' | undefined) ?? 'next',
    ...(reason === undefined ? {} : { reason }),
  };
}

/**
 * Converts a directive to its string representation: `@coverage-<action>[-<scope>]`
 * (not including the reason).
 */
export function directiveToString(directive: Directive): string {
  const scopeSuffix = {
    next: '',
    file: '-file',
    else: '-else',
  }[directive.scope];
  return `${PREFIX}${directive.action}${scopeSuffix}`;
}

/**
 * The code a directive applies to: an offset range, or the implicit else arm of
 * the `if` at `ifSpan`.
 */
type DirectiveTarget =
  | { readonly type: 'range'; readonly span: Span }
  | { readonly type: 'else-arm'; readonly ifSpan: Span };

type DirectiveBindError = 'orphan' | 'misplaced-else' | 'misplaced-file';

/**
 * A directive comment bound to the code it applies to.
 */
export interface BoundDirective {
  readonly commentSpan: Span;
  readonly directive: Directive;
  readonly target: DirectiveTarget;
}

/**
 * Checks if a directive binding result is a successfully bound directive.
 */
export function isBoundDirective(
  binding: DirectiveBindingResult
): binding is BoundDirective {
  return 'target' in binding;
}

/**
 * The result of attempting to bind a directive comment: either a successful
 * binding or an error.
 */
export type DirectiveBindingResult =
  | BoundDirective
  | {
      readonly commentSpan: Span;
      readonly error: 'parse-error';
    }
  | {
      readonly commentSpan: Span;
      readonly directive: Directive;
      readonly error: DirectiveBindError;
    };

/**
 * Attempts to parse and bind every directive comment in a file.
 */
export function bindDirectives(
  sourceFile: SourceFile
): DirectiveBindingResult[] {
  const results: DirectiveBindingResult[] = [];
  for (const comment of collectComments(sourceFile)) {
    const parseResult = parseDirective(comment.text);
    if (parseResult === undefined) continue;
    const commentSpan = comment.span;
    if (parseResult === 'parse-error') {
      results.push({ commentSpan, error: parseResult });
      continue;
    }
    const directive = parseResult;
    const bindResult = bindScope(directive.scope, commentSpan, sourceFile);
    results.push(
      typeof bindResult === 'string'
        ? { commentSpan, directive, error: bindResult }
        : { commentSpan, directive, target: bindResult }
    );
  }
  return results;
}

function bindScope(
  scope: DirectiveScope,
  comment: Span,
  sourceFile: SourceFile
): DirectiveTarget | DirectiveBindError {
  switch (scope) {
    case 'file':
      return bindFile(comment, sourceFile);
    case 'else':
      return bindElse(comment, sourceFile);
    case 'next':
      return bindNextNode(comment, sourceFile);
    default:
      return throwIllegalValue(scope);
  }
}

function isBindable(node: Node): boolean {
  return (
    // Skip whitespace inside JSX text nodes (e.g. newlines between JSX children)
    !isJsxText(node) &&
    // Skip TemplateSpan nodes in interpolated template strings, since they
    // weirdly wrap an interpolated expression and some of the literal text
    // after it
    !isTemplateSpan(node) &&
    // Don't bind to end of file marker
    node.kind !== SyntaxKind.EndOfFile
  );
}

/**
 * A `-file` directive applies to the whole file. It must be at the top of the file.
 */
function bindFile(
  comment: Span,
  sourceFile: SourceFile
): DirectiveTarget | DirectiveBindError {
  const first = sourceFile.statements[0];
  if (first !== undefined && comment.start >= first.getStart(sourceFile)) {
    return 'misplaced-file';
  }
  return { type: 'range', span: { start: 0, end: Infinity } };
}

/**
 * An `-else` directive applies to the implicit else arm of the next `if` within
 * the comment's nearest parent node. That `if` must have no `else`.
 */
function bindElse(
  comment: Span,
  sourceFile: SourceFile
): DirectiveTarget | DirectiveBindError {
  const closest = astClosestParentNodeForSpan(comment, sourceFile);
  for (const node of astNodeDescendants(closest)) {
    if (!isIfStatement(node) || node.getStart(sourceFile) < comment.end) {
      continue;
    }
    if (node.elseStatement) return 'misplaced-else';
    return {
      type: 'else-arm',
      ifSpan: { start: node.getStart(sourceFile), end: node.end },
    };
  }
  return 'orphan';
}

/**
 * A plain directive applies to the first node starting after the comment
 * within the comment's closest parent.
 */
function bindNextNode(
  comment: Span,
  sourceFile: SourceFile
): DirectiveTarget | DirectiveBindError {
  const closest = astClosestParentNodeForSpan(comment, sourceFile);
  // A comment between JSX children must be wrapped in braces, making a
  // JsxExpression that holds nothing but the comment, so we skip to the next
  // parent in that case.
  const container = isJsxExpression(closest) ? closest.parent : closest;
  for (const node of astNodeDescendants(container)) {
    if (isBindable(node) && node.getStart(sourceFile) >= comment.end) {
      return {
        type: 'range',
        span: { start: node.getStart(sourceFile), end: node.end },
      };
    }
  }
  return 'orphan';
}
