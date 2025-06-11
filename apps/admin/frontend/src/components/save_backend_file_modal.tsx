import React, { useContext } from 'react';
import { assert, throwIllegalValue, assertDefined } from '@votingworks/basics';
import {
  isElectionManagerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';
import type { ExportDataResult } from '@votingworks/admin-backend';

import { Button, Modal, P, Font, ModalWidth } from '@votingworks/ui';

import { MutationStatus } from '@tanstack/react-query';
import { AppContext } from '../contexts/app_context';
import { Loading } from './loading';

export interface SaveBackendFileModalProps {
  saveFileStatus: MutationStatus;
  saveFile: (input: { filename: string }) => void;
  saveFileResult?: ExportDataResult;
  resetSaveFileResult: () => void;
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
   * The name of the file to be saved.
   */
  filename: string;
}

export function SaveBackendFileModal({
  saveFileStatus,
  saveFile,
  saveFileResult,
  resetSaveFileResult,
  onClose: onCloseProp,
  fileTypeTitle,
  fileType,
  filename,
}: SaveBackendFileModalProps): JSX.Element {
  const { usbDriveStatus, auth } = useContext(AppContext);
  assert(isElectionManagerAuth(auth) || isSystemAdministratorAuth(auth));

  function onClose() {
    resetSaveFileResult();
    onCloseProp();
  }

  if (saveFileStatus === 'idle') {
    switch (usbDriveStatus.status) {
      case 'no_drive':
      case 'ejected':
      case 'error':
        return (
          <Modal
            title="No USB Drive Detected"
            content={
              <P>
                Insert a USB drive where you would like to save the {fileType}.
              </P>
            }
            onOverlayClick={onClose}
            actions={<Button onPress={onClose}>Cancel</Button>}
          />
        );
      case 'mounted': {
        return (
          <Modal
            title={`Save ${fileTypeTitle}`}
            content={
              <P>
                Save the {fileType} as <Font weight="bold">{filename}</Font> on
                the inserted USB drive?
              </P>
            }
            onOverlayClick={onClose}
            actions={
              <React.Fragment>
                <Button
                  variant="primary"
                  onPress={() =>
                    saveFile({
                      filename,
                    })
                  }
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
        throwIllegalValue(usbDriveStatus, 'status');
    }
  }

  if (saveFileStatus === 'loading') {
    return (
      <Modal
        centerContent
        modalWidth={ModalWidth.Wide}
        content={<Loading>Saving {fileTypeTitle}</Loading>}
      />
    );
  }

  if (saveFileStatus === 'success' && assertDefined(saveFileResult).isOk()) {
    return (
      <Modal
        title={`${fileTypeTitle} Saved`}
        content={
          <P>
            {fileType.charAt(0).toUpperCase() + fileType.slice(1)} successfully
            saved to the inserted USB drive.
          </P>
        }
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  const errorMessage = (() => {
    // istanbul ignore next - if this actually happens, error will go to error boundary
    if (saveFileStatus === 'error') {
      return 'Unknown API Error.';
    }

    assert(saveFileStatus === 'success');
    assert(saveFileResult && saveFileResult.isErr());
    const error = saveFileResult.err();
    switch (error.type) {
      case 'permission-denied':
        return 'Permission denied.';
      case 'file-system-error':
        return 'There may be an issue with the USB drive.';
      case 'missing-usb-drive':
      case 'relative-file-path':
        return 'Application error.';
      // istanbul ignore next
      default:
        throwIllegalValue(error.type);
    }
  })();

  return (
    <Modal
      title={`${fileTypeTitle} Not Saved`}
      content={
        <P>
          Failed to save {fileType}. {errorMessage}
        </P>
      }
      onOverlayClick={onClose}
      actions={<Button onPress={onClose}>Close</Button>}
    />
  );
}
