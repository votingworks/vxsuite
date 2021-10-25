import { TSESTree } from '@typescript-eslint/experimental-utils';
import { createRule } from '../util';

export default createRule({
  name: 'gts-no-unnecessary-has-own-property-check',
  meta: {
    docs: {
      description:
        'Flags unnecessary `hasOwnProperty` checks inside `for-of` loops',
      category: 'Best Practices',
      recommended: 'error',
      suggestion: false,
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

    return Object.fromEntries(
      [
        `${forOfBlockIf}${hasOwnPropertyCall}`,
        `${forOfIf}${hasOwnPropertyCall}`,
        `${forOfBlockIf}${unaryNegation}${hasOwnPropertyCall}`,
        `${forOfIf}${unaryNegation}${hasOwnPropertyCall}`,
        `${forOfBlockIf}${hasOwnPropertyPrototypeCall}`,
        `${forOfIf}${hasOwnPropertyPrototypeCall}`,
        `${forOfBlockIf}${unaryNegation}${hasOwnPropertyPrototypeCall}`,
        `${forOfIf}${unaryNegation}${hasOwnPropertyPrototypeCall}`,
      ].map((pattern) => [
        pattern,
        (node: TSESTree.Node) =>
          context.report({
            node,
            messageId: 'noUnnecessaryHasOwnPropertyCheck',
          }),
      ])
    );
  },
});
