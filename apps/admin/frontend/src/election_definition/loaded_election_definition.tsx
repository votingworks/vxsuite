import { useContext } from 'react';
import type { ElectionInfo } from '@votingworks/election-definition-backend';
import { getCurrentInProgressElection } from '../api.js';
import {
  ElectionCard,
  type ElectionCardProps,
} from '../components/election_card.js';
import { AppContext } from '../contexts/app_context.js';
import { routerPaths } from '../router_paths.js';
import { ElectionCardLink } from './in_progress_election_card.js';

function useLoadedElectionDefinition(): ElectionInfo | undefined {
  const { isElectionDefinitionEnabled } = useContext(AppContext);
  const getCurrentInProgressElectionQuery =
    getCurrentInProgressElection.useQuery({
      enabled: isElectionDefinitionEnabled,
    });
  return getCurrentInProgressElectionQuery.data ?? undefined;
}

export function LoadedElectionCard(props: ElectionCardProps): JSX.Element {
  const electionInfo = useLoadedElectionDefinition();
  if (!electionInfo) {
    return <ElectionCard {...props} />;
  }
  return (
    <ElectionCardLink
      {...props}
      to={routerPaths.electionDefinitionInfo(electionInfo.electionId)}
      action="view"
    />
  );
}
