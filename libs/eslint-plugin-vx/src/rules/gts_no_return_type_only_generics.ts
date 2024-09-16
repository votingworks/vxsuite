import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { strict as assert } from 'node:assert';
import { createRule } from '../util';

const rule: TSESLint.RuleModule<
  'noReturnTypeOnlyGenerics',
  readonly unknown[]
> = createRule({
  name: 'gts-no-return-type-only-generics',
  meta: {
    hasSuggestions: true,
    docs: {
      description:
        'Disallows generics in functions where the only use is in the return type',
      recommended: 'strict',
      requiresTypeChecking: true,
    },
    messages: {
      noReturnTypeOnlyGenerics:
        'Do not declare functions with return type-only generics',
    },
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
    function isTypeParameterReturnOnly(
      node: TSESTree.FunctionLike,
      typeParameter: TSESTree.TSTypeParameter
    ): boolean {
      const scope = context.getScope();
      const variable = scope.set.get(typeParameter.name.name);
      let typeParameterReferencedByFunctionParamType = false;
      let typeParameterReferencedByFunctionReturnType = false;
      assert(variable, 'type parameters must have a scope entry');

      for (const ref of variable.references) {
        for (
          let refContainer: TSESTree.Node | undefined = ref.identifier;
          refContainer.parent;
          refContainer = refContainer.parent
        ) {
          if (refContainer.parent === node) {
            if (node.params.includes(refContainer as TSESTree.Parameter)) {
              typeParameterReferencedByFunctionParamType = true;
            } else if (node.returnType === refContainer) {
              typeParameterReferencedByFunctionReturnType = true;
            }

            break;
          }

          if (
            refContainer.type === AST_NODE_TYPES.TSTypeParameter &&
            refContainer.parent === node.typeParameters &&
            refContainer !== typeParameter &&
            !isTypeParameterReturnOnly(node, refContainer)
          ) {
            // This type parameter is referenced in the definition of another
            // type parameter that is _not_ return-only, so we consider this one
            // as also not return-only.
            return false;
          }
        }
      }

      return (
        typeParameterReferencedByFunctionReturnType &&
        !typeParameterReferencedByFunctionParamType
      );
    }

    function checkFunction(node: TSESTree.FunctionLike): void {
      for (const typeParameter of node.typeParameters?.params ?? []) {
        if (isTypeParameterReturnOnly(node, typeParameter)) {
          context.report({
            messageId: 'noReturnTypeOnlyGenerics',
            node: typeParameter,
          });
        }
      }
    }

    return {
      ArrowFunctionExpression: checkFunction,
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      TSDeclareFunction: checkFunction,
    };
  },
});

export default rule;
