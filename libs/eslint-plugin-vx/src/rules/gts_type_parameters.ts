import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../util';

function isValidTypeParameterName(name: string): boolean {
  return /^([A-Z]|([A-Z][a-z\d]+)+)$/.test(name);
}

const rule: TSESLint.RuleModule<
  'typeParametersMustHaveSingleLetterOrUpperCamelCaseName',
  readonly unknown[]
> = createRule({
  name: 'gts-type-parameters',
  meta: {
    docs: {
      description: 'Requires type parameters be named appropriately.',
      recommended: 'stylistic',
      requiresTypeChecking: false,
    },
    messages: {
      typeParametersMustHaveSingleLetterOrUpperCamelCaseName:
        'Type parameters, like in Array<T>, may use a single upper case character (T) or UpperCamelCase.',
    },
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
    return {
      TSTypeParameter(node: TSESTree.TSTypeParameter): void {
        if (!isValidTypeParameterName(node.name.name)) {
          context.report({
            node,
            messageId: 'typeParametersMustHaveSingleLetterOrUpperCamelCaseName',
          });
        }
      },
    };
  },
});

export default rule;
