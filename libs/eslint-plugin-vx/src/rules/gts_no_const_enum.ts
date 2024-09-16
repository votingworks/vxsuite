import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { strict as assert } from 'node:assert';
import { createRule } from '../util';

const rule: TSESLint.RuleModule<'noConstEnum', readonly unknown[]> = createRule(
  {
    name: 'gts-no-const-enum',
    meta: {
      docs: {
        description: 'Disallows use of `const enum`; use `enum` instead.',
        recommended: 'strict',
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
                const [constToken, enumToken] = sourceCode.getFirstTokens(
                  node,
                  {
                    count: 2,
                  }
                );
                assert(constToken && constToken.value === 'const');
                assert(enumToken && enumToken.value === 'enum');
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
  }
);

export default rule;
