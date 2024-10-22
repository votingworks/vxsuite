import React, { useState } from 'react';
import { throwIllegalValue } from '@votingworks/basics';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import type { LogExportFormat } from '@votingworks/logging';
import { Button } from './button';
import { Modal } from './modal';

import { Loading } from './loading';
import { P } from './typography';
import { useSystemCallApi } from './system_call_api';
import { SegmentedButton } from './segmented_button';
import { WarningIcon } from './diagnostics/icons';

export interface ExportLogsModalProps {
  usbDriveStatus: UsbDriveStatus;
  onClose: () => void;
}

enum ModalState {
  Error = 'error',
  Saving = 'saving',
  Done = 'done',
  Init = 'init',
}

export function ExportLogsModal({
  usbDriveStatus,
  onClose,
}: ExportLogsModalProps): JSX.Element {
  const api = useSystemCallApi();

  const exportLogsToUsbMutation = api.exportLogsToUsb.useMutation();
  const [currentState, setCurrentState] = useState(ModalState.Init);
  const [errorMessage, setErrorMessage] = useState('');
  const [currentFormat, setCurrentFormat] = useState<LogExportFormat>('vxf');

  async function exportLogs(format: LogExportFormat) {
    setCurrentState(ModalState.Saving);

    const result = await exportLogsToUsbMutation.mutateAsync({ format });

    if (result.isErr()) {
      setErrorMessage(result.err());
      setCurrentState(ModalState.Error);
    } else {
      setCurrentState(ModalState.Done);
    }
  }

  if (currentState === ModalState.Error) {
    return (
      <Modal
        title="Failed to Save Logs"
        content={<P>{errorMessage}</P>}
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  if (currentState === ModalState.Done) {
    return (
      <Modal
        title="Logs Saved"
        content={<P>Logs successfully saved on the inserted USB drive.</P>}
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  if (currentState === ModalState.Saving) {
    return <Modal content={<Loading>Saving Logs</Loading>} />;
  }

  // istanbul ignore next
  if (currentState !== ModalState.Init) {
    throwIllegalValue(currentState);
  }

  switch (usbDriveStatus.status) {
    case 'no_drive':
    case 'ejected':
    case 'error':
      return (
        <Modal
          title="No USB Drive Detected"
          content={<P>Insert a USB drive to save logs.</P>}
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              {
                /* istanbul ignore next */ process.env.NODE_ENV ===
                  'development' && (
                  <Button onPress={() => exportLogs('vxf')}>Save</Button>
                )
              }
              <Button onPress={onClose}>Cancel</Button>
            </React.Fragment>
          }
        />
      );
    case 'mounted': {
      return (
        <Modal
          title="Save Logs"
          content={
            <div>
              <P>Select a log format:</P>
              <SegmentedButton
                hideLabel
                label="Format"
                options={[
                  { id: 'vxf', label: 'Default' },
                  { id: 'err', label: 'Errors' },
                  { id: 'cdf', label: 'CDF' },
                ]}
                selectedOptionId={currentFormat}
                onChange={(type) => setCurrentFormat(type)}
              />
              {currentFormat !== 'vxf' && (
                <p>
                  <WarningIcon /> It may take a few minutes to save logs in this
                  format.
                </p>
              )}
            </div>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <Button
                variant="primary"
                onPress={() => exportLogs(currentFormat)}
              >
                Save
              </Button>
              <Button onPress={onClose}>Cancel</Button>
            </React.Fragment>
          }
        />
      );
    }
    // istanbul ignore next
    default:
      throwIllegalValue(usbDriveStatus);
  }
}

export type ExportLogsButtonProps = Omit<ExportLogsModalProps, 'onClose'>;

export function ExportLogsButton(props: ExportLogsButtonProps): JSX.Element {
  const [isShowingModal, setIsShowingModal] = useState(false);

  return (
    <React.Fragment>
      <Button onPress={() => setIsShowingModal(true)}>Save Logs</Button>
      {isShowingModal && (
        <ExportLogsModal {...props} onClose={() => setIsShowingModal(false)} />
      )}
    </React.Fragment>
  );
}
