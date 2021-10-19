import {
  AST_NODE_TYPES,
  ESLintUtils,
  TSESTree,
} from '@typescript-eslint/experimental-utils';

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
