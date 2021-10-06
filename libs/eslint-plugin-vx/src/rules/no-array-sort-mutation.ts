import {
  AST_NODE_TYPES,
  ESLintUtils,
  TSESTree,
} from '@typescript-eslint/experimental-utils'
import { createRule } from '../util'

function isDirectAccess(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return true
  }

  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return isDirectAccess(node.object)
  }

  return false
}

export default createRule({
  name: 'no-array-sort-mutation',
  meta: {
    docs: {
      description: 'Requires `sort` be called on array copies',
      category: 'Best Practices',
      recommended: 'error',
      suggestion: false,
      requiresTypeChecking: false,
    },
    messages: {
      badSort: '`sort` modifies its array; please make a copy first',
    },
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
    return {
      CallExpression({ callee }: TSESTree.CallExpression) {
        if (
          callee.type !== AST_NODE_TYPES.MemberExpression ||
          callee.property.type !== AST_NODE_TYPES.Identifier ||
          callee.property.name !== 'sort'
        ) {
          return
        }

        if (isDirectAccess(callee.object)) {
          context.report({
            node: callee.property,
            messageId: 'badSort',
          })
        }
      },
    }
  },
})
