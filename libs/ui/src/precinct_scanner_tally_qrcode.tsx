import { CompressedTally, ElectionDefinition } from '@votingworks/types';
import { format, formatFullDateTimeZone } from '@votingworks/utils';
import { DateTime } from 'luxon';
import React, { useEffect, useState } from 'react';
import { useCancelablePromise } from './hooks/use_cancelable_promise';
import { LogoMark } from './logo_mark';
import { Prose } from './prose';
import { ReportSection } from './tally_report';
import { Text } from './text';
import { QrCode } from './qrcode';

interface Props {
  reportSavedTime: number;
  electionDefinition: ElectionDefinition;
  signingMachineId: string;
  reportPurpose: string;
  isPollsOpen: boolean;
  isLiveMode: boolean;
  compressedTally: CompressedTally;
}

export function PrecinctScannerTallyQrCode({
  reportSavedTime,
  electionDefinition,
  signingMachineId,
  reportPurpose,
  isPollsOpen,
  isLiveMode,
  compressedTally,
}: Props): JSX.Element {
  const { election, electionHash } = electionDefinition;
  const [resultsReportingUrl, setResultsReportingUrl] = useState('');
  const pollsAction = isPollsOpen ? 'Opened' : 'Closed';
  const makeCancelable = useCancelablePromise();

  const electionDate = format.localeWeekdayAndDate(new Date(election.date));

  useEffect(() => {
    void (async () => {
      if (!isPollsOpen) {
        const secondsSince1970 = Math.round(new Date().getTime() / 1000);
        const stringToSign = `${electionHash}.${signingMachineId}.${
          isLiveMode ? '1' : '0'
        }.${secondsSince1970}.${window.btoa(JSON.stringify(compressedTally))}`;
        const signature =
          window.kiosk &&
          (await makeCancelable(
            window.kiosk.sign({
              signatureType: 'vx-results-reporting',
              payload: stringToSign,
            })
          ));

        setResultsReportingUrl(
          `https://results.voting.works/?p=${encodeURIComponent(
            stringToSign
          )}&s=${encodeURIComponent(signature || '')}`
        );
      }
    })();
  }, [
    setResultsReportingUrl,
    election,
    electionHash,
    signingMachineId,
    compressedTally,
    isPollsOpen,
    isLiveMode,
    makeCancelable,
  ]);

  return resultsReportingUrl ? (
    <ReportSection>
      <LogoMark />
      <Prose maxWidth={false}>
        <h1>Automatic Election Results Reporting</h1>
        <h2>{election.title}</h2>
        <p>
          {electionDate}, {election.county.name}, {election.state}
          <br /> <br />
          This report should be <strong>{reportPurpose}.</strong>
          <br />
          <Text small as="span">
            Polls {pollsAction} and report created on{' '}
            {formatFullDateTimeZone(DateTime.fromMillis(reportSavedTime))}
          </Text>
        </p>
        <p>
          This QR code contains the tally, authenticated with a digital
          signature. Scan the QR code and follow the URL for details.
        </p>
        <QrCode value={resultsReportingUrl} />
      </Prose>
    </ReportSection>
  ) : (
    <div />
  );
}
