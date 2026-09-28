import {
  AST_NODE_TYPES,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../util/index.ts';

function getParamName(param: TSESTree.Parameter): string | undefined {
  switch (param.type) {
    case AST_NODE_TYPES.Identifier:
      return param.name;

    case AST_NODE_TYPES.TSParameterProperty:
      return getParamName(param.parameter);

    default:
      return undefined;
  }
}

function isPropertyInitializerAssignment(
  param: TSESTree.Parameter,
  statement: TSESTree.Statement
): boolean {
  const name = getParamName(param);

  return (
    Boolean(name) &&
    statement.type === AST_NODE_TYPES.ExpressionStatement &&
    statement.expression.type === AST_NODE_TYPES.AssignmentExpression &&
    statement.expression.left.type === AST_NODE_TYPES.MemberExpression &&
    statement.expression.left.object.type === AST_NODE_TYPES.ThisExpression &&
    statement.expression.left.property.type === AST_NODE_TYPES.Identifier &&
    statement.expression.left.property.name === name &&
    statement.expression.right.type === AST_NODE_TYPES.Identifier &&
    statement.expression.right.name === name
  );
}

interface Options {
  useParameterProperties: 'always' | 'never';
}

type MessageId =
  | 'useParameterProperties'
  | 'doNotUseParameterProperties'
  | 'noRedundantAssignment';

const rule: TSESLint.RuleModule<MessageId, readonly [Options]> = createRule<
  [Options],
  MessageId
>({
  name: 'gts-parameter-properties',
  meta: {
    docs: {
      description:
        'Determine whether to use parameter properties for concise class initializers',
    },
    messages: {
      useParameterProperties:
        'Use parameter properties for concise class initializers, e.g. constructor(public name: string)',
      doNotUseParameterProperties:
        'Do not use parameter properties; declare properties separately and assign in the constructor',
      noRedundantAssignment:
        'Do not assign parameter properties again as they are automatically assigned',
    },
    schema: [
      {
        type: 'object',
        properties: {
          useParameterProperties: { type: 'string', enum: ['always', 'never'] },
        },
        additionalProperties: false,
      },
    ],
    type: 'problem',
  },
  defaultOptions: [{ useParameterProperties: 'always' }],

  create(context, [{ useParameterProperties }]) {
    return {
      MethodDefinition(node: TSESTree.MethodDefinition): void {
        if (
          node.key.type !== AST_NODE_TYPES.Identifier ||
          node.key.name !== 'constructor'
        ) {
          return;
        }

        const { params, body } = node.value;
        const statements = body?.body ?? [];

        for (const param of params) {
          if (useParameterProperties === 'never') {
            if (param.type === AST_NODE_TYPES.TSParameterProperty) {
              context.report({
                node: param,
                messageId: 'doNotUseParameterProperties',
              });
            }
            continue;
          }

          const assignmentStatement = statements.find((statement) =>
            isPropertyInitializerAssignment(param, statement)
          );
          if (!assignmentStatement) {
            continue;
          }

          switch (param.type) {
            case AST_NODE_TYPES.Identifier:
              context.report({
                node: param,
                messageId: 'useParameterProperties',
              });
              break;

            case AST_NODE_TYPES.TSParameterProperty:
              context.report({
                node: assignmentStatement,
                messageId: 'noRedundantAssignment',
              });
              break;

            // @coverage-exclude: this can't happen because `isPropertyInitializerAssignment` will not return true for anything other than these types
            default:
              // nothing to do
              break;
          }
        }
      },
    };
  },
});

export default rule;
