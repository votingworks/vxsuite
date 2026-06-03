import { Button, H1, LoadingAnimation, P } from '@votingworks/ui';
import { useCallback, useState } from 'react';
import { PollsTransitionType } from '@votingworks/types';
import { Optional, assert } from '@votingworks/basics';
import { getPollsReportTitle } from '@votingworks/utils';
import type { PrintResult } from '@votingworks/fujitsu-thermal-printer';
import { Screen, getPostPollsTransitionHeaderText } from './poll_worker_shared';
import { getPrinterStatus, printReportSection } from '../api';
import { PollWorkerLoadAndReprintButton } from '../components/printer_management/poll_worker_load_and_reprint_button';
import { CenteredText } from '../components/layout';

/**
 * Drives printing of a report one report section at a time so the poll worker can tear
 * each report off the thermal roll before printing the next.
 *
 * The first report is printed before this screen is shown then this
 * screen prints the remaining sections (if applicable) via "Print Next Report."
 */
export function PostPrintScreen({
  pollsTransitionType,
  isPostPollsTransition,
  initialPrintResult,
  numberOfCopies,
  numberOfSections,
  reportQuickResultsEnabled,
  onViewReportResults,
}: {
  pollsTransitionType: PollsTransitionType;
  isPostPollsTransition: boolean;
  initialPrintResult: PrintResult;
  numberOfCopies: number;
  numberOfSections: number;
  reportQuickResultsEnabled: boolean;
  onViewReportResults: () => void;
}): JSX.Element {
  // The 0-based index of the most recently printed report section
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [totalNumPages, setTotalNumPages] = useState(
    /* report sections per copy * number of copies */
    numberOfSections * numberOfCopies
  );
  const [printResult, setPrintResult] =
    useState<Optional<PrintResult>>(initialPrintResult);
  const printReportSectionMutation = printReportSection.useMutation();
  const printReportSectionMutateAsync = printReportSectionMutation.mutateAsync;
  const printerStatusQuery = getPrinterStatus.useQuery();

  const printPage = useCallback(
    async (pageIndex: number, runTotal: number) => {
      setCurrentPageIndex(pageIndex);
      setTotalNumPages(runTotal);
      setPrintResult(undefined);
      // Interleave copies: page index maps to a party section modulo the number
      // of sections, so a full copy prints before the next begins.
      const { printResult: newPrintResult } =
        await printReportSectionMutateAsync({
          index: pageIndex % numberOfSections,
        });
      setPrintResult(newPrintResult);
    },
    [printReportSectionMutateAsync, numberOfSections]
  );

  assert(printerStatusQuery.isSuccess);
  const printerStatus = printerStatusQuery.data;
  const disablePrinting = printerStatus.state !== 'idle';

  const reportTitle = getPollsReportTitle(pollsTransitionType);

  if (!printResult) {
    return (
      <Screen>
        <LoadingAnimation />
        <CenteredText>
          <H1>Printing Report…</H1>
          {totalNumPages > 1 && (
            <P>
              Printing report {currentPageIndex + 1} of {totalNumPages}…
            </P>
          )}
        </CenteredText>
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
        <H1>Printing Stopped</H1>
        <P>
          {errorStatus.state === 'no-paper'
            ? 'The report did not finish printing because the printer ran out of paper.'
            : 'The report did not finish printing because the printer encountered an unexpected error.'}
        </P>
        <PollWorkerLoadAndReprintButton
          reprint={() => printPage(currentPageIndex, totalNumPages)}
          reprintText={`Reprint ${reportTitle}`}
        />
      </Screen>
    );
  }

  const isLastPage = currentPageIndex + 1 >= totalNumPages;

  // Finished the run: offer to reprint a single additional complete copy.
  if (isLastPage) {
    return (
      <Screen>
        <CenteredText>
          {header}
          <P>
            Report printed. Remove the poll worker card once you have printed
            all necessary reports.
          </P>
          <P>
            <Button
              onPress={() => printPage(0, numberOfSections)}
              disabled={disablePrinting}
            >
              Reprint {reportTitle}
            </Button>{' '}
            {reportQuickResultsEnabled && (
              <Button variant="primary" onPress={onViewReportResults}>
                Send {reportTitle}
              </Button>
            )}
          </P>
        </CenteredText>
      </Screen>
    );
  }

  return (
    <Screen>
      <CenteredText>
        {header}
        <P>
          Finished printing report {currentPageIndex + 1} of {totalNumPages}.
          Remove the report from the printer by gently tearing it against the
          tear bar.
        </P>
        <P>
          <Button
            onPress={() => printPage(currentPageIndex, totalNumPages)}
            disabled={disablePrinting}
          >
            Print Previous Report
          </Button>{' '}
          <Button
            variant="primary"
            onPress={() => printPage(currentPageIndex + 1, totalNumPages)}
            disabled={disablePrinting}
          >
            Print Next Report
          </Button>
        </P>
      </CenteredText>
    </Screen>
  );
}
