import React, { useState } from 'react';
import { Redirect, Route, Switch, useParams } from 'react-router-dom';
import styled from 'styled-components';
import type { ElectionDefinitionPackage } from '@votingworks/admin-backend';
import { throwIllegalValue } from '@votingworks/basics';
import {
  type ElectionId,
  getPrecinctsWithoutAbsenteePollingPlace,
  hasPartialRegisteredVoterCounts,
} from '@votingworks/types';
import {
  Button,
  Callout,
  type CalloutProps,
  Card,
  Font,
  Modal,
  P,
  ProgressBar,
} from '@votingworks/ui';
import {
  electionDefinitionApi,
  finalizeElection,
  getCurrentInProgressElection,
  getElectionPackage,
  saveElectionPackageBallots,
} from '../api.js';
import { NavigationScreen } from '../components/navigation_screen.js';
import { SaveBackendFileModal } from '../components/save_backend_file_modal.js';
import { routerPaths } from '../router_paths.js';
import { getNavItems } from './nav_items.js';

const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 50rem;
`;

const CalloutContent = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: 0.5rem;
`;

const Row = styled.div`
  align-items: center;
  display: flex;
  gap: 1rem;
  justify-content: space-between;
`;

function StatusCallout({
  title,
  action,
  children,
  ...calloutProps
}: Omit<CalloutProps, 'children'> & {
  title: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <Callout {...calloutProps}>
      <CalloutContent>
        <Row>
          <div>
            <Font weight="bold">{title}</Font>
            {children}
          </div>
          {action}
        </Row>
      </CalloutContent>
    </Callout>
  );
}

function FinalizeElectionButton({
  electionId,
}: {
  electionId: ElectionId;
}): JSX.Element {
  const finalizeElectionMutation = finalizeElection.useMutation();
  const [isConfirming, setIsConfirming] = useState(false);

  return (
    <React.Fragment>
      <Button
        icon="Done"
        color="primary"
        fill="outlined"
        onPress={() => setIsConfirming(true)}
      >
        Finalize Election
      </Button>
      {isConfirming && (
        <Modal
          title="Finalize Election"
          content={
            <P>
              Once the election is finalized, it can no longer be edited, and
              VxAdmin will be configured for it. VxAdmin will render every
              ballot first, which may take several minutes.
            </P>
          }
          actions={
            <React.Fragment>
              <Button
                icon="Done"
                variant="primary"
                disabled={finalizeElectionMutation.isLoading}
                onPress={() =>
                  finalizeElectionMutation.mutate(
                    { electionId },
                    { onSuccess: () => setIsConfirming(false) }
                  )
                }
              >
                Finalize Election
              </Button>
              <Button onPress={() => setIsConfirming(false)}>Cancel</Button>
            </React.Fragment>
          }
        />
      )}
    </React.Fragment>
  );
}

function NotFinalizedCallout({
  electionId,
}: {
  electionId: ElectionId;
}): JSX.Element | null {
  const getElectionInfoQuery =
    electionDefinitionApi.getElectionInfo.useQuery(electionId);
  const getStateFeaturesQuery =
    electionDefinitionApi.getStateFeatures.useQuery(electionId);
  const listBallotStylesQuery =
    electionDefinitionApi.listBallotStyles.useQuery(electionId);
  const listPrecinctsQuery =
    electionDefinitionApi.listPrecincts.useQuery(electionId);
  const getRegisteredVoterCountsQuery =
    electionDefinitionApi.getRegisteredVoterCounts.useQuery(electionId);
  const listPollingPlacesQuery =
    electionDefinitionApi.listPollingPlaces.useQuery(electionId);

  if (
    !getElectionInfoQuery.isSuccess ||
    !getStateFeaturesQuery.isSuccess ||
    !listBallotStylesQuery.isSuccess ||
    !listPrecinctsQuery.isSuccess ||
    !getRegisteredVoterCountsQuery.isSuccess ||
    !listPollingPlacesQuery.isSuccess
  ) {
    return null;
  }
  const electionInfo = getElectionInfoQuery.data;
  const features = getStateFeaturesQuery.data;

  if (electionInfo.title === '' || electionInfo.jurisdictionName === '') {
    return (
      <StatusCallout color="neutral" icon="Info" title="Election Incomplete">
        <P>
          Enter the election title and jurisdiction in Election Info before
          finalizing.
        </P>
      </StatusCallout>
    );
  }

  if (listBallotStylesQuery.data.length === 0) {
    return (
      <StatusCallout color="neutral" icon="Info" title="Ballots Incomplete">
        <P>
          VxAdmin will create ballot styles for your election once you have
          created districts, precincts, and contests.
        </P>
      </StatusCallout>
    );
  }

  if (
    hasPartialRegisteredVoterCounts(
      listPrecinctsQuery.data,
      getRegisteredVoterCountsQuery.data
    )
  ) {
    return (
      <StatusCallout
        color="neutral"
        icon="Info"
        title="Registered voter counts must be provided for all precincts and splits, or none."
      >
        <P>
          Registered voter counts are set for some precincts but not all. Set
          counts for all precincts or remove them from all precincts before
          finalizing.
        </P>
      </StatusCallout>
    );
  }

  if (
    features.EDIT_POLLING_PLACES &&
    !features.OMIT_ABSENTEE_POLLING_PLACES &&
    getPrecinctsWithoutAbsenteePollingPlace(
      listPrecinctsQuery.data,
      listPollingPlacesQuery.data
    ).length > 0
  ) {
    return (
      <StatusCallout
        color="neutral"
        icon="Info"
        title="Absentee polling places must cover every precinct."
      >
        <P>
          Every precinct must be covered by an absentee polling place, so that
          centrally-scanned ballots have a location to be tabulated under. Add
          or edit absentee polling places to cover all precincts before
          finalizing.
        </P>
      </StatusCallout>
    );
  }

  return (
    <StatusCallout
      color="neutral"
      icon="Info"
      title="Election Not Finalized"
      action={<FinalizeElectionButton electionId={electionId} />}
    >
      <P>Proof each ballot style, then finalize the election.</P>
    </StatusCallout>
  );
}

const ballotModeLabels = {
  official: {
    title: 'Official Ballots',
    lowercase: 'official ballots',
    description: 'Official precinct and absentee ballots, ready for printing.',
  },
  test: {
    title: 'Test Ballots',
    lowercase: 'test ballots',
    description:
      'Unofficial ballots for use with VotingWorks machines in Test Mode.',
  },
} as const;

function SaveBallotsCard({
  electionId,
  ballotMode,
  ballotsPath,
}: {
  electionId: ElectionId;
  ballotMode: 'official' | 'test';
  ballotsPath: string;
}): JSX.Element {
  const saveBallotsMutation = saveElectionPackageBallots.useMutation();
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const labels = ballotModeLabels[ballotMode];

  return (
    <Card>
      <Row>
        <div>
          <Font weight="bold">{labels.title}</Font>
          <P>{labels.description}</P>
        </div>
        <Button icon="Export" onPress={() => setIsSaveModalOpen(true)}>
          Save {labels.title}
        </Button>
      </Row>
      {isSaveModalOpen && (
        <SaveBackendFileModal
          saveFileStatus={saveBallotsMutation.status}
          saveFile={({ filename }) =>
            saveBallotsMutation.mutate({ electionId, ballotMode, filename })
          }
          saveFileResult={saveBallotsMutation.data}
          resetSaveFileResult={saveBallotsMutation.reset}
          onClose={() => setIsSaveModalOpen(false)}
          fileType={labels.lowercase}
          fileTypeTitle={labels.title}
          filename={ballotsPath.slice(ballotsPath.lastIndexOf('/') + 1)}
        />
      )}
    </Card>
  );
}

function FinalizeContent({
  electionId,
  electionPackage,
}: {
  electionId: ElectionId;
  electionPackage: ElectionDefinitionPackage | null;
}): JSX.Element {
  if (!electionPackage) {
    return <NotFinalizedCallout electionId={electionId} />;
  }

  switch (electionPackage.status) {
    case 'running': {
      const { progress } = electionPackage;
      return (
        <StatusCallout color="primary" title="Finalizing Election">
          <P>{progress ? progress.label : 'Preparing to render ballots'}</P>
          <ProgressBar
            progress={progress?.total ? progress.progress / progress.total : 0}
          />
        </StatusCallout>
      );
    }

    case 'failed':
      return (
        <React.Fragment>
          <StatusCallout color="danger" icon="Danger" title="Finalizing Failed">
            <P>{electionPackage.error}</P>
          </StatusCallout>
          <NotFinalizedCallout electionId={electionId} />
        </React.Fragment>
      );

    case 'succeeded':
      return (
        <React.Fragment>
          <StatusCallout color="primary" icon="Done" title="Election Finalized">
            <P>
              The election can no longer be edited. Save ballots to a USB drive
              for printing.
            </P>
          </StatusCallout>
          <SaveBallotsCard
            electionId={electionId}
            ballotMode="official"
            ballotsPath={electionPackage.officialBallotsPath}
          />
          {electionPackage.testBallotsPath && (
            <SaveBallotsCard
              electionId={electionId}
              ballotMode="test"
              ballotsPath={electionPackage.testBallotsPath}
            />
          )}
        </React.Fragment>
      );

    default: {
      throwIllegalValue(electionPackage, 'status');
    }
  }
}

function FinalizeElection({
  electionId,
}: {
  electionId: ElectionId;
}): JSX.Element | null {
  const getElectionPackageQuery =
    getElectionPackage.usePollingQuery(electionId);

  if (!getElectionPackageQuery.isSuccess) {
    return null;
  }

  return (
    <NavigationScreen
      title="Finalize"
      navItems={getNavItems(electionId)}
      backRouterPath={routerPaths.election}
    >
      <Content>
        <FinalizeContent
          electionId={electionId}
          electionPackage={getElectionPackageQuery.data}
        />
      </Content>
    </NavigationScreen>
  );
}

function FinalizeElectionScreen(): JSX.Element | null {
  const { electionId } = useParams<{ electionId: ElectionId }>();
  const getCurrentInProgressElectionQuery =
    getCurrentInProgressElection.useQuery();

  if (!getCurrentInProgressElectionQuery.isSuccess) {
    return null;
  }
  if (getCurrentInProgressElectionQuery.data?.electionId !== electionId) {
    return <Redirect to={routerPaths.election} />;
  }

  return <FinalizeElection electionId={electionId} />;
}

export function FinalizeScreen(): JSX.Element {
  return (
    <Switch>
      <Route path={`${routerPaths.finalize}/:electionId`}>
        <FinalizeElectionScreen />
      </Route>
      <Redirect to={routerPaths.election} />
    </Switch>
  );
}
