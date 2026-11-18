import { Button, H1, LoadingAnimation, P } from '@votingworks/ui';
import { useCallback, useState } from 'react';
import type { PollsTransitionType } from '@votingworks/types';
import { type Optional, assert } from '@votingworks/basics';
import { getPollsReportTitle } from '@votingworks/utils';
import type { PrintResult } from '@votingworks/fujitsu-thermal-printer';
import {
  Screen,
  getPostPollsTransitionHeaderText,
} from './poll_worker_shared.js';
import { getPrinterStatus, printReport } from '../api.js';
import { PollWorkerLoadAndReprintButton } from '../components/printer_management/poll_worker_load_and_reprint_button.js';
import { CenteredText } from '../components/layout.js';

/**
 * Drives printing of report copies one at a time so the poll worker can tear
 * each copy off the thermal roll before printing the next. A copy is a single
 * continuous print, including every party section in a primary.
 *
 * The first copy is printed before this screen is shown then this screen
 * prints the remaining copies (if applicable) via "Print Next Report."
 */
export function PostPrintScreen({
  pollsTransitionType,
  isPostPollsTransition,
  initialPrintResult,
  numberOfCopies,
  reportQuickResultsEnabled,
  onViewReportResults,
}: {
  pollsTransitionType: PollsTransitionType;
  isPostPollsTransition: boolean;
  initialPrintResult: PrintResult;
  numberOfCopies: number;
  reportQuickResultsEnabled: boolean;
  onViewReportResults: () => void;
}): JSX.Element {
  const [currentCopyIndex, setCurrentCopyIndex] = useState(0);
  const [totalNumCopies, setTotalNumCopies] = useState(numberOfCopies);
  const [printResult, setPrintResult] =
    useState<Optional<PrintResult>>(initialPrintResult);
  const printReportMutation = printReport.useMutation();
  const printReportMutateAsync = printReportMutation.mutateAsync;
  const printerStatusQuery = getPrinterStatus.useQuery();

  const printCopy = useCallback(
    async (copyIndex: number, runTotal: number) => {
      setCurrentCopyIndex(copyIndex);
      setTotalNumCopies(runTotal);
      setPrintResult(undefined);
      setPrintResult(await printReportMutateAsync());
    },
    [printReportMutateAsync]
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
          {totalNumCopies > 1 && (
            <P>
              Printing report {currentCopyIndex + 1} of {totalNumCopies}…
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
          reprint={() => printCopy(currentCopyIndex, totalNumCopies)}
          reprintText={`Reprint ${reportTitle}`}
        />
      </Screen>
    );
  }

  const isLastCopy = currentCopyIndex + 1 >= totalNumCopies;

  // Finished the run: offer to reprint a single additional complete copy.
  if (isLastCopy) {
    return (
      <Screen>
        <CenteredText>
          {header}
          <P>
            Report printed. Remove the poll worker card once you have printed
            all necessary reports.
          </P>
          <P>
            <Button onPress={() => printCopy(0, 1)} disabled={disablePrinting}>
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
          Finished printing report {currentCopyIndex + 1} of {totalNumCopies}.
          Remove the report from the printer by gently tearing it against the
          tear bar.
        </P>
        <P>
          <Button
            onPress={() => printCopy(currentCopyIndex, totalNumCopies)}
            disabled={disablePrinting}
          >
            Print Previous Report
          </Button>{' '}
          <Button
            variant="primary"
            onPress={() => printCopy(currentCopyIndex + 1, totalNumCopies)}
            disabled={disablePrinting}
          >
            Print Next Report
          </Button>
        </P>
      </CenteredText>
    </Screen>
  );
}
