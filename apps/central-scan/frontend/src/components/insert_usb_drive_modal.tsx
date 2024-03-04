import { Button, Modal, P } from '@votingworks/ui';
import React from 'react';
import styled from 'styled-components';

const UsbImageStyles = styled.img`
  margin-right: auto;
  margin-left: auto;
  height: 200px;
`;

export function UsbImage(): JSX.Element {
  return <UsbImageStyles src="/assets/usb-drive.svg" alt="Insert USB Image" />;
}

export function InsertUsbDriveModal({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}): JSX.Element {
  return (
    <Modal
      title="No USB Drive Detected"
      content={
        <React.Fragment>
          <UsbImage />
          <P>{message}</P>
        </React.Fragment>
      }
      onOverlayClick={onClose}
      actions={<Button onPress={onClose}>Cancel</Button>}
    />
  );
}
