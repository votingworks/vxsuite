import { NodePath } from '@babel/core';
import * as t from '@babel/types';

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
