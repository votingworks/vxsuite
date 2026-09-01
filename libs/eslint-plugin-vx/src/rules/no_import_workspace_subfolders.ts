import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { strict as assert } from 'node:assert';
import { createRule } from '../util';

const VOTINGWORKS_WORKSPACE_PREFIX = '@votingworks';

const rule: TSESLint.RuleModule<
  'noImportSubfolders' | 'importEntryPoint',
  readonly unknown[]
> = createRule({
  name: 'no-import-workspace-subfolders',
  meta: {
    docs: {
      description:
        'When importing libraries from the VotingWorks workspace, do not include subfolders like /src in the import',
    },
    // Offered as a suggestion rather than a fix: rewriting the specifier to
    // the package entry point is only correct when that entry point exports
    // every name being imported, which the rule cannot check. Applied
    // blindly by `--fix` it can break the build, or silently widen a
    // deliberately narrow import back to the whole package.
    hasSuggestions: true,
    messages: {
      noImportSubfolders: 'Do not import subfolders of the target library.',
      importEntryPoint: "Import from '{{packageName}}' instead.",
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
          if (folders.length > 2) {
            const packageName = `${folders[0]}/${folders[1]}`;
            context.report({
              node,
              messageId: 'noImportSubfolders',
              suggest: [
                {
                  messageId: 'importEntryPoint',
                  data: { packageName },
                  fix: (fixer) =>
                    fixer.replaceText(node.source, `'${packageName}'`),
                },
              ],
            });
          }
        }
      },
    };
  },
});

export default rule;
