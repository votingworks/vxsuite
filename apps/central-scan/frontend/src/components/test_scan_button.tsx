import { Button, Font, Loading, Modal, P } from '@votingworks/ui';
import React from 'react';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { getStatus, performScanDiagnostic } from '../api';

function TestScanModal({
  isScannerAttached,
  onClose,
}: {
  isScannerAttached: boolean;
  onClose: VoidFunction;
}): JSX.Element {
  const performDiagnosticMutation = performScanDiagnostic.useMutation();

  const { status } = performDiagnosticMutation;
  assert(status !== 'error');
  switch (status) {
    case 'idle':
      if (!isScannerAttached) {
        return (
          <Modal
            title="Test Scan Diagnostic"
            content={
              <P>
                No scanner is currently detected. Please connect a scanner to
                run the test scan.
              </P>
            }
            actions={<Button onPress={onClose}>Close</Button>}
          />
        );
      }
      return (
        <Modal
          title="Test Scan Diagnostic"
          content={
            <React.Fragment>
              <P>
                The test scan checks if the scanner accurately captures ballot
                images.
              </P>
              <P>
                Insert one <Font weight="bold"> blank white</Font> sheet of
                paper into the scanner.
              </P>
            </React.Fragment>
          }
          actions={
            <React.Fragment>
              <Button
                onPress={() => performDiagnosticMutation.mutate()}
                variant="primary"
              >
                Scan
              </Button>
              <Button onPress={onClose}>Cancel</Button>
            </React.Fragment>
          }
        />
      );
    case 'loading':
      return (
        <Modal
          centerContent
          content={<Loading>Scanning</Loading>}
          actions={<Button onPress={onClose}>Cancel</Button>}
        />
      );
    case 'success': {
      const outcome = performDiagnosticMutation.data;
      switch (outcome) {
        case 'pass':
          return (
            <Modal
              title="Test Scan Successful"
              content={<P>No defects were detected in the scanned image.</P>}
              actions={<Button onPress={onClose}>Close</Button>}
            />
          );
        case 'fail':
          return (
            <Modal
              title="Test Scan Failed"
              content={
                <React.Fragment>
                  <P>
                    Defects were detected in the scanned image. Confirm that you
                    used a <Font weight="bold">blank white</Font> sheet of
                    paper.
                  </P>
                  <P>
                    The scanner may need to be cleaned. Please consult the
                    scanner manufacturer&apos;s documentation for cleaning
                    instructions.
                  </P>
                </React.Fragment>
              }
              actions={<Button onPress={onClose}>Close</Button>}
            />
          );
        case 'no-paper':
          return (
            <Modal
              title="Test Scan Failed"
              content={
                <P>
                  The test scan failed because no paper was detected by the
                  scanner. Confirm that the paper was inserted correctly and try
                  again.
                </P>
              }
              actions={<Button onPress={onClose}>Close</Button>}
            />
          );
        /* istanbul ignore next */
        default:
          throwIllegalValue(outcome);
      }
    }
    /* istanbul ignore next */
    // eslint-disable-next-line no-fallthrough
    default:
      throwIllegalValue(status);
  }
}

export function TestScanButton(): JSX.Element {
  const statusQuery = getStatus.useQuery();
  const isScannerAttached = statusQuery.data?.isScannerAttached ?? false;
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  return (
    <React.Fragment>
      <Button
        disabled={!isScannerAttached}
        onPress={() => setIsModalOpen(true)}
      >
        Perform Test Scan
      </Button>
      {isModalOpen && (
        <TestScanModal
          isScannerAttached={isScannerAttached}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </React.Fragment>
  );
}
