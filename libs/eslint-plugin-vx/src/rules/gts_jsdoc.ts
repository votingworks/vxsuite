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
      noJsDocOverride:
        'Do not use `@override`; if applicable, use the TypeScript `override` keyword.',
      noJsDocImplements:
        'Do not use `@implements`; if applicable, use the TypeScript `implements` keyword.',
      noJsDocExtends:
        'Do not use `@extends`; if applicable, use the TypeScript `extends` keyword.',
      noJsDocEnum:
        'Do not use `@enum`; if applicable, use the TypeScript `enum` keyword.',
      noJsDocPrivate:
        'Do not use `@private`; if applicable, use the TypeScript `private` keyword.',
      noJsDocProtected:
        'Do not use `@protected`; if applicable, use the TypeScript `protected` keyword.',
      noJsDocType: 'Do not duplicate types in `{{tag}}` tag.',
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
                    messageId: 'noJsDocOverride',
                  });
                  break;

                case 'extends':
                  context.report({
                    node: comment,
                    messageId: 'noJsDocExtends',
                  });
                  break;

                case 'implements':
                  context.report({
                    node: comment,
                    messageId: 'noJsDocImplements',
                  });
                  break;

                case 'enum':
                  context.report({
                    node: comment,
                    messageId: 'noJsDocEnum',
                  });
                  break;

                case 'private':
                  context.report({
                    node: comment,
                    messageId: 'noJsDocPrivate',
                  });
                  break;

                case 'protected':
                  context.report({
                    node: comment,
                    messageId: 'noJsDocProtected',
                  });
                  break;

                default:
                  // nothing to do
                  break;
              }

              if (tag.type && tag.tag !== 'see') {
                context.report({
                  node: comment,
                  messageId: 'noJsDocType',
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
