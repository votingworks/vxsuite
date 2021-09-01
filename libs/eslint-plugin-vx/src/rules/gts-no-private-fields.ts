import { ESLintUtils, TSESTree } from '@typescript-eslint/experimental-utils'

function isPrivateIdentifier(node: TSESTree.Node): boolean {
  // @ts-expect-error - typescript-eslint v5 will have support for TSPrivateIdentifier or PrivateIdentifier (https://github.com/typescript-eslint/typescript-eslint/issues/3430#issuecomment-907712769)
  return node.type === 'TSPrivateIdentifier'
}

export default ESLintUtils.RuleCreator(
  () =>
    'https://github.com/votingworks/vxsuite/blob/main/libs/eslint-plugin-vx/docs/rules/gts-no-private.md'
)({
  name: 'gts-no-private',
  meta: {
    docs: {
      description: 'Disallows use of private fields aka private identifiers',
      category: 'Best Practices',
      recommended: 'error',
      suggestion: false,
      requiresTypeChecking: false,
    },
    messages: {
      noPrivateFields: `Do not use private fields; instead, use TypeScript's visibility annotations`,
    },
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
    return {
      ClassProperty(node) {
        if (isPrivateIdentifier(node.key)) {
          context.report({
            node: node.key,
            messageId: 'noPrivateFields',
          })
        }
      },

      MemberExpression(node) {
        if (isPrivateIdentifier(node.property)) {
          context.report({
            node: node.property,
            messageId: 'noPrivateFields',
          })
        }
      },

      MethodDefinition(node) {
        if (isPrivateIdentifier(node.key)) {
          context.report({
            node: node.key,
            messageId: 'noPrivateFields',
          })
        }
      },
    }
  },
})
