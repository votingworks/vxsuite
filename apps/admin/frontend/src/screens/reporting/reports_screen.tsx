import { useContext } from 'react';
import { DateTime } from 'luxon';

import { format, isElectionManagerAuth } from '@votingworks/utils';
import { LinkButton, H2, P, Font, H3, Icons } from '@votingworks/ui';

import { assert } from '@votingworks/basics';
import styled from 'styled-components';
import {
  Election,
  ElectionRegisteredVotersCounts,
  hasPartialRegisteredVoterCounts,
} from '@votingworks/types';
import { AppContext } from '../../contexts/app_context';

import { NavigationScreen } from '../../components/navigation_screen';
import { routerPaths } from '../../router_paths';
import {
  getTotalBallotCount,
  getCastVoteRecordFileMode,
  getRegisteredVoterCounts,
  getSystemSettings,
} from '../../api';
import { MarkResultsOfficialButton } from '../../components/mark_official_button';
import { OfficialResultsCard } from '../../components/official_results_card';
import { areClosedPollsActionsBlocked } from '../../utils/closed_polls_actions';

const Section = styled.section`
  margin-bottom: 2rem;
`;

export function isVoterTurnoutReportEnabled(
  election: Election,
  registeredVoterCounts?: ElectionRegisteredVotersCounts | null
): boolean {
  if (
    registeredVoterCounts === null ||
    registeredVoterCounts === undefined ||
    Object.keys(registeredVoterCounts).length === 0
  ) {
    return false;
  }

  return !hasPartialRegisteredVoterCounts(
    election.precincts,
    registeredVoterCounts
  );
}

export function ReportsScreen(): JSX.Element {
  const { electionDefinition, isOfficialResults, configuredAt, auth } =
    useContext(AppContext);
  assert(isElectionManagerAuth(auth));
  assert(electionDefinition && typeof configuredAt === 'string');

  const totalBallotCountQuery = getTotalBallotCount.useQuery();
  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();
  const registeredVoterCountsQuery = getRegisteredVoterCounts.useQuery();
  const systemSettingsQuery = getSystemSettings.useQuery();
  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial';

  const fileMode = castVoteRecordFileModeQuery.data;
  const closedPollsActionsBlocked = areClosedPollsActionsBlocked(
    fileMode,
    systemSettingsQuery.data,
    electionDefinition.election.date
  );
  const pollsCloseDateTime = systemSettingsQuery.data?.electionDayPollsCloseTime
    ? DateTime.fromISO(
        `${electionDefinition.election.date.toISOString()}T${
          systemSettingsQuery.data.electionDayPollsCloseTime
        }`
      ).toJSDate()
    : undefined;

  const electionHasWriteInContest = electionDefinition.election.contests.some(
    (c) => c.type === 'candidate' && c.allowWriteIns
  );

  const voterTurnoutReportEnabled = isVoterTurnoutReportEnabled(
    electionDefinition.election,
    registeredVoterCountsQuery.data
  );

  const totalBallotCount = totalBallotCountQuery.data ?? 0;
  const ballotCountSummaryText = totalBallotCountQuery.isSuccess ? (
    <P>
      <Font weight="bold">
        {fileMode === 'test' ? 'Test ' : ''}
        Ballot Count:
      </Font>{' '}
      {format.count(totalBallotCount)}
    </P>
  ) : (
    <P>Loading total ballot count...</P>
  );

  return (
    <NavigationScreen title="Election Reports">
      {ballotCountSummaryText}
      <OfficialResultsCard>
        {isOfficialResults ? (
          <H3>
            <Icons.Done color="success" />
            Election Results are Official
          </H3>
        ) : (
          <H3>
            <Icons.Info />
            Election Results are Unofficial
          </H3>
        )}
        <MarkResultsOfficialButton />
      </OfficialResultsCard>
      {closedPollsActionsBlocked && pollsCloseDateTime && (
        <P>
          <Icons.Warning /> Reports containing vote totals are unavailable until{' '}
          {format.localeTime(pollsCloseDateTime)} on Election Day (
          {format.localeDate(pollsCloseDateTime)}).
        </P>
      )}
      <Section>
        <H2>{statusPrefix} Tally Reports</H2>
        <P>
          <LinkButton
            variant="primary"
            to={routerPaths.tallyFullReport}
            disabled={closedPollsActionsBlocked}
          >
            Full Election Tally Report
          </LinkButton>{' '}
          <LinkButton
            to={routerPaths.tallyAllPrecinctsReport}
            disabled={closedPollsActionsBlocked}
          >
            All Precincts Tally Report
          </LinkButton>{' '}
          <LinkButton
            to={routerPaths.tallySinglePrecinctReport}
            disabled={closedPollsActionsBlocked}
          >
            Single Precinct Tally Report
          </LinkButton>
        </P>
        <P>
          <LinkButton
            to={routerPaths.tallyReportBuilder}
            disabled={closedPollsActionsBlocked}
          >
            Tally Report Builder
          </LinkButton>
        </P>
      </Section>

      <Section>
        <H2>{statusPrefix} Ballot Count Reports</H2>
        <P>
          <LinkButton to={routerPaths.ballotCountReportPrecinct}>
            Precinct Ballot Count Report
          </LinkButton>{' '}
          <LinkButton to={routerPaths.ballotCountReportVotingMethod}>
            Voting Method Ballot Count Report
          </LinkButton>
        </P>
        <P>
          <LinkButton to={routerPaths.ballotCountReportBuilder}>
            Ballot Count Report Builder
          </LinkButton>
        </P>
      </Section>
      {(electionHasWriteInContest || voterTurnoutReportEnabled) && (
        <Section>
          <H2>Other Reports</H2>
          {electionHasWriteInContest && (
            <P>
              <LinkButton
                to={routerPaths.tallyWriteInReport}
                disabled={closedPollsActionsBlocked}
              >
                {statusPrefix} Write-In Adjudication Report
              </LinkButton>
            </P>
          )}
          {voterTurnoutReportEnabled && (
            <P>
              <LinkButton to={routerPaths.voterTurnoutReport}>
                {statusPrefix} Voter Turnout Report
              </LinkButton>
            </P>
          )}
        </Section>
      )}
    </NavigationScreen>
  );
}
