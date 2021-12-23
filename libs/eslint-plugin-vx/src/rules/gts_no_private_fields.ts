import {
  AST_NODE_TYPES,
  TSESTree,
} from '@typescript-eslint/experimental-utils';
import { createRule } from '../util';

function isPrivateIdentifier(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.PrivateIdentifier;
}

export default createRule({
  name: 'gts-no-private-fields',
  meta: {
    docs: {
      description: 'Disallows use of private fields aka private identifiers',
      recommended: 'error',
      suggestion: false,
      requiresTypeChecking: false,
    },
    messages: {
      noPrivateFields: `Do not use private fields; instead, use TypeScript's visibility annotations`,
    },
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
    return {
      PropertyDefinition(node: TSESTree.PropertyDefinition): void {
        if (isPrivateIdentifier(node.key)) {
          context.report({
            node: node.key,
            messageId: 'noPrivateFields',
          });
        }
      },

      MemberExpression(node: TSESTree.MemberExpression): void {
        if (isPrivateIdentifier(node.property)) {
          context.report({
            node: node.property,
            messageId: 'noPrivateFields',
          });
        }
      },

      MethodDefinition(node: TSESTree.MethodDefinition) {
        if (isPrivateIdentifier(node.key)) {
          context.report({
            node: node.key,
            messageId: 'noPrivateFields',
          });
        }
      },
    };
  },
});
