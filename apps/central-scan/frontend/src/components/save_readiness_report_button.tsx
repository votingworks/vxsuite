import { Button, Font, Loading, Modal, P } from '@votingworks/ui';
import React, { useState } from 'react';
import { assert, throwIllegalValue } from '@votingworks/basics';
import path from 'path';
import { getUsbDriveStatus, saveReadinessReport } from '../api';
import { InsertUsbDriveModal, UsbImage } from './insert_usb_drive_modal';

function SaveReadinessReportModal({
  onClose,
}: {
  onClose: () => void;
}): JSX.Element | null {
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const saveReadinessReportMutation = saveReadinessReport.useMutation();

  if (!usbDriveStatusQuery.isSuccess) {
    return null;
  }
  const usbDriveStatus = usbDriveStatusQuery.data;

  const mutationStatus = saveReadinessReportMutation.status;
  assert(mutationStatus !== 'error');
  switch (mutationStatus) {
    case 'idle':
      if (usbDriveStatus.status !== 'mounted') {
        return (
          <InsertUsbDriveModal
            onClose={onClose}
            message="Please insert a USB drive in order to save the readiness report."
          />
        );
      }

      return (
        <Modal
          title="Save Readiness Report"
          content={
            <React.Fragment>
              <UsbImage />
              <P>
                The readiness report will be saved to the mounted USB drive.
              </P>
            </React.Fragment>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <Button
                icon="Export"
                variant="primary"
                onPress={() => saveReadinessReportMutation.mutate()}
              >
                Save
              </Button>
              <Button onPress={onClose}>Cancel</Button>
            </React.Fragment>
          }
        />
      );

    case 'loading':
      return <Modal content={<Loading>Saving Report</Loading>} />;
    case 'success': {
      const exportResult = saveReadinessReportMutation.data;
      if (exportResult.isErr()) {
        const error = exportResult.err();
        return (
          <Modal
            title="Failed to Save Report"
            content={
              <P>Error while saving the readiness report: {error.message}</P>
            }
            onOverlayClick={onClose}
            actions={<Button onPress={onClose}>Close</Button>}
          />
        );
      }

      const exportPath = exportResult.ok()[0];
      return (
        <Modal
          title="Readiness Report Saved"
          content={
            <P>
              The readiness report was successfully saved to the USB drive as{' '}
              <Font weight="semiBold">{path.basename(exportPath)}</Font>.
            </P>
          }
          onOverlayClick={onClose}
          actions={<Button onPress={onClose}>Close</Button>}
        />
      );
    }
    /* istanbul ignore next */
    default:
      throwIllegalValue(mutationStatus);
  }
}

export function SaveReadinessReportButton(): JSX.Element {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <React.Fragment>
      <Button onPress={() => setIsModalOpen(true)}>
        Save Readiness Report
      </Button>
      {isModalOpen && (
        <SaveReadinessReportModal onClose={() => setIsModalOpen(false)} />
      )}
    </React.Fragment>
  );
}
