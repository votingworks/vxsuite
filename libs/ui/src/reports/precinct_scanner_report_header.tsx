import {
  Election,
  ElectionDefinition,
  formatElectionHashes,
  PartyId,
  pollingPlaceFromElection,
  PollsTransitionType,
  PrecinctSelection,
} from '@votingworks/types';
import {
  formatFullDateTimeZone,
  CachedElectionLookups,
  getPollsReportTitle,
  getPollsTransitionActionPastTense,
  getPrecinctSelectionName,
  isFeatureFlagEnabled,
  BooleanEnvironmentVariableName as Feature,
} from '@votingworks/utils';
import { DateTime } from 'luxon';
import React from 'react';
import { assertDefined } from '@votingworks/basics';
import { LogoMark } from '../logo_mark';
import { CertificationSignatures } from './certification_signatures';
import {
  LabeledValue,
  ReportElectionInfo,
  ReportHeader,
  ReportMetadata,
  ReportSubtitle,
  ReportTitle,
  TestModeReportBanner,
} from './report_header';

interface Props {
  electionDefinition: ElectionDefinition;
  electionPackageHash: string;
  partyId?: PartyId;
  pollingPlaceId?: string;
  precinctSelection?: PrecinctSelection;
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
  pollingPlaceId,
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
  const locationName = precinctScannerLocationName({
    election,
    pollingPlaceId,
    precinctSelection,
  });
  const reportTitle = `${getPollsReportTitle(
    pollsTransition
  )} • ${locationName}`;
  const partyLabel =
    showTallies && election.type === 'primary'
      ? partyId
        ? CachedElectionLookups.getPartyById(electionDefinition, partyId)
            .fullName
        : 'Nonpartisan Contests'
      : undefined;

  return (
    <React.Fragment>
      {!isLiveMode && <TestModeReportBanner />}
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
              { includeWeekday: false, includeSeconds: true }
            )}
          />
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
        <CertificationSignatures />
      </ReportHeader>
    </React.Fragment>
  );
}

export function precinctScannerLocationName(p: {
  election: Election;
  pollingPlaceId?: string;
  precinctSelection?: PrecinctSelection;
}): string {
  if (!isFeatureFlagEnabled(Feature.ENABLE_POLLING_PLACES)) {
    const selection = assertDefined(p.precinctSelection);
    return getPrecinctSelectionName(p.election.precincts, selection);
  }

  const pollingPlaceId = assertDefined(p.pollingPlaceId);
  const pollingPlace = pollingPlaceFromElection(p.election, pollingPlaceId);

  return pollingPlace.name;
}
