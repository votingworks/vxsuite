/* eslint-disable no-param-reassign */
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
 * $ pnpx codemod -p codemods/src/react-fc.ts --printer prettier apps/ libs/
 * ```
 */

import { PluginItem, NodePath } from '@babel/core';
import * as t from '@babel/types';

function rewriteFunction(id: t.Identifier, fn: t.Function): boolean {
  if (!/^[A-Z]/.test(id.name)) {
    // skip patterns or non-canonically-named declarations e.g. `let { a }` or `let abc`
    return false;
  }

  if (
    t.isTSTypeAnnotation(id.typeAnnotation) &&
    t.isTSTypeReference(id.typeAnnotation.typeAnnotation)
  ) {
    const componentTypeAnnotation = id.typeAnnotation.typeAnnotation;
    const param = fn.params.length === 1 ? fn.params[0] : undefined;

    // match `: React.FC` or `: React.FC<…>`
    if (
      t.isTSQualifiedName(componentTypeAnnotation.typeName) &&
      t.isIdentifier(componentTypeAnnotation.typeName.left) &&
      componentTypeAnnotation.typeName.left.name === 'React' &&
      t.isIdentifier(componentTypeAnnotation.typeName.right) &&
      componentTypeAnnotation.typeName.right.name === 'FC'
    ) {
      if (
        param &&
        !t.isTSParameterProperty(param) &&
        !param.typeAnnotation &&
        componentTypeAnnotation.typeParameters?.params.length === 1
      ) {
        // copy `Props` from `React.FC<Props>` to `({ … }: Props) =>`
        param.typeAnnotation = t.tsTypeAnnotation(
          componentTypeAnnotation.typeParameters.params[0]
        );
      }

      // delete `React.FC`
      id.typeAnnotation = null;
    }
  }

  // add explicit `JSX.Element` return type
  fn.returnType = t.tsTypeAnnotation(
    t.tsTypeReference(
      t.tsQualifiedName(t.identifier('JSX'), t.identifier('Element'))
    )
  );

  return true;
}

function rewrite(path: NodePath): boolean {
  if (path.isExportDefaultDeclaration()) {
    return rewrite(path.get('declaration'));
  }
  if (path.isExportNamedDeclaration()) {
    const declaration = path.get('declaration');
    if (declaration.node) {
      return rewrite(declaration as NodePath<t.Declaration>);
    }
  } else if (path.isVariableDeclaration()) {
    const { node } = path;
    const { declarations } = node;

    if (declarations.length !== 1) {
      // skip multiples e.g. `let a, b`
      return false;
    }

    const [declaration] = declarations;

    if (
      !t.isIdentifier(declaration.id) ||
      !/^[A-Z]/.test(declaration.id.name)
    ) {
      // skip patterns or non-canonically-named declarations e.g. `let { a }` or `let abc`
      return false;
    }

    if (!declaration.init || !t.isFunction(declaration.init)) {
      // skip no initial value or non-function value e.g. `let A;` or `let A = 1`
      return false;
    }

    return rewriteFunction(declaration.id, declaration.init);
  } else if (path.isFunctionDeclaration() && path.node.id) {
    return rewriteFunction(path.node.id, path.node);
  }

  return false;
}

export default (): PluginItem => {
  return {
    visitor: {
      /**
       * Loop over all the top-level statements in the program.
       */
      Program(path: NodePath<t.Program>): void {
        for (const child of path.get('body')) {
          if (!rewrite(child)) {
            child.skip();
          }
        }
      },
    },
  };
};
