import styled from 'styled-components';
import React from 'react';
import { LogoMark } from '../logo_mark';
import { QrCode } from '../qrcode';

const QrCodeWrapper = styled.div`
  width: 25%;
`;

export interface PrecinctScannerTallyQrCodeProps {
  signedQuickResultsReportingUrl: string;
}

export function PrecinctScannerTallyQrCode({
  signedQuickResultsReportingUrl,
}: PrecinctScannerTallyQrCodeProps): JSX.Element {
  return (
    <React.Fragment>
      <LogoMark />
      <div>
        <h1>Automatic Election Results Reporting</h1>
        <p>
          This QR code contains the tally, authenticated with a digital
          signature. Scan the QR code and follow the URL for details.
        </p>
        <QrCodeWrapper
          data-testid="qrcode"
          data-value={signedQuickResultsReportingUrl}
        >
          <QrCode value={signedQuickResultsReportingUrl} />
        </QrCodeWrapper>
      </div>
    </React.Fragment>
  );
}
