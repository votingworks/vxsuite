import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../util';

const rule: TSESLint.RuleModule<'noExpectToBe', readonly unknown[]> =
  createRule({
    name: 'no-expect-to-be',
    meta: {
      docs: {
        description: 'Use `toEqual` rather than `toBe` in assertions.',
        recommended: 'strict',
        requiresTypeChecking: false,
      },
      fixable: 'code',
      messages: {
        noExpectToBe: 'Use `toEqual` rather than `toBe` in assertions.',
      },
      schema: [],
      type: 'problem',
    },
    defaultOptions: [],

    create(context) {
      return {
        MemberExpression(node: TSESTree.MemberExpression) {
          if (
            !node.computed &&
            node.property.type === AST_NODE_TYPES.Identifier &&
            node.property.name === 'toBe' &&
            node.object.type === AST_NODE_TYPES.CallExpression &&
            node.object.callee.type === AST_NODE_TYPES.Identifier &&
            node.object.callee.name === 'expect'
          ) {
            context.report({
              node: node.property,
              messageId: 'noExpectToBe',
              fix: (fixer) => {
                return fixer.replaceTextRange(node.property.range, 'toEqual');
              },
            });
          }
        },
      };
    },
  });

export default rule;
