import { LinkButton } from '@votingworks/ui';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { routerPaths } from '../router_paths.js';

interface CreateNewElectionButtonProps {
  readonly disabled?: boolean;
}

export function CreateNewElectionButton({
  disabled,
}: CreateNewElectionButtonProps): JSX.Element | null {
  if (
    !isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.ENABLE_ADMIN_ELECTION_DESIGN
    )
  ) {
    return null;
  }

  return (
    <LinkButton to={routerPaths.electionDefinition} disabled={disabled}>
      Create New Election
    </LinkButton>
  );
}
