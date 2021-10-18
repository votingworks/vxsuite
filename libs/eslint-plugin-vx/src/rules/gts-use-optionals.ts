import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/experimental-utils'
import { createRule, isBindingName } from '../util'

function isOptionalType(node: TSESTree.TypeNode): boolean {
  if (node.type === AST_NODE_TYPES.TSUnionType) {
    return node.types.some(
      (elementType) =>
        elementType.type === AST_NODE_TYPES.TSUndefinedKeyword ||
        isOptionalType(elementType)
    )
  }

  if (node.type === AST_NODE_TYPES.TSTypeReference) {
    return (
      node.typeName.type === AST_NODE_TYPES.Identifier &&
      node.typeName.name === 'Optional'
    )
  }

  return false
}

export default createRule({
  name: 'gts-use-optionals',
  meta: {
    docs: {
      description:
        'Use optional fields (on interfaces or classes) and parameters rather than a |undefined type.',
      category: 'Best Practices',
      recommended: 'error',
      suggestion: false,
      requiresTypeChecking: false,
    },
    messages: {
      useOptionalInterfaceProperties: `Use optional properties on interfaces rather than a |undefined type`,
      useOptionalClassFields: `Use optional fields on classes rather than a |undefined type`,
      useOptionalParams: `Use optional params rather than a |undefined type`,
    },
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
    function checkFunction(node: {
      params: readonly TSESTree.Parameter[]
    }): void {
      const possibleViolations = node.params.map((param) => {
        if (
          isBindingName(param) &&
          param.typeAnnotation &&
          isOptionalType(param.typeAnnotation.typeAnnotation)
        ) {
          return param
        }

        if (
          param.type === AST_NODE_TYPES.AssignmentPattern &&
          param.left.typeAnnotation &&
          isOptionalType(param.left.typeAnnotation.typeAnnotation)
        ) {
          return param
        }

        return undefined
      })

      let indexOfLastNonOptionalParam = -1
      for (const [i, param] of node.params.entries()) {
        if (isBindingName(param) && !param.optional) {
          indexOfLastNonOptionalParam = i
        }
      }

      for (const [i, param] of possibleViolations.entries()) {
        if (
          // do not report params that come before non-optional params
          i < indexOfLastNonOptionalParam ||
          !param
        ) {
          continue
        }

        context.report({
          messageId: 'useOptionalParams',
          node: param,
        })
      }
    }

    return {
      ClassProperty(node: TSESTree.ClassProperty): void {
        if (
          node.typeAnnotation &&
          isOptionalType(node.typeAnnotation.typeAnnotation)
        ) {
          context.report({
            messageId: 'useOptionalClassFields',
            node,
          })
        }
      },

      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction,
      TSFunctionType: checkFunction,
      TSMethodSignature: checkFunction,

      TSParameterProperty(node: TSESTree.TSParameterProperty): void {
        if (
          node.parameter.typeAnnotation &&
          isOptionalType(node.parameter.typeAnnotation.typeAnnotation)
        ) {
          context.report({
            messageId: 'useOptionalClassFields',
            node,
          })
        }
      },

      TSPropertySignature(node: TSESTree.TSPropertySignature): void {
        if (
          node.typeAnnotation &&
          isOptionalType(node.typeAnnotation.typeAnnotation)
        ) {
          context.report({
            messageId: 'useOptionalInterfaceProperties',
            node,
          })
        }
      },
    }
  },
})
