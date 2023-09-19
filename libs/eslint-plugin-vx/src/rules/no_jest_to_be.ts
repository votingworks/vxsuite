import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../util';

const rule: TSESLint.RuleModule<'noJestToBe', readonly unknown[]> = createRule({
  name: 'no-jest-to-be',
  meta: {
    docs: {
      description: 'Use `toEqual` rather than `toBe` in jest assertions.',
      recommended: 'strict',
      requiresTypeChecking: false,
    },
    fixable: 'code',
    messages: {
      noJestToBe: 'Use `toEqual` rather than `toBe` in jest assertions.',
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
            messageId: 'noJestToBe',
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
