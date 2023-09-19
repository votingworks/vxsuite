import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../util';

const rule: TSESLint.RuleModule<'noPublicClassFields', readonly unknown[]> =
  createRule({
    name: 'gts-no-public-class-fields',
    meta: {
      docs: {
        description: 'Disallows public class fields.',
        recommended: 'strict',
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
        node: TSESTree.PropertyDefinition | TSESTree.TSParameterProperty
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
        PropertyDefinition: check,
        TSParameterProperty: check,
      };
    },
  });

export default rule;
