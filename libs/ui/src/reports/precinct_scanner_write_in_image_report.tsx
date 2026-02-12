import {
  ElectionDefinition,
  PrecinctSelection,
  formatElectionHashes,
} from '@votingworks/types';
import { unique } from '@votingworks/basics';
import {
  CachedElectionLookups,
  formatFullDateTimeZone,
  getPrecinctSelectionName,
} from '@votingworks/utils';
import { DateTime } from 'luxon';
import styled, { ThemeProvider } from 'styled-components';
import { LogoMark } from '../logo_mark';
import { Font } from '../typography';
import { PrintedReport, printedReportThemeFn } from './layout';
import {
  LabeledValue,
  ReportElectionInfo,
  ReportHeader,
  ReportMetadata,
  ReportSubtitle,
  ReportTitle,
  TestModeBanner,
} from './report_header';

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
  precinctSelection: PrecinctSelection;
  isLiveMode: boolean;
  reportPrintedTime: number;
  precinctScannerMachineId: string;
  contestWriteIns: ContestWriteIns[];
}

const PartyHeader = styled(ReportSubtitle)`
  margin-top: 1.5em;
`;

const ContestSection = styled.div`
  margin-top: 1.5em;
  page-break-inside: avoid;
`;

const ContestHeading = styled.h2`
  margin-top: 0;
  margin-bottom: 0.5em;
  font-size: 1.1em;
`;

const WriteInGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 0.3em;
`;

const WriteInImage = styled.img`
  max-width: 100%;
  border: 1px solid #ccc;
  display: block;
`;

const WriteInTextBox = styled.div`
  border: 1px solid #ccc;
  padding: 0.4em 0.6em;
  background-color: #f5f5f5;
`;

export function PrecinctScannerWriteInImageReport({
  electionDefinition,
  electionPackageHash,
  precinctSelection,
  isLiveMode,
  reportPrintedTime,
  precinctScannerMachineId,
  contestWriteIns,
}: PrecinctScannerWriteInImageReportProps): JSX.Element {
  const { election } = electionDefinition;
  const precinctName = getPrecinctSelectionName(
    election.precincts,
    precinctSelection
  );

  const relevantPartyIds = unique(contestWriteIns.map((c) => c.partyId));

  return (
    <ThemeProvider theme={printedReportThemeFn}>
      <PrintedReport>
        {!isLiveMode && <TestModeBanner />}
        <LogoMark />
        <ReportHeader>
          <ReportTitle>Write-In Image Report &bull; {precinctName}</ReportTitle>
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
