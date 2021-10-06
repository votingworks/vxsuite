import { ESLintUtils } from '@typescript-eslint/experimental-utils'

export const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `https://github.com/votingworks/vxsuite/blob/main/libs/eslint-plugin-vx/docs/rules/${name}.md`
)
