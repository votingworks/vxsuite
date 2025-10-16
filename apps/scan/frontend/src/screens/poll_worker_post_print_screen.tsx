import { Button, H1, LoadingAnimation, P } from '@votingworks/ui';
import React, { useCallback, useState } from 'react';
import {
  ElectionDefinition,
  getPartyIdsWithContests,
  PollsTransitionType,
} from '@votingworks/types';
import { Optional, assert } from '@votingworks/basics';
import {
  CachedElectionLookups,
  getPollsReportTitle,
  isPollsSuspensionTransition,
} from '@votingworks/utils';
import type { PrintResult } from '@votingworks/fujitsu-thermal-printer';
import { Screen, getPostPollsTransitionHeaderText } from './poll_worker_shared';
import { getPrinterStatus, printReportSection } from '../api';
import { PollWorkerLoadAndReprintButton } from '../components/printer_management/poll_worker_load_and_reprint_button';
import { CenteredText } from '../components/layout';

const POLLS_TRANSITIONS_WITH_REPORTS: PollsTransitionType[] = [
  'open_polls',
  'close_polls',
];

function getReportManifest(
  electionDefinition: ElectionDefinition,
  pollsTransitionType: PollsTransitionType
): string[] | undefined {
  // the polls paused and resumed reports are not separated by party even in a primary
  if (isPollsSuspensionTransition(pollsTransitionType)) {
    return undefined;
  }

  const { election } = electionDefinition;
  const partyIds = getPartyIdsWithContests(election);

  if (partyIds.length <= 1) {
    return undefined;
  }

  return partyIds.map((partyId) => {
    if (!partyId) {
      return 'Nonpartisan Contests';
    }

    return CachedElectionLookups.getPartyById(electionDefinition, partyId)
      .fullName;
  });
}

export function PostPrintScreen({
  electionDefinition,
  pollsTransitionType,
  isPostPollsTransition,
  initialPrintResult,
  reportQuickResultsEnabled,
  onViewReportResults,
}: {
  electionDefinition: ElectionDefinition;
  pollsTransitionType: PollsTransitionType;
  isPostPollsTransition: boolean;
  initialPrintResult: PrintResult;
  reportQuickResultsEnabled: boolean;
  onViewReportResults: () => void;
}): JSX.Element {
  // we start on index 1 because we printed the first report before transitioning to this screen
  const [printIndex, setPrintIndex] = useState(1);
  const [printResult, setPrintResult] =
    useState<Optional<PrintResult>>(initialPrintResult);
  const printReportSectionMutation = printReportSection.useMutation();
  const printReportSectionMutateAsync = printReportSectionMutation.mutateAsync;
  const printerStatusQuery = getPrinterStatus.useQuery();
  const reportManifest = getReportManifest(
    electionDefinition,
    pollsTransitionType
  );

  function getReportSectionTitle(index: number): string {
    assert(reportManifest);
    const section = reportManifest[index];
    return `${section} ${getPollsReportTitle(pollsTransitionType)}`;
  }

  const printSection = useCallback(
    async (index: number) => {
      setPrintResult(undefined);
      const newPrintResult = await printReportSectionMutateAsync({ index });
      setPrintResult(newPrintResult);
      setPrintIndex(index + 1);
    },
    [printReportSectionMutateAsync]
  );

  assert(printerStatusQuery.isSuccess);
  const printerStatus = printerStatusQuery.data;
  const disablePrinting = printerStatus.state !== 'idle';

  if (!printResult) {
    return (
      <Screen>
        <LoadingAnimation />
        <CenteredText>
          <H1>Printing Report…</H1>
        </CenteredText>
      </Screen>
    );
  }

  const header: JSX.Element | null = isPostPollsTransition ? (
    <H1>{getPostPollsTransitionHeaderText(pollsTransitionType)}</H1>
  ) : null;

  if (printResult.isErr()) {
    const errorStatus = printResult.err();
    const reprintText = !reportManifest
      ? `Reprint ${getPollsReportTitle(pollsTransitionType)}`
      : `Reprint ${getReportSectionTitle(printIndex - 1)}`;

    return (
      <Screen>
        <H1>Printing Stopped</H1>
        <P>
          {errorStatus.state === 'no-paper'
            ? 'The report did not finish printing because the printer ran out of paper.'
            : 'The report did not finish printing because the printer encountered an unexpected error.'}
        </P>
        <PollWorkerLoadAndReprintButton
          reprint={() => printSection(printIndex - 1)}
          reprintText={reprintText}
        />
      </Screen>
    );
  }

  // there's only one report to print
  if (!reportManifest) {
    return (
      <Screen>
        <CenteredText>
          {header}
          <P>
            Report printed. Remove the poll worker card once you have printed
            all necessary reports.
          </P>
          <P>
            <Button onPress={() => printSection(0)} disabled={disablePrinting}>
              Reprint {getPollsReportTitle(pollsTransitionType)}
            </Button>{' '}
            {POLLS_TRANSITIONS_WITH_REPORTS.includes(pollsTransitionType) &&
              reportQuickResultsEnabled && (
                <Button variant="primary" onPress={onViewReportResults}>
                  Send {getPollsReportTitle(pollsTransitionType)}
                </Button>
              )}
          </P>
        </CenteredText>
      </Screen>
    );
  }

  const reportsLeft = reportManifest.length - printIndex;

  return (
    <Screen>
      <CenteredText>
        {header}
        <P>
          Finished printing the {getReportSectionTitle(printIndex - 1)} (
          {printIndex} of {reportManifest.length}). Remove the report from the
          printer by gently tearing it against the tear bar.
        </P>
        {reportsLeft === 0 ? (
          <React.Fragment>
            <P>
              Remove the poll worker card once you have printed all necessary
              reports.
            </P>
            <P>
              <Button
                onPress={() => printSection(printIndex - 1)}
                disabled={disablePrinting}
              >
                Reprint Previous Report
              </Button>{' '}
              <Button
                onPress={() => printSection(0)}
                disabled={disablePrinting}
              >
                Reprint All Reports
              </Button>{' '}
              {POLLS_TRANSITIONS_WITH_REPORTS.includes(pollsTransitionType) &&
                reportQuickResultsEnabled && (
                  <Button variant="primary" onPress={onViewReportResults}>
                    Send {getPollsReportTitle(pollsTransitionType)}
                  </Button>
                )}
            </P>
          </React.Fragment>
        ) : (
          <P>
            <Button
              onPress={() => printSection(printIndex - 1)}
              disabled={disablePrinting}
            >
              Reprint Previous Report
            </Button>{' '}
            <Button
              variant="primary"
              onPress={() => printSection(printIndex)}
              disabled={disablePrinting}
            >
              Print Next Report
            </Button>
          </P>
        )}
      </CenteredText>
    </Screen>
  );
}
