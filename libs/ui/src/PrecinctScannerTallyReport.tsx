import QRCodeReact from '@votingworks/qrcode.react';
import {
  ElectionDefinition,
  Tally,
  PrecinctSelection,
  PrecinctSelectionKind,
} from '@votingworks/types';
import React, { useState, useEffect } from 'react';
import { DateTime } from 'luxon';
import {
  format,
  find,
  compressTally,
  formatFullDateTimeZone,
} from '@votingworks/utils';
import { ContestTally } from './ContestTally';
import {
  PrintableContainer,
  Prose,
  ReportSection,
  TallyReport,
  TallyReportColumns,
  Text,
  LogoMark,
} from '.';
import { TallyReportSummary } from './TallyReportSummary';

interface Props {
  reportSavedTime: number;
  electionDefinition: ElectionDefinition;
  signingMachineId: string;
  precinctSelection: PrecinctSelection;
  reportPurpose: string;
  isPollsOpen: boolean;
  isLiveMode: boolean;
  tally: Tally;
}

export const PrecinctScannerTallyReport = ({
  reportSavedTime,
  electionDefinition,
  signingMachineId,
  precinctSelection,
  reportPurpose,
  isPollsOpen,
  isLiveMode,
  tally,
}: Props): JSX.Element => {
  const { election, electionHash } = electionDefinition;
  const [resultsReportingUrl, setResultsReportingUrl] = useState('');
  const precinctId =
    precinctSelection.kind === PrecinctSelectionKind.SinglePrecinct
      ? precinctSelection.precinctId
      : undefined;
  const precinctName =
    precinctSelection.kind === PrecinctSelectionKind.AllPrecincts
      ? 'All Precincts'
      : find(election.precincts, (p) => p.id === precinctSelection.precinctId)
          .name;
  const pollsAction = isPollsOpen ? 'Opened' : 'Closed';
  const reportTitle = `${precinctName} Polls ${pollsAction} Tally Report`;
  const electionDate = format.localeWeekdayAndDate(new Date(election.date));

  useEffect(() => {
    void (async () => {
      if (tally.numberOfBallotsCounted > 0 && !isPollsOpen) {
        const compressedTally = compressTally(election, tally);
        const secondsSince1970 = Math.round(new Date().getTime() / 1000);
        const stringToSign = `${electionHash}.${signingMachineId}.${
          isLiveMode ? '1' : '0'
        }.${secondsSince1970}.${window.btoa(JSON.stringify(compressedTally))}`;
        const signature = await window.kiosk?.sign({
          signatureType: 'vx-results-reporting',
          payload: stringToSign,
        });

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
    tally,
    isPollsOpen,
    isLiveMode,
  ]);

  return (
    <PrintableContainer>
      <TallyReport>
        <ReportSection>
          <LogoMark />
          <Prose maxWidth={false}>
            <h1>{reportTitle}</h1>
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
          </Prose>
          <TallyReportColumns>
            <TallyReportSummary
              totalBallotCount={tally.numberOfBallotsCounted}
              ballotCountsByVotingMethod={tally.ballotCountsByVotingMethod}
            />
            <ContestTally
              election={election}
              electionTally={tally}
              externalTallies={[]}
              precinctId={precinctId}
            />
          </TallyReportColumns>
        </ReportSection>
        {resultsReportingUrl && (
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
              <QRCodeReact
                renderAs="svg"
                value={resultsReportingUrl}
                level="H"
              />
            </Prose>
          </ReportSection>
        )}
      </TallyReport>
    </PrintableContainer>
  );
};
