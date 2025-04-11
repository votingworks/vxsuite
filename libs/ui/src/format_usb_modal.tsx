import React, { useCallback, useState } from 'react';
import { assert, Result, throwIllegalValue } from '@votingworks/basics';
import { UsbDriveStatus } from '@votingworks/usb-drive';
import { UseMutationResult } from '@tanstack/react-query';
import { Button } from './button';
import { Modal } from './modal';
import { Font, P } from './typography';
import { Icons } from './icons';
import { Loading } from './loading';

type FlowState =
  | { stage: 'confirm' }
  | { stage: 'formatting' }
  | { stage: 'done' }
  | { stage: 'error'; message: string };

function FormatUsbFlow({
  onClose,
  usbDriveStatus,
  formatUsbDriveMutation,
}: FormatUsbModalProps): JSX.Element {
  assert(usbDriveStatus.status !== 'no_drive');

  const [state, setState] = useState<FlowState>({ stage: 'confirm' });

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
    case 'confirm':
      return (
        <Modal
          title="Format USB Drive"
          content={
            <React.Fragment>
              {usbDriveStatus.status === 'error' ? (
                <P>
                  The format of the inserted USB drive is{' '}
                  <Font weight="semiBold">not compatible</Font> with VotingWorks
                  components.
                </P>
              ) : (
                <P>
                  The format of the inserted USB drive is{' '}
                  <Font weight="semiBold">already compatible</Font> with
                  VotingWorks components.
                </P>
              )}
              <P>
                <Icons.Warning color="warning" /> Formatting will delete all
                files on the USB drive. Back up USB drive files before
                formatting.
              </P>
            </React.Fragment>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <Button variant="primary" onPress={format}>
                Format USB Drive
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
              USB drive successfully formatted and ejected. It can now be used
              with VxSuite components.
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

export interface FormatUsbModalProps extends FormatUsbButtonProps {
  onClose: () => void;
}
export function FormatUsbModal(props: FormatUsbModalProps): JSX.Element {
  const { usbDriveStatus, onClose } = props;

  if (usbDriveStatus.status === 'no_drive') {
    return (
      <Modal
        title="No USB Drive Detected"
        content={<P>Insert a USB drive you would like to format.</P>}
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Cancel</Button>}
      />
    );
  }

  return <FormatUsbFlow {...props} />;
}

export interface FormatUsbButtonProps {
  usbDriveStatus: UsbDriveStatus;
  formatUsbDriveMutation: UseMutationResult<
    Result<void, Error>,
    unknown,
    void,
    unknown
  >;
}

export function FormatUsbButton(props: FormatUsbButtonProps): JSX.Element {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <React.Fragment>
      <Button onPress={() => setIsModalOpen(true)}>Format USB Drive</Button>
      {isModalOpen && (
        <FormatUsbModal {...props} onClose={() => setIsModalOpen(false)} />
      )}
    </React.Fragment>
  );
}
