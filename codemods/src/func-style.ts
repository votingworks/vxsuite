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
 * const Foo = (): JSX.Element => {
 *   return <div/>
 * }
 *
 *
 * // broken
 * const Foo = ({ bar }: Props) => {
 *   return <div/>
 * }
 *
 * // fixed
 * const Foo = ({ bar }: Props): JSX.Element => {
 *   return <div/>
 * }
 *
 *
 * // broken
 * const Foo: React.FC<Props> = ({ bar }) => {
 *   return <div/>
 * }
 *
 * // fixed
 * const Foo = ({ bar }: Props): JSX.Element => {
 *   return <div/>
 * }
 * ```
 *
 * Run it like so:
 *
 * ```sh
 * $ pnpx codemod -p codemods/src/func-style.ts --printer prettier apps/ libs/
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
      VariableDeclaration(path: NodePath<t.VariableDeclaration>): void {
        const declarations = path.node.declarations

        if (declarations.length !== 1) {
          return
        }

        const declaration = declarations[0]

        if (t.isFunction(declaration)) {

        }
      },
    },
  }
}
