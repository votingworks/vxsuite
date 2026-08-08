import React, { useEffect, useState } from 'react';
import { getLowDiskSpaceWarningMessage } from '@votingworks/utils';

import { Button } from './button.js';
import { Icons } from './icons.js';
import { Modal } from './modal.js';
import { useSystemCallApi } from './system_call_api.js';
import { P } from './typography.js';

export function LowDiskSpaceWarning(): JSX.Element | null {
  const systemCallApi = useSystemCallApi();
  const diskSpaceQuery = systemCallApi.getDiskSpaceSummary.useQuery();
  const [hasBeenDismissed, setHasBeenDismissed] = useState(false);

  const warningMessage = diskSpaceQuery.isSuccess
    ? getLowDiskSpaceWarningMessage(diskSpaceQuery.data)
    : undefined;
  const isDiskSpaceLow = warningMessage !== undefined;

  // Reset the dismissal state when space recovers so that the warning can reappear if space drops
  // again later
  useEffect(() => {
    if (!isDiskSpaceLow) {
      setHasBeenDismissed(false);
    }
  }, [isDiskSpaceLow]);

  if (!diskSpaceQuery.isSuccess || !isDiskSpaceLow || hasBeenDismissed) {
    return null;
  }

  return (
    <Modal
      title={
        <React.Fragment>
          <Icons.Warning color="warning" /> Low Disk Space
        </React.Fragment>
      }
      content={<P>{warningMessage}</P>}
      actions={
        <Button onPress={() => setHasBeenDismissed(true)}>Dismiss</Button>
      }
    />
  );
}
