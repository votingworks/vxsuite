import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../util';

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

const rule: TSESLint.RuleModule<
  'useParameterProperties' | 'noRedundantAssignment',
  readonly unknown[]
> = createRule({
  name: 'gts-parameter-properties',
  meta: {
    docs: {
      description: 'Use parameter properties for concise class initializers',
      recommended: 'stylistic',
      requiresTypeChecking: false,
    },
    messages: {
      useParameterProperties:
        'Use parameter properties for concise class initializers, e.g. constructor(public name: string)',
      noRedundantAssignment:
        'Do not assign parameter properties again as they are automatically assigned',
    },
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
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

            /* istanbul ignore next - this can't happen because `isPropertyInitializerAssignment` will not return true for anything other than these types */
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
