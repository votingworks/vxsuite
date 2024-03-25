import {
  Button,
  CenteredLargeProse,
  H1,
  LoadingAnimation,
  P,
  getPartyIdsForPrecinctScannerTallyReports,
  useLock,
} from '@votingworks/ui';
import React, { useCallback, useEffect, useState } from 'react';
import { ElectionDefinition, PollsTransitionType } from '@votingworks/types';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { getPartyById, getPollsReportTitle } from '@votingworks/utils';
import type { FujitsuPrintResult } from '@votingworks/scan-backend';
import { PollWorkerFlowScreen } from '../components/layout';
import { printReportSection } from '../api';

function getHeaderText(pollsTransitionType: PollsTransitionType): string {
  switch (pollsTransitionType) {
    case 'close_polls':
      return 'Polls are closed.';
    case 'open_polls':
      return 'Polls are open.';
    case 'resume_voting':
      return 'Voting resumed.';
    case 'pause_voting':
      return 'Voting paused.';
    /* istanbul ignore next - compile-time check for completeness */
    default:
      throwIllegalValue(pollsTransitionType);
  }
}

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

export function PollWorkerFujitsuPrintFlow({
  electionDefinition,
  pollsTransitionType,
  isReprint,
}: {
  electionDefinition: ElectionDefinition;
  pollsTransitionType: PollsTransitionType;
  isReprint: boolean;
}): JSX.Element {
  const initialPrintLock = useLock();
  const [printIndex, setPrintIndex] = useState(0);
  const [printResult, setPrintResult] = useState<FujitsuPrintResult>();
  const printReportSectionMutation = printReportSection.useMutation();
  const printReportSectionMutateAsync = printReportSectionMutation.mutateAsync;
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

  useEffect(() => {
    /* istanbul ignore if */
    if (!initialPrintLock.lock()) return;

    void printSection(0);
  }, [initialPrintLock, printSection]);

  if (!printResult) {
    return (
      <PollWorkerFlowScreen>
        <LoadingAnimation />
        <CenteredLargeProse>
          <H1>Printing Report…</H1>
        </CenteredLargeProse>
      </PollWorkerFlowScreen>
    );
  }

  if (printResult.isErr()) {
    <PollWorkerFlowScreen>
      <CenteredLargeProse>
        {!isReprint && <H1>{getHeaderText(pollsTransitionType)}</H1>}
        <P>Error printing the report.</P>
      </CenteredLargeProse>
    </PollWorkerFlowScreen>;
  }

  // there's only one report to print
  if (!reportManifest) {
    return (
      <PollWorkerFlowScreen>
        <CenteredLargeProse>
          {!isReprint && <H1>{getHeaderText(pollsTransitionType)}</H1>}
          <P>
            Report printed. Remove the poll worker card once you have printed
            all necessary reports.
          </P>
          <P>
            <Button onPress={() => printSection(0)}>
              Print Additional {getPollsReportTitle(pollsTransitionType)}
            </Button>
          </P>
        </CenteredLargeProse>
      </PollWorkerFlowScreen>
    );
  }

  function getReportTitle(index: number): string {
    assert(reportManifest);
    const section = reportManifest[index - 1];
    if (!section) {
      return getPollsReportTitle(pollsTransitionType);
    }

    return `${section} ${getPollsReportTitle(pollsTransitionType)}`;
  }

  return (
    <PollWorkerFlowScreen>
      <CenteredLargeProse>
        {!isReprint && <H1>{getHeaderText(pollsTransitionType)}</H1>}
        <P>
          Finished printing the {getReportTitle(printIndex - 1)}. Remove the
          report from the printer by gently tearing it against the tear bar.
        </P>
        {printIndex >= reportManifest.length ? (
          <React.Fragment>
            <P>
              Remove the poll worker card once you have printed all necessary
              reports.
            </P>
            <P>
              <Button onPress={() => printSection(printIndex - 1)}>
                Print Previous Report Again
              </Button>
              <Button onPress={() => printSection(0)}>
                Print All Reports Again
              </Button>
            </P>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <P>
              There are {reportManifest.length - printIndex} more report
              sections to print.
            </P>
            <P>
              <Button onPress={() => printSection(printIndex - 1)}>
                Print Previous Report Again
              </Button>
              <Button
                variant="primary"
                onPress={() => printSection(printIndex)}
              >
                Print Next Report
              </Button>
            </P>
          </React.Fragment>
        )}

        <P>
          <Button onPress={() => printSection(printIndex - 1)}>
            Print Previous Report Again
          </Button>
          <Button variant="primary" onPress={() => printSection(printIndex)}>
            Print Next Report
          </Button>
        </P>
      </CenteredLargeProse>
    </PollWorkerFlowScreen>
  );
}
