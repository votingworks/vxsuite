import {
  AST_NODE_TYPES,
  ESLintUtils,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/experimental-utils'
import type * as ts from 'typescript'

export default ESLintUtils.RuleCreator(() => 'https://voting.works/')({
  name: 'no-floating-results',
  meta: {
    docs: {
      description: 'Requires Result values to be handled appropriately',
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
        if (isUnhandledResult(checker, node.expression)) {
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

    function isUnhandledResult(
      checker: ts.TypeChecker,
      node: TSESTree.Node
    ): boolean {
      if (node.type === AST_NODE_TYPES.SequenceExpression) {
        // Any child in a comma expression could return a potentially unhandled
        // Result, so we check them all regardless of whether the final returned
        // value is a Result.
        return node.expressions.some((item) => isUnhandledResult(checker, item))
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
        return isUnhandledResult(checker, node.argument)
      }

      // Check the type. At this point it can't be unhandled if it isn't a Result
      return isResultType(
        checker,
        parserServices.esTreeNodeToTSNodeMap.get(node)
      )
    }

    function isResultType(checker: ts.TypeChecker, node: ts.Node): boolean {
      // TODO: consider the actual declaration location?
      const type = checker.getTypeAtLocation(node)
      return type.aliasSymbol?.getName() === 'Result'
    }
  },
})
