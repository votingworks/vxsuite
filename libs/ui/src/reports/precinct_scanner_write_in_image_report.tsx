import { ElectionDefinition, formatElectionHashes } from '@votingworks/types';
import { unique } from '@votingworks/basics';
import {
  CachedElectionLookups,
  formatFullDateTimeZone,
} from '@votingworks/utils';
import { DateTime } from 'luxon';
import { ThemeProvider } from 'styled-components';
import { styled } from '../styled.js';
import {
  ContestHeading,
  ContestSection,
  WriteInGrid,
  WriteInImage,
  WriteInTextBox,
} from './write_in_report_styles.js';
import { LogoMark } from '../logo_mark.js';
import { Font } from '../typography.js';
import { PrintedReport, printedReportThemeFn } from './layout.js';
import {
  LabeledValue,
  ReportElectionInfo,
  ReportHeader,
  ReportMetadata,
  ReportSubtitle,
  ReportTitle,
  TestModeReportBanner,
} from './report_header.js';
import { precinctScannerLocationName } from './precinct_scanner_report_header.js';

export interface WriteInEntry {
  type: 'image' | 'text';
  dataUrl?: string;
  text?: string;
}

export interface ContestWriteIns {
  contestId: string;
  contestName: string;
  partyId?: string;
  writeIns: WriteInEntry[];
}

interface PrecinctScannerWriteInImageReportProps {
  electionDefinition: ElectionDefinition;
  electionPackageHash: string;
  pollingPlaceId?: string;
  isLiveMode: boolean;
  reportPrintedTime: number;
  precinctScannerMachineId: string;
  contestWriteIns: ContestWriteIns[];
}

const PartyHeader = styled(ReportSubtitle)`
  margin-top: 1.5em;
`;

export function PrecinctScannerWriteInImageReport({
  electionDefinition,
  electionPackageHash,
  pollingPlaceId,
  isLiveMode,
  reportPrintedTime,
  precinctScannerMachineId,
  contestWriteIns,
}: PrecinctScannerWriteInImageReportProps): JSX.Element {
  const { election } = electionDefinition;
  const locationName = precinctScannerLocationName({
    election,
    pollingPlaceId,
  });

  const relevantPartyIds = unique(contestWriteIns.map((c) => c.partyId));

  return (
    <ThemeProvider theme={printedReportThemeFn}>
      <PrintedReport>
        {!isLiveMode && <TestModeReportBanner />}
        <LogoMark />
        <ReportHeader>
          <ReportTitle>Write-In Image Report &bull; {locationName}</ReportTitle>
          <ReportElectionInfo election={election} />
          <ReportMetadata>
            <LabeledValue
              label="Report Printed"
              value={formatFullDateTimeZone(
                DateTime.fromMillis(reportPrintedTime),
                { includeWeekday: false, includeSeconds: true }
              )}
            />
            <LabeledValue label="Scanner ID" value={precinctScannerMachineId} />
            <LabeledValue
              label="Election ID"
              value={formatElectionHashes(
                electionDefinition.ballotHash,
                electionPackageHash
              )}
            />
          </ReportMetadata>
        </ReportHeader>
        {relevantPartyIds.map((partyId) => {
          const partyLabel =
            partyId &&
            CachedElectionLookups.getPartyById(electionDefinition, partyId)
              .fullName;
          const partyContests = contestWriteIns.filter(
            (c) => c.partyId === partyId
          );

          return (
            <div key={partyId || 'none'}>
              {partyLabel && <PartyHeader>{partyLabel}</PartyHeader>}
              {partyContests.map((contest) => (
                <ContestSection key={contest.contestId}>
                  <ContestHeading>
                    {contest.contestName} &bull; {contest.writeIns.length} Total
                    Write-In
                    {contest.writeIns.length !== 1 && 's'}
                  </ContestHeading>
                  {contest.writeIns.length > 0 && (
                    <WriteInGrid>
                      {contest.writeIns.map((writeIn, index) => {
                        const key = `${contest.contestId}-${index}`;
                        if (writeIn.type === 'image') {
                          return (
                            <WriteInImage
                              key={key}
                              src={writeIn.dataUrl}
                              alt={`Write-in for ${contest.contestName}`}
                            />
                          );
                        }
                        return (
                          <WriteInTextBox key={key}>
                            <Font weight="bold">Summary Ballot Write-In</Font>
                            <br />
                            {writeIn.text}
                          </WriteInTextBox>
                        );
                      })}
                    </WriteInGrid>
                  )}
                </ContestSection>
              ))}
            </div>
          );
        })}
      </PrintedReport>
    </ThemeProvider>
  );
}
