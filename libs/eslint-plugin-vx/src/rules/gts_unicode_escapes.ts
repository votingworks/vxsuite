import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import {
  createRule,
  enumerateCharacterCodeEscapes,
  enumerateNonPrintableCharacters,
  hasAttachedComment,
  isNonPrintableCharacter,
} from '../util';

const QUOTE_LENGTH = '"'.length;

const rule: TSESLint.RuleModule<
  | 'escapeSequenceMissingComment'
  | 'useLiteralPrintableCharacter'
  | 'useEscapeSequenceForNonPrintableCharacter',
  readonly unknown[]
> = createRule({
  name: 'gts-unicode-escapes',
  meta: {
    docs: {
      description:
        'Requires the use of real Unicode characters when printable, escapes when non-printable.',
      recommended: 'stylistic',
      requiresTypeChecking: false,
    },
    messages: {
      escapeSequenceMissingComment:
        'Escape sequence ‘{{escaped}}’ is missing an explanatory comment.',
      useLiteralPrintableCharacter:
        'Unnecessary escape sequence ‘{{escaped}}’ for a printable character; use ‘{{char}}’ directly.',
      useEscapeSequenceForNonPrintableCharacter:
        'Use the escape sequence ‘{{escaped}}’ for the non-printable character.',
    },
    schema: [],
    type: 'problem',
    fixable: 'code',
  },
  defaultOptions: [],

  create(context) {
    const sourceCode = context.getSourceCode();

    function checkNonPrintableCharacters(
      node: TSESTree.Node,
      raw: string,
      startIndex: number
    ): void {
      for (const {
        nonPrintableCharacter,
        index,
      } of enumerateNonPrintableCharacters(raw)) {
        const matchIndex = startIndex + index;
        const nonPrintableCharacterCode = nonPrintableCharacter.charCodeAt(0);
        const escaped = `\\u${nonPrintableCharacterCode
          .toString(16)
          .padStart(4, '0')}`;

        context.report({
          node,
          messageId: 'useEscapeSequenceForNonPrintableCharacter',
          data: { escaped },
          fix: (fixer) =>
            fixer.replaceTextRange(
              [matchIndex, matchIndex + nonPrintableCharacter.length],
              escaped
            ),
        });
      }
    }

    function checkEscapes(
      node: TSESTree.Node,
      raw: string,
      startIndex: number
    ): void {
      for (const {
        escapeSequence,
        char,
        index,
      } of enumerateCharacterCodeEscapes(raw)) {
        const matchIndex = startIndex + index;
        const escaped = escapeSequence;
        const isAllowedEscapeSequence =
          isNonPrintableCharacter(char) || char === '\n' || char === '\r';

        if (isAllowedEscapeSequence) {
          if (!hasAttachedComment(sourceCode, node)) {
            context.report({
              node,
              messageId: 'escapeSequenceMissingComment',
              data: { escaped },
            });
          }
        } else {
          context.report({
            node,
            messageId: 'useLiteralPrintableCharacter',
            data: { escaped, char },
            fix: (fixer) =>
              fixer.replaceTextRange(
                [matchIndex, matchIndex + escaped.length],
                char
              ),
          });
        }
      }
    }

    function check(node: TSESTree.Node, raw: string, startIndex: number): void {
      checkNonPrintableCharacters(node, raw, startIndex);
      checkEscapes(node, raw, startIndex);
    }

    return {
      Literal(node: TSESTree.Literal): void {
        if (typeof node.value !== 'string') {
          return;
        }

        check(
          node,
          node.raw.slice(QUOTE_LENGTH, -QUOTE_LENGTH),
          node.range[0] + QUOTE_LENGTH
        );
      },

      TemplateLiteral(node: TSESTree.TemplateLiteral): void {
        for (const [i, quasi] of node.quasis.entries()) {
          check(
            node,
            quasi.value.raw,
            quasi.range[0] + (i === 0 ? QUOTE_LENGTH : 0)
          );
        }
      },
    };
  },
});

export default rule;
