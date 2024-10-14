import { Button, Modal, P, UsbDriveImage } from '@votingworks/ui';
import React from 'react';
import styled from 'styled-components';

const UsbDriveImageWrapper = styled.div`
  margin: 0.5rem auto 1rem;
  height: 200px;

  svg {
    height: 100%;
  }
`;

export function UsbImage(): JSX.Element {
  return (
    <UsbDriveImageWrapper>
      <UsbDriveImage />
    </UsbDriveImageWrapper>
  );
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
