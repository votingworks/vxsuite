import {
  ContestResultsTable,
  H1,
  LoadingAnimation,
  MainContent,
  SegmentedButton,
  TallyReportColumns,
} from '@votingworks/ui';
import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { assert } from '@votingworks/basics';
import { formatBallotHash } from '@votingworks/types';
import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, routes } from './routes';
import { getQuickReportedResults, getSystemSettings } from './api';
import { useTitle } from './hooks/use_title';

export function QuickReportedResultsScreen(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getSystemSettingsQuery = getSystemSettings.useQuery(electionId);
  const [isLive, setIsLive] = useState(true);
  const getQuickReportedResultsQuery = getQuickReportedResults.useQuery(
    electionId,
    isLive
  );

  useTitle(routes.election(electionId).systemSettings.title);

  if (!getSystemSettingsQuery.isSuccess) {
    return null;
  }

  const systemSettings = getSystemSettingsQuery.data;
  if (!systemSettings.quickResultsReportingUrl) {
    return (
      <ElectionNavScreen electionId={electionId}>
        <Header>
          <H1>Quick Reported Results</H1>
        </Header>
        <MainContent>
          This election does not have Quick Results Reporting enabled.
        </MainContent>
      </ElectionNavScreen>
    );
  }

  if (!getQuickReportedResultsQuery.isSuccess) {
    return (
      <ElectionNavScreen electionId={electionId}>
        <Header>
          <H1>Quick Reported Results</H1>
        </Header>
        <MainContent>
          <LoadingAnimation />
        </MainContent>
      </ElectionNavScreen>
    );
  }
  if (getQuickReportedResultsQuery.data.isErr()) {
    const err = getQuickReportedResultsQuery.data.err();
    assert(err === 'election-not-exported'); // This is the only possible error.
    return (
      <ElectionNavScreen electionId={electionId}>
        <Header>
          <H1>Quick Reported Results</H1>
        </Header>
        <MainContent>
          This election has not yet been exported. Please export the election
          and configure VxScan to report results.
        </MainContent>
      </ElectionNavScreen>
    );
  }

  const aggregatedResults = getQuickReportedResultsQuery.data.ok();

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>Quick Reported Results</H1>
      </Header>
      <MainContent>
        <SegmentedButton
          label="Ballot Data Mode"
          selectedOptionId={isLive ? 'live' : 'test'}
          onChange={() => setIsLive(!isLive)}
          options={[
            { id: 'live', label: 'Live' },
            { id: 'test', label: 'Test (L&A)' },
          ]}
        />
        <h2>Report Information</h2>
        <p>
          <strong>Ballot Hash:</strong>{' '}
          {formatBallotHash(aggregatedResults.ballotHash)}
        </p>
        <p>
          <strong>Machine Ids Reporting:</strong>{' '}
          {aggregatedResults.machinesReporting.join(', ')}
        </p>
        <h2>Results</h2>
        {aggregatedResults.machinesReporting.length === 0 && (
          <p>No results reported.</p>
        )}
        {aggregatedResults.machinesReporting.length > 0 && (
          <TallyReportColumns>
            {aggregatedResults.election.contests.map((contest) => {
              const currentContestResults =
                aggregatedResults.contestResults[contest.id];
              assert(
                currentContestResults,
                `missing reported results for contest ${contest.id}`
              );
              return (
                <ContestResultsTable
                  key={contest.id}
                  election={aggregatedResults.election}
                  contest={contest}
                  scannedContestResults={currentContestResults}
                />
              );
            })}
          </TallyReportColumns>
        )}
      </MainContent>
    </ElectionNavScreen>
  );
}
