/* eslint-disable react/destructuring-assignment */

import {
  BallotStyle,
  Candidate,
  CandidateContest,
  ContestLike,
  County,
  DEFAULT_LANGUAGE_CODE,
  District,
  Election,
  ElectionStringKey as Key,
  Party,
  Precinct,
  PrecinctSplit,
  YesNoOption,
} from '@votingworks/types';
import { format } from '@votingworks/utils';

import { UiRichTextString, UiString } from './ui_string';
import { DateString } from './date_string';
import { InEnglish } from './language_override';

type ContestWithDescription = ContestLike & {
  description: string;
};

/**
 * Election-specific strings that need to be translated and/or spoken.
 */
/* istanbul ignore next - mostly presentational, tested via apps where relevant - @preserve */
export const electionStrings = {
  [Key.BALLOT_LANGUAGE]: (languageCode: string) => (
    <UiString uiStringKey={Key.BALLOT_LANGUAGE} uiStringSubKey={languageCode}>
      {format.languageDisplayName({
        languageCode,
        displayLanguageCode: DEFAULT_LANGUAGE_CODE,
      })}
    </UiString>
  ),

  [Key.BALLOT_STYLE_ID]: (ballotStyle: BallotStyle) => (
    <InEnglish>
      <UiString
        uiStringKey={Key.BALLOT_STYLE_ID}
        uiStringSubKey={ballotStyle.groupId}
      >
        {ballotStyle.groupId}
      </UiString>
    </InEnglish>
  ),

  [Key.CANDIDATE_NAME]: (candidate: Candidate) => (
    <InEnglish>
      <UiString uiStringKey={Key.CANDIDATE_NAME} uiStringSubKey={candidate.id}>
        {candidate.name}
      </UiString>
    </InEnglish>
  ),

  [Key.CONTEST_DESCRIPTION]: (contest: ContestWithDescription) => (
    <UiRichTextString
      uiStringKey={Key.CONTEST_DESCRIPTION}
      uiStringSubKey={contest.id}
    >
      {contest.description}
    </UiRichTextString>
  ),

  [Key.CONTEST_OPTION_LABEL]: (option: YesNoOption) => (
    <UiString uiStringKey={Key.CONTEST_OPTION_LABEL} uiStringSubKey={option.id}>
      {option.label}
    </UiString>
  ),

  [Key.CONTEST_TERM]: (contest: CandidateContest) => (
    <UiString uiStringKey={Key.CONTEST_TERM} uiStringSubKey={contest.id}>
      {contest.termDescription}
    </UiString>
  ),

  [Key.CONTEST_TITLE]: (contest: ContestLike) => (
    <UiString uiStringKey={Key.CONTEST_TITLE} uiStringSubKey={contest.id}>
      {contest.title}
    </UiString>
  ),

  [Key.COUNTY_NAME]: (county: County) => (
    <UiString uiStringKey={Key.COUNTY_NAME}>{county.name}</UiString>
  ),

  [Key.DISTRICT_NAME]: (district: District) => (
    <UiString uiStringKey={Key.DISTRICT_NAME} uiStringSubKey={district.id}>
      {district.name}
    </UiString>
  ),

  [Key.ELECTION_DATE]: (election: Election) => (
    <UiString uiStringKey={Key.ELECTION_DATE}>
      <DateString
        value={election.date.toMidnightDatetimeWithSystemTimezone()}
      />
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

  [Key.PRECINCT_SPLIT_NAME]: (split: PrecinctSplit) => (
    <UiString uiStringKey={Key.PRECINCT_SPLIT_NAME} uiStringSubKey={split.id}>
      {split.name}
    </UiString>
  ),

  [Key.STATE_NAME]: (election: Election) => (
    <UiString uiStringKey={Key.STATE_NAME}>{election.state}</UiString>
  ),
} satisfies Record<
  Key,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (..._args: any[]) => JSX.Element
>;
