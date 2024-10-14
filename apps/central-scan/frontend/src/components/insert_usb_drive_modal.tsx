import { Button, Modal, P } from '@votingworks/ui';

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
      content={<P>{message}</P>}
      onOverlayClick={onClose}
      actions={<Button onPress={onClose}>Cancel</Button>}
    />
  );
}
