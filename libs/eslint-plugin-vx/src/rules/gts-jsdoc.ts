import { AST_TOKEN_TYPES } from '@typescript-eslint/experimental-utils';
import { parse } from 'comment-parser';
import { createRule } from '../util';

export default createRule({
  name: 'gts-jsdoc',
  meta: {
    docs: {
      description: 'Enforces GTS JSDoc rules.',
      category: 'Best Practices',
      recommended: 'error',
      suggestion: false,
      requiresTypeChecking: false,
    },
    fixable: 'code',
    messages: {
      noJSDocOverride:
        'Do not use `@override`; if applicable, use the TypeScript `override` keyword.',
      noJSDocImplements:
        'Do not use `@implements`; if applicable, use the TypeScript `implements` keyword.',
      noJSDocExtends:
        'Do not use `@extends`; if applicable, use the TypeScript `extends` keyword.',
      noJSDocEnum:
        'Do not use `@enum`; if applicable, use the TypeScript `enum` keyword.',
      noJSDocPrivate:
        'Do not use `@private`; if applicable, use the TypeScript `private` keyword.',
      noJSDocProtected:
        'Do not use `@protected`; if applicable, use the TypeScript `protected` keyword.',
      noJSDocType: 'Do not duplicate types in `{{tag}}` tag.',
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
          if (comment.type === AST_TOKEN_TYPES.Line) {
            continue;
          }

          for (const block of parse(
            sourceCode.getText().slice(...comment.range)
          )) {
            for (const tag of block.tags) {
              switch (tag.tag) {
                case 'override':
                  context.report({
                    node: comment,
                    messageId: 'noJSDocOverride',
                  });
                  break;

                case 'extends':
                  context.report({
                    node: comment,
                    messageId: 'noJSDocExtends',
                  });
                  break;

                case 'implements':
                  context.report({
                    node: comment,
                    messageId: 'noJSDocImplements',
                  });
                  break;

                case 'enum':
                  context.report({
                    node: comment,
                    messageId: 'noJSDocEnum',
                  });
                  break;

                case 'private':
                  context.report({
                    node: comment,
                    messageId: 'noJSDocPrivate',
                  });
                  break;

                case 'protected':
                  context.report({
                    node: comment,
                    messageId: 'noJSDocProtected',
                  });
                  break;

                default:
                  // nothing to do
                  break;
              }

              if (tag.type && tag.tag !== 'see') {
                context.report({
                  node: comment,
                  messageId: 'noJSDocType',
                  data: { tag: `@${tag.tag}` },
                });
              }
            }
          }
        }
      },
    };
  },
});
