import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { strict as assert } from 'node:assert';
import { createRule } from '../util';

const VOTINGWORKS_WORKSPACE_PREFIX = '@votingworks';

const rule: TSESLint.RuleModule<'noImportSubfolders', readonly unknown[]> =
  createRule({
    name: 'no-import-workspace-subfolders',
    meta: {
      docs: {
        description:
          'When importing libraries from the VotingWorks workspace, do not include subfolders like /src in the import',
        recommended: 'strict',
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
          assert(typeof importSource === 'string');
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

export default rule;
