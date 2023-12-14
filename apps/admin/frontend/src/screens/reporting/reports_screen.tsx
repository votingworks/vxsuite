import { useContext } from 'react';
import pluralize from 'pluralize';

import {
  format,
  isElectionManagerAuth,
  getBallotCount,
} from '@votingworks/utils';
import { LinkButton, H2, P, Font, H3, Icons } from '@votingworks/ui';

import { assert } from '@votingworks/basics';
import styled from 'styled-components';
import { AppContext } from '../../contexts/app_context';

import { NavigationScreen } from '../../components/navigation_screen';
import { routerPaths } from '../../router_paths';
import { getCardCounts, getCastVoteRecordFileMode } from '../../api';
import { MarkResultsOfficialButton } from '../../components/mark_official_button';
import { OfficialResultsCard } from '../../components/official_results_card';

const Section = styled.section`
  margin-bottom: 2rem;
`;

export function ReportsScreen(): JSX.Element {
  const { electionDefinition, isOfficialResults, configuredAt, auth } =
    useContext(AppContext);
  assert(isElectionManagerAuth(auth));
  assert(electionDefinition && typeof configuredAt === 'string');

  const cardCountsQuery = getCardCounts.useQuery();
  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();
  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial';

  const fileMode = castVoteRecordFileModeQuery.data;
  const totalBallotCount = cardCountsQuery.data
    ? getBallotCount(cardCountsQuery.data[0])
    : 0;

  const electionHasWriteInContest = electionDefinition.election.contests.some(
    (c) => c.type === 'candidate' && c.allowWriteIns
  );

  const ballotCountSummaryText = cardCountsQuery.isSuccess ? (
    <P>
      <Font weight="bold">
        {format.count(totalBallotCount)}
        {fileMode === 'unlocked' ? ' ' : ` ${fileMode} `}
        {pluralize('ballot', totalBallotCount, false)}
      </Font>{' '}
      have been counted for{' '}
      <Font weight="bold">{electionDefinition.election.title}</Font>.
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
            Election Results Marked as Official
          </H3>
        ) : (
          <H3>
            <Icons.Info />
            Election Results are Unofficial
          </H3>
        )}
        <MarkResultsOfficialButton />
      </OfficialResultsCard>
      <Section>
        <H2>{statusPrefix} Tally Reports</H2>
        <P>
          <LinkButton variant="primary" to={routerPaths.tallyFullReport}>
            Full Election Tally Report
          </LinkButton>{' '}
          <LinkButton to={routerPaths.tallyAllPrecinctsReport}>
            All Precincts Tally Report
          </LinkButton>{' '}
          <LinkButton to={routerPaths.tallySinglePrecinctReport}>
            Single Precinct Tally Report
          </LinkButton>
        </P>
        <P>
          <LinkButton to={routerPaths.tallyReportBuilder}>
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
      {electionHasWriteInContest && (
        <Section>
          <H2>Other Reports</H2>
          <P>
            <LinkButton to={routerPaths.tallyWriteInReport}>
              {statusPrefix} Write-In Adjudication Report
            </LinkButton>
          </P>
        </Section>
      )}
    </NavigationScreen>
  );
}
