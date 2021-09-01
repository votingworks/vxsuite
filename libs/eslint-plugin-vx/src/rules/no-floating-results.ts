import {
  AST_NODE_TYPES,
  ESLintUtils,
  ParserServices,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/experimental-utils'
import type * as ts from 'typescript'

interface Options {
  ignoreVoid?: boolean
}

function isResultType(checker: ts.TypeChecker, node: ts.Node): boolean {
  // TODO: consider the actual declaration location?
  const type = checker.getTypeAtLocation(node)
  // FIXME: I'm unsure why I need both of these.
  return (
    type.getSymbol()?.getName() === 'Result' ||
    type.aliasSymbol?.getName() === 'Result'
  )
}

function isUnhandledResult(
  checker: ts.TypeChecker,
  parserServices: ParserServices,
  options: Options,
  node: TSESTree.Node
): boolean {
  if (node.type === AST_NODE_TYPES.SequenceExpression) {
    // Any child in a comma expression could return a potentially unhandled
    // Result, so we check them all regardless of whether the final returned
    // value is a Result.
    return node.expressions.some((item) =>
      isUnhandledResult(checker, parserServices, options, item)
    )
  }

  if (node.type === AST_NODE_TYPES.AssignmentExpression) {
    return false
  }

  if (
    !options.ignoreVoid &&
    node.type === AST_NODE_TYPES.UnaryExpression &&
    node.operator === 'void'
  ) {
    // Similarly, a `void` expression always returns undefined, so we need to
    // see what's inside it without checking the type of the overall expression.
    return isUnhandledResult(checker, parserServices, options, node.argument)
  }

  // Check the type. At this point it can't be unhandled if it isn't a Result
  return isResultType(checker, parserServices.esTreeNodeToTSNodeMap.get(node))
}

export default ESLintUtils.RuleCreator(
  () =>
    'https://github.com/votingworks/vxsuite/blob/main/libs/eslint-plugin-vx/docs/rules/no-floating-results.md'
)({
  name: 'no-floating-results',
  meta: {
    docs: {
      description: 'Requires `Result` values to be handled appropriately',
      category: 'Best Practices',
      recommended: 'error',
      suggestion: true,
      requiresTypeChecking: true,
    },
    messages: {
      floating: 'Results must be handled appropriately.',
      floatingVoid:
        'Results must be handled appropriately' +
        ' or explicitly marked as ignored with the `void` operator.',
      floatingFixVoid: 'Add void operator to ignore.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          ignoreVoid: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
    type: 'problem',
  },
  defaultOptions: [
    {
      ignoreVoid: true,
    },
  ],

  create(context, [options]) {
    const parserServices = ESLintUtils.getParserServices(context)
    const checker = parserServices.program.getTypeChecker()
    const sourceCode = context.getSourceCode()

    return {
      ExpressionStatement(node): void {
        if (
          isUnhandledResult(checker, parserServices, options, node.expression)
        ) {
          if (options.ignoreVoid) {
            context.report({
              node,
              messageId: 'floatingVoid',
              suggest: [
                {
                  messageId: 'floatingFixVoid',
                  fix(fixer): TSESLint.RuleFix {
                    let code = sourceCode.getText(node)
                    code = `void ${code}`
                    return fixer.replaceText(node, code)
                  },
                },
              ],
            })
          } else {
            context.report({
              node,
              messageId: 'floating',
            })
          }
        }
      },
    }
  },
})
