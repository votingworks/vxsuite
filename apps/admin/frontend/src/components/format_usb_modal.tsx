import React, { useCallback, useContext, useState } from 'react';
import { assert, throwIllegalValue } from '@votingworks/basics';

import { Button, Modal, Loading, UsbImage, P, Icons } from '@votingworks/ui';
import {
  isElectionManagerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';
import { AppContext } from '../contexts/app_context';
import { formatUsbDrive } from '../api';

export interface FormatUsbModalProps {
  onClose: () => void;
}

type FlowState =
  | { stage: 'init' }
  | { stage: 'confirm' }
  | { stage: 'formatting' }
  | { stage: 'done' }
  | { stage: 'error'; message: string };

function FormatUsbFlow({ onClose }: FormatUsbModalProps): JSX.Element {
  const { usbDriveStatus, auth } = useContext(AppContext);
  assert(usbDriveStatus.status !== 'no_drive');
  assert(isSystemAdministratorAuth(auth) || isElectionManagerAuth(auth));
  const formatUsbDriveMutation = formatUsbDrive.useMutation();

  const [state, setState] = useState<FlowState>({ stage: 'init' });

  const formatUsbDriveMutateAsync = formatUsbDriveMutation.mutateAsync;
  const format = useCallback(async () => {
    setState({ stage: 'formatting' });
    const formatUsbDriveResult = await formatUsbDriveMutateAsync();
    if (formatUsbDriveResult.isOk()) {
      setState({ stage: 'done' });
    } else {
      setState({ stage: 'error', message: formatUsbDriveResult.err().message });
    }
  }, [formatUsbDriveMutateAsync]);

  const { stage } = state;
  switch (stage) {
    case 'init':
      switch (usbDriveStatus.status) {
        case 'ejected':
        case 'error':
        case 'mounted': {
          return (
            <Modal
              title="Format USB Drive"
              content={
                <P>
                  {usbDriveStatus.status === 'error'
                    ? 'The format of the inserted USB drive is not compatible with VxSuite components.'
                    : 'The format of the inserted USB drive is already compatible with VxSuite components.'}
                </P>
              }
              onOverlayClick={onClose}
              actions={
                <React.Fragment>
                  <Button
                    variant="primary"
                    onPress={() => setState({ stage: 'confirm' })}
                  >
                    Format USB
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
      break;
    case 'confirm':
      return (
        <Modal
          title="Confirm Format USB Drive"
          content={
            <P>
              <Icons.Warning color="warning" /> Formatting will delete all files
              on the USB drive. Back up USB drive files before formatting.
            </P>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <Button variant="primary" onPress={format}>
                Format USB
              </Button>
              <Button onPress={onClose}>Close</Button>
            </React.Fragment>
          }
        />
      );
    case 'formatting':
      return <Modal content={<Loading>Formatting USB Drive</Loading>} />;
    case 'done':
      return (
        <Modal
          title="USB Drive Formatted"
          content={
            <P>
              USB drive successfully formatted and ejected. It is now ready to
              use with VxSuite components.
            </P>
          }
          onOverlayClick={onClose}
          actions={<Button onPress={onClose}>Close</Button>}
        />
      );
    case 'error':
      return (
        <Modal
          title="Failed to Format USB Drive"
          content={<P>Failed to format USB drive: {state.message}</P>}
          onOverlayClick={onClose}
          actions={<Button onPress={onClose}>Close</Button>}
        />
      );
    default:
      throwIllegalValue(stage);
  }
}

export function FormatUsbModal({ onClose }: FormatUsbModalProps): JSX.Element {
  const { usbDriveStatus } = useContext(AppContext);

  if (usbDriveStatus.status === 'no_drive') {
    return (
      <Modal
        title="No USB Drive Detected"
        content={
          <P>
            <UsbImage />
            Insert a USB drive you would like to format.
          </P>
        }
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Cancel</Button>}
      />
    );
  }

  return <FormatUsbFlow onClose={onClose} />;
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
