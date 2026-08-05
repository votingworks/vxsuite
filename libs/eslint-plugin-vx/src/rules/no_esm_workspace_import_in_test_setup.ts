import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRule } from '../util';

const WORKSPACE_SCOPE = '@votingworks/';

/** Resolved `package.json` path → whether that package is ESM. */
const isEsmByPackageJsonPath = new Map<string, boolean>();

/**
 * Locates a workspace package's `package.json` the way node would: by walking
 * up from `fromDir` looking for it under `node_modules`. pnpm links workspace
 * dependencies there, so this finds the real package for any importer that
 * declares the dependency.
 */
function findPackageJson(
  fromDir: string,
  packageName: string
): string | undefined {
  for (let dir = fromDir; ; dir = path.dirname(dir)) {
    const packageJsonPath = path.join(
      dir,
      'node_modules',
      packageName,
      'package.json'
    );
    if (fs.existsSync(packageJsonPath)) {
      return packageJsonPath;
    }
    if (dir === path.dirname(dir)) {
      return undefined;
    }
  }
}

/**
 * Whether the given workspace package is ESM, i.e. its `package.json` declares
 * `"type": "module"`. Returns `false` when the package cannot be found, so that
 * an unresolvable import is never reported.
 */
function isEsmPackage(fromDir: string, packageName: string): boolean {
  const packageJsonPath = findPackageJson(fromDir, packageName);
  if (!packageJsonPath) {
    return false;
  }

  const cached = isEsmByPackageJsonPath.get(packageJsonPath);
  if (cached !== undefined) {
    return cached;
  }

  let isEsm = false;
  try {
    isEsm =
      (
        JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
          type?: string;
        }
      ).type === 'module';
  } catch {
    isEsm = false;
  }
  isEsmByPackageJsonPath.set(packageJsonPath, isEsm);
  return isEsm;
}

const rule: TSESLint.RuleModule<'noEagerEsmImport', readonly unknown[]> =
  createRule({
    name: 'no-esm-workspace-import-in-test-setup',
    meta: {
      docs: {
        description:
          'Do not import ESM workspace packages at module scope in a vitest setup file, where they load before mocks are registered',
      },
      messages: {
        noEagerEsmImport:
          "`{{packageName}}` is ESM, so importing it here runs before any `vi.mock` and leaves modules in its dependency graph holding unmocked bindings. Load it inside a hook instead: `const { x } = await vi.importActual<typeof import('{{packageName}}')>('{{packageName}}')`.",
      },
      schema: [],
      type: 'problem',
    },
    defaultOptions: [],

    create(context) {
      return {
        ImportDeclaration(node: TSESTree.ImportDeclaration) {
          // Type-only imports are erased, so they load nothing.
          if (node.importKind === 'type') {
            return;
          }

          const importSource = node.source.value;
          assert(typeof importSource === 'string');
          if (!importSource.startsWith(WORKSPACE_SCOPE)) {
            return;
          }

          const packageName = importSource.split('/').slice(0, 2).join('/');
          const fromDir = path.dirname(context.getFilename());
          if (!isEsmPackage(fromDir, packageName)) {
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
