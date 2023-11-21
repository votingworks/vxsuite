import React, { useState } from 'react';
import {
  LogFileType,
  isElectionManagerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';

import { LogEventId, Logger } from '@votingworks/logging';

import { DippedSmartCardAuth, InsertedSmartCardAuth } from '@votingworks/types';
import { LogsResultType } from '@votingworks/backend';
import { assert, throwIllegalValue } from '@votingworks/basics';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { Button } from './button';
import { Modal } from './modal';

import { Loading } from './loading';
import { UsbImage } from './graphics';
import { P } from './typography';

export interface ExportLogsModalProps {
  usbDriveStatus: UsbDriveStatus;
  auth: DippedSmartCardAuth.AuthStatus | InsertedSmartCardAuth.AuthStatus;
  logFileType: LogFileType;
  logger: Logger;
  onExportLogs: (lft: LogFileType) => Promise<LogsResultType>;
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
  logFileType,
  logger,
  onClose,
  onExportLogs,
}: ExportLogsModalProps): JSX.Element {
  assert(isSystemAdministratorAuth(auth) || isElectionManagerAuth(auth)); // TODO(auth) should this check for a specific user type
  const userRole = auth.user.role;

  const [currentState, setCurrentState] = useState(ModalState.Init);
  const [errorMessage, setErrorMessage] = useState('');

  async function exportLogs() {
    setCurrentState(ModalState.Saving);

    if (logFileType === LogFileType.Raw) {
      const result = await onExportLogs(logFileType);
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

export function ExportLogsButton({
  logFileType,
  ...rest
}: ExportLogsButtonProps): JSX.Element {
  const [isShowingModal, setIsShowingModal] = useState(false);

  return (
    <React.Fragment>
      <Button
        onPress={() => setIsShowingModal(true)}
        disabled={logFileType === 'cdf'}
      >
        {logFileType === 'raw' ? 'Save Log File' : 'Save CDF Log File'}
      </Button>
      {isShowingModal && (
        <ExportLogsModal
          logFileType={logFileType}
          {...rest}
          onClose={() => setIsShowingModal(false)}
        />
      )}
    </React.Fragment>
  );
}

export type ExportLogsButtonRowProps = Omit<
  ExportLogsButtonProps,
  'logFileType'
>;

export function ExportLogsButtonRow(
  sharedProps: ExportLogsButtonRowProps
): JSX.Element {
  return (
    <P>
      <ExportLogsButton logFileType={LogFileType.Raw} {...sharedProps} />{' '}
      <ExportLogsButton logFileType={LogFileType.Cdf} {...sharedProps} />
    </P>
  );
}

/*
 * Renders raw and CDF log export buttons without formatting
 */
export function ExportLogsButtonGroup(
  sharedProps: ExportLogsButtonRowProps
): JSX.Element {
  return (
    <React.Fragment>
      <ExportLogsButton logFileType={LogFileType.Raw} {...sharedProps} />
      <ExportLogsButton logFileType={LogFileType.Cdf} {...sharedProps} />
    </React.Fragment>
  );
}
