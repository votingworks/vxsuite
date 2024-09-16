import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { strict as assert } from 'node:assert';
import { createRule } from '../util';

const rule: TSESLint.RuleModule<
  'noImportType' | 'noExportType',
  Array<{ allowReexport: boolean }>
> = createRule({
  name: 'gts-no-import-export-type',
  meta: {
    docs: {
      description: 'Disallows use of `import type` and `export type`',
      recommended: 'strict',
      requiresTypeChecking: false,
    },
    fixable: 'code',
    messages: {
      noImportType: 'Do not use `import type`; just use `import`',
      noExportType: 'Do not use `export type`; just use `export`',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowReexport: {
            type: 'boolean',
            description:
              'Allow `import type` and `export type` if that is the only use of the types in the module',
          },
        },
      },
    ],
    type: 'problem',
  },
  defaultOptions: [
    {
      allowReexport: false,
    },
  ],

  create(context, [{ allowReexport }]) {
    const sourceCode = context.getSourceCode();

    function isReexportOnly(name: string): boolean {
      const scope = context.getScope();
      const variable = scope.set.get(name);

      if (!variable) {
        return false;
      }

      if (variable.defs.length !== 1) {
        return false;
      }

      const [def] = variable.defs;

      assert(def.node.parent);
      if (def.node.parent.type !== AST_NODE_TYPES.ImportDeclaration) {
        return false;
      }

      if (variable.references.length !== 1) {
        return false;
      }

      const [reference] = variable.references;

      // A reference to a type must have at least a grandparent node, even
      // though a non-type reference doesn't have to.
      assert(reference.identifier.parent && reference.identifier.parent.parent);

      if (
        reference.identifier.parent.type !==
          AST_NODE_TYPES.ExportAllDeclaration &&
        reference.identifier.parent.parent.type !==
          AST_NODE_TYPES.ExportNamedDeclaration
      ) {
        return false;
      }

      return true;
    }

    function reportExport(
      node:
        | TSESTree.ExportDefaultDeclaration
        | TSESTree.ExportAllDeclaration
        | TSESTree.ExportNamedDeclaration
    ): void {
      const [exportToken, typeToken] = sourceCode.getFirstTokens(node, {
        count: 2,
      });
      assert.equal(exportToken.value, 'export');
      assert.equal(typeToken.value, 'type');

      context.report({
        node: typeToken,
        messageId: 'noExportType',
        fix: (fixer) =>
          fixer.removeRange([exportToken.range[1], typeToken.range[1]]),
      });
    }

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (node.importKind !== 'type') {
          return;
        }

        const [importToken, typeToken] = sourceCode.getFirstTokens(node, {
          count: 2,
        });
        assert.equal(importToken.value, 'import');
        assert.equal(typeToken.value, 'type');

        // import type { foo } from 'foo'
        // export type { foo }
        if (
          allowReexport &&
          node.specifiers.every((specifier) =>
            isReexportOnly(specifier.local.name)
          )
        ) {
          return;
        }

        context.report({
          node: typeToken,
          messageId: 'noImportType',
          fix: (fixer) =>
            fixer.removeRange([importToken.range[1], typeToken.range[1]]),
        });
      },

      ExportNamedDeclaration(node: TSESTree.ExportNamedDeclaration) {
        // export const foo = 1
        // export type foo = string
        if (node.exportKind !== 'type' || node.declaration) {
          return;
        }

        // export type { foo } from 'foo'
        if (allowReexport && node.source) {
          return;
        }

        // import type { foo } from 'foo'
        // export type { foo }
        if (
          allowReexport &&
          node.specifiers.every((specifier) =>
            isReexportOnly(specifier.local.name)
          )
        ) {
          return;
        }

        reportExport(node);
      },

      ExportAllDeclaration(node: TSESTree.ExportAllDeclaration) {
        if (node.exportKind !== 'type' || allowReexport) {
          return;
        }

        reportExport(node);
      },
    };
  },
});

export default rule;
