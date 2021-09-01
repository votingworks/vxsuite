import {
  AST_NODE_TYPES,
  ESLintUtils,
  TSESTree,
} from '@typescript-eslint/experimental-utils'

export default ESLintUtils.RuleCreator(
  () =>
    'https://github.com/votingworks/vxsuite/blob/main/libs/eslint-plugin-vx/docs/rules/use-array-from-with-map.md'
)({
  name: 'use-array-from-with-map',
  meta: {
    docs: {
      description:
        'Use `Array.from` instead of spread `...` for mapping over iterables',
      category: 'Best Practices',
      recommended: 'error',
      suggestion: false,
      requiresTypeChecking: false,
    },
    messages: {
      useArrayFrom:
        'Use `Array.from` instead of spread `...` for mapping over iterables',
    },
    schema: [],
    type: 'problem',
    fixable: 'code',
  },
  defaultOptions: [],

  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node
        if (
          callee.type === AST_NODE_TYPES.MemberExpression &&
          callee.property.type === AST_NODE_TYPES.Identifier &&
          !callee.computed &&
          callee.property.name === 'map' &&
          node.arguments.length === 1 &&
          callee.object.type === AST_NODE_TYPES.ArrayExpression &&
          callee.object.elements.length === 1 &&
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore - AST_NODE_TYPES.SpreadElement should be allowed here, but the types think it isn't
          callee.object.elements[0].type === AST_NODE_TYPES.SpreadElement
        ) {
          const sourceCode = context.getSourceCode()
          const array = callee.object
          const map = callee.property
          const spreadElement = array
            .elements[0] as unknown as TSESTree.SpreadElement
          context.report({
            node: callee,
            messageId: 'useArrayFrom',
            fix: (fixer) => [
              // `[...a].map(b)` → `Array.from(...a].map(b)`
              //  ^                 ^^^^^^^^^^^
              fixer.replaceTextRange(
                sourceCode.getFirstToken(callee).range,
                'Array.from('
              ),
              // `Array.from(...a].map(b)` → `Array.from(a].map(b)`
              //             ^^^
              fixer.removeRange(sourceCode.getFirstToken(spreadElement).range),
              // remove trailing comma after spread element if present
              sourceCode.getFirstTokensBetween(spreadElement, map, 1)[0]
                ?.value === ','
                ? fixer.removeRange(
                    sourceCode.getFirstTokenBetween(spreadElement, map).range
                  )
                : fixer.removeRange([
                    spreadElement.range[1],
                    spreadElement.range[1],
                  ]),
              // `Array.from(...a].map(b)` → `Array.from(a.map(b)`
              //                 ^
              fixer.removeRange(sourceCode.getLastToken(array).range),
              // `Array.from(a.map(b)` → `Array.from(a, map(b)`
              //              ^                       ^^
              fixer.replaceTextRange(
                sourceCode.getFirstTokenBetween(array, map).range,
                ', '
              ),
              // `Array.from(a, map(b)` → `Array.from(a, (b)`
              //                ^^^
              fixer.removeRange(map.range),
              // `Array.from(a, (b)` → `Array.from(a, b)`
              //                ^
              fixer.removeRange(
                sourceCode.getFirstTokenBetween(map, node.arguments[0]).range
              ),
            ],
          })
        }
      },
    }
  },
})
