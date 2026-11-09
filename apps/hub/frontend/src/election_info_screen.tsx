import { ElectionIdSchema, unsafeParse } from '@votingworks/types';
import { H1 } from '@votingworks/ui';
import { ElectionInfoEditor } from '@votingworks/election-definition-ui';
import { useHistory, useParams } from 'react-router-dom';
import { z } from 'zod/v4';
import { getBallotsFinalizedAt, getBallotTemplate } from './api.js';
import { ElectionNavScreen, Header } from './nav_screen.js';
import { routes } from './routes.js';
import { useTitle } from './hooks/use_title.js';
import { ElectionInfoAudioPanel } from './election_info_audio_panel.js';

export function ElectionInfoScreen(): JSX.Element | null {
  const params = useParams<{ electionId: string }>();
  const { electionId } = unsafeParse(
    z.object({ electionId: ElectionIdSchema }),
    params
  );
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);
  const ballotTemplateIdQuery = getBallotTemplate.useQuery(electionId);
  const history = useHistory();
  useTitle(routes.election(electionId).electionInfo.root.title);

  if (
    !getBallotsFinalizedAtQuery.isSuccess ||
    !ballotTemplateIdQuery.isSuccess
  ) {
    return null;
  }
  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;
  const ballotTemplateId = ballotTemplateIdQuery.data;
  const showSignatureInput =
    ballotTemplateId === 'NhBallot' || ballotTemplateId === 'NhStateBallot';

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>Election Info</H1>
      </Header>
      <ElectionInfoEditor
        electionId={electionId}
        isLocked={!!ballotsFinalizedAt}
        showSignatureInput={showSignatureInput}
        AudioPanel={ElectionInfoAudioPanel}
        onElectionDeleted={() => history.push(routes.root.path)}
      />
    </ElectionNavScreen>
  );
}
