import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { strict as assert } from 'node:assert';
import { createRule } from '../util';

const rule: TSESLint.RuleModule<'directAccessOnly', readonly unknown[]> =
  createRule({
    name: 'gts-direct-module-export-access-only',
    meta: {
      docs: {
        description:
          'Directly access module import properties rather than passing it around.',
        recommended: 'stylistic',
        requiresTypeChecking: false,
      },
      messages: {
        directAccessOnly:
          'Directly access module import properties rather than passing it around',
      },
      schema: [],
      type: 'problem',
    },
    defaultOptions: [],

    create(context) {
      return {
        ImportNamespaceSpecifier(
          node: TSESTree.ImportNamespaceSpecifier
        ): void {
          const scope = context.getScope();
          const variable = scope.set.get(node.local.name);
          assert(variable);

          for (const reference of variable.references) {
            assert(reference.identifier.parent);

            // A.b
            if (
              reference.identifier.parent.type ===
                AST_NODE_TYPES.MemberExpression &&
              reference.identifier.parent.object === reference.identifier
            ) {
              continue;
            }

            // let a: A.b
            if (
              reference.identifier.parent.type ===
                AST_NODE_TYPES.TSQualifiedName &&
              reference.identifier.parent.left === reference.identifier
            ) {
              continue;
            }

            assert(reference.identifier.parent.parent);

            // let a: A['b']
            if (
              reference.identifier.parent.parent.type ===
                AST_NODE_TYPES.TSIndexedAccessType &&
              reference.identifier.parent.parent.objectType.type ===
                AST_NODE_TYPES.TSTypeReference &&
              reference.identifier.parent.parent.objectType.typeName ===
                reference.identifier
            ) {
              continue;
            }

            // let a: typeof A['b']
            if (
              reference.identifier.parent.parent.type ===
                AST_NODE_TYPES.TSIndexedAccessType &&
              reference.identifier.parent.parent.objectType.type ===
                AST_NODE_TYPES.TSTypeQuery &&
              reference.identifier.parent.parent.objectType.exprName ===
                reference.identifier
            ) {
              continue;
            }

            // import * as React from 'react'
            // For some reason, this one only happens on some imports.
            // Specifically, it seems to happen with React. I suspect it's due to
            // `eslint-plugin-react` marking it as used, but I'm not sure.
            /* istanbul ignore next */
            if (
              reference.identifier.parent.type ===
                AST_NODE_TYPES.ImportNamespaceSpecifier &&
              reference.identifier.parent.local === reference.identifier
            ) {
              continue;
            }

            context.report({
              node: reference.identifier,
              messageId: 'directAccessOnly',
            });
          }
        },
      };
    },
  });

export default rule;
