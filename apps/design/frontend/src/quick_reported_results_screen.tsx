import {
  Button,
  ChangePrecinctButton,
  ContestResultsTable,
  H1,
  H2,
  LoadingAnimation,
  MainContent,
  Modal,
  P,
  SegmentedButton,
  TallyReportColumns,
} from '@votingworks/ui';
import { useParams } from 'react-router-dom';
import React, { useState } from 'react';
import { assert } from '@votingworks/basics';
import { formatBallotHash, PrecinctSelection } from '@votingworks/types';
import { getContestsForPrecinctAndElection } from '@votingworks/utils';
import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, routes } from './routes';
import {
  deleteQuickReportingResults,
  getQuickReportedResults,
  getSystemSettings,
} from './api';
import { useTitle } from './hooks/use_title';

export function QuickReportedResultsScreen(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getSystemSettingsQuery = getSystemSettings.useQuery(electionId);
  const [isLive, setIsLive] = useState(true);
  const [isDeleteDataModalOpen, setIsDeleteDataModalOpen] = useState(false);
  const [precinctSelection, setPrecinctSelection] = useState<PrecinctSelection>(
    { kind: 'AllPrecincts' }
  );
  const getQuickReportedResultsQuery = getQuickReportedResults.useQuery(
    electionId,
    precinctSelection,
    isLive
  );
  const deleteQuickReportingResultsMutation =
    deleteQuickReportingResults.useMutation();

  useTitle(routes.election(electionId).systemSettings.title);

  if (!getSystemSettingsQuery.isSuccess) {
    return null;
  }

  async function deleteData(): Promise<void> {
    await deleteQuickReportingResultsMutation.mutateAsync({
      electionId,
      isLive,
    });
    setIsDeleteDataModalOpen(false);
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
  const contests = getContestsForPrecinctAndElection(
    aggregatedResults.election,
    precinctSelection
  );
  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>Quick Reported Results</H1>
      </Header>
      <MainContent>
        <div>
          <div style={{ width: '500px' }}>
            <ChangePrecinctButton
              appPrecinctSelection={precinctSelection}
              // eslint-disable-next-line @typescript-eslint/require-await
              updatePrecinctSelection={async (s) => setPrecinctSelection(s)}
              election={aggregatedResults.election}
              mode="default"
            />
          </div>
          <br />
          <SegmentedButton
            label="Ballot Mode"
            selectedOptionId={isLive ? 'live' : 'test'}
            onChange={() => setIsLive(!isLive)}
            options={[
              { id: 'live', label: 'Live' },
              { id: 'test', label: 'Test' },
            ]}
          />
        </div>
        <h2>Results</h2>
        {aggregatedResults.machinesReporting.length === 0 && (
          <p>No results reported.</p>
        )}
        {aggregatedResults.machinesReporting.length > 0 && (
          <div>
            <p>
              <strong>Ballot Hash:</strong>{' '}
              {formatBallotHash(aggregatedResults.ballotHash)}
            </p>
            <p>
              <strong>Machine Ids Reporting:</strong>{' '}
              {aggregatedResults.machinesReporting.join(', ')}
            </p>
            <Button
              color="danger"
              onPress={() => setIsDeleteDataModalOpen(true)}
            >
              Delete All {isLive ? 'Live' : 'Test'} Data
            </Button>
            <TallyReportColumns>
              {contests.map((contest) => {
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
          </div>
        )}
        {isDeleteDataModalOpen && (
          <Modal
            content={
              deleteQuickReportingResultsMutation.isLoading ? (
                <LoadingAnimation />
              ) : (
                <React.Fragment>
                  <H2 as="h1">Delete All {isLive ? 'Live' : 'Test'} Data</H2>
                  <P>
                    This will delete all quick reported results data for this
                    election in {isLive ? 'live' : 'test'} mode.
                  </P>
                </React.Fragment>
              )
            }
            actions={
              <React.Fragment>
                <Button
                  onPress={deleteData}
                  variant="danger"
                  disabled={deleteQuickReportingResultsMutation.isLoading}
                  data-testid="confirm-delete-data-button"
                >
                  Delete Data
                </Button>
                <Button
                  onPress={() => setIsDeleteDataModalOpen(false)}
                  variant="secondary"
                >
                  Cancel
                </Button>
              </React.Fragment>
            }
            onOverlayClick={() => setIsDeleteDataModalOpen(false)}
          />
        )}
      </MainContent>
    </ElectionNavScreen>
  );
}
