import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { strict as assert } from 'node:assert';
import { createRule } from '../util';

const rule: TSESLint.RuleModule<
  'noDefaultExports' | 'noDefaultImports',
  readonly unknown[]
> = createRule({
  name: 'gts-no-default-exports',
  meta: {
    docs: {
      description: 'Disallows default exports',
      recommended: 'stylistic',
      requiresTypeChecking: false,
    },
    fixable: 'code',
    messages: {
      noDefaultExports:
        'Do not use default exports; use named exports instead.',
      noDefaultImports:
        'Do not use default imports within a package; use named imports instead.',
    },
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
    const sourceCode = context.getSourceCode();

    function getNamedExportCandidate(
      name: string
    ): TSESTree.ExportDeclaration | undefined {
      const defs = context.getScope().set.get(name)?.defs;

      if (!defs || defs.length !== 1) {
        return undefined;
      }

      const [def] = defs;

      if (def.node.type === AST_NODE_TYPES.VariableDeclarator) {
        assert(
          def.node.parent &&
            def.node.parent.type === AST_NODE_TYPES.VariableDeclaration
        );
        return def.node.parent.declarations.length === 1
          ? def.node.parent
          : undefined;
      }

      if (def.node.type === AST_NODE_TYPES.FunctionDeclaration) {
        return def.node;
      }
    }

    function isImportSourceAllowedToUseDefaultImport(source: string): boolean {
      const isJsonModule = source.toLowerCase().endsWith('.json');

      if (isJsonModule) {
        return true;
      }

      const [firstPathComponent] = source.split('/', 2);
      const isRelative =
        firstPathComponent === '.' || firstPathComponent === '..';

      if (!isRelative) {
        return true;
      }

      return false;
    }

    return {
      ExportSpecifier(node: TSESTree.ExportSpecifier): void {
        assert(
          node.parent &&
            node.parent.type === AST_NODE_TYPES.ExportNamedDeclaration
        );

        if (node.local.name === 'default' && node.exported.name !== 'default') {
          context.report({
            node: node.parent,
            messageId: 'noDefaultExports',
            fix: (fixer) =>
              // `export { default as a } from './a';` → `export { a } from './a';`
              //           ^^^^^^^^^^^
              fixer.removeRange([node.range[0], node.exported.range[0]]),
          });
        }
      },

      ExportDefaultDeclaration(node: TSESTree.ExportDefaultDeclaration): void {
        switch (node.declaration.type) {
          case AST_NODE_TYPES.Identifier: {
            const declaration = getNamedExportCandidate(node.declaration.name);

            context.report({
              node,
              messageId: 'noDefaultExports',
              fix: declaration
                ? function* getFixes(fixer) {
                    /* istanbul ignore next - this is for TypeScript type narrowing */
                    assert(declaration.parent);

                    if (
                      declaration.parent.type !==
                      AST_NODE_TYPES.ExportNamedDeclaration
                    ) {
                      // `const a = 1;` → `export const a = 1;`
                      //                   ^^^^^^^
                      yield fixer.insertTextBefore(declaration, 'export ');
                    }

                    // `export default a;` → ``
                    //  ^^^^^^^^^^^^^^^^^
                    yield fixer.remove(node);
                  }
                : undefined,
            });
            break;
          }

          case AST_NODE_TYPES.FunctionDeclaration:
          case AST_NODE_TYPES.ClassDeclaration: {
            context.report({
              node,
              messageId: 'noDefaultExports',
              fix: function* getFixes(fixer) {
                const [exportToken, defaultToken] = sourceCode.getFirstTokens(
                  node,
                  { count: 2 }
                );
                /* istanbul ignore next - this is for TypeScript type narrowing */
                assert.equal(exportToken?.value, 'export');
                /* istanbul ignore next - this is for TypeScript type narrowing */
                assert.equal(defaultToken?.value, 'default');

                // `export default function a() {}` → `export function a() {}`
                //        ^^^^^^^^
                yield fixer.removeRange([
                  exportToken.range[1],
                  defaultToken.range[1],
                ]);
              },
            });
            break;
          }

          default:
            context.report({
              node,
              messageId: 'noDefaultExports',
            });
        }
      },

      ImportDefaultSpecifier(node: TSESTree.ImportDefaultSpecifier): void {
        /* istanbul ignore next - this is for TypeScript type narrowing */
        assert(node.parent?.type === AST_NODE_TYPES.ImportDeclaration);
        const importDeclaration = node.parent;

        /* istanbul ignore next - this is for TypeScript type narrowing */
        assert(typeof importDeclaration.source.value === 'string');

        if (
          isImportSourceAllowedToUseDefaultImport(
            importDeclaration.source.value
          )
        ) {
          return;
        }

        context.report({
          node: importDeclaration,
          messageId: 'noDefaultImports',
          fix: function* getFixes(fixer) {
            if (importDeclaration.specifiers.length === 1) {
              // `import a from './a';` → `import { a from './a';`
              //                                  ^^
              yield fixer.insertTextBefore(node, '{ ');
              // `import { a from './a';` → `import { a } from './a';`
              //                                       ^^
              yield fixer.insertTextAfter(node, ' }');
            } else {
              const [commaToken, leftBracketToken, afterLeftBracketToken] =
                sourceCode.getTokensAfter(node, { count: 3 });
              /* istanbul ignore next - this is for TypeScript type narrowing */
              assert(commaToken?.value === ',');
              /* istanbul ignore next - this is for TypeScript type narrowing */
              assert(leftBracketToken?.value === '{');
              /* istanbul ignore next - this is for TypeScript type narrowing */
              assert(afterLeftBracketToken);

              // `import a, { b } from './a';` → `import a, b } from './a';`
              //            ^^
              yield fixer.removeRange([
                leftBracketToken.range[0],
                afterLeftBracketToken.range[0],
              ]);
              // `import a, b } from './a';` → `import { a, b } from './a';`
              //                                       ^^
              yield fixer.insertTextBefore(
                node,
                sourceCode
                  .getText()
                  .slice(
                    leftBracketToken.range[0],
                    afterLeftBracketToken.range[0]
                  )
              );
            }
          },
        });
      },
    };
  },
});

export default rule;
