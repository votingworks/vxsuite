import { Party } from '@votingworks/types';

import { UiString } from './ui_string';

/* istanbul ignore next - mostly presentational, tested via apps where relevant */
export const electionStrings = {
  // TODO(kofi): Fill out.

  // NOTE: Using more lenient typing to support both the `Contest` and the
  // `MsEitherNeitherContest` types.
  contestTitle: (contest: { id: string; title: string }) => (
    <UiString uiStringKey="contestTitle" uiStringSubKey={contest.id}>
      {contest.title}
    </UiString>
  ),

  partyName: (party: Party) => (
    <UiString uiStringKey="partyName" uiStringSubKey={party.id}>
      {party.name}
    </UiString>
  ),
} as const;
