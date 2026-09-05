import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { strict as assert } from 'node:assert';
import * as path from 'node:path';
import { createRule, isEsmWorkspacePackage } from '../util';

const WORKSPACE_SCOPE = '@votingworks/';

interface Options {
  /**
   * Import specifiers to allow because they import nothing we want to mock.
   */
  readonly allow: readonly string[];
}

const rule: TSESLint.RuleModule<'noEagerEsmImport', readonly [Options]> =
  createRule({
    name: 'no-esm-workspace-import-in-test-setup',
    meta: {
      docs: {
        description:
          'Do not import ESM workspace packages at module scope in a vitest setup file, where they load before mocks are registered',
      },
      messages: {
        noEagerEsmImport:
          "`{{packageName}}` is ESM, so importing it here runs before any `vi.mock` and leaves modules in its dependency graph holding unmocked bindings. Import a module with no workspace imports of its own, or load it inside a hook: `const { x } = await vi.importActual<typeof import('{{packageName}}')>('{{packageName}}')`.",
      },
      schema: [
        {
          type: 'object',
          properties: {
            allow: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: false,
        },
      ],
      type: 'problem',
    },
    defaultOptions: [{ allow: [] as string[] }],

    create(context) {
      const allow = new Set(context.options[0]?.allow ?? []);

      return {
        ImportDeclaration(node: TSESTree.ImportDeclaration) {
          // Type-only imports are erased, so they load nothing.
          if (node.importKind === 'type') {
            return;
          }

          const importSource = node.source.value;
          assert(typeof importSource === 'string');
          if (
            !importSource.startsWith(WORKSPACE_SCOPE) ||
            allow.has(importSource)
          ) {
            return;
          }

          const packageName = importSource.split('/').slice(0, 2).join('/');
          const fromDir = path.dirname(context.filename);
          if (!isEsmWorkspacePackage(fromDir, packageName)) {
            return;
          }

          context.report({
            node,
            messageId: 'noEagerEsmImport',
            data: { packageName },
          });
        },
      };
    },
  });

export default rule;
