import {
  AST_NODE_TYPES,
  ESLintUtils,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { strict as assert } from 'node:assert';
import * as ts from 'typescript';

export const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `https://github.com/votingworks/vxsuite/blob/main/libs/eslint-plugin-vx/docs/rules/${name}.md`
);

const FUNCTION_NODE_TYPES = new Set([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
]);

export type FunctionType =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

/**
 * Determines whether `node` is any kind of function.
 */
export function isFunction(node: TSESTree.Node): node is FunctionType {
  return FUNCTION_NODE_TYPES.has(node.type);
}

const BINDING_NAME_TYPES = new Set([
  AST_NODE_TYPES.ArrayPattern,
  AST_NODE_TYPES.ObjectPattern,
  AST_NODE_TYPES.Identifier,
]);

/**
 * Determines whether `node` is suitable for a variable declaration, i.e. the
 * `id` in `let id` or the `{a,b}` in `let {a,b}`.
 */
export function isBindingName(
  node: TSESTree.Node
): node is TSESTree.BindingName {
  return BINDING_NAME_TYPES.has(node.type);
}

export type CollectionType = 'array' | 'set' | 'map';

/**
 * Determines whether `node` is an array or set or map by checking its static
 * type as determined by TypeScript.
 */
export function getCollectionType(
  checker: ts.TypeChecker,
  node: ts.Node
): CollectionType | undefined {
  const type = checker.getTypeAtLocation(node);
  const typeName = type.getSymbol()?.getName();
  return typeName === 'Array' || typeName === 'ReadonlyArray'
    ? 'array'
    : typeName === 'Set' || typeName === 'ReadonlySet'
    ? 'set'
    : typeName === 'Map' || typeName === 'ReadonlyMap'
    ? 'map'
    : undefined;
}

/**
 * Determines whether there is a comment attached to `node`.
 */
export function hasAttachedComment(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Node | TSESTree.Token
): boolean {
  function hasAttachedCommentInner(
    inner: TSESTree.Node | TSESTree.Token
  ): boolean {
    if (
      sourceCode
        .getCommentsBefore(inner)
        .some((comment) => comment.loc.end.line >= node.loc.start.line - 1) ||
      sourceCode
        .getCommentsAfter(inner)
        .some((comment) => comment.loc.start.line === node.loc.end.line)
    ) {
      return true;
    }

    if (!('parent' in inner)) {
      return false;
    }

    if (inner.type === AST_NODE_TYPES.ExpressionStatement) {
      return false;
    }

    switch (inner.parent?.type) {
      case AST_NODE_TYPES.VariableDeclarator:
      case AST_NODE_TYPES.AssignmentExpression:
        return hasAttachedCommentInner(inner.parent);

      case AST_NODE_TYPES.Property: {
        const commaToken = sourceCode.getTokenAfter(inner.parent);
        assert.equal(commaToken?.value, ',');
        return (
          hasAttachedCommentInner(inner.parent) ||
          hasAttachedCommentInner(commaToken)
        );
      }

      case AST_NODE_TYPES.VariableDeclaration:
        return (
          inner.parent.declarations[0] === inner &&
          hasAttachedCommentInner(inner.parent)
        );

      default:
        return !!inner.parent && hasAttachedCommentInner(inner.parent);
    }
  }

  return hasAttachedCommentInner(node);
}

/**
 * Enumerates over all matches for non-printable characters in `string`. The
 * definition for printable characters is taken from this StackOverflow answer:
 *
 *   https://stackoverflow.com/a/53450014/549363
 *
 * The short version is that that's no agreed-upon definition because it depends
 * on the context. This answer shows what golang uses and, since it seems sane,
 * that's what we're using here. We also include CR & LF because we want those
 * to be allowed in template strings.
 */
export function* enumerateNonPrintableCharacters(
  string: string
): IterableIterator<{ nonPrintableCharacter: string; index: number }> {
  const NonPrintableCharactersPattern =
    /[^\r\n\p{Letter}\p{Mark}\p{Number}\p{Punctuation}\p{Symbol}\p{Space_Separator}]/gu;
  for (const match of string.matchAll(NonPrintableCharactersPattern)) {
    assert(typeof match.index === 'number');
    yield { nonPrintableCharacter: match[0], index: match.index };
  }
}

/**
 * Determines whether `char` is non-printable.
 *
 * @see {@link enumerateNonPrintableCharacters}
 */
export function isNonPrintableCharacter(char: string): boolean {
  return !enumerateNonPrintableCharacters(char).next().done;
}

/**
 * Determines whether an escape sequence starts at `index` in `string`.
 */
export function isStartOfEscapeSequence(
  string: string,
  index: number
): boolean {
  if (string[index] !== '\\') {
    return false;
  }

  let indexOfFirstSlash = index;

  while (string[indexOfFirstSlash - 1] === '\\') {
    indexOfFirstSlash -= 1;
  }

  return (index - indexOfFirstSlash) % 2 === 0;
}

export interface CharacterCodeEscape {
  readonly escapeSequence: string;
  readonly hexString: string;
  readonly charCode: number;
  readonly char: string;
  readonly index: number;
}

/**
 * Enumerates over all escape sequences in `string` that use a character code.
 * These could be hex (e.g. `\x0a`) or unicode (e.g. `\u000a` or `\u{a}`).
 */
export function* enumerateCharacterCodeEscapes(
  string: string
): IterableIterator<CharacterCodeEscape> {
  const CharacterEscapeSequencePattern =
    /(?:\\u([a-fA-F\d]{4})|\\u\{([a-fA-F\d]+)\}|\\x([a-fA-F\d]{2}))/gu;
  for (const match of string.matchAll(CharacterEscapeSequencePattern)) {
    assert(typeof match.index === 'number');
    if (isStartOfEscapeSequence(string, match.index)) {
      const hexString = match[1] ?? match[2] ?? match[3];
      const charCode = parseInt(hexString, 16);
      assert(!Number.isNaN(charCode) && Number.isFinite(charCode));
      const char = String.fromCharCode(charCode);
      yield {
        escapeSequence: match[0],
        hexString,
        charCode,
        char,
        index: match.index,
      };
    }
  }
}

/**
 * Gets the name of a type without any type arguments.
 *
 * @example
 *
 * ```ts
 * const type = checker.getTypeAtLocation(node);
 * const typeName = getTypeName(type);
 * ```
 */
export function getTypeName(type: ts.Type): string | undefined {
  return (
    // this seems to be for when the type is declared in the same file
    type.getSymbol()?.getName() ??
    // and this is for when it's imported
    type.aliasSymbol?.getName()
  );
}

function* allDeclaredTypes(
  node: ts.TypeNode
): Generator<ts.TypeNode> {
  yield node;

  switch (node.kind) {
    // `type Foo = Bar;` – follow the type reference
    case ts.SyntaxKind.TypeAliasDeclaration: {
      const typeAliasDeclaration = node as unknown as ts.TypeAliasDeclaration;
      yield* allDeclaredTypes(typeAliasDeclaration.type);
      break;
    }

    // `type Foo = Bar | Baz;` – follow each type in the union
    case ts.SyntaxKind.UnionType: {
      const unionType = node as ts.UnionTypeNode;
      for (const type of unionType.types) {
        yield* allDeclaredTypes(type);
      }
      break;
    }

    default:
      break;
  }
}

/**
 * Determines if `type` is a type with name `name`, or a union type that
 * contains `name`.
 *
 * @example
 *
 * ```ts
 * const type = checker.getTypeAtLocation(node);
 * if (containsNamedType('Map', type)) {
 *   // `type` is a `Map` or a union type that contains `Map`
 * }
 * ```
 */
export function containsNamedType(
  checker: ts.TypeChecker,
  name: string,
  type: ts.Type
): boolean {
  const typeName = getTypeName(type);

  if (typeName === name) {
    return true;
  }

  if (type.aliasSymbol) {
    const declarations = checker.getDeclaredTypeOfSymbol(type.aliasSymbol)
      .aliasSymbol?.declarations;

    if (declarations) {
      for (const declaration of declarations) {
        for (const declaredType of allDeclaredTypes(
          declaration as unknown as ts.TypeNode
        )) {
          if (declaredType.kind === ts.SyntaxKind.TypeReference) {
            const typeReference = declaredType as ts.TypeReferenceNode;
            if (typeReference.typeName.getText() === name) {
              return true;
            }
          }
        }
      }
    }
  }

  if (type.isUnion()) {
    return type.types.some((t) => containsNamedType(checker, name, t));
  }

  return false;
}
