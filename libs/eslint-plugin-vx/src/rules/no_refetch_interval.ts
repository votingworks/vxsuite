import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../util';

/**
 * Disallows setting react-query's `refetchInterval` option, whether in a
 * `useQuery` call or in a query client's default options. react-query runs a
 * separate refetch timer for every observer that sets a `refetchInterval`,
 * and the resulting requests only coalesce if they literally overlap, so N
 * components subscribing to one polled query multiply the request rate
 * N-fold. `usePollingQuery` from `@votingworks/ui` drives all instances of a
 * query with a single shared timer instead.
 */
const rule: TSESLint.RuleModule<'noRefetchInterval', readonly unknown[]> =
  createRule({
    name: 'no-refetch-interval',
    meta: {
      docs: {
        description:
          "Disallows react-query's `refetchInterval` option in favor of `usePollingQuery`.",
      },
      messages: {
        noRefetchInterval:
          'react-query runs a separate refetch timer for every observer that sets `refetchInterval`, so multiple components subscribing to one polled query multiply the request rate. Use `usePollingQuery` from `@votingworks/ui` instead, which drives all instances of a query with a single shared timer.',
      },
      schema: [],
      type: 'problem',
    },
    defaultOptions: [],

    create(context) {
      return {
        Property(node: TSESTree.Property) {
          if (node.parent.type !== AST_NODE_TYPES.ObjectExpression) {
            return;
          }

          const isRefetchIntervalKey =
            (node.key.type === AST_NODE_TYPES.Identifier &&
              !node.computed &&
              node.key.name === 'refetchInterval') ||
            (node.key.type === AST_NODE_TYPES.Literal &&
              node.key.value === 'refetchInterval');

          if (isRefetchIntervalKey) {
            context.report({
              node,
              messageId: 'noRefetchInterval',
            });
          }
        },
      };
    },
  });

export default rule;
