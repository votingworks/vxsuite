import {
  ElectionDefinition,
  formatElectionHashes,
  PartyId,
  PollsTransitionType,
  PrecinctSelection,
} from '@votingworks/types';
import {
  formatFullDateTimeZone,
  getPartyById,
  getPollsReportTitle,
  getPollsTransitionActionPastTense,
  getPrecinctSelectionName,
} from '@votingworks/utils';
import { DateTime } from 'luxon';
import React from 'react';
import { LogoMark } from '../logo_mark';
import { CertificationSignatures } from './certification_signatures';
import {
  LabeledValue,
  ReportElectionInfo,
  ReportHeader,
  ReportMetadata,
  ReportSubtitle,
  ReportTitle,
  TestModeBanner,
} from './report_header';

interface Props {
  electionDefinition: ElectionDefinition;
  electionPackageHash: string;
  partyId?: PartyId;
  precinctSelection: PrecinctSelection;
  pollsTransition: PollsTransitionType;
  isLiveMode: boolean;
  pollsTransitionedTime: number;
  reportPrintedTime: number;
  precinctScannerMachineId: string;
}

export function PrecinctScannerReportHeader({
  electionDefinition,
  electionPackageHash,
  partyId,
  precinctSelection,
  pollsTransition,
  isLiveMode,
  pollsTransitionedTime,
  reportPrintedTime,
  precinctScannerMachineId,
}: Props): JSX.Element {
  const { election } = electionDefinition;
  const showTallies =
    pollsTransition === 'open_polls' || pollsTransition === 'close_polls';
  const precinctName = getPrecinctSelectionName(
    election.precincts,
    precinctSelection
  );
  const reportTitle = `${getPollsReportTitle(
    pollsTransition
  )} • ${precinctName}`;
  const partyLabel =
    showTallies && election.type === 'primary'
      ? partyId
        ? getPartyById(electionDefinition, partyId).fullName
        : 'Nonpartisan Contests'
      : undefined;

  return (
    <React.Fragment>
      {!isLiveMode && <TestModeBanner />}
      <LogoMark />
      <ReportHeader>
        <ReportTitle>{reportTitle}</ReportTitle>
        {partyLabel && <ReportSubtitle>{partyLabel}</ReportSubtitle>}
        <ReportElectionInfo election={election} />
        <ReportMetadata>
          <LabeledValue
            label={getPollsTransitionActionPastTense(pollsTransition)}
            value={formatFullDateTimeZone(
              DateTime.fromMillis(pollsTransitionedTime),
              { includeWeekday: false }
            )}
          />
          <LabeledValue
            label="Report Printed"
            value={formatFullDateTimeZone(
              DateTime.fromMillis(reportPrintedTime),
              { includeWeekday: false }
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
        <CertificationSignatures />
      </ReportHeader>
    </React.Fragment>
  );
}
