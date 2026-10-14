import type { MachineConfig } from '@votingworks/admin-backend';
import { RestoreNavScreen } from '../components/restore_nav_screen.js';

export function RestoreScreen({
  machineConfig,
}: {
  machineConfig: MachineConfig;
}): JSX.Element {
  return (
    <RestoreNavScreen title="Restore from Backup" machineConfig={machineConfig}>
      TODO
    </RestoreNavScreen>
  );
}
