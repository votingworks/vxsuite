import React, { useContext, useState } from 'react';
import {
  isElectionManagerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';

import { LogEventId, Logger } from '@votingworks/logging';

import { DippedSmartCardAuth, InsertedSmartCardAuth } from '@votingworks/types';
import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { Button } from './button';
import { Modal } from './modal';

import { Loading } from './loading';
import { UsbImage } from './graphics';
import { P } from './typography';
import { SystemCallContext } from './system_call_api';

export interface ExportLogsModalProps {
  usbDriveStatus: UsbDriveStatus;
  auth: DippedSmartCardAuth.AuthStatus | InsertedSmartCardAuth.AuthStatus;
  logger: Logger;
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
  auth,
  logger,
  onClose,
}: ExportLogsModalProps): JSX.Element {
  assert(isSystemAdministratorAuth(auth) || isElectionManagerAuth(auth)); // TODO(auth) should this check for a specific user type
  const userRole = auth.user.role;

  const { api } = assertDefined(useContext(SystemCallContext));

  const exportLogsToUsbMutation = api.exportLogsToUsb.useMutation();
  const [currentState, setCurrentState] = useState(ModalState.Init);
  const [errorMessage, setErrorMessage] = useState('');

  async function exportLogs() {
    setCurrentState(ModalState.Saving);

    const result = await exportLogsToUsbMutation.mutateAsync();

    await logger.log(LogEventId.FileSaved, userRole, {
      disposition: result.isOk() ? 'success' : 'failure',
      message: result.isOk()
        ? 'Sucessfully saved logs on the usb drive.'
        : `Failed to save logs to usb drive: ${result.err()}`,
      fileType: 'logs',
    });

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
        content={<P>Failed to save log file. {errorMessage}</P>}
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  if (currentState === ModalState.Done) {
    return (
      <Modal
        title="Logs Saved"
        content={<P>Log files successfully saved on the inserted USB drive.</P>}
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
          content={
            <P>
              <UsbImage />
              Please insert a USB drive where you would like the save the log
              file.
            </P>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              {
                /* istanbul ignore next */ process.env.NODE_ENV ===
                  'development' && (
                  <Button onPress={() => exportLogs()}>Save</Button>
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
          content={<P>Save logs on the inserted USB drive?</P>}
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <Button variant="primary" onPress={() => exportLogs()}>
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
      <Button onPress={() => setIsShowingModal(true)}>Save Log File</Button>
      {isShowingModal && (
        <ExportLogsModal {...props} onClose={() => setIsShowingModal(false)} />
      )}
    </React.Fragment>
  );
}
