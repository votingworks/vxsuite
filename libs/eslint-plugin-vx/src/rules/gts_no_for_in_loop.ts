import { TSESTree } from '@typescript-eslint/experimental-utils';
import { strict as assert } from 'assert';
import { createRule } from '../util';

export default createRule({
  name: 'gts-no-for-in-loop',
  meta: {
    docs: {
      description: 'Disallows use of `for-in` loops',
      recommended: 'error',
      suggestion: false,
      requiresTypeChecking: false,
    },
    fixable: 'code',
    messages: {
      noForInLoop:
        'Do not use `for-in`; use `for-of` with `Object.keys` or `Object.entries`',
    },
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
    const sourceCode = context.getSourceCode();
    return {
      ForInStatement: (node: TSESTree.ForInStatement) => {
        context.report({
          node,
          messageId: 'noForInLoop',
          fix: (fixer) => {
            const inToken = sourceCode.getFirstTokenBetween(
              node.left,
              node.right
            );
            assert(inToken && inToken.value === 'in');

            return [
              fixer.replaceTextRange(
                [inToken.range[0], node.right.range[0]],
                'of Object.keys('
              ),
              fixer.insertTextAfter(node.right, ')'),
            ];
          },
        });
      },
    };
  },
});
