import {
  AST_NODE_TYPES,
  ESLintUtils,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import {
  containsArbitraryStringType,
  containsNamedType,
  createRule,
} from '../util';

const rule: TSESLint.RuleModule<
  | 'noRecordAsMap'
  | 'noObjectEntriesOnMap'
  | 'noObjectValuesOnMap'
  | 'noObjectKeysOnMap',
  readonly unknown[]
> = createRule({
  name: 'no-record-as-map',
  meta: {
    docs: {
      description:
        'Prevents the use of the `Record` type with arbitrary string keys',
      recommended: 'strict',
      requiresTypeChecking: true,
    },
    messages: {
      noRecordAsMap: 'Use `Map` instead of `Record` for arbitrary keys',
      noObjectEntriesOnMap: 'Use `Map::entries` instead of `Object.entries`',
      noObjectValuesOnMap: 'Use `Map::values` instead of `Object.values`',
      noObjectKeysOnMap: 'Use `Map::keys` instead of `Object.keys`',
    },
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
    const parserServices = ESLintUtils.getParserServices(context);
    const checker = parserServices.program.getTypeChecker();

    return {
      TSTypeReference({ typeName, typeArguments }: TSESTree.TSTypeReference) {
        if (
          typeName.type === AST_NODE_TYPES.Identifier &&
          typeName.name === 'Record' &&
          typeArguments?.params.length === 2
        ) {
          const tsNode = parserServices.esTreeNodeToTSNodeMap.get(
            typeArguments.params[0]
          );
          const tsType = checker.getTypeAtLocation(tsNode);

          if (containsArbitraryStringType(tsType)) {
            context.report({
              node: typeName,
              messageId: 'noRecordAsMap',
            });
          }
        }
      },

      CallExpression(node: TSESTree.CallExpression) {
        if (
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          !node.callee.computed &&
          node.callee.object.type === AST_NODE_TYPES.Identifier &&
          node.callee.object.name === 'Object' &&
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.arguments.length === 1
        ) {
          const argumentType = checker.getTypeAtLocation(
            parserServices.esTreeNodeToTSNodeMap.get(node.arguments[0])
          );

          if (!containsNamedType('Map', argumentType)) {
            return;
          }

          if (
            node.callee.property.type === AST_NODE_TYPES.Identifier &&
            node.callee.property.name === 'entries'
          ) {
            context.report({
              node: node.callee.property,
              messageId: 'noObjectEntriesOnMap',
            });
          } else if (
            node.callee.property.type === AST_NODE_TYPES.Identifier &&
            node.callee.property.name === 'values'
          ) {
            context.report({
              node: node.callee.property,
              messageId: 'noObjectValuesOnMap',
            });
          } else if (
            node.callee.property.type === AST_NODE_TYPES.Identifier &&
            node.callee.property.name === 'keys'
          ) {
            context.report({
              node: node.callee.property,
              messageId: 'noObjectKeysOnMap',
            });
          }
        }
      },
    };
  },
});

export default rule;
