import {
  AST_NODE_TYPES,
  ESLintUtils,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import * as ts from 'typescript';
import { createRule } from '../util';

export interface Options {
  objects: boolean;
  asserts: string[];
}

function typeIncludesStringOrNumber(type: ts.Type): boolean {
  if (type.isUnion()) {
    return type.types.some((subtype) => typeIncludesStringOrNumber(subtype));
  }

  const flags = type.getFlags();

  return (
    flags === ts.TypeFlags.String ||
    flags === ts.TypeFlags.Number ||
    flags === ts.TypeFlags.NumberLiteral ||
    flags === ts.TypeFlags.StringLiteral
  );
}

function typeIncludesUndefined(type: ts.Type): boolean {
  if (type.isUnion()) {
    return type.types.some((subtype) => typeIncludesUndefined(subtype));
  }

  return type.getFlags() === ts.TypeFlags.Undefined;
}

function typeIsBoolean(type: ts.Type): boolean {
  const flags = type.getFlags();
  return (
    flags === ts.TypeFlags.Boolean || flags === ts.TypeFlags.BooleanLiteral
  );
}

const rule: TSESLint.RuleModule<
  'assertStringOrNumber' | 'assertObject',
  Options[]
> = createRule({
  name: 'no-assert-truthiness',
  meta: {
    fixable: 'code',
    hasSuggestions: true,
    docs: {
      description: 'Forbids truthiness checks in `assert`',
      recommended: 'strict',
      requiresTypeChecking: true,
    },
    messages: {
      assertStringOrNumber:
        '`assert` may not operate on strings or numbers; maybe you want a `typeof` check?',
      assertObject:
        '`assert` may not operate on objects; maybe you want a `typeof` check?',
    },
    schema: [
      {
        type: 'object',
        properties: {
          objects: { type: 'boolean' },
          asserts: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    type: 'problem',
  },
  defaultOptions: [
    {
      objects: false,
      asserts: ['assert'],
    },
  ],

  create(context, [options]) {
    const parserServices = ESLintUtils.getParserServices(context);
    const checker = parserServices.program.getTypeChecker();

    return {
      CallExpression(node: TSESTree.CallExpression): void {
        if (node.callee.type !== AST_NODE_TYPES.Identifier) {
          return;
        }

        if (!options.asserts.includes(node.callee.name)) {
          return;
        }

        if (node.arguments.length === 0) {
          return;
        }

        const [assertValue] = node.arguments;
        const tsAssertionNode =
          parserServices.esTreeNodeToTSNodeMap.get(assertValue);
        const assertValueType = checker.getTypeAtLocation(tsAssertionNode);

        if (typeIsBoolean(assertValueType)) {
          return;
        }

        const hasStringOrNumber = typeIncludesStringOrNumber(assertValueType);
        const isViolation = options.objects || hasStringOrNumber;

        if (isViolation) {
          const includesUndefined = typeIncludesUndefined(assertValueType);
          const isFixable = !hasStringOrNumber && includesUndefined;
          context.report({
            node: assertValue,
            messageId: hasStringOrNumber
              ? 'assertStringOrNumber'
              : 'assertObject',
            fix: !isFixable
              ? undefined
              : (fixer) => [
                  fixer.insertTextBeforeRange(assertValue.range, 'typeof '),
                  fixer.insertTextAfterRange(
                    assertValue.range,
                    ` !== 'undefined'`
                  ),
                ],
          });
        }
      },
    };
  },
});

export default rule;
