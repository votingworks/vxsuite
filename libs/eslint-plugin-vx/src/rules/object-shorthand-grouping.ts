import {
  AST_NODE_TYPES,
  ESLintUtils,
} from '@typescript-eslint/experimental-utils'

export default ESLintUtils.RuleCreator(
  () =>
    'https://github.com/votingworks/vxsuite/blob/main/libs/eslint-plugin-vx/docs/rules/object-shorthand-grouping.md'
)({
  name: 'object-shorthand-grouping',
  meta: {
    docs: {
      description:
        'Group your shorthand properties at the beginning of your object declaration',
      category: 'Best Practices',
      recommended: 'error',
      suggestion: true,
      requiresTypeChecking: false,
    },
    messages: {
      groupProperty:
        'Shorthand properties must be grouped at the beginning of the object',
    },
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
    return {
      ObjectExpression(node): void {
        if (node.properties.length === 0) {
          return
        }

        let hasSeenNonShorthand = false

        for (const property of node.properties) {
          if (property.type === AST_NODE_TYPES.Property) {
            if (property.shorthand) {
              if (hasSeenNonShorthand) {
                context.report({
                  node: property,
                  messageId: 'groupProperty',
                })
              }
            } else {
              hasSeenNonShorthand = true
            }
          }
        }
      },
    }
  },
})
