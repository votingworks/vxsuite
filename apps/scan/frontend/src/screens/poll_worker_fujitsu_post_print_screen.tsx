import {
  Button,
  CenteredLargeProse,
  H1,
  LoadingAnimation,
  P,
  getPartyIdsForPrecinctScannerTallyReports,
} from '@votingworks/ui';
import React, { useCallback, useState } from 'react';
import { ElectionDefinition, PollsTransitionType } from '@votingworks/types';
import { Optional, assert } from '@votingworks/basics';
import { getPartyById, getPollsReportTitle } from '@votingworks/utils';
import type { FujitsuPrintResult } from '@votingworks/scan-backend';
import { Screen, getPostPollsTransitionHeaderText } from './poll_worker_shared';
import { getPrinterStatus, printReportSection } from '../api';

function getReportManifest(
  electionDefinition: ElectionDefinition
): string[] | undefined {
  const partyIds =
    getPartyIdsForPrecinctScannerTallyReports(electionDefinition);

  if (partyIds.length <= 1) {
    return undefined;
  }

  return partyIds.map((partyId) => {
    if (!partyId) {
      return 'Nonpartisan Contests';
    }

    return getPartyById(electionDefinition, partyId).fullName;
  });
}

export function FujitsuPostPrintScreen({
  electionDefinition,
  pollsTransitionType,
  isPostPollsTransition,
  initialPrintResult,
}: {
  electionDefinition: ElectionDefinition;
  pollsTransitionType: PollsTransitionType;
  isPostPollsTransition: boolean;
  initialPrintResult: FujitsuPrintResult;
}): JSX.Element {
  const [printIndex, setPrintIndex] = useState(1);
  const [printResult, setPrintResult] =
    useState<Optional<FujitsuPrintResult>>(initialPrintResult);
  const printReportSectionMutation = printReportSection.useMutation();
  const printReportSectionMutateAsync = printReportSectionMutation.mutateAsync;
  const printerStatusQuery = getPrinterStatus.useQuery();
  const reportManifest = getReportManifest(electionDefinition);

  const printSection = useCallback(
    async (index: number) => {
      setPrintResult(undefined);
      const newPrintResult = await printReportSectionMutateAsync({ index });
      setPrintResult(newPrintResult);
      setPrintIndex(index + 1);
    },
    [printReportSectionMutateAsync]
  );

  // this status should not be possible in production, where the parent
  // component has already run the query, but it's possible in testing
  if (!printerStatusQuery.isSuccess) {
    return (
      <Screen>
        <LoadingAnimation />
        <CenteredLargeProse>
          <H1>Loading…</H1>
        </CenteredLargeProse>
      </Screen>
    );
  }

  const printerStatus = printerStatusQuery.data;
  assert(printerStatus.scheme === 'hardware-v4');
  const disablePrinting = printerStatus.state !== 'idle';

  if (!printResult) {
    return (
      <Screen>
        <LoadingAnimation />
        <CenteredLargeProse>
          <H1>Printing Report…</H1>
        </CenteredLargeProse>
      </Screen>
    );
  }

  const header: JSX.Element | null = isPostPollsTransition ? (
    <H1>{getPostPollsTransitionHeaderText(pollsTransitionType)}</H1>
  ) : null;

  if (printResult.isErr()) {
    const errorStatus = printResult.err();

    return (
      <Screen>
        <CenteredLargeProse>
          <H1>Printing Stopped</H1>
          <P>
            {errorStatus.state === 'no-paper'
              ? 'The printer ran out of paper while printing. Remove your poll worker card, load new paper, and restart report printing.'
              : 'The printer encountered an unexpected error.'}
          </P>
        </CenteredLargeProse>
      </Screen>
    );
  }

  // there's only one report to print
  if (!reportManifest) {
    return (
      <Screen>
        <CenteredLargeProse>
          {header}
          <P>
            Report printed. Remove the poll worker card once you have printed
            all necessary reports.
          </P>
          <P>
            <Button onPress={() => printSection(0)} disabled={disablePrinting}>
              Reprint {getPollsReportTitle(pollsTransitionType)}
            </Button>
          </P>
        </CenteredLargeProse>
      </Screen>
    );
  }

  function getReportTitle(index: number): string {
    assert(reportManifest);
    const section = reportManifest[index];
    return `${section} ${getPollsReportTitle(pollsTransitionType)}`;
  }

  const reportsLeft = reportManifest.length - printIndex;

  return (
    <Screen>
      <CenteredLargeProse>
        {header}
        <P>
          Finished printing the {getReportTitle(printIndex - 1)}. Remove the
          report from the printer by gently tearing it against the tear bar.
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
              </Button>
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
              Print Next
            </Button>
          </P>
        )}
      </CenteredLargeProse>
    </Screen>
  );
}
