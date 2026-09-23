import React, { useCallback, useState } from 'react';
import { Result, throwIllegalValue } from '@votingworks/basics';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { format } from '@votingworks/utils';
import { UseMutationResult } from '@tanstack/react-query';
import { Button } from './button.js';
import { Modal } from './modal.js';
import { Font, P } from './typography.js';
import { Icons } from './icons.js';
import { FILESYSTEM_LABELS } from './usb_drive.js';
import { UsbControllerButton } from './usbcontroller_button.js';

function CompatibilityMessage({
  usbDriveStatus,
}: {
  usbDriveStatus: UsbDriveStatus;
}): JSX.Element {
  if (usbDriveStatus.status === 'error') {
    return (
      <P>
        The format of the inserted USB drive is{' '}
        <Font weight="semiBold">not compatible</Font> with VotingWorks
        components.
      </P>
    );
  }

  if (
    usbDriveStatus.status === 'mounted' &&
    usbDriveStatus.maxFileSize !== undefined
  ) {
    return (
      <P>
        The inserted USB drive is formatted as{' '}
        <Font weight="semiBold">
          {FILESYSTEM_LABELS[usbDriveStatus.fstype]}
        </Font>
        , which cannot store files larger than{' '}
        <Font noWrap>
          {format.bytes(usbDriveStatus.maxFileSize, { fractionDigits: 0 })}
        </Font>
        . Formatting the drive removes this limit.
      </P>
    );
  }

  return (
    <P>
      The format of the inserted USB drive is{' '}
      <Font weight="semiBold">already compatible</Font> with VotingWorks
      components.
    </P>
  );
}

type FlowState =
  | { stage: 'confirm' }
  | { stage: 'formatting' }
  | { stage: 'done' }
  | { stage: 'error'; message: string };

export interface FormatUsbModalProps extends FormatUsbButtonProps {
  onClose: () => void;
}
export function FormatUsbModal({
  onClose,
  usbDriveStatus,
  formatUsbDriveMutation,
  ejectUsbDriveMutation,
}: FormatUsbModalProps): JSX.Element {
  const [state, setState] = useState<FlowState>({ stage: 'confirm' });

  const formatUsbDriveMutateAsync = formatUsbDriveMutation.mutateAsync;
  const formatDrive = useCallback(async () => {
    setState({ stage: 'formatting' });
    const formatUsbDriveResult = await formatUsbDriveMutateAsync();
    if (formatUsbDriveResult.isOk()) {
      setState({ stage: 'done' });
    } else {
      setState({ stage: 'error', message: formatUsbDriveResult.err().message });
    }
  }, [formatUsbDriveMutateAsync]);

  const { stage } = state;

  // Show "no drive" screen only when we haven't started formatting yet.
  // During and after formatting, keep showing the flow even if the drive
  // status transiently reports no_drive (e.g. while partitions are being
  // reformatted) to prevent flickering and loss of the done/error state.
  if (stage === 'confirm' && usbDriveStatus.status === 'no_drive') {
    return (
      <Modal
        title="No USB Drive Detected"
        content={<P>Insert a USB drive you would like to format.</P>}
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Cancel</Button>}
      />
    );
  }

  switch (stage) {
    case 'confirm':
      return (
        <Modal
          title="Format USB Drive"
          content={
            <React.Fragment>
              <CompatibilityMessage usbDriveStatus={usbDriveStatus} />
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
              <Button variant="primary" onPress={formatDrive}>
                Format USB Drive
              </Button>
              <Button onPress={onClose}>Close</Button>
            </React.Fragment>
          }
        />
      );
    case 'formatting':
      return (
        <Modal
          title="Formatting USB Drive…"
          content={
            <P>
              <Icons.Warning color="warning" /> Do not remove the USB drive.
            </P>
          }
        />
      );
    case 'done':
      return (
        <Modal
          title="USB Drive Formatted"
          content={
            <P>
              USB drive successfully formatted. It can now be used with
              VotingWorks components.
            </P>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <UsbControllerButton
                primary
                usbDriveStatus={usbDriveStatus}
                usbDriveEject={() => ejectUsbDriveMutation.mutate()}
                usbDriveIsEjecting={ejectUsbDriveMutation.isLoading}
              />
              <Button onPress={onClose}>Close</Button>
            </React.Fragment>
          }
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

export interface FormatUsbButtonProps {
  usbDriveStatus: UsbDriveStatus;
  formatUsbDriveMutation: UseMutationResult<
    Result<void, Error>,
    unknown,
    void,
    unknown
  >;
  ejectUsbDriveMutation: UseMutationResult<void, unknown, void, unknown>;
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
