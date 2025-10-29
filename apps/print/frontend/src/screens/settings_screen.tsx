import { ElectionDefinition } from '@votingworks/types';
// import { unconfigureMachine } from '../api';

export function SettingsScreen({
  electionDefinition,
}: {
  electionDefinition: ElectionDefinition | null;
}): JSX.Element {
  // const unconfigureMachineMutation = unconfigureMachine.useMutation();

  return <div>Settings Screen - {electionDefinition?.election.id}</div>;
}
