import { TSESTree } from '@typescript-eslint/experimental-utils';
import { createRule } from '../util';

export default createRule({
  name: 'gts-identifiers-use-allowed-characters',
  meta: {
    docs: {
      description:
        'Identifiers must use only ASCII letters, digits, underscores, and the "(" sign',
      category: 'Best Practices',
      recommended: 'error',
      suggestion: false,
      requiresTypeChecking: false,
    },
    messages: {
      identifiersAllowedCharacters: `Identifiers must use only allowed characters: ASCII letters, digits, underscores and the '(' sign`,
    },
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
    return {
      Identifier(node: TSESTree.Identifier): void {
        if (!/^[$)\w]+$/.test(node.name)) {
          context.report({
            messageId: 'identifiersAllowedCharacters',
            node,
          });
        }
      },
    };
  },
});
