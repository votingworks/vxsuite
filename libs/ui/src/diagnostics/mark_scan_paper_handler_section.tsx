import React from 'react';
import { assert } from '@votingworks/basics';
import { DiagnosticRecord } from '@votingworks/types';
import { H2, P } from '../typography';
import { InfoIcon, SuccessIcon, WarningIcon } from './icons';
import { Button } from '../button';

export interface MarkScanPaperHandlerSectionProps {
  mostRecentPaperHandlerDiagnostic?: DiagnosticRecord;
  isPaperHandlerDetected: boolean;
  onStartPaperHandlerDiagnostic: () => void;
}

export function MarkScanPaperHandlerSection({
  mostRecentPaperHandlerDiagnostic,
  isPaperHandlerDetected,
  onStartPaperHandlerDiagnostic,
}: MarkScanPaperHandlerSectionProps): JSX.Element {
  if (mostRecentPaperHandlerDiagnostic) {
    assert(mostRecentPaperHandlerDiagnostic.type === 'mark-scan-paper-handler');
  }

  return (
    <React.Fragment>
      <H2>Printer/Scanner</H2>
      {isPaperHandlerDetected ? (
        <P data-testid="paperHandlerDetected">
          <SuccessIcon /> Detected
        </P>
      ) : (
        <P data-testid="paperHandlerNotDetected">
          <WarningIcon /> Not detected
        </P>
      )}
      {!mostRecentPaperHandlerDiagnostic ? (
        <P>
          <InfoIcon /> No test on record
        </P>
      ) : mostRecentPaperHandlerDiagnostic.outcome === 'fail' ? (
        <P>
          <WarningIcon /> Test failed,{' '}
          {new Date(
            mostRecentPaperHandlerDiagnostic.timestamp
          ).toLocaleString()}
          {mostRecentPaperHandlerDiagnostic.message
            ? ` — ${mostRecentPaperHandlerDiagnostic.message}`
            : ''}
        </P>
      ) : (
        <P data-testid="paperHandlerTestPassed">
          <SuccessIcon /> Test passed,{' '}
          {new Date(
            mostRecentPaperHandlerDiagnostic.timestamp
          ).toLocaleString()}
        </P>
      )}
      <Button onPress={onStartPaperHandlerDiagnostic}>
        Test Printer/Scanner
      </Button>
    </React.Fragment>
  );
}
