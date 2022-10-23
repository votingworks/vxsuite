import {
  CompressedTally,
  Election,
  ElectionDefinition,
} from '@votingworks/types';
import { format, formatFullDateTimeZone } from '@votingworks/utils';
import { DateTime } from 'luxon';
import React from 'react';
import styled from 'styled-components';
import { LogoMark } from './logo_mark';
import { Prose } from './prose';
import { ReportSection } from './tally_report';
import { Text } from './text';
import { QrCode } from './qrcode';

interface SignedQuickResultsReportingUrlProps {
  electionDefinition: ElectionDefinition;
  signingMachineId: string;
  isLiveMode: boolean;
  compressedTally: CompressedTally;
}

export async function getSignedQuickResultsReportingUrl({
  electionDefinition,
  signingMachineId,
  isLiveMode,
  compressedTally,
}: SignedQuickResultsReportingUrlProps): Promise<string> {
  const { electionHash, election } = electionDefinition;
  const secondsSince1970 = Math.round(new Date().getTime() / 1000);
  const stringToSign = `${electionHash}.${signingMachineId}.${
    isLiveMode ? '1' : '0'
  }.${secondsSince1970}.${window.btoa(JSON.stringify(compressedTally))}`;
  const signature =
    window.kiosk &&
    (await window.kiosk.sign({
      signatureType: 'vx-results-reporting',
      payload: stringToSign,
    }));

  return `${election.quickResultsReportingUrl}/?p=${encodeURIComponent(
    stringToSign
  )}&s=${encodeURIComponent(signature || '')}`;
}

const QrCodeWrapper = styled.div`
  width: 25%;
`;

export interface PrecinctScannerTallyQrCodeProps {
  pollsToggledTime: number;
  election: Election;
  isPollsOpen: boolean;
  signedQuickResultsReportingUrl: string;
}

export function PrecinctScannerTallyQrCode({
  pollsToggledTime,
  election,
  isPollsOpen,
  signedQuickResultsReportingUrl,
}: PrecinctScannerTallyQrCodeProps): JSX.Element {
  const pollsAction = isPollsOpen ? 'Opened' : 'Closed';
  const electionDate = format.localeWeekdayAndDate(new Date(election.date));

  return (
    <ReportSection>
      <LogoMark />
      <Prose maxWidth={false}>
        <h1>Automatic Election Results Reporting</h1>
        <h2>{election.title}</h2>
        <p>
          {electionDate}, {election.county.name}, {election.state}
          <br />
          <Text small as="span">
            Polls {pollsAction} and report created on{' '}
            {formatFullDateTimeZone(DateTime.fromMillis(pollsToggledTime))}
          </Text>
        </p>
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
      </Prose>
    </ReportSection>
  );
}
