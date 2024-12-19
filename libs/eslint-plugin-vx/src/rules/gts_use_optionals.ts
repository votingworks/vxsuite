import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { strict as assert } from 'node:assert';
import { createRule, isBindingName } from '../util';

interface GetUndefinedUnionPartResult {
  unionType: TSESTree.TSUnionType;
  undefinedType: TSESTree.TSUndefinedKeyword;
}

function getUndefinedUnionPart(
  node: TSESTree.TypeNode
): GetUndefinedUnionPartResult | undefined {
  if (node.type === AST_NODE_TYPES.TSUnionType) {
    for (const elementType of node.types) {
      if (elementType.type === AST_NODE_TYPES.TSUndefinedKeyword) {
        return { unionType: node, undefinedType: elementType };
      }
    }
  }
}

interface GetOptionalTypeReferenceResult {
  optionalType: TSESTree.TSTypeReference;
  wrappedType: TSESTree.TypeNode;
}

function getOptionalTypeReference(
  node: TSESTree.TypeNode
): GetOptionalTypeReferenceResult | undefined {
  if (
    node.type === AST_NODE_TYPES.TSTypeReference &&
    node.typeName.type === AST_NODE_TYPES.Identifier &&
    node.typeName.name === 'Optional' &&
    node.typeArguments?.params.length === 1
  ) {
    return { optionalType: node, wrappedType: node.typeArguments.params[0] };
  }
}

const rule: TSESLint.RuleModule<
  | 'useOptionalInterfaceProperties'
  | 'useOptionalClassFields'
  | 'useOptionalParams',
  readonly unknown[]
> = createRule({
  name: 'gts-use-optionals',
  meta: {
    docs: {
      description:
        'Use optional fields (on interfaces or classes) and parameters rather than a |undefined type.',
      recommended: 'stylistic',
      requiresTypeChecking: false,
    },
    fixable: 'code',
    messages: {
      useOptionalInterfaceProperties: `Use optional properties on interfaces rather than a |undefined type`,
      useOptionalClassFields: `Use optional fields on classes rather than a |undefined type`,
      useOptionalParams: `Use optional params rather than a |undefined type`,
    },
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
    const sourceCode = context.getSourceCode();

    function getFixFunction(
      typeAnnotation: TSESTree.TSTypeAnnotation
    ): TSESLint.ReportFixFunction | undefined {
      const undefinedUnionResult = getUndefinedUnionPart(
        typeAnnotation.typeAnnotation
      );

      if (undefinedUnionResult) {
        return function* getFixes(fixer) {
          const pipeBefore = sourceCode.getTokenBefore(
            undefinedUnionResult.undefinedType
          );
          assert(pipeBefore);
          const pipeAfter = sourceCode.getTokenAfter(
            undefinedUnionResult.undefinedType
          );
          /* istanbul ignore else */
          if (pipeBefore.value === '|') {
            yield fixer.remove(pipeBefore);
          } else if (pipeAfter?.value === '|') {
            yield fixer.remove(pipeAfter);
          } else {
            assert.fail('could not find union type pipe around `undefined`');
          }
          yield fixer.remove(undefinedUnionResult.undefinedType);

          const colonToken = sourceCode.getFirstToken(typeAnnotation);
          assert(colonToken && colonToken.value === ':');
          const questionMarkToken = sourceCode.getTokenBefore(colonToken);
          assert(questionMarkToken);
          if (questionMarkToken.value !== '?') {
            yield fixer.insertTextBefore(colonToken, '?');
          }
        };
      }

      const optionalTypeReferenceResult = getOptionalTypeReference(
        typeAnnotation.typeAnnotation
      );

      if (optionalTypeReferenceResult) {
        return function* getFixes(fixer) {
          yield fixer.remove(optionalTypeReferenceResult.optionalType.typeName);

          const typeParamStartToken = sourceCode.getFirstTokenBetween(
            optionalTypeReferenceResult.optionalType.typeName,
            optionalTypeReferenceResult.wrappedType
          );
          assert(typeParamStartToken && typeParamStartToken.value === '<');
          yield fixer.remove(typeParamStartToken);

          const typeParamEndToken = sourceCode.getLastToken(
            typeAnnotation.typeAnnotation
          );
          assert(typeParamEndToken && typeParamEndToken.value === '>');
          yield fixer.remove(typeParamEndToken);

          const colonToken = sourceCode.getFirstToken(typeAnnotation);
          assert(colonToken && colonToken.value === ':');
          const questionMarkToken = sourceCode.getTokenBefore(colonToken);
          assert(questionMarkToken);
          if (questionMarkToken.value !== '?') {
            yield fixer.insertTextBefore(colonToken, '?');
          }
        };
      }
    }

    function checkFunction(node: {
      params: readonly TSESTree.Parameter[];
    }): void {
      const possibleViolations = node.params.map<
        [TSESTree.BindingName, TSESLint.ReportFixFunction] | undefined
      >((param) => {
        if (isBindingName(param) && param.typeAnnotation) {
          const fix = getFixFunction(param.typeAnnotation);
          if (fix) {
            return [param, fix];
          }
        }

        if (
          param.type === AST_NODE_TYPES.AssignmentPattern &&
          isBindingName(param.left) &&
          param.left.typeAnnotation
        ) {
          const fix = getFixFunction(param.left.typeAnnotation);
          if (fix) {
            return [param.left, fix];
          }
        }

        return undefined;
      });

      let indexOfLastNonOptionalParam = -1;
      for (const [i, param] of node.params.entries()) {
        if (isBindingName(param) && !param.optional) {
          indexOfLastNonOptionalParam = i;
        }
      }

      for (const [i, paramAndFix] of possibleViolations.entries()) {
        if (
          // do not report params that come before non-optional params
          i < indexOfLastNonOptionalParam ||
          !paramAndFix
        ) {
          continue;
        }

        const [param, fix] = paramAndFix;
        context.report({
          messageId: 'useOptionalParams',
          node: param,
          fix,
        });
      }
    }

    return {
      PropertyDefinition(node: TSESTree.PropertyDefinition): void {
        const fix = node.typeAnnotation && getFixFunction(node.typeAnnotation);
        if (fix) {
          context.report({
            messageId: 'useOptionalClassFields',
            node,
            fix,
          });
        }
      },

      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction,
      TSFunctionType: checkFunction,
      TSMethodSignature: checkFunction,

      TSParameterProperty(node: TSESTree.TSParameterProperty): void {
        const fix =
          node.parameter.typeAnnotation &&
          getFixFunction(node.parameter.typeAnnotation);
        if (fix) {
          context.report({
            messageId: 'useOptionalClassFields',
            node,
            fix,
          });
        }
      },

      TSPropertySignature(node: TSESTree.TSPropertySignature): void {
        const fix = node.typeAnnotation && getFixFunction(node.typeAnnotation);
        if (fix) {
          context.report({
            messageId: 'useOptionalInterfaceProperties',
            node,
            fix,
          });
        }
      },
    };
  },
});

export default rule;
