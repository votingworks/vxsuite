import { useContext } from 'react';
import {
  BooleanEnvironmentVariableName,
  format,
  isElectionManagerAuth,
  isFeatureFlagEnabled,
  isSystemAdministratorAuth,
} from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { H3, Icons, P, UnconfigureMachineButton } from '@votingworks/ui';
import { useHistory } from 'react-router-dom';
import { AppContext } from '../contexts/app_context.js';
import { NavigationScreen } from '../components/navigation_screen.js';
import { ExportElectionPackageModalButton } from '../components/export_election_package_modal_button.js';
import { getCurrentInProgressElection, unconfigure } from '../api.js';
import { routerPaths } from '../router_paths.js';
import { OfficialResultsCard } from '../components/official_results_card.js';
import { RevertResultsToUnofficialButton } from '../components/mark_official_button.js';
import { SaveBackupButton } from '../components/save_backup_button.js';
import {
  ElectionCard,
  ElectionCardLink,
  type ElectionCardProps,
} from '../components/election_card.js';

export function ElectionScreen(): JSX.Element {
  const {
    electionDefinition,
    configuredAt,
    auth,
    isOfficialResults,
    isElectionDefinitionEnabled,
  } = useContext(AppContext);
  const history = useHistory();
  const unconfigureMutation = unconfigure.useMutation();
  const getCurrentInProgressElectionQuery =
    getCurrentInProgressElection.useQuery({
      enabled: isElectionDefinitionEnabled && isSystemAdministratorAuth(auth),
    });
  const electionDefinitionInfo = getCurrentInProgressElectionQuery.data;
  const canViewElectionDefinition =
    isSystemAdministratorAuth(auth) && !!electionDefinitionInfo;

  assert(isSystemAdministratorAuth(auth) || isElectionManagerAuth(auth));
  assert(electionDefinition && typeof configuredAt === 'string');
  const { election } = electionDefinition;
  const electionCardProps: ElectionCardProps = {
    seal: election.seal,
    title: election.title,
    jurisdictionName: election.jurisdiction.name,
    state: election.state,
    date: election.date,
  };

  async function unconfigureMachine() {
    try {
      await unconfigureMutation.mutateAsync();
      history.push(routerPaths.root);
    } catch {
      // Handled by default query client error handling
    }
  }

  return (
    <NavigationScreen title="Election">
      {isSystemAdministratorAuth(auth) && isOfficialResults && (
        <OfficialResultsCard>
          <H3>
            <Icons.Done color="success" />
            Election Results are Official
          </H3>
          <RevertResultsToUnofficialButton />
        </OfficialResultsCard>
      )}
      <P>
        Configured with the current election at{' '}
        {format.localeLongDateAndTime(new Date(configuredAt))}.
      </P>
      {canViewElectionDefinition ? (
        <ElectionCardLink
          {...electionCardProps}
          to={routerPaths.electionDefinitionInfo(
            electionDefinitionInfo.electionId
          )}
          action="view"
        />
      ) : (
        <ElectionCard {...electionCardProps} />
      )}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <ExportElectionPackageModalButton />
        {isSystemAdministratorAuth(auth) && (
          <UnconfigureMachineButton unconfigureMachine={unconfigureMachine} />
        )}
        {isFeatureFlagEnabled(
          BooleanEnvironmentVariableName.ENABLE_ADMIN_BACKUP_RESTORE
        ) && <SaveBackupButton />}
      </div>
    </NavigationScreen>
  );
}
