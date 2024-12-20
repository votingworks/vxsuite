import React, { useState } from 'react';
import { assert, throwIllegalValue } from '@votingworks/basics';
import path from 'node:path';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { ExportDataResult } from '@votingworks/backend';
import { UseMutationResult } from '@tanstack/react-query';
import { Button } from './button';
import { Modal } from './modal';
import { P, Font } from './typography';
import { Loading } from './loading';

export interface SaveReadinessReportProps {
  usbDriveStatus: UsbDriveStatus;
  saveReadinessReportMutation: UseMutationResult<
    ExportDataResult,
    unknown,
    void,
    unknown
  >;
  usbImage?: React.ReactNode;
}

function SaveReadinessReportModal({
  usbDriveStatus,
  saveReadinessReportMutation,
  usbImage,
  onClose: exitModal,
}: SaveReadinessReportProps & {
  onClose: () => void;
}): JSX.Element | null {
  function onClose() {
    saveReadinessReportMutation.reset();
    exitModal();
  }

  const mutationStatus = saveReadinessReportMutation.status;
  assert(mutationStatus !== 'error');
  switch (mutationStatus) {
    case 'idle':
      if (usbDriveStatus.status !== 'mounted') {
        return (
          <Modal
            title="No USB Drive Detected"
            content={
              <React.Fragment>
                {usbImage}
                <P>Insert a USB drive in order to save the readiness report.</P>
              </React.Fragment>
            }
            onOverlayClick={onClose}
            actions={<Button onPress={onClose}>Cancel</Button>}
          />
        );
      }

      return (
        <Modal
          title="Save Readiness Report"
          content={
            <React.Fragment>
              {usbImage}
              <P>
                The readiness report will be saved to the inserted USB drive.
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

export function SaveReadinessReportButton(
  props: SaveReadinessReportProps
): JSX.Element {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <React.Fragment>
      <Button style={{ flexShrink: 0 }} onPress={() => setIsModalOpen(true)}>
        Save Readiness Report
      </Button>
      {isModalOpen && (
        <SaveReadinessReportModal
          {...props}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </React.Fragment>
  );
}
