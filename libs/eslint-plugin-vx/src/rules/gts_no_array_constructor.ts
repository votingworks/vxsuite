import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { strict as assert } from 'node:assert';
import { createRule } from '../util';

const rule: TSESLint.RuleModule<'noArrayConstructor', readonly unknown[]> =
  createRule({
    name: 'gts-no-array-constructor',
    meta: {
      docs: {
        description: 'Disallows using the `Array` constructor.',
        recommended: 'strict',
        requiresTypeChecking: false,
      },
      fixable: 'code',
      messages: {
        noArrayConstructor:
          'Do not use the `Array` constructor; use `Array.from` or similar instead.',
      },
      schema: [],
      type: 'problem',
    },
    defaultOptions: [],

    create(context) {
      const sourceCode = context.getSourceCode();

      function processNode(
        node: TSESTree.CallExpression | TSESTree.NewExpression
      ): void {
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === 'Array' &&
          (node.type !== AST_NODE_TYPES.CallExpression || !node.optional)
        ) {
          context.report({
            node,
            messageId: 'noArrayConstructor',
            fix: (fixer) => {
              const result: TSESLint.RuleFix[] = [];

              const leftParen = sourceCode.getTokenAfter(
                node.typeArguments ?? node.callee
              );
              assert(leftParen && leftParen.value === '(');

              const rightParen = sourceCode.getLastToken(node);
              assert(rightParen && rightParen.value === ')');

              if (node.type === AST_NODE_TYPES.NewExpression) {
                const newToken = sourceCode.getFirstToken(node);
                assert(newToken && newToken.value === 'new');
                const commentsAfterNew = sourceCode.getCommentsAfter(newToken);
                result.push(
                  // `new Array()` → `Array()`
                  //  ^^^^
                  fixer.removeRange([
                    newToken.range[0],
                    (commentsAfterNew[0] ?? node.callee).range[0],
                  ])
                );
              }

              if (node.arguments.length !== 1) {
                if (node.typeArguments) {
                  result.push(
                    // `Array<number>()` → `Array.of<number>()`
                    //                           ^^^
                    fixer.insertTextAfterRange(node.callee.range, '.of')
                  );
                } else {
                  result.push(
                    // `Array(a, b)` → `(a, b)`
                    //  ^^^^^
                    fixer.removeRange(node.callee.range),
                    // `(a, b)` → `[a, b)`
                    //  ^          ^
                    fixer.replaceTextRange(leftParen.range, '['),
                    // `[a, b)` → `[a, b]`
                    //       ^          ^
                    fixer.replaceTextRange(rightParen.range, ']')
                  );
                }
              } else {
                result.push(
                  // `Array(5)` → `Array.from(5)`
                  //                    ^^^^^
                  fixer.insertTextAfterRange(node.callee.range, '.from'),
                  // `Array.from(5)` → `Array.from({ length: 5)`
                  //                               ^^^^^^^^^^
                  fixer.insertTextAfterRange(leftParen.range, '{ length: '),
                  // `Array.from({ length: 5)` → `Array.from({ length: 5 })`
                  //                                                    ^^
                  fixer.insertTextBeforeRange(rightParen.range, ' }')
                );
              }

              return result;
            },
          });
        }
      }

      return {
        CallExpression: processNode,
        NewExpression: processNode,
      };
    },
  });

export default rule;
