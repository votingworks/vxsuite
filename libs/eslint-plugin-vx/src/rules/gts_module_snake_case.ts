import { TSESTree } from '@typescript-eslint/experimental-utils';
import { basename } from 'path';
import { createRule } from '../util';

function convertFileNameToSnakeCase(fileName: string): string {
  return fileName
    .replace(/[A-Z]+/g, (caps, index) =>
      (index === 0 ? caps : `_${caps}`).toLowerCase()
    )
    .replace(/-/g, '_');
}

function shouldBeSnakeCase(filePath: string): boolean {
  const fileName = basename(filePath);
  return (
    !fileName.startsWith('setupTests.ts') &&
    !fileName.startsWith('serviceWorker.ts')
  );
}

export default createRule({
  name: 'gts-module-snake-case',
  meta: {
    docs: {
      description: 'Requires the use of `snake_case` for module file names.',
      category: 'Best Practices',
      recommended: 'error',
      suggestion: false,
      requiresTypeChecking: false,
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
    const sourceCode = context.getSourceCode();

    return {
      Program(node: TSESTree.Program): void {
        const filePath = context.getFilename();

        if (!shouldBeSnakeCase(filePath)) {
          return;
        }

        const fileName = basename(filePath);
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
