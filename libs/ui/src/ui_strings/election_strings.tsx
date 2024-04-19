/* eslint-disable react/destructuring-assignment */

import {
  BallotStyleId,
  Candidate,
  ContestLike,
  County,
  District,
  Election,
  ElectionStringKey as Key,
  LanguageCode,
  Party,
  Precinct,
  YesNoOption,
} from '@votingworks/types';
import { format } from '@votingworks/utils';

import React, { ReactNode } from 'react';
import { UiString, UiStringProps } from './ui_string';
import { Pre } from '../typography';
import { DateString } from './date_string';
import {
  InEnglish,
  LanguageOverride,
  LanguageOverrideProps,
} from './language_override';
import {
  BackendInEnglish,
  BackendLanguageOverride,
  BackendUiString,
} from './backend_strings';

type ContestWithDescription = ContestLike & {
  description: string;
};

/**
 * Election-specific strings that need to be translated and/or spoken.
 */
/* istanbul ignore next - mostly presentational, tested via apps where relevant */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function generateElectionStrings(
  UiStringComponent: (props: UiStringProps) => ReactNode,
  LanguageOverrideComponent: (props: LanguageOverrideProps) => ReactNode,
  InEnglishComponent: (props: { children: React.ReactNode }) => ReactNode
) {
  return {
    [Key.BALLOT_LANGUAGE]: (languageCode: LanguageCode) => (
      <LanguageOverrideComponent languageCode={languageCode}>
        <UiStringComponent uiStringKey={Key.BALLOT_LANGUAGE}>
          {format.languageDisplayName({ languageCode })}
        </UiStringComponent>
      </LanguageOverrideComponent>
    ),

    [Key.BALLOT_STYLE_ID]: (id: BallotStyleId) => (
      <InEnglishComponent>
        <UiStringComponent
          uiStringKey={Key.BALLOT_STYLE_ID}
          uiStringSubKey={id}
        >
          {id}
        </UiStringComponent>
      </InEnglishComponent>
    ),

    [Key.CANDIDATE_NAME]: (candidate: Candidate) => (
      <InEnglishComponent>
        <UiStringComponent
          uiStringKey={Key.CANDIDATE_NAME}
          uiStringSubKey={candidate.id}
        >
          {candidate.name}
        </UiStringComponent>
      </InEnglishComponent>
    ),

    [Key.CONTEST_DESCRIPTION]: (contest: ContestWithDescription) => (
      <UiStringComponent
        as={Pre}
        uiStringKey={Key.CONTEST_DESCRIPTION}
        uiStringSubKey={contest.id}
      >
        {contest.description}
      </UiStringComponent>
    ),

    [Key.CONTEST_OPTION_LABEL]: (option: YesNoOption) => (
      <UiStringComponent
        uiStringKey={Key.CONTEST_OPTION_LABEL}
        uiStringSubKey={option.id}
      >
        {option.label}
      </UiStringComponent>
    ),

    [Key.CONTEST_TITLE]: (contest: ContestLike) => (
      <UiStringComponent
        uiStringKey={Key.CONTEST_TITLE}
        uiStringSubKey={contest.id}
      >
        {contest.title}
      </UiStringComponent>
    ),

    [Key.COUNTY_NAME]: (county: County) => (
      <UiStringComponent uiStringKey={Key.COUNTY_NAME}>
        {county.name}
      </UiStringComponent>
    ),

    [Key.DISTRICT_NAME]: (district: District) => (
      <UiStringComponent
        uiStringKey={Key.DISTRICT_NAME}
        uiStringSubKey={district.id}
      >
        {district.name}
      </UiStringComponent>
    ),

    [Key.ELECTION_DATE]: (election: Election) => (
      <UiStringComponent uiStringKey={Key.ELECTION_DATE}>
        <DateString
          value={election.date.toMidnightDatetimeWithSystemTimezone()}
        />
      </UiStringComponent>
    ),

    [Key.ELECTION_TITLE]: (election: Election) => (
      <UiStringComponent uiStringKey={Key.ELECTION_TITLE}>
        {election.title}
      </UiStringComponent>
    ),

    [Key.PARTY_FULL_NAME]: (party: Party) => (
      <UiStringComponent uiStringKey={Key.PARTY_NAME} uiStringSubKey={party.id}>
        {party.fullName}
      </UiStringComponent>
    ),

    [Key.PARTY_NAME]: (party: Party) => (
      <UiStringComponent uiStringKey={Key.PARTY_NAME} uiStringSubKey={party.id}>
        {party.name}
      </UiStringComponent>
    ),

    [Key.PRECINCT_NAME]: (precinct: Precinct) => (
      <UiStringComponent
        uiStringKey={Key.PRECINCT_NAME}
        uiStringSubKey={precinct.id}
      >
        {precinct.name}
      </UiStringComponent>
    ),

    [Key.STATE_NAME]: (election: Election) => (
      <UiStringComponent uiStringKey={Key.STATE_NAME}>
        {election.state}
      </UiStringComponent>
    ),
  };
  // TODO(kofi): Update esbuild so we can use the `satisfies` operator here:
  // } satisfies Record<Key, unknown>;
}

export const electionStrings = generateElectionStrings(
  UiString,
  LanguageOverride,
  InEnglish
);

export const backendElectionStrings = generateElectionStrings(
  BackendUiString,
  BackendLanguageOverride,
  BackendInEnglish
);
