import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { strict as assert } from 'node:assert';
import { createRule } from '../util';

const rule: TSESLint.RuleModule<'noPublicModifier', readonly unknown[]> =
  createRule({
    name: 'gts-no-public-modifier',
    meta: {
      docs: {
        description:
          'Disallows use of `public` accessibility modifiers on class properties',
        recommended: 'strict',
        requiresTypeChecking: false,
      },
      fixable: 'code',
      messages: {
        noPublicModifier:
          'Do not use `public` modifier on class properties; they are already public by default',
      },
      schema: [],
      type: 'problem',
    },
    defaultOptions: [],

    create(context) {
      const sourceCode = context.getSourceCode();

      function reportPublicToken(node: TSESTree.Node): void {
        const [publicToken, nextToken] = sourceCode.getFirstTokens(node, {
          count: 2,
        });
        assert(publicToken && publicToken.value === 'public');
        assert(nextToken);

        context.report({
          node: publicToken,
          messageId: 'noPublicModifier',
          fix: (fixer) =>
            fixer.removeRange([publicToken.range[0], nextToken.range[0]]),
        });
      }

      function processNode(
        node: TSESTree.PropertyDefinition | TSESTree.MethodDefinition
      ): void {
        if (node.accessibility === 'public') {
          reportPublicToken(node);
        }

        if (
          node.type === AST_NODE_TYPES.MethodDefinition &&
          node.key.type === AST_NODE_TYPES.Identifier &&
          node.key.name === 'constructor'
        ) {
          for (const param of node.value.params) {
            if (
              param.type === AST_NODE_TYPES.TSParameterProperty &&
              param.accessibility === 'public' &&
              param.readonly
            ) {
              reportPublicToken(param);
            }
          }
        }
      }

      return {
        PropertyDefinition: processNode,
        MethodDefinition: processNode,
      };
    },
  });

export default rule;
