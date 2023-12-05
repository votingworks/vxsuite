import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../util';

const rule: TSESLint.RuleModule<
  'noUnnecessaryHasOwnPropertyCheck',
  readonly unknown[]
> = createRule({
  name: 'gts-no-unnecessary-has-own-property-check',
  meta: {
    docs: {
      description:
        'Flags unnecessary `hasOwnProperty` checks inside `for-of` loops',
      recommended: 'strict',
      requiresTypeChecking: false,
    },
    messages: {
      noUnnecessaryHasOwnPropertyCheck:
        'hasOwnProperty check is unnecessary inside a `for-of` loop',
    },
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
    const forOfBlockIf = `ForOfStatement > BlockStatement > IfStatement.body > .test`;
    const forOfIf = `ForOfStatement > IfStatement.body > .test`;
    const unaryNegation = `[type=UnaryExpression][operator="!"] > .argument`;
    const hasOwnPropertyCall =
      '[type=CallExpression] > MemberExpression.callee > Identifier.property[name=hasOwnProperty]';
    const hasOwnPropertyPrototypeCall =
      '[type=CallExpression] > MemberExpression.callee > MemberExpression.object[object.object.name="Object"][object.property.name="prototype"]' +
      ' > Identifier.property[name=hasOwnProperty]';

    function report(node: TSESTree.Node) {
      context.report({
        node,
        messageId: 'noUnnecessaryHasOwnPropertyCheck',
      });
    }

    return {
      [`${forOfBlockIf}${hasOwnPropertyCall}`]: report,
      [`${forOfIf}${hasOwnPropertyCall}`]: report,
      [`${forOfBlockIf}${unaryNegation}${hasOwnPropertyCall}`]: report,
      [`${forOfIf}${unaryNegation}${hasOwnPropertyCall}`]: report,
      [`${forOfBlockIf}${hasOwnPropertyPrototypeCall}`]: report,
      [`${forOfIf}${hasOwnPropertyPrototypeCall}`]: report,
      [`${forOfBlockIf}${unaryNegation}${hasOwnPropertyPrototypeCall}`]: report,
      [`${forOfIf}${unaryNegation}${hasOwnPropertyPrototypeCall}`]: report,
    };
  },
});

export default rule;
