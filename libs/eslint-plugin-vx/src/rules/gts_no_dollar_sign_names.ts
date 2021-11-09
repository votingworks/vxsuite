import { TSESTree } from '@typescript-eslint/experimental-utils';
import { createRule } from '../util';

export default createRule({
  name: 'gts-no-dollar-sign-names',
  meta: {
    docs: {
      description:
        'Disallows use of $ in identifiers, except when aligning with naming conventions for third party frameworks.',
      category: 'Best Practices',
      recommended: 'error',
      suggestion: false,
      requiresTypeChecking: false,
    },
    messages: {
      noDollarSign: `Do not use $ in names`,
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowedNames: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    type: 'problem',
  },
  defaultOptions: [{ allowedNames: [] as string[] }],

  create(context) {
    const { allowedNames = [] } = context.options[0] ?? {};

    return {
      Identifier(node: TSESTree.Identifier): void {
        if (node.name.includes('$') && !allowedNames.includes(node.name)) {
          context.report({
            messageId: 'noDollarSign',
            node,
          });
        }
      },
    };
  },
});
