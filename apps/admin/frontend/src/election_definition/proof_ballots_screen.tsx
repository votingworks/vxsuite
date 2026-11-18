import React, { useState } from 'react';
import { assertDefined } from '@votingworks/basics';
import { Redirect, Route, Switch, useParams } from 'react-router-dom';
import styled from 'styled-components';
import {
  BallotLayoutForm,
  type BallotPreviewInput,
  BallotStylesTable,
  BallotViewer,
} from '@votingworks/election-definition-ui';
import type { BallotStyleId, ElectionId, PrecinctId } from '@votingworks/types';
import { Button, RouterTabBar, TabPanel } from '@votingworks/ui';
import { NavigationScreen } from '../components/navigation_screen.js';
import { PrintButton } from '../components/print_button.js';
import { SaveBackendFileModal } from '../components/save_backend_file_modal.js';
import { routerPaths } from '../router_paths.js';
import {
  getCurrentInProgressElection,
  getElectionPackageRenderingStatus,
  printBallotPreviewPdf,
  saveBallotPreviewPdf,
} from '../api.js';
import { getNavItems } from './nav_items.js';

const BallotStylesPanel = styled.div`
  max-width: 40rem;
`;

function ProofBallotActions({
  previewInput,
  fileName,
}: {
  previewInput: BallotPreviewInput;
  fileName?: string;
}): JSX.Element {
  const printBallotPreviewPdfMutation = printBallotPreviewPdf.useMutation();
  const saveBallotPreviewPdfMutation = saveBallotPreviewPdf.useMutation();
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

  return (
    <React.Fragment>
      <Button
        icon="Export"
        variant="inverseNeutral"
        onPress={() => setIsSaveModalOpen(true)}
        disabled={!fileName}
      >
        Save PDF
      </Button>
      <PrintButton
        icon="Print"
        variant="inverseNeutral"
        print={() => printBallotPreviewPdfMutation.mutateAsync(previewInput)}
        {...(fileName ? {} : { disabled: true })}
      >
        Print
      </PrintButton>
      {isSaveModalOpen && (
        <SaveBackendFileModal
          saveFileStatus={saveBallotPreviewPdfMutation.status}
          saveFile={({ filename }) =>
            saveBallotPreviewPdfMutation.mutate({ ...previewInput, filename })
          }
          saveFileResult={saveBallotPreviewPdfMutation.data}
          resetSaveFileResult={saveBallotPreviewPdfMutation.reset}
          onClose={() => setIsSaveModalOpen(false)}
          fileType="ballot proof"
          fileTypeTitle="Ballot Proof"
          filename={assertDefined(fileName)}
        />
      )}
    </React.Fragment>
  );
}

function ProofBallotViewer({
  electionId,
}: {
  electionId: ElectionId;
}): JSX.Element {
  const { ballotStyleId, precinctId } = useParams<{
    ballotStyleId: BallotStyleId;
    precinctId: PrecinctId;
  }>();
  return (
    <BallotViewer
      electionId={electionId}
      ballotStyleId={ballotStyleId}
      precinctId={precinctId}
      ballotTemplateId="VxDefaultBallot"
      closePath={routerPaths.proofBallotsBallotStyles(electionId)}
      electionInfoPath={routerPaths.electionDefinitionInfo(electionId)}
      renderActions={({ previewInput, preview }) => (
        <ProofBallotActions
          previewInput={previewInput}
          fileName={preview?.fileName}
        />
      )}
    />
  );
}

function ProofBallotsTabs({
  electionId,
}: {
  electionId: ElectionId;
}): JSX.Element | null {
  const getElectionPackageQuery =
    getElectionPackageRenderingStatus.usePollingQuery(electionId);

  if (!getElectionPackageQuery.isSuccess) {
    return null;
  }
  const electionPackage = getElectionPackageQuery.data;
  const isLocked = !!electionPackage && electionPackage.status !== 'failed';
  if (electionPackage?.status === 'loaded') {
    return <Redirect to={routerPaths.electionDefinitionInfo(electionId)} />;
  }

  return (
    <NavigationScreen
      title="Proof Ballots"
      navItems={getNavItems(electionId, electionPackage)}
      backRouterPath={routerPaths.election}
    >
      <RouterTabBar
        tabs={[
          {
            title: 'Ballot Styles',
            path: routerPaths.proofBallotsBallotStyles(electionId),
          },
          {
            title: 'Ballot Layout',
            path: routerPaths.proofBallotsBallotLayout(electionId),
          },
        ]}
      />
      <Switch>
        <Route path={routerPaths.proofBallotsBallotStyles(':electionId')}>
          <TabPanel>
            <BallotStylesPanel>
              <BallotStylesTable
                electionId={electionId}
                getViewBallotPath={(ballotStyleId, precinctId) =>
                  routerPaths.proofBallotsViewBallot(
                    electionId,
                    ballotStyleId,
                    precinctId
                  )
                }
              />
            </BallotStylesPanel>
          </TabPanel>
        </Route>
        <Route path={routerPaths.proofBallotsBallotLayout(':electionId')}>
          <TabPanel>
            <BallotLayoutForm electionId={electionId} isLocked={isLocked} />
          </TabPanel>
        </Route>
        <Redirect to={routerPaths.proofBallotsBallotStyles(electionId)} />
      </Switch>
    </NavigationScreen>
  );
}

function ProofBallotsElectionScreen(): JSX.Element | null {
  const { electionId } = useParams<{ electionId: ElectionId }>();
  const getCurrentInProgressElectionQuery =
    getCurrentInProgressElection.useQuery();

  if (!getCurrentInProgressElectionQuery.isSuccess) {
    return null;
  }
  if (getCurrentInProgressElectionQuery.data?.electionId !== electionId) {
    return <Redirect to={routerPaths.election} />;
  }

  return (
    <Switch>
      <Route
        path={routerPaths.proofBallotsViewBallot(
          ':electionId',
          ':ballotStyleId',
          ':precinctId'
        )}
      >
        <ProofBallotViewer electionId={electionId} />
      </Route>
      <Route>
        <ProofBallotsTabs electionId={electionId} />
      </Route>
    </Switch>
  );
}

export function ProofBallotsScreen(): JSX.Element {
  return (
    <Switch>
      <Route path={`${routerPaths.proofBallots}/:electionId`}>
        <ProofBallotsElectionScreen />
      </Route>
      <Redirect to={routerPaths.election} />
    </Switch>
  );
}
