import React from 'react';
import { assertDefined } from '@votingworks/basics';
import {
  CandidateContest,
  ContestId,
  ElectionDefinition,
} from '@votingworks/types';
import styled, { ThemeProvider } from 'styled-components';
import { BallotText } from '../ballot_text';
import {
  ContestHeading,
  ContestSection,
  WriteInGrid,
  WriteInImage,
  WriteInTextBox,
} from './write_in_report_styles';
import { LogoMark } from '../logo_mark';
import { Font, P } from '../typography';
import { PrintedReport, printedReportThemeFn } from './layout';
import { ReportElectionInfo, ReportHeader, ReportTitle } from './report_header';
import { ReportGeneratedMetadata } from './report_generated_metadata';
import { prefixedTitle } from './utils';
import { WriteInEntry } from './precinct_scanner_write_in_image_report';
import { Icons } from '../icons';

const WRITE_IN_REACT_KEY_MAX_LENGTH = 64;

// Represents a group of adjudicated write-ins for a contest.
// `groupLabel` is either a candidate name or "Invalid" for write-ins that were adjudicated but not qualified.
export interface CandidateGroupWriteIns {
  groupLabel: string;
  isQualified: boolean;
  writeIns: WriteInEntry[];
}

export interface AdminContestWriteIns {
  candidateGroups: CandidateGroupWriteIns[];
  unadjudicatedWriteIns: WriteInEntry[];
}

const CandidateGroupHeading = styled.h3`
  margin-top: 1em;
  margin-bottom: 0.4em;
  font-size: 1em;
`;

function getKeyForWriteIn(writeIn: WriteInEntry): string {
  if (writeIn.type === 'image') {
    const possiblyLargeKey = writeIn?.dataUrl || JSON.stringify(writeIn);
    return `image-${possiblyLargeKey.slice(
      -1 * WRITE_IN_REACT_KEY_MAX_LENGTH
    )}`;
  }

  return `text-${writeIn.text}`;
}

function WriteInEntryComponent({
  writeIn,
}: {
  writeIn: WriteInEntry;
}): JSX.Element {
  if (writeIn.type === 'image') {
    return <WriteInImage src={writeIn.dataUrl} />;
  }
  return (
    <WriteInTextBox>
      <Font weight="bold">Summary Ballot Write-In</Font>
      <br />
      {writeIn.text}
    </WriteInTextBox>
  );
}

export interface AdminWriteInImageReportProps {
  electionDefinition: ElectionDefinition;
  electionPackageHash: string;
  isOfficial: boolean;
  generatedAtTime: Date;
  contestWriteInsById: Map<ContestId, AdminContestWriteIns>;
  qualifiedWriteInsEnabled: boolean;
}

export function AdminWriteInImageReport({
  electionDefinition,
  electionPackageHash,
  isOfficial,
  generatedAtTime,
  contestWriteInsById,
  qualifiedWriteInsEnabled,
}: AdminWriteInImageReportProps): JSX.Element {
  const { election } = electionDefinition;
  const allWriteInContests = election.contests.filter(
    (c): c is CandidateContest =>
      c.type === 'candidate' && c.allowWriteIns && contestWriteInsById.has(c.id)
  );

  const title = prefixedTitle({ isOfficial, title: 'Write-In Image Report' });

  return (
    <ThemeProvider theme={printedReportThemeFn}>
      <div data-testid="write-in-image-report">
        <PrintedReport data-testid="write-in-image-report-content">
          <LogoMark />
          <ReportHeader>
            <ReportTitle>{title}</ReportTitle>
            <ReportElectionInfo election={election} />
            <ReportGeneratedMetadata
              generatedAtTime={generatedAtTime}
              electionDefinition={electionDefinition}
              electionPackageHash={electionPackageHash}
            />
          </ReportHeader>
          {allWriteInContests.map((contest) => {
            const { candidateGroups, unadjudicatedWriteIns } = assertDefined(
              contestWriteInsById.get(contest.id)
            );
            const totalWriteIns =
              candidateGroups.reduce((sum, g) => sum + g.writeIns.length, 0) +
              unadjudicatedWriteIns.length;
            const areAllAdjudicatedWriteInsInvalid = candidateGroups.every(
              (g) => !g.isQualified
            );

            return (
              <ContestSection key={contest.id}>
                <ContestHeading>
                  <BallotText text={contest.title} /> &bull; {totalWriteIns}{' '}
                  Total Write-In
                  {totalWriteIns !== 1 && 's'}
                </ContestHeading>
                {qualifiedWriteInsEnabled &&
                unadjudicatedWriteIns.length === 0 &&
                areAllAdjudicatedWriteInsInvalid ? (
                  <React.Fragment>
                    <P>
                      <Icons.Info />
                      No qualified write-in candidates have received votes in
                      this contest.
                    </P>
                    {candidateGroups.map((group) => (
                      <div key={group.groupLabel}>
                        <CandidateGroupHeading>
                          {group.groupLabel} &bull; {group.writeIns.length}{' '}
                          Write-In
                          {group.writeIns.length !== 1 && 's'}
                        </CandidateGroupHeading>
                        <WriteInGrid>
                          {group.writeIns.map((writeIn) => (
                            <WriteInEntryComponent
                              writeIn={writeIn}
                              key={getKeyForWriteIn(writeIn)}
                            />
                          ))}
                        </WriteInGrid>
                      </div>
                    ))}
                  </React.Fragment>
                ) : !qualifiedWriteInsEnabled && totalWriteIns === 0 ? (
                  <P>
                    <Icons.Info />
                    No write-in candidates have received votes in this contest.
                  </P>
                ) : (
                  <React.Fragment>
                    {candidateGroups.map((group) => (
                      <div key={group.groupLabel}>
                        <CandidateGroupHeading>
                          {group.groupLabel} &bull; {group.writeIns.length}{' '}
                          Write-In
                          {group.writeIns.length !== 1 && 's'}
                        </CandidateGroupHeading>
                        <WriteInGrid>
                          {group.writeIns.map((writeIn) => (
                            <WriteInEntryComponent
                              writeIn={writeIn}
                              key={getKeyForWriteIn(writeIn)}
                            />
                          ))}
                        </WriteInGrid>
                      </div>
                    ))}
                    {unadjudicatedWriteIns.length > 0 && (
                      <div>
                        <CandidateGroupHeading>
                          Unadjudicated &bull; {unadjudicatedWriteIns.length}{' '}
                          Write-In
                          {unadjudicatedWriteIns.length !== 1 && 's'}
                        </CandidateGroupHeading>
                        <WriteInGrid>
                          {unadjudicatedWriteIns.map((writeIn) => (
                            <WriteInEntryComponent
                              writeIn={writeIn}
                              key={getKeyForWriteIn(writeIn)}
                            />
                          ))}
                        </WriteInGrid>
                      </div>
                    )}
                  </React.Fragment>
                )}
              </ContestSection>
            );
          })}
        </PrintedReport>
      </div>
    </ThemeProvider>
  );
}
