import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../util';

/**
 * Detects manual sleep implementations like:
 *   new Promise((resolve) => setTimeout(resolve, ms))
 *   new Promise((resolve) => { setTimeout(resolve, ms) })
 *   new Promise(r => setTimeout(r, ms))
 *
 * And suggests using `sleep(ms)` from `@votingworks/basics` instead.
 */

function getSetTimeoutResolveCall(
  body: TSESTree.Node,
  resolveParamName: string
): TSESTree.CallExpression | undefined {
  // Direct expression: (resolve) => setTimeout(resolve, ms)
  if (body.type === AST_NODE_TYPES.CallExpression) {
    return isSetTimeoutResolveCall(body, resolveParamName) ? body : undefined;
  }

  // Block body: (resolve) => { setTimeout(resolve, ms) }
  if (body.type === AST_NODE_TYPES.BlockStatement) {
    if (body.body.length !== 1) return undefined;
    const stmt = body.body[0];
    if (stmt?.type !== AST_NODE_TYPES.ExpressionStatement) return undefined;
    if (stmt.expression.type !== AST_NODE_TYPES.CallExpression)
      return undefined;
    return isSetTimeoutResolveCall(stmt.expression, resolveParamName)
      ? stmt.expression
      : undefined;
  }

  return undefined;
}

function isSetTimeoutResolveCall(
  node: TSESTree.CallExpression,
  resolveParamName: string
): boolean {
  const { callee } = node;

  // Must be `setTimeout`
  if (
    callee.type !== AST_NODE_TYPES.Identifier ||
    callee.name !== 'setTimeout'
  ) {
    return false;
  }

  // Must have exactly 2 args: resolve, duration
  if (node.arguments.length !== 2) return false;

  const [resolveArg] = node.arguments;

  // First arg must be the resolve parameter
  return (
    resolveArg !== undefined &&
    resolveArg.type === AST_NODE_TYPES.Identifier &&
    resolveArg.name === resolveParamName
  );
}

function getResolveParamName(
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression
): string | undefined {
  if (callback.params.length !== 1) return undefined;
  const param = callback.params[0];
  if (param?.type !== AST_NODE_TYPES.Identifier) return undefined;
  return param.name;
}

const rule: TSESLint.RuleModule<
  'manualSleep' | 'useSleep',
  readonly unknown[]
> = createRule({
  name: 'no-manual-sleep',
  meta: {
    docs: {
      description:
        'Disallow manual sleep implementations; use `sleep` from `@votingworks/basics`',
    },
    hasSuggestions: true,
    messages: {
      manualSleep:
        'Use `sleep` from `@votingworks/basics` instead of manually constructing a sleep promise.',
      useSleep: 'Replace with `sleep({{ duration }})`.',
    },
    schema: [],
    type: 'suggestion',
  },
  defaultOptions: [],

  create(context) {
    return {
      NewExpression(node: TSESTree.NewExpression) {
        // Must be `new Promise(...)`
        if (
          node.callee.type !== AST_NODE_TYPES.Identifier ||
          node.callee.name !== 'Promise'
        ) {
          return;
        }

        if (node.arguments.length !== 1) return;
        const callback = node.arguments[0];

        // Callback must be arrow function or function expression
        if (
          callback?.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
          callback?.type !== AST_NODE_TYPES.FunctionExpression
        ) {
          return;
        }

        const resolveParamName = getResolveParamName(callback);
        if (!resolveParamName) return;

        const setTimeoutCall = getSetTimeoutResolveCall(
          callback.body,
          resolveParamName
        );
        if (!setTimeoutCall) return;

        // Safe: isSetTimeoutResolveCall already verified exactly 2 arguments
        const durationArg = setTimeoutCall.arguments[1]!;
        const sourceCode = context.sourceCode;
        const durationText = sourceCode.getText(durationArg);

        context.report({
          node,
          messageId: 'manualSleep',
          suggest: [
            {
              messageId: 'useSleep',
              data: { duration: durationText },
              fix(fixer): TSESLint.RuleFix {
                return fixer.replaceText(node, `sleep(${durationText})`);
              },
            },
          ],
        });
      },
    };
  },
});

export default rule;
