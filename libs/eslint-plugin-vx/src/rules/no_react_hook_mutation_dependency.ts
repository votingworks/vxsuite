import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../util';

const HOOKS_WITH_DEPS = [
  'useEffect',
  'useLayoutEffect',
  'useMemo',
  'useCallback',
  'useImperativeHandle',
];

const MUTATION_TYPE_NAME = 'UseMutationResult';

const rule: TSESLint.RuleModule<'badMutationDependency', readonly unknown[]> =
  createRule({
    name: 'no-react-hook-mutation-dependency',
    meta: {
      docs: {
        description:
          'Prevents react query mutation objects from being used as dependencies in react hooks.',
        recommended: 'error',
        suggestion: false,
        requiresTypeChecking: true,
      },
      messages: {
        badMutationDependency:
          'Mutations change identity on every render, so they should not be used as dependencies in React hooks. Instead, pass the properties of the mutation (e.g. `mutate` or `mutateAsync`) since they are stable references.',
      },
      schema: [],
      type: 'problem',
    },
    defaultOptions: [],

    create(context) {
      return {
        CallExpression(node: TSESTree.CallExpression) {
          if (
            node.callee.type !== AST_NODE_TYPES.Identifier ||
            !HOOKS_WITH_DEPS.includes(node.callee.name)
          ) {
            return;
          }

          const deps = node.arguments[1];
          if (!deps || deps.type !== AST_NODE_TYPES.ArrayExpression) {
            return;
          }

          const { parserServices } = context.getSourceCode();
          const tsNodeMap = parserServices.esTreeNodeToTSNodeMap;
          const typeChecker = parserServices.program.getTypeChecker();

          const mutation = deps.elements.find((element) => {
            const type = typeChecker.getTypeAtLocation(tsNodeMap.get(element));
            // istanbul ignore next - unsure how to reproduce aliasSymbol in tests
            const typeName = type.symbol?.name ?? type.aliasSymbol?.name;
            return typeName === MUTATION_TYPE_NAME;
          });

          if (mutation) {
            context.report({
              node: mutation,
              messageId: 'badMutationDependency',
            });
          }
        },
      };
    },
  });

export default rule;
