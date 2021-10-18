import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/experimental-utils'
import { strict as assert } from 'assert'
import { createRule } from '../util'

export default createRule({
  name: 'gts-no-for-in-loop',
  meta: {
    docs: {
      description: 'Disallows use of `for-in` loops',
      category: 'Best Practices',
      recommended: 'error',
      suggestion: false,
      requiresTypeChecking: false,
    },
    fixable: 'code',
    messages: {
      noForInLoop:
        'Do not use `for-in`; use `for-of` with `Object.keys` or `Object.entries`',
    },
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
    const sourceCode = context.getSourceCode()

    function identifierName(node: TSESTree.Node) {
      return node.type === AST_NODE_TYPES.Identifier ? node.name : null
    }

    function getHasOwnPropertyGuard(node: TSESTree.ForInStatement) {
      const { body } = node
      assert(body.type === AST_NODE_TYPES.BlockStatement)
      const [guard] = body.body
      // for (const k in o)
      if (
        (guard.type === AST_NODE_TYPES.IfStatement &&
          guard.test.type === AST_NODE_TYPES.CallExpression &&
          guard.test.callee.type === AST_NODE_TYPES.MemberExpression &&
          guard.test.callee.property.type === AST_NODE_TYPES.Identifier &&
          guard.test.callee.property.name === 'hasOwnProperty' &&
          guard.test.arguments.length === 2 &&
          identifierName(guard.test.arguments[0]) &&
          identifierName(guard.test.arguments[0]) ===
            identifierName(node.right),
        guard.test.arguments[0].type === AST_NODE_TYPES.Identifier &&
          guard.test.arguments[0].name === node.right.name &&
          node.left.type === AST_NODE_TYPES.VariableDeclaration &&
          guard.test.arguments[1].type === AST_NODE_TYPES.Identifier &&
          guard.test.arguments[1].name === node.left.name)
      )
        return guard
      return null
    }

    return {
      ForInStatement: (node: TSESTree.ForInStatement) => {
        // const { body } = node
        // assert(body.type === AST_NODE_TYPES.BlockStatement)
        // const [firstStatement] = body.body
        // if (firstStatement.type === 'IfStatement' &&

        // )

        context.report({
          node,
          messageId: 'noForInLoop',
          fix: (fixer) => {
            const inToken = sourceCode.getFirstTokenBetween(
              node.left,
              node.right
            )
            assert(inToken?.value === 'in')
            return [
              fixer.replaceTextRange(
                [inToken.range[0], node.right.range[0]],
                'of Object.keys('
              ),
              fixer.insertTextAfter(node.right, ')'),
            ]
          },
        })
      },
      // // '> CallExpression.test > MemberExpression.callee > Identifier[name=hasOwnProperty]':
      // // .callee > MemberExpression[name=hasOwnProperty]':
      // ['ForInStatement > BlockStatement > IfStatement' +
      // '[test.type="CallExpression"]' +
      // '[test.callee.type="MemberExpression"]' +
      // '[test.callee.property.name="hasOwnProperty"]']: (
      //   node: TSESTree.IfStatement
      // ) => {
      //   console.log(node)
      // },
    }
  },
})
