import { useEffect, useRef } from 'react';
import { Button, ButtonBar, H2, Main, P, Screen } from '@votingworks/ui';
import {
  addDiagnosticRecord,
  clearLastBarcodeScan,
  getMostRecentBarcodeScan,
} from '../api';

interface BarcodeReaderDiagnosticScreenProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function BarcodeReaderDiagnosticScreen({
  onComplete,
  onCancel,
}: BarcodeReaderDiagnosticScreenProps): JSX.Element {
  const addDiagnosticRecordMutation = addDiagnosticRecord.useMutation();
  const clearLastBarcodeScanMutation = clearLastBarcodeScan.useMutation();
  const mostRecentBarcodeScanQuery = getMostRecentBarcodeScan.useQuery();

  // Track the start timestamp to detect scans during the test
  const testStartTime = useRef<Date>(new Date());

  // Clear any previous scan data when the test starts
  useEffect(() => {
    clearLastBarcodeScanMutation.mutate();
    testStartTime.current = new Date();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-pass if a scan is detected during the test
  const lastScan = mostRecentBarcodeScanQuery.data;
  const scanDetectedDuringTest =
    lastScan && new Date(lastScan.timestamp) > testStartTime.current;

  function passTest() {
    addDiagnosticRecordMutation.mutate({
      type: 'mark-barcode-reader',
      outcome: 'pass',
    });
    onComplete();
  }

  function failTest() {
    addDiagnosticRecordMutation.mutate({
      type: 'mark-barcode-reader',
      outcome: 'fail',
    });
    onComplete();
  }

  // If a scan was detected, automatically pass the test
  useEffect(() => {
    if (scanDetectedDuringTest) {
      passTest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanDetectedDuringTest]);

  return (
    <Screen>
      <Main flexColumn padded>
        <H2>Barcode Reader Test</H2>
        <P>
          Scan any barcode to verify the barcode reader is working. The test
          will automatically pass when a barcode is detected.
        </P>
        {scanDetectedDuringTest ? (
          <P>
            <strong>Barcode detected!</strong> Test passed.
          </P>
        ) : (
          <P>Waiting for barcode scan...</P>
        )}
        <ButtonBar style={{ marginTop: '0.5rem' }}>
          <Button icon="Delete" onPress={failTest}>
            Barcode Reader Is Not Working
          </Button>
        </ButtonBar>
        <P style={{ marginTop: '1rem' }}>
          <Button onPress={onCancel}>Cancel Test</Button>
        </P>
      </Main>
    </Screen>
  );
}
