import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { strict as assert } from 'node:assert';
import { createRule } from '../util';

const rule: TSESLint.RuleModule<
  'useShortArrayType' | 'useLongArrayType',
  readonly unknown[]
> = createRule({
  name: 'gts-array-type-style',
  meta: {
    docs: {
      description:
        'Recommends using short form T[] for simple array types (containing only alphanumeric characters and dots). Recommends using long form Array<T> for complex array types.',
      recommended: 'stylistic',
      requiresTypeChecking: false,
    },
    fixable: 'code',
    messages: {
      useShortArrayType: 'Use short form T[] for this simple array type.',
      useLongArrayType: 'Use long form Array<T> for this complex array type.',
    },
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
    const sourceCode = context.getSourceCode();

    function isSimpleType(node: TSESTree.Node) {
      // A simple type contains just alphanumeric characters and dot
      return /^[a-z0-9.]+$/i.test(sourceCode.getText(node));
    }

    return {
      'TSTypeReference[typeName.name=/^(Readonly)?Array$/]': (
        node: TSESTree.TSTypeReference
      ) => {
        if (
          node.typeArguments?.params.length === 1 &&
          isSimpleType(node.typeArguments.params[0])
        ) {
          const elementType = node.typeArguments.params[0];
          context.report({
            messageId: 'useShortArrayType',
            node,
            fix: (fixer) => {
              assert(node.typeName.type === AST_NODE_TYPES.Identifier);
              const readonly =
                node.typeName.name === 'ReadonlyArray' ? 'readonly ' : '';
              return [
                fixer.replaceText(
                  node,
                  `${readonly}${sourceCode.getText(elementType)}[]`
                ),
              ];
            },
          });
        }
      },

      TSArrayType: (node: TSESTree.TSArrayType) => {
        if (!isSimpleType(node.elementType)) {
          context.report({
            messageId: 'useLongArrayType',
            node,
            fix: (fixer) => {
              const text = sourceCode.getText(node);
              assert.equal(text.slice(-2), '[]');
              assert(node.parent);
              if (
                node.parent.type === AST_NODE_TYPES.TSTypeOperator &&
                node.parent.operator === 'readonly'
              ) {
                return [
                  fixer.replaceText(
                    node.parent,
                    `ReadonlyArray<${text.slice(0, -2)}>`
                  ),
                ];
              }

              return [fixer.replaceText(node, `Array<${text.slice(0, -2)}>`)];
            },
          });
        }
      },
    };
  },
});

export default rule;
