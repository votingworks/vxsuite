import { API, TypeFlags, type Checker } from '@typescript/native/unstable/sync';
import {
  SyntaxKind,
  type Node,
  type SourceFile,
  type Statement,
} from '@typescript/native/unstable/ast';
import {
  isBlock,
  isCaseClause,
  isDefaultClause,
  isIdentifier,
  isJsxText,
  isModuleBlock,
  isPropertyAccessExpression,
  isSourceFile,
  isStatement,
  isTypeNode,
} from '@typescript/native/unstable/ast/is';
import {
  getLeadingCommentRanges,
  getTrailingCommentRanges,
  skipTrivia,
} from '@typescript/native/unstable/ast/scanner';
import { resolve } from 'node:path';

/**
 * A range of text in a source file, represented by start and end offsets. This
 * does not include a node's "trivia" (comments and whitespace preceding the
 * node).
 */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/**
 * A source file comment's location and text.
 */
interface Comment {
  readonly span: Span;
  /**
   * Text with the comment markers removed
   */
  readonly text: string;
}

/**
 * A TypeScript compiler session for a package.
 */
export interface TypescriptCompilerSession {
  /**
   * Gets the AST for a source file in the package.
   */
  readonly sourceFile: (fileName: string) => SourceFile;
  /**
   * Analyzes which of the given statements contain a value reference whose narrowed
   * type is `never` (meaning the statement is unreachable).
   */
  readonly unreachableStatements: (
    statements: readonly Node[]
  ) => ReadonlySet<Node>;
  [Symbol.dispose](): void;
}

/**
 * Starts the TypeScript compiler using a package's `tsconfig.json`. This uses
 * the TS API to start an ongoing tsgo child process, which is stopped when the
 * session is disposed.
 */
export function startTypescriptCompilerSession(
  packageDir: string
): TypescriptCompilerSession {
  const api = new API({ cwd: packageDir });
  const tsconfig = resolve(packageDir, 'tsconfig.json');
  try {
    const project = api
      .updateSnapshot({ openProjects: [tsconfig] })
      .getProject(tsconfig);
    if (!project) {
      throw new Error(`coverage-check: could not load ${tsconfig}`);
    }
    const { program, checker } = project;
    return {
      sourceFile: (fileName) => {
        const file = program.getSourceFile(fileName);
        if (!file) {
          throw new Error(`coverage-check: ${fileName} is not in the project`);
        }
        return file;
      },
      unreachableStatements: (statements) =>
        findUnreachableStatements(checker, statements),
      [Symbol.dispose]: () => api.close(),
    };
  } catch (error) {
    api.close();
    throw error;
  }
}

/**
 * A node's direct children.
 */
function astNodeChildren(node: Node): Node[] {
  const children: Node[] = [];
  node.forEachChild((child) => {
    children.push(child);
  });
  return children;
}

/**
 * Every node below the given node in pre-order (a node before its children).
 */
export function* astNodeDescendants(root: Node): Generator<Node> {
  const stack = astNodeChildren(root).reverse();
  for (let node = stack.pop(); node; node = stack.pop()) {
    yield node;
    const children = astNodeChildren(node);
    for (let i = children.length - 1; i >= 0; i -= 1) {
      stack.push(children[i] as Node);
    }
  }
}

/**
 * The smallest node whose range contains the given span (topping out at the
 * source file root node).
 */
export function astClosestParentNodeForSpan(
  span: Span,
  sourceFile: SourceFile
): Node {
  let node: Node = sourceFile;
  for (;;) {
    const next = astNodeChildren(node).find(
      (child) =>
        child.getStart(sourceFile) <= span.start && child.end >= span.end
    );
    if (!next) return node;
    node = next;
  }
}

/**
 * The statement list a node directly holds (provided it is a statement container).
 */
export function astNodeStatements(
  node: Node
): readonly Statement[] | undefined {
  if (
    isSourceFile(node) ||
    isBlock(node) ||
    isModuleBlock(node) ||
    isCaseClause(node) ||
    isDefaultClause(node)
  ) {
    return node.statements;
  }
  return undefined;
}

const TERMINATORS = new Set([
  SyntaxKind.ReturnStatement,
  SyntaxKind.ThrowStatement,
  SyntaxKind.BreakStatement,
  SyntaxKind.ContinueStatement,
]);

/**
 * Whether a statement ends in return/throw/break/continue.
 */
export function astNodeTerminates(statement: Node): boolean {
  if (TERMINATORS.has(statement.kind)) return true;
  if (isBlock(statement)) {
    const last = statement.statements[statement.statements.length - 1];
    return last !== undefined && astNodeTerminates(last);
  }
  return false;
}

/**
 * Every comment in a file, in order.
 */
export function collectComments(sourceFile: SourceFile): Comment[] {
  const { text } = sourceFile;
  const commentsByPosition = new Map<number, Comment>();
  const jsxText: Span[] = [];

  // Comments live in the gaps between tokens. Given a gap offset, scan for
  // trailing comments from the previous node and leading comments for the next
  // node.
  function collectCommentsAt(gapPosition: number): void {
    for (const range of [
      ...(getTrailingCommentRanges(text, gapPosition) ?? []),
      ...(getLeadingCommentRanges(text, gapPosition) ?? []),
    ]) {
      if (commentsByPosition.has(range.pos)) continue;
      const fullCommentText = text.slice(range.pos, range.end);
      const innerCommentText =
        range.kind === SyntaxKind.SingleLineCommentTrivia
          ? fullCommentText.slice(2)
          : fullCommentText.slice(
              2,
              fullCommentText.endsWith('*/') ? -2 : undefined
            );
      commentsByPosition.set(range.pos, {
        span: { start: range.pos, end: range.end },
        text: innerCommentText,
      });
    }
  }

  // Scan the gap before and after each node. A comment that is the only thing
  // inside a delimiter pair (e.g. `{ /* comment */ }`) has no node on
  // either side, and the delimiters are not nodes, so also scan just past any
  // opening delimiter that starts or follows a node.
  function collectNodeComments(node: Node): void {
    collectCommentsAt(node.getFullStart());
    collectCommentsAt(node.end);
    for (const offset of [
      node.getStart(sourceFile),
      skipTrivia(text, node.end),
    ]) {
      const character = text[offset];
      if (character !== undefined && '{[('.includes(character)) {
        collectCommentsAt(offset + 1);
      }
    }
  }

  collectNodeComments(sourceFile);
  for (const node of astNodeDescendants(sourceFile)) {
    if (isJsxText(node)) {
      jsxText.push({ start: node.getStart(sourceFile), end: node.end });
      continue;
    }
    collectNodeComments(node);
  }

  return (
    [...commentsByPosition.values()]
      // Text with comment syntax inside a JSX node doesn't actually parse as a comment.
      // E.g.
      //  <div>/* not a comment */</div>
      // In this case, "/* not a comment */" is parsed as text to render in that div.
      .filter(
        (comment) =>
          !jsxText.some(
            (span) =>
              comment.span.start >= span.start && comment.span.start < span.end
          )
      )
      .sort((a, b) => a.span.start - b.span.start)
  );
}

const FUNCTION_LIKE = new Set([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.FunctionExpression,
  SyntaxKind.ArrowFunction,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.Constructor,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
]);

const NOT_VALUE_REFERENCE_PARENTS = new Set([
  SyntaxKind.ImportSpecifier,
  SyntaxKind.ImportClause,
  SyntaxKind.NamespaceImport,
  SyntaxKind.ExportSpecifier,
  SyntaxKind.QualifiedName,
  SyntaxKind.LabeledStatement,
  SyntaxKind.BreakStatement,
  SyntaxKind.ContinueStatement,
]);

/**
 * Parents whose `name` child is a declaration or property name, not a value
 * reference.
 */
const NAME_OWNERS = new Set([
  SyntaxKind.PropertyAccessExpression,
  SyntaxKind.PropertyAssignment,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.PropertyDeclaration,
  SyntaxKind.PropertySignature,
  SyntaxKind.VariableDeclaration,
  SyntaxKind.Parameter,
  SyntaxKind.BindingElement,
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.FunctionExpression,
  SyntaxKind.ClassDeclaration,
  SyntaxKind.TypeAliasDeclaration,
  SyntaxKind.InterfaceDeclaration,
  SyntaxKind.EnumDeclaration,
  SyntaxKind.EnumMember,
  SyntaxKind.ModuleDeclaration,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
]);

/**
 * Reference expressions used as values directly within `root`: identifiers
 * and property-access chains (`x`, `x.y.z` — the references TypeScript
 * narrows), excluding type positions, declaration names, property names, and
 * labels. Nested statements and function bodies belong to their own
 * statements.
 */
function valueReferences(root: Node): Node[] {
  const references: Node[] = [];
  function visit(node: Node, parent: Node): void {
    if (isTypeNode(node)) return;
    if (isStatement(node) || FUNCTION_LIKE.has(node.kind)) return;
    if (isPropertyAccessExpression(node)) {
      references.push(node);
      visit(node.expression, node);
      return;
    }
    if (isIdentifier(node)) {
      const isDeclaredName =
        NAME_OWNERS.has(parent.kind) &&
        'name' in parent &&
        parent.name === node;
      if (!NOT_VALUE_REFERENCE_PARENTS.has(parent.kind) && !isDeclaredName) {
        references.push(node);
      }
      return;
    }
    node.forEachChild((child) => {
      visit(child, node);
    });
  }
  root.forEachChild((child) => {
    visit(child, root);
  });
  return references;
}

/**
 * Given a list of statements, finds those that are deemed unreachable by the
 * type checker due to referencing a value that is of type `never`.
 */
function findUnreachableStatements(
  checker: Checker,
  statements: readonly Node[]
): ReadonlySet<Node> {
  const candidates: Array<{ statement: Node; reference: Node }> = [];
  for (const statement of new Set(statements)) {
    for (const reference of valueReferences(statement)) {
      candidates.push({ statement, reference });
    }
  }
  if (candidates.length === 0) return new Set();
  // Check the types in bulk since talking to the checker is expensive
  const types = checker.getTypeAtLocation(
    candidates.map((candidate) => candidate.reference)
  );
  const unreachable = new Set<Node>();
  for (const [index, type] of types.entries()) {
    const candidate = candidates[index];
    // eslint-disable-next-line no-bitwise
    if (candidate && type && type.flags & TypeFlags.Never) {
      unreachable.add(candidate.statement);
    }
  }
  return unreachable;
}
