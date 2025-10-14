import { FullScreenMessage, UsbDriveImage } from '@votingworks/ui';

export function UnconfiguredSystemAdminScreen(): JSX.Element {
  return (
    <FullScreenMessage
      title="Insert a USB drive containing an election package."
      image={<UsbDriveImage />}
    />
  );
}
