/* eslint-disable no-bitwise */
import {
  AST_NODE_TYPES,
  ESLintUtils,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { strict as assert } from 'node:assert';
import * as ts from 'typescript';
import { createRule, getCollectionType } from '../util';

function isIterableType(type: ts.Type): boolean {
  return (
    type
      .getProperties()
      // TypeScript 4.2.x has a property with name '__@iterator', but in
      // TypeScript 4.6.x it's '__@iterator@10' and possibly others.
      .some((p) => p.getName().startsWith('__@iterator'))
  );
}

function isAnyType(type: ts.Type): boolean {
  return (type.getFlags() & ts.TypeFlags.Any) === ts.TypeFlags.Any;
}

function isObjectType(type: ts.Type): boolean {
  if (type.isUnion()) {
    return type.types.every((subtype) => isObjectType(subtype));
  }

  if (type.isIntersection()) {
    return type.types.some((subtype) => isObjectType(subtype));
  }

  const flags = type.getFlags();

  return (
    (flags & ts.TypeFlags.Object) === ts.TypeFlags.Object ||
    (flags & ts.TypeFlags.NonPrimitive) === ts.TypeFlags.NonPrimitive
  );
}

const rule: TSESLint.RuleModule<
  | 'requireIterablesInArraySpread'
  | 'requireObjectsInObjectSpread'
  | 'requireIterablesInCallSpread',
  readonly unknown[]
> = createRule({
  name: 'gts-spread-like-types',
  meta: {
    docs: {
      description:
        'Requires spreading iterables in arrays and objects in objects',
      recommended: 'strict',
      requiresTypeChecking: true,
    },
    messages: {
      requireIterablesInArraySpread: 'Only iterables may be spread into arrays',
      requireObjectsInObjectSpread: 'Only objects may be spread into objects',
      requireIterablesInCallSpread:
        'Only iterables may be spread into arguments',
    },
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
    const parserServices = ESLintUtils.getParserServices(context);
    const checker = parserServices.program.getTypeChecker();

    return {
      SpreadElement(node: TSESTree.SpreadElement): void {
        assert(node.parent);

        const spreadArgumentNode = parserServices.esTreeNodeToTSNodeMap.get(
          node.argument
        );
        const spreadArgumentType =
          checker.getTypeAtLocation(spreadArgumentNode);

        if (isAnyType(spreadArgumentType)) {
          return;
        }

        switch (node.parent.type) {
          case AST_NODE_TYPES.CallExpression:
          case AST_NODE_TYPES.NewExpression:
          case AST_NODE_TYPES.ArrayExpression: {
            const isIterable = isIterableType(spreadArgumentType);
            if (!isIterable) {
              context.report({
                messageId:
                  node.parent.type === AST_NODE_TYPES.ArrayExpression
                    ? 'requireIterablesInArraySpread'
                    : 'requireIterablesInCallSpread',
                node,
              });
            }
            break;
          }

          case AST_NODE_TYPES.ObjectExpression: {
            const isObject = isObjectType(spreadArgumentType);
            const isCollection =
              isObject && getCollectionType(checker, spreadArgumentNode);

            if (!isObject || isCollection) {
              context.report({
                messageId: 'requireObjectsInObjectSpread',
                node,
              });
            }
            break;
          }

          /* istanbul ignore next - this should not be possible */
          default:
            throw new Error(
              `unexpected spread element parent: ${node.parent.type}`
            );
        }
      },
    };
  },
});

export default rule;
