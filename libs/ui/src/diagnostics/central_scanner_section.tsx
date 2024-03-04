import React from 'react';
import { H2, P } from '../typography';
import { InfoIcon, SuccessIcon } from './icons';

export function CentralScannerSection({
  isScannerAttached,
}: {
  isScannerAttached: boolean;
}): JSX.Element {
  return (
    <React.Fragment>
      <H2>Scanner</H2>
      {isScannerAttached ? (
        <P>
          <SuccessIcon /> Connected
        </P>
      ) : (
        <P>
          <InfoIcon /> No scanner detected
        </P>
      )}
    </React.Fragment>
  );
}
