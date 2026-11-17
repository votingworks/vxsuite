import React, { useState } from 'react';
import { Redirect, Route, Switch, useParams } from 'react-router-dom';
import styled from 'styled-components';
import type { FinalizedBallotsKind } from '@votingworks/admin-backend';
import { Row } from '@votingworks/election-definition-ui';
import {
  getPrecinctsWithoutAbsenteePollingPlace,
  hasPartialRegisteredVoterCounts,
  type ElectionId,
} from '@votingworks/types';
import {
  Button,
  Callout as CalloutBase,
  type CalloutProps,
  Card,
  Font,
  H3,
  H4,
  Icons,
  Modal,
  P,
  ProgressBar,
} from '@votingworks/ui';
import { NavigationScreen } from '../components/navigation_screen.js';
import { SaveBackendFileModal } from '../components/save_backend_file_modal.js';
import { routerPaths } from '../router_paths.js';
import {
  electionDefinitionApi,
  finalizeElection,
  getCurrentInProgressElection,
  getFinalizeStatus,
  saveFinalizedBallots,
} from '../api.js';
import { getNavItems } from './nav_items.js';
import {
  countMissingAudio,
  countMissingTranslations,
  languageName,
  useElectionStrings,
  useLanguageMockupState,
} from './language_mockup.js';

const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 40rem;
`;

const CalloutContent = styled.div`
  align-items: baseline;
  display: flex;
  flex-grow: 1;
  gap: 0.5rem;
`;

function Callout(
  props: CalloutProps & {
    action?: React.ReactNode;
    icon: React.ReactNode;
    title: React.ReactNode;
  }
): JSX.Element {
  const { action, children, icon, title, ...rest } = props;
  return (
    <CalloutBase {...rest}>
      <CalloutContent>
        <H3 aria-hidden>{icon}</H3>
        <Row
          style={{
            alignItems: 'center',
            flexGrow: 1,
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ flexGrow: 1 }}>
            <H3>{title}</H3>
            <Font>{children}</Font>
          </div>
          {action}
        </Row>
      </CalloutContent>
    </CalloutBase>
  );
}

const SaveCardContents = styled.div`
  display: grid;
  gap: 1rem;
  grid-template-columns: 1fr min-content;

  > :last-child {
    place-self: center end;
  }
`;

const BALLOTS_TITLES: Record<FinalizedBallotsKind, string> = {
  official: 'Official Ballots',
  test: 'Test Ballots',
};

const BALLOTS_DESCRIPTIONS: Record<FinalizedBallotsKind, string> = {
  official: 'Official precinct and absentee ballots, ready for printing.',
  test: 'Unofficial ballots for use with VotingWorks machines in Test Mode.',
};

function SaveBallotsCard({
  electionId,
  kind,
}: {
  electionId: ElectionId;
  kind: FinalizedBallotsKind;
}): JSX.Element {
  const saveFinalizedBallotsMutation = saveFinalizedBallots.useMutation();
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const title = BALLOTS_TITLES[kind];

  return (
    <Card>
      <SaveCardContents>
        <div>
          <H3>{title}</H3>
          <P>{BALLOTS_DESCRIPTIONS[kind]}</P>
        </div>
        <div>
          <Button icon="Export" onPress={() => setIsSaveModalOpen(true)}>
            Save
          </Button>
        </div>
      </SaveCardContents>
      {isSaveModalOpen && (
        <SaveBackendFileModal
          saveFileStatus={saveFinalizedBallotsMutation.status}
          saveFile={({ filename }) =>
            saveFinalizedBallotsMutation.mutate({ electionId, kind, filename })
          }
          saveFileResult={saveFinalizedBallotsMutation.data}
          resetSaveFileResult={saveFinalizedBallotsMutation.reset}
          onClose={() => setIsSaveModalOpen(false)}
          fileType={title.toLowerCase()}
          fileTypeTitle={title}
          filename={`${kind}-ballots.zip`}
        />
      )}
    </Card>
  );
}

function FinalizeStatusPanel({
  electionId,
}: {
  electionId: ElectionId;
}): JSX.Element | null {
  const [isConfirmingFinalize, setIsConfirmingFinalize] = useState(false);
  const getFinalizeStatusQuery = getFinalizeStatus.usePollingQuery(electionId);
  const listBallotStylesQuery =
    electionDefinitionApi.listBallotStyles.useQuery(electionId);
  const getStateFeaturesQuery =
    electionDefinitionApi.getStateFeatures.useQuery(electionId);
  const listPrecinctsQuery =
    electionDefinitionApi.listPrecincts.useQuery(electionId);
  const getRegisteredVoterCountsQuery =
    electionDefinitionApi.getRegisteredVoterCounts.useQuery(electionId);
  const listPollingPlacesQuery =
    electionDefinitionApi.listPollingPlaces.useQuery(electionId);
  const finalizeElectionMutation = finalizeElection.useMutation();
  const { enabledLanguages } = useLanguageMockupState();
  const stringGroups = useElectionStrings(electionId);

  if (
    !getFinalizeStatusQuery.isSuccess ||
    !listBallotStylesQuery.isSuccess ||
    !getStateFeaturesQuery.isSuccess ||
    !listPrecinctsQuery.isSuccess ||
    !getRegisteredVoterCountsQuery.isSuccess ||
    !listPollingPlacesQuery.isSuccess ||
    !stringGroups
  ) {
    return null;
  }

  const finalizeStatus = getFinalizeStatusQuery.data;
  const features = getStateFeaturesQuery.data;

  if (finalizeStatus.status === 'finalized') {
    return (
      <React.Fragment>
        <Callout
          color="primary"
          icon={<Icons.Done color="primary" />}
          title="Election Finalized"
        >
          The election can no longer be edited. Save ballots to a USB drive for
          printing.
        </Callout>
        <SaveBallotsCard electionId={electionId} kind="official" />
        <SaveBallotsCard electionId={electionId} kind="test" />
      </React.Fragment>
    );
  }

  if (finalizeStatus.status === 'finalizing') {
    const { label, progress, total } = finalizeStatus.progress;
    return (
      <Card color="primary">
        <H4>Finalizing Election</H4>
        <P>{label}</P>
        <ProgressBar key={label} progress={progress / total} />
      </Card>
    );
  }

  if (listBallotStylesQuery.data.length === 0) {
    return (
      <Callout color="neutral" icon={<Icons.Info />} title="Ballots Incomplete">
        VxAdmin will create ballot styles for your election once you have
        created districts, precincts, and contests.
      </Callout>
    );
  }

  if (
    hasPartialRegisteredVoterCounts(
      listPrecinctsQuery.data,
      getRegisteredVoterCountsQuery.data
    )
  ) {
    return (
      <Callout
        color="neutral"
        icon={<Icons.Info />}
        title="Registered voter counts must be provided for all precincts and splits, or none."
      >
        Registered voter counts are set for some precincts but not all. Set
        counts for all precincts or remove them from all precincts before
        finalizing.
      </Callout>
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
      <Callout
        color="neutral"
        icon={<Icons.Info />}
        title="Absentee polling places must cover every precinct."
      >
        Every precinct must be covered by an absentee polling place, so that
        centrally-scanned ballots have a location to be tabulated under. Add or
        edit absentee polling places to cover all precincts before finalizing.
      </Callout>
    );
  }

  const incompleteTranslations = enabledLanguages.filter(
    (code) => countMissingTranslations(stringGroups, code) > 0
  );
  if (incompleteTranslations.length > 0) {
    return (
      <Callout
        color="neutral"
        icon={<Icons.Info />}
        title="Translations Incomplete"
      >
        Load complete translations for{' '}
        {incompleteTranslations.map(languageName).join(', ')} before finalizing.
      </Callout>
    );
  }

  const incompleteAudio = enabledLanguages.filter(
    (code) => countMissingAudio(stringGroups, code) > 0
  );
  if (incompleteAudio.length > 0) {
    return (
      <Callout color="neutral" icon={<Icons.Info />} title="Audio Incomplete">
        Load audio for {incompleteAudio.map(languageName).join(', ')} before
        finalizing.
      </Callout>
    );
  }

  return (
    <React.Fragment>
      <Callout
        action={
          <Button
            icon="Done"
            color="primary"
            fill="outlined"
            disabled={finalizeElectionMutation.isLoading}
            onPress={() => setIsConfirmingFinalize(true)}
          >
            Finalize Election
          </Button>
        }
        color="neutral"
        icon={<Icons.Info />}
        title="Election Not Finalized"
      >
        Proof each ballot style, then finalize the election.
      </Callout>
      {isConfirmingFinalize && (
        <Modal
          title="Finalize Election"
          content={
            <P>Once the election is finalized, it may not be edited further.</P>
          }
          actions={
            <React.Fragment>
              <Button
                icon="Done"
                variant="primary"
                onPress={() =>
                  finalizeElectionMutation.mutate(
                    { electionId },
                    { onSuccess: () => setIsConfirmingFinalize(false) }
                  )
                }
              >
                Finalize Election
              </Button>
              <Button onPress={() => setIsConfirmingFinalize(false)}>
                Cancel
              </Button>
            </React.Fragment>
          }
          onOverlayClick={() => setIsConfirmingFinalize(false)}
        />
      )}
    </React.Fragment>
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

  return (
    <NavigationScreen
      title="Finalize"
      navItems={getNavItems(electionId)}
      backRouterPath={routerPaths.election}
    >
      <Content>
        <FinalizeStatusPanel electionId={electionId} />
      </Content>
    </NavigationScreen>
  );
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
