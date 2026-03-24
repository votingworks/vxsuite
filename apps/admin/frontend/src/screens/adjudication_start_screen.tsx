import React, { useContext } from 'react';

import {
  Button,
  Callout,
  Caption,
  Font,
  H2,
  Icons,
  LinkButton,
  Loading,
  P,
} from '@votingworks/ui';
import pluralize from 'pluralize';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { NavigationScreen } from '../components/navigation_screen';
import { AppContext } from '../contexts/app_context';
import {
  getCastVoteRecordFiles,
  getBallotAdjudicationQueueMetadata,
  getIsClientAdjudicationEnabled,
  getNetworkStatus,
  setIsClientAdjudicationEnabled,
} from '../api';
import { routerPaths } from '../router_paths';

function NetworkSection(): JSX.Element {
  const networkStatusQuery = getNetworkStatus.useQuery();
  const adjudicationEnabledQuery = getIsClientAdjudicationEnabled.useQuery();
  const setAdjudicationEnabledMutation =
    setIsClientAdjudicationEnabled.useMutation();

  if (!networkStatusQuery.isSuccess || !adjudicationEnabledQuery.isSuccess) {
    return <Loading />;
  }

  const { isOnline } = networkStatusQuery.data;
  const isEnabled = adjudicationEnabledQuery.data;

  return (
    <React.Fragment>
      <H2>Multi-Station Adjudication</H2>
      <P>
        {isEnabled ? (
          <React.Fragment>
            <Icons.Done color="success" /> Multi-station adjudication is
            enabled. Connected clients can begin adjudicating.
          </React.Fragment>
        ) : (
          <React.Fragment>
            <Icons.Warning color="warning" /> Multi-station adjudication is
            disabled. Enable it to allow connected clients to adjudicate.
          </React.Fragment>
        )}
      </P>
      <P>
        <Button
          onPress={() =>
            setAdjudicationEnabledMutation.mutate({
              enabled: !isEnabled,
            })
          }
          disabled={setAdjudicationEnabledMutation.isLoading}
        >
          {isEnabled
            ? 'Disable Multi-Station Adjudication'
            : 'Enable Multi-Station Adjudication'}
        </Button>
      </P>

      <H2>Network</H2>
      <P>
        {isOnline ? (
          <React.Fragment>
            <Icons.Done color="success" /> Online
          </React.Fragment>
        ) : (
          <React.Fragment>
            <Icons.Danger color="danger" /> Offline
          </React.Fragment>
        )}
      </P>
    </React.Fragment>
  );
}

export function AdjudicationStartScreen(): JSX.Element {
  const { isOfficialResults } = useContext(AppContext);

  const isMultiStationEnabled = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.ENABLE_MULTI_STATION_ADMIN
  );

  const adjudicationQueueMetadataQuery =
    getBallotAdjudicationQueueMetadata.useQuery();

  const castVoteRecordFilesQuery = getCastVoteRecordFiles.useQuery();

  if (
    !adjudicationQueueMetadataQuery.isSuccess ||
    !castVoteRecordFilesQuery.isSuccess
  ) {
    return (
      <NavigationScreen title="Adjudication">
        <Loading isFullscreen />
      </NavigationScreen>
    );
  }

  const queryMetadata = adjudicationQueueMetadataQuery.data;
  function renderCallout() {
    if (isOfficialResults) {
      return (
        <Callout icon="Info" color="neutral">
          Adjudication is disabled because results were marked as official.
        </Callout>
      );
    }

    if (
      castVoteRecordFilesQuery.isSuccess &&
      castVoteRecordFilesQuery.data.length === 0
    ) {
      return (
        <Callout icon="Info" color="neutral">
          Load CVRs to begin adjudication.
        </Callout>
      );
    }

    if (queryMetadata.totalTally === 0) {
      return (
        <Callout icon="Info" color="neutral">
          No ballots flagged for adjudication.
        </Callout>
      );
    }
    return null;
  }

  const callout = renderCallout();
  if (callout) {
    return (
      <NavigationScreen title="Adjudication">
        {callout}
        {isMultiStationEnabled && <NetworkSection />}
      </NavigationScreen>
    );
  }

  return (
    <NavigationScreen title="Adjudication">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '1rem',
          paddingBottom: '5%',
        }}
      >
        <LinkButton
          variant="primary"
          to={routerPaths.ballotAdjudication}
          style={{ height: '3rem', width: '14rem', fontSize: '1.25rem' }}
        >
          Start Adjudication
        </LinkButton>
        <div style={{ textAlign: 'center' }}>
          <Font weight="semiBold" style={{ display: 'block' }}>
            {queryMetadata.pendingTally}{' '}
            {pluralize('Ballot', queryMetadata.pendingTally)} Awaiting Review
          </Font>
          <Caption style={{ display: 'block', marginTop: '0.25rem' }}>
            {queryMetadata.totalTally - queryMetadata.pendingTally}{' '}
            {pluralize(
              'Ballot',
              queryMetadata.totalTally - queryMetadata.pendingTally
            )}{' '}
            Completed
          </Caption>
        </div>
      </div>
      {isMultiStationEnabled && <NetworkSection />}
    </NavigationScreen>
  );
}
