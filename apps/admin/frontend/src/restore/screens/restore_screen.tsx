import { FullScreenMessage, UsbDriveImage } from '@votingworks/ui';
import { RestoreNavScreen } from '../components/restore_nav_screen.js';
import { getBackupDriveStatus } from '../api.js';

export function RestoreScreen(): JSX.Element | null {
  const getBackupDriveStatusQuery = getBackupDriveStatus.usePollingQuery();

  if (!getBackupDriveStatusQuery.isSuccess) {
    return null;
  }

  const backupDriveStatus = getBackupDriveStatusQuery.data;

  if (backupDriveStatus.status !== 'mounted') {
    return (
      <RestoreNavScreen title="Restore from Backup">
        <FullScreenMessage
          title="Insert a backup USB drive"
          image={<UsbDriveImage />}
        />
      </RestoreNavScreen>
    );
  }

  return (
    <RestoreNavScreen title="Restore from Backup">
      TODO List of backups
    </RestoreNavScreen>
  );
}
