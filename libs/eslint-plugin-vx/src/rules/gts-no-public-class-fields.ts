import { TSESTree } from '@typescript-eslint/experimental-utils';
import { createRule } from '../util';

export default createRule({
  name: 'gts-no-public-class-fields',
  meta: {
    docs: {
      description: 'Disallows public class fields.',
      category: 'Best Practices',
      recommended: 'error',
      suggestion: false,
      requiresTypeChecking: false,
    },
    messages: {
      noPublicClassFields:
        'Class fields must be protected or private, not public.',
    },
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
    function check(
      node: TSESTree.ClassProperty | TSESTree.TSParameterProperty
    ): void {
      if (
        !node.static &&
        node.accessibility !== 'protected' &&
        node.accessibility !== 'private'
      ) {
        context.report({
          node,
          messageId: 'noPublicClassFields',
        });
      }
    }
    return {
      ClassProperty: check,
      TSParameterProperty: check,
    };
  },
});
