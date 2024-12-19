import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { strict as assert } from 'node:assert';
/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
// @ts-ignore -- comment-parser v1.4.0 does not have "types" properties in its "exports" map values
import { parse } from 'comment-parser';
import { createRule } from '../util';

function isJsDocComment(comment: TSESTree.Comment): boolean {
  return (
    comment.type === AST_TOKEN_TYPES.Block && comment.value.startsWith('*')
  );
}

const rule: TSESLint.RuleModule<
  | 'moduleExportRequiresJsDoc'
  | 'noJsDocOverride'
  | 'noJsDocImplements'
  | 'noJsDocExtends'
  | 'noJsDocEnum'
  | 'noJsDocPrivate'
  | 'noJsDocProtected'
  | 'noJsDocType',
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
      moduleExportRequiresJsDoc:
        'Document module exports with JSDoc comments, i.e. /** … */.',
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

    function hasJsDocComment(node: TSESTree.Node): boolean {
      assert(node.parent);
      if (
        node.type === AST_NODE_TYPES.VariableDeclarator &&
        node.parent.type === AST_NODE_TYPES.VariableDeclaration &&
        node.parent.declarations[0] === node
      ) {
        return hasJsDocComment(node.parent);
      }

      if (
        node.parent.type === AST_NODE_TYPES.ExportNamedDeclaration ||
        node.parent.type === AST_NODE_TYPES.ExportDefaultDeclaration
      ) {
        return hasJsDocComment(node.parent);
      }

      const comments = sourceCode.getCommentsBefore(node);
      return comments.some(isJsDocComment);
    }

    function checkHasJsDoc(node: TSESTree.Node): void {
      if (node.type === AST_NODE_TYPES.Identifier) {
        const scope = context.getScope();
        const variable = scope.set.get(node.name);

        if (variable) {
          for (const def of variable.defs) {
            checkHasJsDoc(def.node);
          }
        }
      } else if (!hasJsDocComment(node)) {
        context.report({
          node,
          messageId: 'moduleExportRequiresJsDoc',
        });
      }
    }

    return {
      ExportDefaultDeclaration(node: TSESTree.ExportDefaultDeclaration): void {
        checkHasJsDoc(node.declaration);
      },

      ExportNamedDeclaration(node: TSESTree.ExportNamedDeclaration): void {
        if (node.declaration?.type === AST_NODE_TYPES.VariableDeclaration) {
          for (const declarator of node.declaration.declarations) {
            checkHasJsDoc(declarator);
          }
        } else if (node.declaration) {
          checkHasJsDoc(node.declaration);
        } else {
          for (const specifier of node.specifiers) {
            checkHasJsDoc(specifier.local);
          }
        }
      },

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

export default rule;
