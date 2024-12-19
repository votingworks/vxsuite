import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { strict as assert } from 'node:assert';
import { createRule } from '../util';

interface PendingReport {
  readonly declaration: TSESTree.VariableDeclaration;
  readonly declarator: TSESTree.VariableDeclarator;
  readonly id: TSESTree.Identifier;
  readonly init: TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;
  readonly functionLevel: number;
  usesThis: boolean;
}

const rule: TSESLint.RuleModule<'useFunctionDeclaration', readonly unknown[]> =
  createRule({
    name: 'gts-func-style',
    meta: {
      docs: {
        description:
          'Use `function foo() { ... }` to declare named functions, including functions in nested scopes, e.g. within another function.',
        recommended: 'stylistic',
        requiresTypeChecking: false,
      },
      fixable: 'code',
      messages: {
        useFunctionDeclaration:
          'Use function declarations instead of assigning a function expression into a local variable',
      },
      schema: [],
      type: 'problem',
    },
    defaultOptions: [],

    create(context) {
      const sourceCode = context.getSourceCode();
      let functionLevel = 0;
      const pendingReports: PendingReport[] = [];

      return {
        VariableDeclarator(node: TSESTree.VariableDeclarator): void {
          const declaration = node.parent as TSESTree.VariableDeclaration;
          const declarator = node;
          const { id, init } = node;

          if (
            // Function declarations must be named
            id.type !== AST_NODE_TYPES.Identifier ||
            // Top level arrow functions may be used to explicitly declare that a
            // function implements an interface.
            id.typeAnnotation ||
            (init?.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
              init?.type !== AST_NODE_TYPES.FunctionExpression)
          ) {
            return;
          }

          pendingReports.push({
            declaration,
            declarator,
            id,
            init,
            functionLevel,
            usesThis: false,
          });
        },

        FunctionExpression(): void {
          functionLevel += 1;
        },

        FunctionDeclaration(): void {
          functionLevel += 1;
        },

        ThisExpression(): void {
          const pendingReport = pendingReports.at(-1);

          if (pendingReport?.functionLevel === functionLevel) {
            pendingReport.usesThis = true;
          }
        },

        'FunctionExpression:exit': (): void => {
          functionLevel -= 1;
        },

        'FunctionDeclaration:exit': (): void => {
          functionLevel -= 1;
        },

        'VariableDeclarator:exit': (
          node: TSESTree.VariableDeclarator
        ): void => {
          if (pendingReports.at(-1)?.declarator === node) {
            const { declaration, id, init, usesThis } =
              pendingReports.pop() as PendingReport;

            if (usesThis) {
              // Use arrow functions assigned to variables instead of function
              // declarations if the function accesses the outer scope's this.
              return;
            }

            context.report({
              messageId: 'useFunctionDeclaration',
              node: init,
              fix:
                declaration.declarations.length !== 1
                  ? undefined
                  : function* getFixes(fixer) {
                      // `const foo = () => {}`
                      //  ^^^^^
                      const declarationToken =
                        sourceCode.getFirstToken(declaration);
                      assert(
                        declarationToken &&
                          declarationToken.value === declaration.kind
                      );

                      // `const foo = () => {}`
                      //            ^
                      const equalToken = sourceCode.getTokenAfter(id);
                      assert(equalToken && equalToken.value === '=');

                      if (init.async) {
                        // `const foo = async () => {}`
                        //              ^^^^^
                        const asyncToken = sourceCode.getTokenAfter(equalToken);
                        assert(asyncToken && asyncToken.value === 'async');

                        // `const foo = async () => {}`
                        //                    ^
                        const paramsStartParenToken =
                          sourceCode.getTokenAfter(asyncToken);
                        assert(
                          paramsStartParenToken &&
                            paramsStartParenToken.value === '('
                        );

                        // `const foo = async () => {}` → `const foo = () => {}`
                        //              ^^^^^^
                        yield fixer.removeRange([
                          asyncToken.range[0],
                          paramsStartParenToken.range[0],
                        ]);
                      }

                      // `const foo = () => {}`
                      //                 ^^
                      const arrowToken = sourceCode.getTokenBefore(init.body, {
                        filter: (t) => t.value === '=>',
                      });
                      assert(arrowToken && arrowToken.value === '=>');

                      // `const foo = () => {}` → `function foo = () => {}`
                      //  ^^^^^                    ^^^^^^^^
                      yield fixer.replaceText(
                        declarationToken,
                        init.async ? 'async function' : 'function'
                      );

                      // `function foo = () => {}` → `function foo() => {}`
                      //              ^^^
                      yield fixer.removeRange([id.range[1], init.range[0]]);

                      // `function foo() => {}`
                      //                    ^
                      const afterArrowToken =
                        sourceCode.getTokenAfter(arrowToken);
                      assert(afterArrowToken);

                      // `function foo() => {}` → `function foo() {}`
                      //                 ^^^
                      yield fixer.replaceTextRange(
                        [arrowToken.range[0], afterArrowToken.range[0]],
                        init.body.type !== AST_NODE_TYPES.BlockStatement
                          ? '{ return '
                          : ''
                      );

                      if (init.body.type !== AST_NODE_TYPES.BlockStatement) {
                        // `function foo() { return 1` → `function foo() { return 1 }`
                        //                                                         ^^
                        yield fixer.insertTextAfter(init, ' }');
                      }
                    },
            });
          }
        },
      };
    },
  });

export default rule;
