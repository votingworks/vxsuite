/**
 * Makes top-level `const` arrays readonly.
 *
 * ```ts
 * // broken
 * const a: number[] = [1, 2, 3];
 *
 * // fixed
 * const a: readonly number[] = [1, 2, 3];
 *
 *
 * // broken
 * const a: Array<number> = [1, 2, 3];
 *
 * // fixed
 * const a: ReadonlyArray<number> = [1, 2, 3];
 * ```
 *
 * Run it like so:
 *
 * ```sh
 * $ pnpx codemod -p codemods/src/top_level_array_readonly.ts frontends/ libs/ services/
 * ```
 */

import { PluginItem, NodePath } from '@babel/core';
import * as t from '@babel/types';

export default (): PluginItem => {
  return {
    visitor: {
      Program(path: NodePath<t.Program>): void {
        const { node } = path;

        for (const statement of node.body) {
          if (
            !t.isVariableDeclaration(statement) ||
            statement.kind !== 'const'
          ) {
            continue;
          }

          for (const declaration of statement.declarations) {
            const { typeAnnotation } = declaration.id as t.Identifier;
            if (!t.isTSTypeAnnotation(typeAnnotation)) {
              continue;
            }

            if (t.isTSArrayType(typeAnnotation.typeAnnotation)) {
              typeAnnotation.typeAnnotation = t.tsTypeOperator(
                typeAnnotation.typeAnnotation
              );
              typeAnnotation.typeAnnotation.operator = 'readonly';
            } else if (
              t.isTSTypeReference(typeAnnotation.typeAnnotation) &&
              t.isIdentifier(typeAnnotation.typeAnnotation.typeName, {
                name: 'Array',
              })
            ) {
              typeAnnotation.typeAnnotation.typeName.name = 'ReadonlyArray';
            }
          }
        }
      },
    },
  };
};
