import { TSESTree } from '@typescript-eslint/experimental-utils';
import { strict as assert } from 'assert';
import { createRule } from '../util';

export default createRule({
  name: 'gts-no-const-enum',
  meta: {
    docs: {
      description: 'Disallows use of `const enum`; use `enum` instead.',
      category: 'Best Practices',
      recommended: 'error',
      suggestion: false,
      requiresTypeChecking: false,
    },
    messages: {
      noConstEnum: 'Use `enum` instead of `const enum`.',
    },
    fixable: 'code',
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
    const sourceCode = context.getSourceCode();

    return {
      TSEnumDeclaration(node: TSESTree.TSEnumDeclaration): void {
        if (node.const) {
          context.report({
            node,
            messageId: 'noConstEnum',
            fix: (fixer) => {
              const [constToken, enumToken] = sourceCode.getFirstTokens(node, {
                count: 2,
              });
              assert.equal(constToken?.value, 'const');
              assert.equal(enumToken?.value, 'enum');
              return fixer.removeRange([
                constToken.range[0],
                enumToken.range[0],
              ]);
            },
          });
        }
      },
    };
  },
});
