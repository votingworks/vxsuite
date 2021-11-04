import { AST_TOKEN_TYPES } from '@typescript-eslint/experimental-utils';
import { createRule } from '../util';

export default createRule({
  name: 'gts-no-jsdoc-override',
  meta: {
    docs: {
      description: 'Disallows JSDoc `@override` directive.',
      category: 'Best Practices',
      recommended: 'error',
      suggestion: false,
      requiresTypeChecking: false,
    },
    fixable: 'code',
    messages: {
      noJSDocOverride:
        'Do not use `@override`; if applicable, use the TypeScript `override` keyword.',
    },
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
    const sourceCode = context.getSourceCode();

    return {
      Program(): void {
        for (const comment of sourceCode.getAllComments()) {
          if (
            comment.type === AST_TOKEN_TYPES.Block &&
            comment.value.includes('@override')
          ) {
            context.report({
              node: comment,
              messageId: 'noJSDocOverride',
            });
          }
        }
      },
    };
  },
});
