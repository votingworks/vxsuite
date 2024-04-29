import { DiagnosticRecord } from '@votingworks/types';
import React from 'react';
import { assert } from '@votingworks/basics';
import { H2, P } from '../typography';
import { InfoIcon, SuccessIcon, WarningIcon } from './icons';
import { DiagnosticSection, DiagnosticSectionTitle } from './components';

export interface MarkScanControllerSectionProps {
  isAccessibleControllerInputDetected: boolean;
  mostRecentAccessibleControllerDiagnostic?: DiagnosticRecord;
  accessibleControllerSectionChildren?: React.ReactNode;
}

export function MarkScanControllerSection({
  isAccessibleControllerInputDetected,
  mostRecentAccessibleControllerDiagnostic,
  accessibleControllerSectionChildren,
}: MarkScanControllerSectionProps): JSX.Element {
  if (mostRecentAccessibleControllerDiagnostic) {
    assert(
      mostRecentAccessibleControllerDiagnostic.type ===
        'mark-scan-accessible-controller'
    );
  }

  return (
    <DiagnosticSection>
      <H2>{DiagnosticSectionTitle.AccessibleController}</H2>
      {isAccessibleControllerInputDetected ? (
        <P>
          <SuccessIcon /> Detected
        </P>
      ) : (
        <P>
          <WarningIcon /> Not detected
        </P>
      )}
      {!mostRecentAccessibleControllerDiagnostic ? (
        <P>
          <InfoIcon /> No test on record
        </P>
      ) : mostRecentAccessibleControllerDiagnostic.outcome === 'fail' ? (
        <P>
          <WarningIcon /> Test failed,{' '}
          {new Date(
            mostRecentAccessibleControllerDiagnostic.timestamp
          ).toLocaleString()}
          {mostRecentAccessibleControllerDiagnostic.message
            ? ` — ${mostRecentAccessibleControllerDiagnostic.message}`
            : ''}
        </P>
      ) : (
        <P>
          <SuccessIcon /> Test passed,{' '}
          {new Date(
            mostRecentAccessibleControllerDiagnostic.timestamp
          ).toLocaleString()}
        </P>
      )}
      {accessibleControllerSectionChildren}
    </DiagnosticSection>
  );
}
