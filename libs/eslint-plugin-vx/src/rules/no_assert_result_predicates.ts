import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../util';

type MessageId = 'noAssertResultPredicates' | 'noExpectResultPredicates';

const rule: TSESLint.RuleModule<MessageId, readonly unknown[]> = createRule({
  name: 'gts-no-assert-result-predicates',
  meta: {
    docs: {
      description:
        'Do not use assert on `Result` predicates like `isErr` and `isOk`',
      recommended: 'recommended',
    },
    fixable: 'code',
    messages: {
      noAssertResultPredicates:
        'Do not use assert `Result` predicates like `isErr` and `isOk`. Consider using `unsafeUnwrap` instead.',
      noExpectResultPredicates:
        'Do not call `expect` on `Result` predicates like `isErr` and `isOk`. Consider calling `expect(…).toEqual(ok(…))` instead.',
    },
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
    function checkCallExpression(
      node: TSESTree.CallExpression,
      reportNode: TSESTree.Node,
      messageId: MessageId
    ) {
      if (
        node.callee.type === AST_NODE_TYPES.MemberExpression &&
        node.callee.property.type === AST_NODE_TYPES.Identifier &&
        ['isErr', 'isOk'].includes(node.callee.property.name)
      ) {
        context.report({
          messageId,
          node: reportNode,
        });
      }
    }

    return {
      CallExpression(node) {
        if (
          // assert(result.isOk());
          (node.callee.type === AST_NODE_TYPES.Identifier &&
            node.callee.name === 'assert' &&
            node.arguments.length === 1) ||
          // assert.ok(result.isOk());
          (node.callee.type === AST_NODE_TYPES.MemberExpression &&
            node.callee.property.type === AST_NODE_TYPES.Identifier &&
            node.callee.object.type === AST_NODE_TYPES.Identifier &&
            node.callee.object.name === 'assert' &&
            node.callee.property.name === 'ok' &&
            node.arguments.length === 1)
        ) {
          const arg = node.arguments[0];
          if (arg.type === AST_NODE_TYPES.CallExpression) {
            checkCallExpression(arg, node, 'noAssertResultPredicates');
          }

          // assert(!result.isOk());
          if (arg.type === AST_NODE_TYPES.UnaryExpression) {
            if (
              arg.operator === '!' &&
              arg.argument.type === AST_NODE_TYPES.CallExpression
            ) {
              checkCallExpression(
                arg.argument,
                node,
                'noAssertResultPredicates'
              );
            }
          }
        }

        // expect(result.isOk()).toBe(true);
        if (
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.property.type === AST_NODE_TYPES.Identifier &&
          /^to[A-Z]/.test(node.callee.property.name) &&
          node.arguments.length === 1 &&
          node.callee.object.type === AST_NODE_TYPES.CallExpression &&
          node.callee.object.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.object.callee.name === 'expect' &&
          node.callee.object.arguments.length === 1
        ) {
          const arg = node.callee.object.arguments[0];
          if (arg.type === AST_NODE_TYPES.CallExpression) {
            checkCallExpression(arg, node, 'noExpectResultPredicates');
          }

          // expect(!result.isOk()).toBe(true);
          if (arg.type === AST_NODE_TYPES.UnaryExpression) {
            if (
              arg.operator === '!' &&
              arg.argument.type === AST_NODE_TYPES.CallExpression
            ) {
              checkCallExpression(
                arg.argument,
                node,
                'noExpectResultPredicates'
              );
            }
          }
        }
      },
    };
  },
});

export default rule;
