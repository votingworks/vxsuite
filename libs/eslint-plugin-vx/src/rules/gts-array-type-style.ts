import { TSESTree } from '@typescript-eslint/experimental-utils'
import assert from 'assert'
import { createRule } from '../util'

export default createRule({
  name: 'gts-array-type-style',
  meta: {
    docs: {
      description:
        'Recommends using short form T[] for simple array types (containing only alphanumeric characters and dots). Recommends using long form Array<T> for complex array types.',
      category: 'Best Practices',
      recommended: 'error',
      suggestion: false,
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
    const sourceCode = context.getSourceCode()

    function isSimpleType(node: TSESTree.Node) {
      // A simple type contains just alphanumeric characters and dot
      return /^[a-z0-9.]+$/i.test(sourceCode.getText(node))
    }

    return {
      'TSTypeAnnotation > TSTypeReference.typeAnnotation[typeName.name=Array]':
        (node: TSESTree.TSTypeReference) => {
          if (
            node.typeParameters?.params.length === 1 &&
            isSimpleType(node.typeParameters.params[0])
          ) {
            const elementType = node.typeParameters.params[0]
            context.report({
              messageId: 'useShortArrayType',
              node,
              fix: (fixer) => [
                fixer.replaceText(node, `${sourceCode.getText(elementType)}[]`),
              ],
            })
          }
        },
      'TSTypeAnnotation > TSTypeReference.typeAnnotation[typeName.name=ReadonlyArray]':
        (node: TSESTree.TSTypeReference) => {
          if (
            node.typeParameters?.params.length === 1 &&
            isSimpleType(node.typeParameters.params[0])
          ) {
            const elementType = node.typeParameters.params[0]
            context.report({
              messageId: 'useShortArrayType',
              node,
              fix: (fixer) => [
                fixer.replaceText(
                  node,
                  `readonly ${sourceCode.getText(elementType)}[]`
                ),
              ],
            })
          }
        },
      'TSTypeAnnotation > TSArrayType': (node: TSESTree.TSArrayType) => {
        if (!isSimpleType(node.elementType))
          context.report({
            messageId: 'useLongArrayType',
            node,
            fix: (fixer) => {
              const text = sourceCode.getText(node)
              assert(text.slice(-2) === '[]')
              return [fixer.replaceText(node, `Array<${text.slice(0, -2)}>`)]
            },
          })
      },
      'TSTypeAnnotation > TSTypeOperator[operator="readonly"] > TSArrayType.typeAnnotation':
        (node: TSESTree.TSArrayType) => {
          if (!isSimpleType(node.elementType))
            context.report({
              messageId: 'useLongArrayType',
              node,
              fix: (fixer) => {
                assert(node.parent)
                const text = sourceCode.getText(node)
                assert(text.slice(-2) === '[]')
                return [
                  fixer.replaceText(
                    node.parent,
                    `ReadonlyArray<${text.slice(0, -2)}>`
                  ),
                ]
              },
            })
        },
    }
  },
})
