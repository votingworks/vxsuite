import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { strict as assert } from 'node:assert';
import { createRule } from '../util';

const rule: TSESLint.RuleModule<
  | 'noObjectLiteralTypeAssertions'
  | 'useTypeAnnotation'
  | 'convertToTypeAnnotation'
  | 'useTypedAs'
  | 'removeTypeAssertion'
  | 'castToUnknownFirst',
  readonly unknown[]
> = createRule({
  name: 'gts-object-literal-types',
  meta: {
    hasSuggestions: true,
    docs: {
      description:
        'Requires type annotations instead of type assertions on object literals',
      recommended: 'strict',
      requiresTypeChecking: false,
    },
    messages: {
      noObjectLiteralTypeAssertions:
        'Do not use type assertions on object literals; prefer type annotations instead',
      useTypeAnnotation:
        'Type literal must be declared with a type annotation or `as const`.',
      convertToTypeAnnotation: 'Convert to type annotation',
      useTypedAs: 'Use `typedAs` helper for an inline type annotation',
      removeTypeAssertion: 'Remove type assertion',
      castToUnknownFirst: 'Cast to `unknown` first',
    },
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
    const sourceCode = context.getSourceCode();

    type ReportSuggestionArray = Exclude<
      Parameters<(typeof context)['report']>[0]['suggest'],
      undefined | null
    >;
    type MutableReportSuggestionArray =
      ReportSuggestionArray extends ReadonlyArray<infer T> ? T[] : never;

    return {
      VariableDeclarator(node: TSESTree.VariableDeclarator): void {
        if (
          node.id.type !== AST_NODE_TYPES.Identifier ||
          node.id.typeAnnotation
        ) {
          return;
        }

        if (node.init?.type === AST_NODE_TYPES.ObjectExpression) {
          context.report({
            node,
            messageId: 'useTypeAnnotation',
          });
        }
      },

      TSAsExpression(node: TSESTree.TSAsExpression): void {
        if (
          node.expression.type !== AST_NODE_TYPES.ObjectExpression ||
          node.typeAnnotation.type === AST_NODE_TYPES.TSUnknownKeyword ||
          (node.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference &&
            node.typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier &&
            node.typeAnnotation.typeName.name === 'const')
        ) {
          return;
        }

        const { parent } = node;
        assert(parent);
        const typeAnnotationSourceCode = sourceCode.getText(
          node.typeAnnotation
        );

        const suggest: MutableReportSuggestionArray = [];

        if (
          parent.type === AST_NODE_TYPES.VariableDeclarator &&
          parent.init === node &&
          !parent.id.typeAnnotation
        ) {
          suggest.push({
            messageId: 'convertToTypeAnnotation',
            fix: (fixer) => [
              fixer.removeRange([node.expression.range[1], node.range[1]]),
              fixer.insertTextAfter(parent.id, `: ${typeAnnotationSourceCode}`),
            ],
          });
        }

        suggest.push(
          {
            messageId: 'useTypedAs',
            fix: (fixer) => [
              fixer.insertTextBefore(
                node.expression,
                `typedAs<${typeAnnotationSourceCode}>(`
              ),
              fixer.replaceTextRange(
                [node.expression.range[1], node.range[1]],
                ')'
              ),
            ],
          },
          {
            messageId: 'removeTypeAssertion',
            fix: (fixer) =>
              fixer.removeRange([node.expression.range[1], node.range[1]]),
          },
          {
            messageId: 'castToUnknownFirst',
            fix: (fixer) =>
              fixer.insertTextBefore(node.typeAnnotation, 'unknown as '),
          }
        );

        context.report({
          messageId: 'noObjectLiteralTypeAssertions',
          node,
          suggest,
        });
      },
    };
  },
});

export default rule;
