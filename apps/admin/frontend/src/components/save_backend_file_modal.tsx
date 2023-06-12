import React, { useContext, useState } from 'react';
import styled from 'styled-components';
import { basename, join } from 'path';
import {
  assert,
  throwIllegalValue,
  assertDefined,
  Result,
} from '@votingworks/basics';
import {
  isElectionManagerAuth,
  isSystemAdministratorAuth,
  usbstick,
} from '@votingworks/utils';
import type { ExportDataError } from '@votingworks/admin-backend';

import {
  Button,
  Modal,
  H1,
  P,
  useExternalStateChangeListener,
  Font,
} from '@votingworks/ui';

import { AppContext } from '../contexts/app_context';
import { Loading } from './loading';

export const UsbImage = styled.img`
  margin-right: auto;
  margin-left: auto;
  height: 200px;
`;

interface SaveAsButtonProps {
  onSave: (location: string) => void;
  options?: KioskBrowser.SaveDialogOptions;
}

export function SaveAsButton({
  onSave,
  options,
}: SaveAsButtonProps): JSX.Element {
  async function useSaveDialog() {
    assert(window.kiosk);
    const { filePath } = await window.kiosk.showSaveDialog(options);
    if (filePath) {
      onSave(filePath);
    }
  }
  return <Button onPress={useSaveDialog}>Save As…</Button>;
}

export type SaveBackendFileError =
  | ExportDataError
  | {
      type: 'api-error';
      message: string;
    };

export type SaveBackendFileResult = Result<string[], SaveBackendFileError>;

export interface SaveBackendFileModalProps {
  onSave: (location: string) => Promise<SaveBackendFileResult>;
  onClose: () => void;
  /**
   * Title case name for the type of file being saved, e.g. "Batch Results".
   */
  fileTypeTitle: string;
  /**
   * Lowercase name for the type of file being saved, e.g. "batch results".
   */
  fileType: string;
  /**
   * Relative to the root of the USB drive.
   */
  defaultRelativePath: string;
}

type SaveFileModalState = 'error' | 'saving' | 'done' | 'init';

export function SaveBackendFileModal({
  onSave,
  onClose,
  fileTypeTitle,
  fileType,
  defaultRelativePath,
}: SaveBackendFileModalProps): JSX.Element {
  const { usbDrive, auth } = useContext(AppContext);
  assert(isElectionManagerAuth(auth) || isSystemAdministratorAuth(auth));

  const [currentState, setCurrentState] = useState<SaveFileModalState>('init');
  const [errorMessage, setErrorMessage] = useState('');
  const [usbDrivePath, setUsbDrivePath] = useState<string>();

  useExternalStateChangeListener(usbDrive.status, async (newStatus) => {
    if (newStatus === 'mounted') {
      const usbDriveInfo = await usbstick.getInfo();
      assert(usbDriveInfo);
      setUsbDrivePath(usbDriveInfo.mountPoint);
    }
  });

  async function saveFile(location: string) {
    setCurrentState('saving');
    const result = await onSave(location);
    if (result.isOk()) {
      setCurrentState('done');
    } else {
      setCurrentState('error');
      const error = result.err();
      // istanbul ignore next
      switch (error.type) {
        case 'permission-denied':
          setErrorMessage('Permission denied.');
          break;
        case 'file-system-error':
          setErrorMessage('There may be an issue with the USB drive.');
          break;
        case 'missing-usb-drive':
        case 'relative-file-path':
        case 'api-error':
          setErrorMessage('Application error.');
          break;
        // istanbul ignore next
        default:
          throwIllegalValue(error);
      }
    }
  }

  if (currentState === 'error') {
    return (
      <Modal
        content={
          <React.Fragment>
            <H1>{fileTypeTitle} Not Saved</H1>
            <P>
              Failed to save {fileType}. {errorMessage}
            </P>
          </React.Fragment>
        }
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  if (currentState === 'done') {
    return (
      <Modal
        content={
          <React.Fragment>
            <H1>{fileTypeTitle} Saved</H1>
            <P>
              {fileType.charAt(0).toUpperCase() + fileType.slice(1)}{' '}
              successfully saved to the inserted USB drive.
            </P>
          </React.Fragment>
        }
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  if (currentState === 'saving') {
    return <Modal content={<Loading>Saving {fileTypeTitle}</Loading>} />;
  }

  // istanbul ignore next
  if (currentState !== 'init') {
    throwIllegalValue(currentState);
  }

  switch (usbDrive.status) {
    case 'absent':
    case 'ejected':
    case 'bad_format':
      return (
        <Modal
          content={
            <React.Fragment>
              <H1>No USB Drive Detected</H1>
              <P>
                <UsbImage src="/assets/usb-drive.svg" alt="Insert USB Image" />
                Please insert a USB drive where you would like the save the{' '}
                {fileType}.
              </P>
            </React.Fragment>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              {window.kiosk && process.env.NODE_ENV === 'development' && (
                <SaveAsButton
                  onSave={(location) => saveFile(location)}
                  options={{
                    // Provide a file name, but allow the system dialog to use its
                    // default starting directory.
                    defaultPath: basename(defaultRelativePath),
                  }}
                />
              )}
              <Button onPress={onClose}>Cancel</Button>
            </React.Fragment>
          }
        />
      );
    case 'ejecting':
    case 'mounting':
      return (
        <Modal
          content={<Loading />}
          onOverlayClick={onClose}
          actions={<Button onPress={onClose}>Cancel</Button>}
        />
      );
    case 'mounted': {
      return (
        <Modal
          content={
            <React.Fragment>
              <H1>Save {fileTypeTitle}</H1>
              <P>
                Save the {fileType} as{' '}
                <Font weight="bold">{defaultRelativePath}</Font> on the inserted
                USB drive?
              </P>
            </React.Fragment>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <Button
                variant="primary"
                onPress={() =>
                  saveFile(
                    join(assertDefined(usbDrivePath), defaultRelativePath)
                  )
                }
              >
                Save
              </Button>
              <Button onPress={onClose}>Cancel</Button>
              <SaveAsButton
                onSave={saveFile}
                options={{
                  // Provide a file name and default to the USB drive's root directory.
                  defaultPath: join(
                    usbDrivePath ?? '',
                    basename(defaultRelativePath)
                  ),
                }}
              />
            </React.Fragment>
          }
        />
      );
    }
    // istanbul ignore next
    default:
      throwIllegalValue(usbDrive.status);
  }
}
