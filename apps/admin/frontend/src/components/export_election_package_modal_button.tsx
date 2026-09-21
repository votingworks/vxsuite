import React, { useContext, useState } from 'react';
import {
  checkFileFitsOnUsbDrive,
  format,
  isElectionManagerAuth,
  isSystemAdministratorAuth,
  UsbDriveFileFit,
} from '@votingworks/utils';
import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
import {
  Button,
  FILESYSTEM_LABELS,
  Font,
  FormatUsbModal,
  LoadingButton,
  Modal,
  P,
  UsbControllerButton,
  userReadableMessageFromExportDataError,
} from '@votingworks/ui';
import type { ExportDataError } from '@votingworks/admin-backend';
import type { MountedUsbDriveStatus } from '@votingworks/usb-drive';

import {
  ejectUsbDrive,
  formatUsbDrive,
  getElectionPackageSize,
  saveElectionPackageToUsb,
} from '../api.js';
import { AppContext } from '../contexts/app_context.js';

type SaveState =
  | { state: 'unsaved' }
  | { state: 'saved' }
  | { state: 'error'; error: ExportDataError };

function Bytes({ value }: { value: number }): JSX.Element {
  return <Font noWrap>{format.bytes(value)}</Font>;
}

type DoesNotFit = Exclude<UsbDriveFileFit, 'fits'>;

const DOES_NOT_FIT_TITLES: Record<DoesNotFit, string> = {
  'file-too-large': 'File Too Large for USB Drive',
  'insufficient-space': 'Not Enough Space on USB Drive',
  'drive-too-small': 'USB Drive Too Small',
};

function DoesNotFitMessage({
  fit,
  usbDriveStatus,
  electionPackageSize,
  canFormat,
}: {
  fit: DoesNotFit;
  usbDriveStatus: MountedUsbDriveStatus;
  electionPackageSize: number;
  canFormat: boolean;
}): JSX.Element {
  switch (fit) {
    case 'file-too-large':
      return (
        <P>
          The election package is <Bytes value={electionPackageSize} />. The USB
          drive is formatted as{' '}
          <Font weight="semiBold">
            {FILESYSTEM_LABELS[usbDriveStatus.fstype]}
          </Font>
          , which cannot store files larger than{' '}
          <Bytes value={assertDefined(usbDriveStatus.maxFileSize)} />.{' '}
          {canFormat
            ? 'Format the USB drive to continue.'
            : 'Ask a system administrator to format the USB drive, or use a different USB drive.'}
        </P>
      );
    case 'insufficient-space':
      return (
        <P>
          The election package is <Bytes value={electionPackageSize} />, but the
          USB drive only has{' '}
          <Bytes value={assertDefined(usbDriveStatus.availableBytes)} /> free.
          Remove files from the USB drive{canFormat ? ' or format it' : ''} to
          continue.
        </P>
      );
    case 'drive-too-small':
      return (
        <P>
          The election package is <Bytes value={electionPackageSize} />, but the
          USB drive can only hold{' '}
          <Bytes value={assertDefined(usbDriveStatus.totalBytes)} />. Use a
          larger USB drive.
        </P>
      );
    default:
      return throwIllegalValue(fit);
  }
}

export function ExportElectionPackageModalButton(): JSX.Element {
  const { electionDefinition, usbDriveStatus, auth } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth) || isSystemAdministratorAuth(auth));
  const saveElectionPackageToUsbMutation =
    saveElectionPackageToUsb.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();
  const formatUsbDriveMutation = formatUsbDrive.useMutation();

  const [saveState, setSaveState] = useState<SaveState>({ state: 'unsaved' });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFormatModalOpen, setIsFormatModalOpen] = useState(false);

  const electionPackageSizeQuery = getElectionPackageSize.useQuery({
    enabled: isModalOpen && usbDriveStatus.status === 'mounted',
  });

  function closeModal() {
    if (saveElectionPackageToUsbMutation.isLoading) return;
    setIsModalOpen(false);
    setSaveState({ state: 'unsaved' });
  }

  function saveElectionPackage() {
    saveElectionPackageToUsbMutation.mutate(undefined, {
      onSuccess: (result) => {
        if (result.isErr()) {
          setSaveState({ state: 'error', error: result.err() });
        } else {
          setSaveState({ state: 'saved' });
        }
      },
    });
  }

  let title = '';
  let mainContent: React.ReactNode = null;
  let actions: React.ReactNode = null;

  switch (saveState.state) {
    case 'unsaved':
      switch (usbDriveStatus.status) {
        case 'no_drive':
        case 'ejected':
        case 'error':
          actions = <Button onPress={closeModal}>Cancel</Button>;
          title = 'No USB Drive Detected';
          mainContent = (
            <P>Insert a USB drive in order to save the election package.</P>
          );
          break;
        case 'mounted': {
          const electionPackageSize = electionPackageSizeQuery.data;
          if (electionPackageSize === undefined) {
            actions = <Button onPress={closeModal}>Cancel</Button>;
            title = 'Save Election Package';
            break;
          }
          const fit = checkFileFitsOnUsbDrive(
            usbDriveStatus,
            electionPackageSize
          );
          if (fit !== 'fits') {
            const canFormat = isSystemAdministratorAuth(auth);
            const offerFormat = canFormat && fit !== 'drive-too-small';
            actions = (
              <React.Fragment>
                {offerFormat && (
                  <Button
                    variant="primary"
                    onPress={() => setIsFormatModalOpen(true)}
                  >
                    Format USB Drive
                  </Button>
                )}
                <Button onPress={closeModal}>Cancel</Button>
              </React.Fragment>
            );
            title = DOES_NOT_FIT_TITLES[fit];
            mainContent = (
              <DoesNotFitMessage
                fit={fit}
                usbDriveStatus={usbDriveStatus}
                electionPackageSize={electionPackageSize}
                canFormat={canFormat}
              />
            );
            break;
          }
          actions = (
            <React.Fragment>
              {saveElectionPackageToUsbMutation.isLoading ? (
                <LoadingButton variant="primary">Saving...</LoadingButton>
              ) : (
                <Button
                  icon="Export"
                  onPress={saveElectionPackage}
                  variant="primary"
                >
                  Save
                </Button>
              )}
              <Button
                onPress={closeModal}
                disabled={saveElectionPackageToUsbMutation.isLoading}
              >
                Cancel
              </Button>
            </React.Fragment>
          );
          title = 'Save Election Package';
          mainContent = (
            <P>An election package will be saved to the inserted USB drive.</P>
          );
          break;
        }

        default:
          throwIllegalValue(usbDriveStatus, 'status');
      }
      break;

    case 'saved': {
      // @coverage-defer
      if (usbDriveStatus.status !== 'ejected') {
        actions = (
          <React.Fragment>
            <UsbControllerButton
              primary
              usbDriveEject={() => ejectUsbDriveMutation.mutate()}
              usbDriveStatus={usbDriveStatus}
              usbDriveIsEjecting={ejectUsbDriveMutation.isLoading}
            />
            <Button onPress={closeModal}>Close</Button>
          </React.Fragment>
        );
      } else {
        actions = <Button onPress={closeModal}>Close</Button>;
      }
      title = 'Election Package Saved';
      mainContent = (
        <P>
          You may now eject the USB drive. Use the saved election package on the
          USB drive to configure VxSuite components.
        </P>
      );
      break;
    }

    case 'error': {
      actions = <Button onPress={closeModal}>Close</Button>;
      title = 'Failed to Save Election Package';
      mainContent = (
        <P>
          An error occurred:{' '}
          {userReadableMessageFromExportDataError(saveState.error.type)}
        </P>
      );
      break;
    }

    default:
      throwIllegalValue(saveState);
  }

  return (
    <React.Fragment>
      <Button
        variant="primary"
        icon="Export"
        onPress={() => setIsModalOpen(true)}
      >
        Save Election Package
      </Button>
      {isModalOpen && isFormatModalOpen && (
        <FormatUsbModal
          usbDriveStatus={usbDriveStatus}
          formatUsbDriveMutation={formatUsbDriveMutation}
          onClose={() => setIsFormatModalOpen(false)}
        />
      )}
      {isModalOpen && !isFormatModalOpen && (
        <Modal
          title={title}
          content={mainContent}
          onOverlayClick={closeModal}
          actions={actions}
        />
      )}
    </React.Fragment>
  );
}
