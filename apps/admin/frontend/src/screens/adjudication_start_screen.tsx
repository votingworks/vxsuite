import { useContext } from 'react';

import {
  Callout,
  Caption,
  Font,
  LinkButton,
  Loading,
  P,
} from '@votingworks/ui';
import { NavigationScreen } from '../components/navigation_screen';
import { AppContext } from '../contexts/app_context';
import {
  getCastVoteRecordFiles,
  getBallotAdjudicationQueueMetadata,
} from '../api';
import { routerPaths } from '../router_paths';

export function AdjudicationStartScreen(): JSX.Element {
  const { electionDefinition, isOfficialResults } = useContext(AppContext);

  const adjudicationQueueMetadataQuery =
    getBallotAdjudicationQueueMetadata.useQuery();

  const castVoteRecordFilesQuery = getCastVoteRecordFiles.useQuery();

  const election = electionDefinition?.election;
  if (!election) {
    return (
      <NavigationScreen title="Adjudication">
        <P>Election must be defined.</P>
      </NavigationScreen>
    );
  }

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
        <Callout icon="Info" color="neutral" style={{ marginBottom: '1rem' }}>
          Adjudication is disabled because results were marked as official.
        </Callout>
      );
    }

    if (
      castVoteRecordFilesQuery.isSuccess &&
      castVoteRecordFilesQuery.data.length === 0
    ) {
      return (
        <Callout icon="Info" color="neutral" style={{ marginBottom: '1rem' }}>
          Load CVRs to begin adjudication.
        </Callout>
      );
    }

    if (queryMetadata.totalTally === 0) {
      return (
        <Callout icon="Info" color="neutral" style={{ marginBottom: '1rem' }}>
          No ballots flagged for adjudication.
        </Callout>
      );
    }
    return null;
  }

  const callout = renderCallout();
  if (callout) {
    return <NavigationScreen title="Adjudication">{callout}</NavigationScreen>;
  }

  return (
    <NavigationScreen title="Adjudication">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
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
            {queryMetadata.pendingTally} Ballots Awaiting Review
          </Font>
          <Caption style={{ display: 'block', marginTop: '0.25rem' }}>
            {queryMetadata.totalTally - queryMetadata.pendingTally} Completed
          </Caption>
        </div>
      </div>
    </NavigationScreen>
  );
}
