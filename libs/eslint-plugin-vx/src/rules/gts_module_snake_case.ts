import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { basename } from 'node:path';
import { createRule } from '../util/index.ts';

function convertFileNameToSnakeCase(fileName: string): string {
  return fileName
    .replace(/[A-Z]+/g, (caps, index) =>
      (index === 0 ? caps : `_${caps}`).toLowerCase()
    )
    .replace(/-/g, '_');
}

const rule: TSESLint.RuleModule<'useSnakeCase', readonly unknown[]> =
  createRule({
    name: 'gts-module-snake-case',
    meta: {
      docs: {
        description: 'Requires the use of `snake_case` for module file names.',
      },
      messages: {
        useSnakeCase:
          'Module must be named using `snake_case`, i.e. {{snakeCaseFileName}}.',
      },
      schema: [],
      type: 'problem',
    },
    defaultOptions: [],

    create(context) {
      const { sourceCode } = context;

      return {
        Program(node: TSESTree.Program): void {
          const fileName = basename(context.filename);
          const snakeCaseFileName = convertFileNameToSnakeCase(fileName);
          const firstToken = sourceCode.getFirstToken(node);

          if (snakeCaseFileName !== fileName && firstToken) {
            context.report({
              messageId: 'useSnakeCase',
              node: firstToken,
              data: { snakeCaseFileName },
            });
          }
        },
      };
    },
  });

export default rule;
