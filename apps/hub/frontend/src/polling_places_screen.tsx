import { H1 } from '@votingworks/ui';
import { useParams } from 'react-router-dom';
import { PollingPlacesEditor } from '@votingworks/election-definition-ui';
import { ElectionNavScreen, Header } from './nav_screen.js';
import { type ElectionIdParams, electionParamRoutes } from './routes.js';
import { getBallotsFinalizedAt } from './api.js';
import { useTitle } from './hooks/use_title.js';
import { PollingPlaceAudioPanel } from './polling_place_audio_panel.js';

export function PollingPlacesScreen(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const { title } = electionParamRoutes.pollingPlaces.root;
  useTitle(title);
  const ballotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>{title}</H1>
      </Header>
      {ballotsFinalizedAtQuery.isSuccess && (
        <PollingPlacesEditor
          electionId={electionId}
          isLocked={!!ballotsFinalizedAtQuery.data}
          AudioPanel={PollingPlaceAudioPanel}
        />
      )}
    </ElectionNavScreen>
  );
}
