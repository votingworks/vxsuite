import {
  AST_NODE_TYPES,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../util/index.ts';

const rule: TSESLint.RuleModule<
  'useSafeParseNumber' | 'useSafeParseInteger',
  readonly unknown[]
> = createRule({
  name: 'gts-safe-number-parse',
  meta: {
    docs: {
      description: 'Requires using a safe number parser',
    },
    messages: {
      useSafeParseNumber: 'Use `safeParseNumber` to parse numbers.',
      useSafeParseInteger: 'Use `safeParseInteger` to parse integers.',
    },
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
    function checkCall(
      node: TSESTree.CallExpression | TSESTree.NewExpression
    ): void {
      if (
        node.callee.type === AST_NODE_TYPES.Identifier &&
        node.callee.name === 'parseInt' &&
        (node.arguments.length < 2 ||
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          (node.arguments[1]!.type === AST_NODE_TYPES.Literal &&
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            node.arguments[1]!.value === 10))
      ) {
        context.report({
          node,
          messageId: 'useSafeParseInteger',
        });
      } else if (
        node.callee.type === AST_NODE_TYPES.Identifier &&
        node.callee.name === 'parseFloat' &&
        node.arguments.length < 2
      ) {
        context.report({
          node,
          messageId: 'useSafeParseNumber',
        });
      } else if (
        node.callee.type === AST_NODE_TYPES.Identifier &&
        node.callee.name === 'Number'
      ) {
        context.report({
          node,
          messageId: 'useSafeParseNumber',
        });
      }
    }

    return {
      CallExpression: checkCall,
      NewExpression: checkCall,

      UnaryExpression(node: TSESTree.UnaryExpression): void {
        // @coverage-defer
        if (node.operator === '+') {
          context.report({
            node,
            messageId: 'useSafeParseNumber',
          });
        }
      },
    };
  },
});

export default rule;
