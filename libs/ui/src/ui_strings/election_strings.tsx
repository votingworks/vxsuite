/* eslint-disable react/destructuring-assignment */

import {
  BallotStyleId,
  Candidate,
  County,
  District,
  Election,
  ElectionStringKey as Key,
  Party,
  Precinct,
  YesNoOption,
} from '@votingworks/types';

import { UiString } from './ui_string';

// Using more lenient typing to support both the `Contest` and the
// `MsEitherNeitherContest` types.
interface ContestLike {
  id: string;
  title: string;
}

type ContestWithDescription = ContestLike & {
  description: string;
};

/**
 * Election-specific strings that need to be translated and/or spoken.
 */
/* istanbul ignore next - mostly presentational, tested via apps where relevant */
export const electionStrings = {
  // TODO(kofi): Fill out.

  [Key.BALLOT_STYLE_ID]: (id: BallotStyleId) => (
    <UiString uiStringKey={Key.BALLOT_STYLE_ID} uiStringSubKey={id}>
      {id}
    </UiString>
  ),

  [Key.CANDIDATE_NAME]: (candidate: Candidate) => (
    <UiString uiStringKey={Key.CANDIDATE_NAME} uiStringSubKey={candidate.id}>
      {candidate.name}
    </UiString>
  ),

  [Key.CONTEST_DESCRIPTION]: (contest: ContestWithDescription) => (
    <UiString uiStringKey={Key.CONTEST_DESCRIPTION} uiStringSubKey={contest.id}>
      {contest.description}
    </UiString>
  ),

  [Key.CONTEST_OPTION_LABEL]: (option: YesNoOption) => (
    <UiString uiStringKey={Key.CONTEST_OPTION_LABEL} uiStringSubKey={option.id}>
      {option.label}
    </UiString>
  ),

  [Key.CONTEST_TITLE]: (contest: ContestLike) => (
    <UiString uiStringKey={Key.CONTEST_TITLE} uiStringSubKey={contest.id}>
      {contest.title}
    </UiString>
  ),

  [Key.COUNTY_NAME]: (county: County) => (
    <UiString uiStringKey={Key.COUNTY_NAME} uiStringSubKey={county.id}>
      {county.name}
    </UiString>
  ),

  [Key.DISTRICT_NAME]: (district: District) => (
    <UiString uiStringKey={Key.DISTRICT_NAME} uiStringSubKey={district.id}>
      {district.name}
    </UiString>
  ),

  [Key.ELECTION_TITLE]: (election: Election) => (
    <UiString uiStringKey={Key.ELECTION_TITLE}>{election.title}</UiString>
  ),

  [Key.PARTY_FULL_NAME]: (party: Party) => (
    <UiString uiStringKey={Key.PARTY_NAME} uiStringSubKey={party.id}>
      {party.fullName}
    </UiString>
  ),

  [Key.PARTY_NAME]: (party: Party) => (
    <UiString uiStringKey={Key.PARTY_NAME} uiStringSubKey={party.id}>
      {party.name}
    </UiString>
  ),

  [Key.PRECINCT_NAME]: (precinct: Precinct) => (
    <UiString uiStringKey={Key.PRECINCT_NAME} uiStringSubKey={precinct.id}>
      {precinct.name}
    </UiString>
  ),

  [Key.STATE_NAME]: (election: Election) => (
    <UiString uiStringKey={Key.STATE_NAME}>{election.state}</UiString>
  ),
} as const;
// TODO(kofi): Update esbuild so we can use the `satisfies` operator here:
// } satisfies Record<Key, unknown>;
