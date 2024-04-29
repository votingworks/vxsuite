import React from 'react';
import { assert } from '@votingworks/basics';
import { DiagnosticRecord } from '@votingworks/types';
import { H2, P } from '../typography';
import { InfoIcon, SuccessIcon, WarningIcon } from './icons';
import { DiagnosticSection, DiagnosticSectionTitle } from './components';

export interface MarkScanPaperHandlerSectionProps {
  mostRecentPaperHandlerDiagnostic?: DiagnosticRecord;
  isPaperHandlerDetected: boolean;
  paperHandlerSectionChildren?: React.ReactNode;
}

export function MarkScanPaperHandlerSection({
  mostRecentPaperHandlerDiagnostic,
  isPaperHandlerDetected,
  paperHandlerSectionChildren,
}: MarkScanPaperHandlerSectionProps): JSX.Element {
  if (mostRecentPaperHandlerDiagnostic) {
    assert(mostRecentPaperHandlerDiagnostic.type === 'mark-scan-paper-handler');
  }

  return (
    <DiagnosticSection>
      <H2>{DiagnosticSectionTitle.PaperHandler}</H2>
      {isPaperHandlerDetected ? (
        <P>
          <SuccessIcon /> Detected
        </P>
      ) : (
        <P>
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
        <P>
          <SuccessIcon /> Test passed,{' '}
          {new Date(
            mostRecentPaperHandlerDiagnostic.timestamp
          ).toLocaleString()}
        </P>
      )}
      {paperHandlerSectionChildren}
    </DiagnosticSection>
  );
}
