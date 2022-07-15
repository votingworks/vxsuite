/**
 * Changes imports of `assert` to use `@votingworks/utils` instead.
 *
 * ```ts
 * // broken
 * import assert from 'assert';
 *
 * // fixed
 * import { assert } from '@votingworks/utils';
 *
 *
 * // broken
 * import { strict as assert } from 'assert';
 *
 * // fixed
 * import { assert } from '@votingworks/utils';
 *
 *
 * // broken
 * import { ok } from 'assert';
 *
 * // fixed
 * import { assert } from '@votingworks/utils';
 * ```
 *
 * Run it like so:
 *
 * ```sh
 * $ pnpx codemod -p codemods/src/use_utils_assert.ts --printer prettier frontends/ libs/ services/
 * ```
 */

import { PluginItem, NodePath, types as t } from '@babel/core';
import assert from 'assert';
import { addSpecifierToImport } from './utils';

export default (): PluginItem => {
  return {
    visitor: {
      ImportDeclaration(path: NodePath<t.ImportDeclaration>): void {
        if (path.get('source').node.value === 'assert') {
          // skip imports that can't be fixed, i.e. use an assert helper like `strictEqual`
          for (const specifier of path.get('specifiers')) {
            const binding = path.scope.getBinding(specifier.node.local.name);
            assert(binding);
            for (const reference of binding.referencePaths) {
              assert(reference.parentPath);
              if (reference.parentPath.isMemberExpression()) {
                return;
              }
            }

            if (specifier.isImportSpecifier()) {
              const imported = specifier.get('imported');
              if (
                imported.isIdentifier() &&
                imported.node.name !== 'ok' &&
                imported.node.name !== 'strict'
              ) {
                return;
              }
            } else if (!specifier.isImportDefaultSpecifier()) {
              return;
            }
          }

          // rename all imported bindings to `assert`
          for (const specifier of path.get('specifiers')) {
            path.scope.rename(specifier.node.local.name, 'assert');
          }

          /* istanbul ignore else */
          assert(path.parentPath && path.parentPath.isProgram());
          const existingImport = path.parentPath
            .get('body')
            .find(
              (statement): statement is NodePath<t.ImportDeclaration> =>
                statement.isImportDeclaration() &&
                statement.get('source').node.value === '@votingworks/utils'
            );
          if (existingImport) {
            addSpecifierToImport(existingImport, 'assert');
            path.remove();
          } else {
            // replace the whole import since there's only really one form
            path.replaceWith(
              t.importDeclaration(
                [
                  t.importSpecifier(
                    t.identifier('assert'),
                    t.identifier('assert')
                  ),
                ],
                t.stringLiteral('@votingworks/utils')
              )
            );
          }
        }
      },
    },
  };
};
