/**
 * Refactors a few uses of `safeParse` to use more specific helper functions.
 *
 * Run it like so:
 *
 * ```sh
 * $ pnpx codemod -p codemods/src/safeParseHelpers.ts --printer prettier apps/ libs/
 * ```
 */
import { PluginItem, NodePath } from '@babel/core';
import * as t from '@babel/types';
import assert from 'assert';

/**
 * Adds a named import to an existing import declaration.
 *
 * @VisibleForTesting
 */
export function addSpecifierToImport(
  path: NodePath<t.ImportDeclaration>,
  name: string
): void {
  const specifiers = path.get('specifiers');
  const newSpecifier = t.importSpecifier(
    t.identifier(name),
    t.identifier(name)
  );

  if (specifiers.length === 0) {
    path.replaceWith(
      t.importDeclaration([newSpecifier], path.get('source').node)
    );
  } else {
    let insertionIndex = 0;

    for (const [i, specifier] of specifiers.entries()) {
      switch (
        specifier.node.local.name.localeCompare(name, undefined, {
          sensitivity: 'base',
        })
      ) {
        case 0:
          return;

        case -1:
          insertionIndex = i + 1;
          break;

        default:
          // nothing to do
          break;
      }
    }

    if (insertionIndex === 0) {
      specifiers[0].insertBefore(newSpecifier);
    } else {
      specifiers[insertionIndex - 1].insertAfter(newSpecifier);
    }
  }
}

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
