import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/experimental-utils'
import { strict as assert } from 'assert'
import { createRule } from '../util'
import { Node } from 'typescript'
import { RuleFixer } from '@typescript-eslint/experimental-utils/dist/ts-eslint'

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

    function areEqualIdentifiers(node1?: TSESTree.Node, node2?: TSESTree.Node) {
      return (
        node1?.type === AST_NODE_TYPES.Identifier &&
        node2?.type === AST_NODE_TYPES.Identifier &&
        node1.name === node2.name
      )
    }

    function removeHasOwnPropertyGuard(
      node: TSESTree.ForInStatement,
      fixer: RuleFixer
    ) {
      const { body } = node
      const guard =
        body.type === AST_NODE_TYPES.BlockStatement
          ? body.body[0]
          : body.type === AST_NODE_TYPES.IfStatement
          ? body
          : null

      // for (const k in o) if (o.hasOwnProperty(k)) ...
      if (
        guard &&
        guard.type === AST_NODE_TYPES.IfStatement &&
        guard.test.type === AST_NODE_TYPES.CallExpression &&
        guard.test.callee.type === AST_NODE_TYPES.MemberExpression &&
        guard.test.callee.property.type === AST_NODE_TYPES.Identifier &&
        guard.test.callee.property.name === 'hasOwnProperty' &&
        areEqualIdentifiers(guard.test.callee.object, node.right) &&
        guard.test.arguments.length === 1 &&
        node.left.type === AST_NODE_TYPES.VariableDeclaration &&
        node.left.declarations.length === 1 &&
        areEqualIdentifiers(
          guard.test.arguments[0],
          node.left.declarations[0].id
        ) &&
        !guard.alternate
      ) {
        const consequent =
          guard.consequent.type === AST_NODE_TYPES.BlockStatement
            ? guard.consequent.body
            : [guard.consequent]
        return [
          fixer.replaceText(
            guard,
            consequent
              .map((statement) => sourceCode.getText(statement))
              .join('\n')
          ),
        ]
      }

      // for (const k in o) if (!o.hasOwnProperty(k)) continue
      if (
        guard &&
        guard.type === AST_NODE_TYPES.IfStatement &&
        guard.test.type === AST_NODE_TYPES.UnaryExpression &&
        guard.test.operator === '!' &&
        guard.test.argument.type === AST_NODE_TYPES.CallExpression &&
        guard.test.argument.callee.type === AST_NODE_TYPES.MemberExpression &&
        guard.test.argument.callee.property.type ===
          AST_NODE_TYPES.Identifier &&
        guard.test.argument.callee.property.name === 'hasOwnProperty' &&
        areEqualIdentifiers(guard.test.argument.callee.object, node.right) &&
        guard.test.argument.arguments.length === 1 &&
        node.left.type === AST_NODE_TYPES.VariableDeclaration &&
        node.left.declarations.length === 1 &&
        areEqualIdentifiers(
          guard.test.argument.arguments[0],
          node.left.declarations[0].id
        ) &&
        (guard.consequent.type === AST_NODE_TYPES.BlockStatement
          ? guard.consequent.body.length === 1 &&
            guard.consequent.body[0].type === AST_NODE_TYPES.ContinueStatement
          : guard.consequent.type === AST_NODE_TYPES.ContinueStatement)
      ) {
        const newBody = (guard.alternate ? [guard.alternate] : []).concat(
          node.body.type === AST_NODE_TYPES.BlockStatement
            ? node.body.body.slice(1)
            : node.body
        )
        return [
          fixer.replaceText(
            node.body,
            newBody.map((statement) => sourceCode.getText(statement)).join('\n')
          ),
        ]
      }

      return []
    }

    return {
      ForInStatement: (node: TSESTree.ForInStatement) => {
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
              ...removeHasOwnPropertyGuard(node, fixer),
            ]
          },
        })
      },
    }
  },
})
