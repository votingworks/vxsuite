import { Scan } from '@votingworks/api';

export async function exportCastVoteRecords(): Promise<void> {
  const response = await fetch('/central-scanner/scan/export-to-usb-drive', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const body: Scan.ExportToUsbDriveResponse = await response.json();

  if (body.status !== 'ok') {
    throw new Error(
      `Unable to export to USB drive: ${
        body.errors.map((error) => error.message)[0]
      }`
    );
  }
}
