import React, { useState } from 'react';
import { throwIllegalValue } from '@votingworks/basics';
import { Button, Loading, Modal, P } from '@votingworks/ui';
import { getDeviceStatuses, exportBallotsPrintedReportPdf } from '../api';

export function ExportReportModal({
  onClose,
}: {
  onClose: () => void;
}): JSX.Element | null {
  const getDeviceStatusesQuery = getDeviceStatuses.useQuery();
  const exportReportMutation = exportBallotsPrintedReportPdf.useMutation();

  if (!getDeviceStatusesQuery.isSuccess) {
    return null;
  }

  const { usbDrive } = getDeviceStatusesQuery.data;

  switch (exportReportMutation.status) {
    case 'idle': {
      if (usbDrive.status === 'mounted') {
        return (
          <Modal
            title="Export Ballots Printed Report"
            content={
              <P>The report will be exported to the inserted USB drive.</P>
            }
            onOverlayClick={onClose}
            actions={
              <React.Fragment>
                <Button
                  icon="Export"
                  variant="primary"
                  onPress={() => exportReportMutation.mutate()}
                >
                  Export
                </Button>
                <Button onPress={onClose}>Cancel</Button>
              </React.Fragment>
            }
          />
        );
      }
      return (
        <Modal
          title="No USB Drive Detected"
          content={<P>Insert a USB drive to export the report.</P>}
          onOverlayClick={onClose}
          actions={<Button onPress={onClose}>Cancel</Button>}
        />
      );
    }

    case 'loading':
      return <Modal content={<Loading>Exporting Report</Loading>} />;

    case 'success':
      return (
        <Modal
          title="Ballots Printed Report Exported"
          content={
            <P>The report was successfully exported to the USB drive.</P>
          }
          onOverlayClick={onClose}
          actions={<Button onPress={onClose}>Close</Button>}
        />
      );

    case 'error':
      return (
        <Modal
          title="Failed to Export Ballots Printed Report"
          content={<P>Failed to export the report to the USB drive.</P>}
          onOverlayClick={onClose}
          actions={<Button onPress={onClose}>Close</Button>}
        />
      );

    default: {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(exportReportMutation);
    }
  }
}

export function ExportReportButton(): JSX.Element {
  const [isShowingModal, setIsShowingModal] = useState(false);

  return (
    <React.Fragment>
      <Button onPress={() => setIsShowingModal(true)}>Export Report PDF</Button>
      {isShowingModal && (
        <ExportReportModal onClose={() => setIsShowingModal(false)} />
      )}
    </React.Fragment>
  );
}
