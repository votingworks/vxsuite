import { H1 } from '@votingworks/ui';
import { useParams } from 'react-router-dom';
import { DistrictsEditor } from '@votingworks/election-definition-ui';
import { ElectionNavScreen, Header } from './nav_screen.js';
import { type ElectionIdParams, electionParamRoutes } from './routes.js';
import { getBallotsFinalizedAt } from './api.js';
import { useTitle } from './hooks/use_title.js';
import { DistrictAudioPanel } from './district_audio_panel.js';

export function DistrictsScreen(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const { title } = electionParamRoutes.districts.root;
  useTitle(title);
  const ballotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>{title}</H1>
      </Header>
      {ballotsFinalizedAtQuery.isSuccess && (
        <DistrictsEditor
          electionId={electionId}
          isLocked={!!ballotsFinalizedAtQuery.data}
          AudioPanel={DistrictAudioPanel}
        />
      )}
    </ElectionNavScreen>
  );
}
