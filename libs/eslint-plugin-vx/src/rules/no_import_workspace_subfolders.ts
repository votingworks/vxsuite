import { TSESTree } from '@typescript-eslint/experimental-utils';
import { createRule } from '../util';

const VOTINGWORKS_WORKSPACE_PREFIX = '@votingworks';

export default createRule({
  name: 'no-import-workspace-subfolders',
  meta: {
    docs: {
      description:
        'When importing libraries from the VotingWorks workspace, do not include subfolders like /src in the import',
      category: 'Best Practices',
      recommended: 'error',
      suggestion: false,
      requiresTypeChecking: false,
    },
    fixable: 'code',
    messages: {
      noImportSubfolders: 'Do not import subfolders of the target library.',
    },
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        const importSource = node.source.value;
        if (typeof importSource !== 'string') {
          return;
        }
        if (importSource.startsWith(VOTINGWORKS_WORKSPACE_PREFIX)) {
          const folders = importSource.split('/');
          if (folders.length > 2 && folders[1] !== 'types') {
            context.report({
              node,
              messageId: 'noImportSubfolders',
              fix: (fixer) => {
                return fixer.replaceText(
                  node.source,
                  `'${folders[0]}/${folders[1]}'`
                );
              },
            });
          }
        }
      },
    };
  },
});
