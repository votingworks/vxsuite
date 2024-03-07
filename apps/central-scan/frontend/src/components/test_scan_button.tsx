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
            <P>
              The test scan will check whether the scanner is able to produce
              acceptable scanned images. Please insert one{' '}
              <Font weight="bold">completely blank, white</Font> sheet of paper
              into the scanner.
            </P>
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
              content={
                <P>
                  No issues were found in the scanned image produced by the
                  scanner.
                </P>
              }
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
                    The test scan was not successful because defects were
                    detected in the scanned image. Confirm that you used a{' '}
                    <Font weight="bold">completely blank, white</Font> sheet of
                    paper.
                  </P>
                  <P>
                    The scanner may need to be cleaned. Please consult the
                    scanner manufacturer&apos;s documentation for cleaning
                    instructions. When ready, try another test scan.
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
                  The test scan was not successful because no paper was detected
                  by the scanner. Confirm that the paper was inserted correctly
                  and try again.
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
