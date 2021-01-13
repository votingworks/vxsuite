/**
 * Fixes violations of eslint rules requiring return types on functions for
 * functional components.
 *
 * ```ts
 * // broken
 * const Foo = () => {
 *   return <div/>
 * }
 *
 * // fixed
 * const Foo: React.FC = () => {}
 *
 *
 * // broken
 * const Foo = ({ bar }: Props) => {
 *   return <div/>
 * }
 *
 * // fixed
 * const Foo: React.FC<Props> = ({ bar }) => {
 *   return <div/>
 * }
 * ```
 *
 * Adding a type annotation to the component function tells TypeScript enough
 * to infer the return type.
 * 
 * Run it like so:
 * 
 * ```sh
 * # Run on all of `src/`:
 * $ pnpx codemod -p codemods/react-fc.ts --printer prettier src/
 * ```
 */

import * as t from '@babel/types'
import { PluginItem, NodePath } from '@babel/core'

export default ({
  types: t,
}: {
  types: typeof import('@babel/types')
}): PluginItem => {
  return {
    visitor: {
      /**
       * Loop over all the top-level statements in the program.
       */
      Program(path: NodePath<t.Program>): void {
        for (const node of path.node.body) {
          if (!t.isVariableDeclaration(node)) {
            continue
          }

          const { declarations } = node

          if (declarations.length !== 1) {
            return
          }

          const [declaration] = declarations

          // Components start with a capital letter.
          if (
            !t.isIdentifier(declaration.id) ||
            !/^[A-Z]/.test(declaration.id.name) ||
            declaration.id.typeAnnotation
          ) {
            continue
          }

          if (!declaration.init || !t.isFunction(declaration.init)) {
            continue
          }

          const params = declaration.init.params

          if (params.length === 1) {
            const [param] = params

            if (!t.isIdentifier(param) && !t.isObjectPattern(param)) {
              continue
            }

            if (
              !t.isTSTypeAnnotation(param.typeAnnotation) ||
              !t.isTSTypeReference(param.typeAnnotation.typeAnnotation)
            ) {
              continue
            }

            const type = param.typeAnnotation.typeAnnotation.typeName

            // Replace `const Foo = (props: Props) => {}` with `const Foo: React.FC<Props> = (props) => {}`.
            param.typeAnnotation = null
            declaration.id.typeAnnotation = t.tsTypeAnnotation(
              t.tsTypeReference(
                t.tsQualifiedName(t.identifier('React'), t.identifier('FC')),
                t.tsTypeParameterInstantiation([t.tsTypeReference(type)])
              )
            )
          } else if (params.length === 0) {
            // Replace `const Foo = () => {}` with `const Foo: React.FC = () => {}`.
            declaration.id.typeAnnotation = t.tsTypeAnnotation(
              t.tsTypeReference(
                t.tsQualifiedName(t.identifier('React'), t.identifier('FC'))
              )
            )
          }
        }

        path.skip()
      },
    },
  }
}
