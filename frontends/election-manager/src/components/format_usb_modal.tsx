import React, { useCallback, useContext, useEffect, useState } from 'react';
import { assert, throwIllegalValue } from '@votingworks/utils';

import {
  Button,
  Modal,
  Prose,
  isElectionManagerAuth,
  isSystemAdministratorAuth,
  LinkButton,
  Loading,
  UsbImage,
} from '@votingworks/ui';
import { AppContext } from '../contexts/app_context';

export interface FormatUsbModalProps {
  onClose: () => void;
}

type ModalState = 'init' | 'confirm' | 'formatting' | 'done' | 'error';

export function FormatUsbModal({ onClose }: FormatUsbModalProps): JSX.Element {
  const { usbDrive, auth } = useContext(AppContext);
  assert(isSystemAdministratorAuth(auth) || isElectionManagerAuth(auth));
  const userRole = auth.user.role;

  const [state, setState] = useState<ModalState>('init');
  const [errorMessage, setErrorMessage] = useState('');

  const format = useCallback(async () => {
    setState('formatting');
    try {
      await usbDrive.format(userRole, { action: 'eject', actionDelay: 2000 });
      setState('done');
    } catch (error) {
      setState('error');
      setErrorMessage((error as Error).message);
    }
  }, [usbDrive, userRole]);

  // Handle USB drive being removed during stages of the  process
  useEffect(() => {
    if (usbDrive.status === 'absent') {
      setState('init');
    }
  }, [state, usbDrive.status]);

  if (state === 'error') {
    return (
      <Modal
        content={
          <Prose>
            <h1>Failed to Format USB Drive</h1>
            <p>Failed to format USB drive: {errorMessage}</p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  if (state === 'done') {
    return (
      <Modal
        content={
          <Prose>
            <h1>USB Drive Formatted</h1>
            <p>
              USB drive successfully re-formatted. It is now ready to use with
              VotingWorks devices.
            </p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={<LinkButton onPress={onClose}>Close</LinkButton>}
      />
    );
  }

  if (state === 'formatting') {
    return <Modal content={<Loading>Formatting USB Drive</Loading>} />;
  }

  if (state === 'confirm') {
    return (
      <Modal
        content={
          <Prose>
            <h1>Confirm Format USB Drive</h1>
            <p>
              <strong>Warning:</strong> Any files currently on the USB drive
              will be deleted. Make sure you have backed up any important files.
            </p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={
          <React.Fragment>
            <Button primary onPress={format}>
              Format USB
            </Button>
            <Button onPress={onClose}>Close</Button>
          </React.Fragment>
        }
      />
    );
  }

  switch (usbDrive.status) {
    case 'absent':
      return (
        <Modal
          content={
            <Prose>
              <h1>No USB Drive Detected</h1>
              <p>
                <UsbImage />
                Insert a USB drive you would like to format.
              </p>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={<Button onPress={onClose}>Cancel</Button>}
        />
      );
    case 'ejecting':
    case 'mounting':
      return (
        <Modal
          content={<Loading />}
          onOverlayClick={onClose}
          actions={<LinkButton onPress={onClose}>Cancel</LinkButton>}
        />
      );
    case 'ejected':
    case 'bad_format':
    case 'mounted': {
      return (
        <Modal
          content={
            <Prose>
              <h1>Format USB Drive</h1>
              <p>
                Format the inserted USB drive to be compatible with VotingWorks
                devices? Formatting will delete any files currently saved to the
                USB drive.
              </p>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <Button primary onPress={() => setState('confirm')}>
                Format USB
              </Button>
              <LinkButton onPress={onClose}>Cancel</LinkButton>
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

export function FormatUsbButton(): JSX.Element {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <React.Fragment>
      <Button onPress={() => setIsModalOpen(true)}>Format USB</Button>
      {isModalOpen && <FormatUsbModal onClose={() => setIsModalOpen(false)} />}
    </React.Fragment>
  );
}
