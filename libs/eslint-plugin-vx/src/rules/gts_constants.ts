import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { strict as assert } from 'node:assert';
import { createRule } from '../util';

const rule: TSESLint.RuleModule<
  'useConstVariableDeclaration',
  readonly unknown[]
> = createRule({
  name: 'gts-jsdoc',
  meta: {
    docs: {
      description: 'Enforces GTS JSDoc rules.',
      recommended: 'stylistic',
      requiresTypeChecking: false,
    },
    fixable: 'code',
    messages: {
      useConstVariableDeclaration:
        '`CONSTANT_CASE` variables must be declared `const`',
    },
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
    return {
      VariableDeclarator(node: TSESTree.VariableDeclarator): void {
        /* istanbul ignore next - here for TS type narrowing */
        assert(node.parent?.type === AST_NODE_TYPES.VariableDeclaration);
        if (
          node.id.type === AST_NODE_TYPES.Identifier &&
          /^[A-Z_\d]+$/.test(node.id.name) &&
          node.parent.kind !== 'const'
        ) {
          context.report({
            node: node.id,
            messageId: 'useConstVariableDeclaration',
          });
        }
      },
    };
  },
});

export default rule;
