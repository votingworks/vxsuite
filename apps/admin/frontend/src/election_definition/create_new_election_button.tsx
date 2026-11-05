import { useHistory } from 'react-router-dom';
import { Button } from '@votingworks/ui';
import { routerPaths } from '../router_paths.js';
import { createInProgressElection } from '../api.js';

interface CreateNewElectionButtonProps {
  readonly disabled?: boolean;
}

export function CreateNewElectionButton({
  disabled,
}: CreateNewElectionButtonProps): JSX.Element {
  const history = useHistory();
  const createInProgressElectionMutation =
    createInProgressElection.useMutation();

  return (
    <Button
      disabled={disabled || createInProgressElectionMutation.isLoading}
      onPress={() =>
        createInProgressElectionMutation.mutate(undefined, {
          onSuccess: (electionId) =>
            history.push(routerPaths.electionDefinitionInfo(electionId)),
        })
      }
    >
      Create New Election
    </Button>
  );
}
