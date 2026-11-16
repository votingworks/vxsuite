import { useParams } from 'react-router-dom';
import {
  BallotStyleIdSchema,
  ElectionIdSchema,
  PrecinctIdSchema,
  unsafeParse,
} from '@votingworks/types';
import { z } from 'zod/v4';
import { BallotViewer } from '@votingworks/election-definition-ui';
import { getBallotTemplate } from './api.js';
import { routes } from './routes.js';

export function BallotScreen(): JSX.Element | null {
  const params = useParams<{
    electionId: string;
    ballotStyleId: string;
    precinctId: string;
  }>();
  const { electionId, ballotStyleId, precinctId } = unsafeParse(
    z.object({
      electionId: ElectionIdSchema,
      ballotStyleId: BallotStyleIdSchema,
      precinctId: PrecinctIdSchema,
    }),
    params
  );
  const getBallotTemplateQuery = getBallotTemplate.useQuery(electionId);

  if (!getBallotTemplateQuery.isSuccess) {
    return null;
  }

  const electionRoutes = routes.election(electionId);
  return (
    <BallotViewer
      electionId={electionId}
      ballotStyleId={ballotStyleId}
      precinctId={precinctId}
      ballotTemplateId={getBallotTemplateQuery.data}
      closePath={electionRoutes.ballots.root.path}
      electionInfoPath={electionRoutes.electionInfo.root.path}
    />
  );
}
