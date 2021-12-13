/**
 * Refactors a few uses of `safeParse` to use more specific helper functions.
 *
 * Run it like so:
 *
 * ```sh
 * $ pnpx codemod -p codemods/src/safe_parse_helpers.ts --printer prettier frontends/ libs/
 * ```
 */
import { PluginItem, NodePath } from '@babel/core';
import * as t from '@babel/types';
import assert from 'assert';
import { addSpecifierToImport } from './utils';

export default (): PluginItem => {
  return {
    visitor: {
      CallExpression(path: NodePath<t.CallExpression>): void {
        const callee = path.get('callee');

        if (!callee.isMemberExpression() || path.get('arguments').length > 0) {
          return;
        }

        const object = callee.get('object');
        const property = callee.get('property');

        if (
          callee.node.computed ||
          !property.isIdentifier() ||
          !object.isCallExpression() ||
          !object.get('callee').isIdentifier({ name: 'safeParse' }) ||
          object.get('arguments').length !== 2
        ) {
          return;
        }

        const replacementHelper =
          property.node.name === 'unsafeUnwrap'
            ? 'unsafeParse'
            : property.node.name === 'ok'
            ? 'maybeParse'
            : undefined;

        if (replacementHelper) {
          const binding = path.scope.getBinding('safeParse');

          if (binding) {
            if (binding.path.isImportSpecifier()) {
              /* istanbul ignore next - helps TS with type narrowing */
              assert(binding.path.parentPath?.isImportDeclaration());
              addSpecifierToImport(binding.path.parentPath, replacementHelper);
            }
          }

          path.replaceWith(
            t.callExpression(
              t.identifier(replacementHelper),
              object.node.arguments
            )
          );
        }
      },

      Program: {
        // Clean up any `safeParse` imports that aren't used anymore.
        exit(path: NodePath<t.Program>): void {
          path.scope.crawl();

          const binding = path.scope.getBinding('safeParse');
          if (
            binding &&
            !binding.referenced &&
            binding.path.isImportSpecifier()
          ) {
            binding.path.remove();
          }
        },
      },
    },
  };
};
