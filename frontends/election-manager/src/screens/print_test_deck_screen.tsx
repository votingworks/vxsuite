import React, { useState, useContext, useCallback, useEffect } from 'react';
import {
  BallotPaperSize,
  Election,
  ElectionDefinition,
  getPrecinctById,
  Precinct,
  PrecinctId,
  Tally,
  VotingMethod,
} from '@votingworks/types';
import { assert, sleep, tallyVotesByContest } from '@votingworks/utils';
import { LogEventId } from '@votingworks/logging';
import {
  BmdPaperBallot,
  useCancelablePromise,
  Modal,
  Prose,
  isElectionManagerAuth,
  isSystemAdministratorAuth,
  HorizontalRule,
} from '@votingworks/ui';

import { AppContext } from '../contexts/app_context';
import { Button } from '../components/button';
import { ButtonList } from '../components/button_list';
import { Loading } from '../components/loading';
import { NavigationScreen } from '../components/navigation_screen';
import { HandMarkedPaperBallot } from '../components/hand_marked_paper_ballot';
import { TestDeckTallyReport } from '../components/test_deck_tally_report';
import {
  generateTestDeckBallots,
  generateBlankBallots,
  generateOvervoteBallot,
} from '../utils/election';
import {
  getBallotLayoutPageSize,
  getBallotLayoutPageSizeReadableString,
} from '../utils/get_ballot_layout_page_size';
import { BallotMode } from '../config/types';

export const ONE_SIDED_PAGE_PRINT_TIME_MS = 3000;
export const TWO_SIDED_PAGE_PRINT_TIME_MS = 5000;
export const LAST_PRINT_JOB_SLEEP_MS = 5000;

interface PrecinctTallyReportProps {
  election: Election;
  precinctId: PrecinctId;
  onRendered: (numPages: number) => void;
}

function PrecinctTallyReport({
  election,
  precinctId,
  onRendered,
}: PrecinctTallyReportProps): JSX.Element {
  const ballots = generateTestDeckBallots({ election, precinctId });
  const votes = ballots.map((b) => b.votes);

  // Precinct test deck tallies should be twice that of a single test
  // deck because it counts scanning 2 test decks (BMD + HMPB)
  const doubledVotes = [...votes, ...votes];
  const testDeckTally: Tally = {
    numberOfBallotsCounted: doubledVotes.length,
    castVoteRecords: new Set(),
    contestTallies: tallyVotesByContest({
      election,
      votes: doubledVotes,
    }),
    ballotCountsByVotingMethod: { [VotingMethod.Unknown]: doubledVotes.length },
  };

  useEffect(() => {
    const parties = new Set(election.ballotStyles.map((bs) => bs.partyId));
    onRendered(Math.max(parties.size, 1));
  }, [election, precinctId, onRendered]);

  return (
    <TestDeckTallyReport
      election={election}
      electionTally={testDeckTally}
      precinctId={precinctId}
    />
  );
}

interface BmdPaperBallotsProps {
  electionDefinition: ElectionDefinition;
  onAllRendered: (numBallots: number) => void;
  precinctId: string;
}

function BmdPaperBallots({
  electionDefinition,
  onAllRendered,
  precinctId,
}: BmdPaperBallotsProps): JSX.Element {
  const { election } = electionDefinition;
  const ballots = generateTestDeckBallots({ election, precinctId });

  let numRendered = 0;
  function onRendered() {
    numRendered += 1;
    if (numRendered === ballots.length) {
      onAllRendered(ballots.length);
    }
  }

  return (
    <div className="print-only">
      {ballots.map((ballot, i) => (
        <BmdPaperBallot
          ballotStyleId={ballot.ballotStyleId}
          electionDefinition={electionDefinition}
          isLiveMode={false}
          key={`ballot-${i}`} // eslint-disable-line react/no-array-index-key
          precinctId={ballot.precinctId}
          votes={ballot.votes}
          onRendered={onRendered}
        />
      ))}
    </div>
  );
}

function generateHandMarkedPaperBallots({
  election,
  precinctId,
}: {
  election: Election;
  precinctId: PrecinctId;
}) {
  const ballots = [
    ...generateTestDeckBallots({ election, precinctId }),
    ...generateBlankBallots({ election, precinctId, numBlanks: 2 }),
  ];
  const overvoteBallot = generateOvervoteBallot({ election, precinctId });
  if (overvoteBallot) {
    ballots.push(overvoteBallot);
  }
  return ballots;
}

function generateHmpbTargetElementId(ballotIndex: number) {
  return `ballot-${ballotIndex}`;
}

interface HandMarkedPaperBallotsProps {
  election: Election;
  electionHash: string;
  precinctId: PrecinctId;
  onAllRendered: (numBallots: number) => void;
}

function HandMarkedPaperBallots({
  election,
  electionHash,
  precinctId,
  onAllRendered,
}: HandMarkedPaperBallotsProps): JSX.Element {
  const ballots = generateHandMarkedPaperBallots({ election, precinctId });

  let numRendered = 0;
  function onRendered() {
    numRendered += 1;
    if (numRendered === ballots.length) {
      onAllRendered(ballots.length);
    }
  }

  return (
    <div className="print-only">
      {ballots.map((ballot, i) => (
        <HandMarkedPaperBallot
          key={`ballot-${i}`} // eslint-disable-line react/no-array-index-key
          ballotStyleId={ballot.ballotStyleId}
          election={election}
          electionHash={electionHash}
          ballotMode={BallotMode.Test}
          isAbsentee={false}
          precinctId={ballot.precinctId}
          locales={{ primary: 'en-US' }}
          votes={ballot.votes}
          onRendered={() => onRendered()}
          targetElementId={generateHmpbTargetElementId(i)}
        />
      ))}
    </div>
  );
}

/**
 * Hand-marked paper ballots are post-processed by Paged.js on a per-ballot basis and rendered to a
 * target element. useCreateHmpbTargetElements creates a set of target elements, one for every
 * hand-marked paper ballot. In the past, we rendered all test deck hand-marked paper ballots to
 * the same target element, but this occasionally resulted in a misordered test deck.
 *
 * We render the target elements separate from HandMarkedPaperBallot and in this unconventional way
 * because we need each target element to 1) exist before the corresponding HandMarkedPaperBallot
 * is rendered and 2) be unaffected by HandMarkedPaperBallot's React lifecycle.
 */
function useCreateHmpbTargetElements({
  containerRef,
  election,
  precinctId,
  printingHandMarkedPaperBallots,
}: {
  containerRef?: React.RefObject<HTMLElement>;
  election: Election;
  precinctId: PrecinctId;
  printingHandMarkedPaperBallots: boolean;
}) {
  const [
    hmpbTargetElementsCreatedForPrecinctId,
    setHmpbTargetElementsCreatedForPrecinctId,
  ] = useState<string>();

  useEffect(() => {
    const container = containerRef?.current;

    if (container && printingHandMarkedPaperBallots) {
      const numBallots = generateHandMarkedPaperBallots({
        election,
        precinctId,
      }).length;
      for (let i = 0; i < numBallots; i += 1) {
        const hmpbTargetElement = document.createElement('div');
        hmpbTargetElement.id = generateHmpbTargetElementId(i);
        container.appendChild(hmpbTargetElement);
      }
      setHmpbTargetElementsCreatedForPrecinctId(precinctId);
    }

    // Cleanup action: Clear the created elements
    return () => {
      if (container) {
        container.innerHTML = '';
        setHmpbTargetElementsCreatedForPrecinctId(undefined);
      }
    };
  }, [containerRef, election, precinctId, printingHandMarkedPaperBallots]);

  return { hmpbTargetElementsCreatedForPrecinctId };
}

// FIXME: We're using `React.memo` to prevent re-rendering `TestDeckBallots`,
// but this is explicitly against the React docs: https://reactjs.org/docs/react-api.html#reactmemo
//
// > This method only exists as a performance optimization. Do not rely on it to
// > “prevent” a render, as this can lead to bugs.
//
// What happens if we remove `React.memo`? See https://github.com/votingworks/vxsuite/issues/1416.
// We need to figure out a better way to handle renders that happen at times we
// don't expect, not by preventing them but by being resilient to them.
//
// https://github.com/votingworks/vxsuite/issues/1531
const BmdPaperBallotsMemoized = React.memo(BmdPaperBallots);
const HandMarkedPaperBallotsMemoized = React.memo(HandMarkedPaperBallots);

interface PrintingModalProps {
  advancePrinting: () => void;
  currentPrecinct: Precinct;
  election: Election;
  precinctIds: string[];
  printIndex: PrintIndex;
}

function PrintingModal({
  advancePrinting,
  currentPrecinct,
  election,
  precinctIds,
  printIndex,
}: PrintingModalProps): JSX.Element {
  if (printIndex.component === 'PaperChangeModal') {
    return (
      <Modal
        centerContent
        content={
          <Prose textCenter>
            <h1>Change Paper</h1>
            <p>
              Load printer with{' '}
              <strong>
                {getBallotLayoutPageSizeReadableString(election)}-size paper
              </strong>
              .
            </p>
          </Prose>
        }
        actions={
          <Button onPress={advancePrinting} primary>
            {getBallotLayoutPageSizeReadableString(election, {
              capitalize: true,
            })}{' '}
            Paper Loaded, Continue Printing
          </Button>
        }
      />
    );
  }
  return (
    <Modal
      centerContent
      content={
        <Prose textCenter>
          <p>
            <Loading as="strong" wrapInProse={false}>
              {`Printing L&A Package for ${currentPrecinct.name}`}
            </Loading>
          </p>
          {precinctIds.length > 1 && (
            <p>
              This is package {printIndex.precinctIndex + 1} of{' '}
              {precinctIds.length}.
            </p>
          )}
          {getBallotLayoutPageSize(election) !== BallotPaperSize.Letter && (
            <p>
              {printIndex.component === 'HandMarkedPaperBallots'
                ? `Currently printing ${getBallotLayoutPageSizeReadableString(
                    election
                  )}-size pages.`
                : 'Currently printing letter-size pages.'}
            </p>
          )}
        </Prose>
      }
    />
  );
}

interface PrintIndex {
  precinctIndex: number;
  component:
    | 'TallyReport'
    | 'BmdPaperBallots'
    | 'PaperChangeModal'
    | 'HandMarkedPaperBallots';
}

export function PrintTestDeckScreen(): JSX.Element {
  const makeCancelable = useCancelablePromise();
  const { electionDefinition, printer, auth, logger, printBallotRef } =
    useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth) || isSystemAdministratorAuth(auth)); // TODO(auth) should this check for a specific user type
  const userRole = auth.user.role;
  const { election, electionHash } = electionDefinition;
  const [precinctIds, setPrecinctIds] = useState<string[]>([]);
  const [printIndex, setPrintIndex] = useState<PrintIndex>();

  const pageTitle = 'Precinct L&A Packages';

  function generatePrecinctIds(precinctId: string): string[] {
    if (precinctId === 'all') {
      const sortedPrecincts = [...election.precincts].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {
          ignorePunctuation: true,
        })
      );
      return sortedPrecincts.map((p) => p.id);
    }

    return [precinctId];
  }

  const advancePrinting = useCallback(() => {
    if (!printIndex) {
      return;
    }
    const { component, precinctIndex } = printIndex;

    const areHandMarkedPaperBallotsLetterSize =
      getBallotLayoutPageSize(election) === BallotPaperSize.Letter;
    const isLastPrecinct = precinctIndex === precinctIds.length - 1;

    let nextPrecinctIndex = precinctIndex;
    let nextComponent = component;
    let endPrinting = false;

    // Full collation: If all content is letter-size, print tally reports, BMD paper ballots, and
    // hand-marked paper ballots grouped by precinct
    if (areHandMarkedPaperBallotsLetterSize) {
      if (component === 'TallyReport') {
        nextComponent = 'BmdPaperBallots';
      } else if (component === 'BmdPaperBallots') {
        nextComponent = 'HandMarkedPaperBallots';
      } else if (component === 'HandMarkedPaperBallots') {
        if (!isLastPrecinct) {
          nextPrecinctIndex = precinctIndex + 1;
          nextComponent = 'TallyReport';
        } else {
          endPrinting = true;
        }
      }
    }

    // Best-effort collation: If hand-marked paper ballots are not letter-size, print tally reports
    // and BMD paper ballots grouped by precinct. Then prompt the election official to change paper,
    // and print hand-marked paper ballots grouped by precinct
    if (!areHandMarkedPaperBallotsLetterSize) {
      if (component === 'TallyReport') {
        nextComponent = 'BmdPaperBallots';
      } else if (component === 'BmdPaperBallots') {
        if (!isLastPrecinct) {
          nextPrecinctIndex = precinctIndex + 1;
          nextComponent = 'TallyReport';
        } else {
          nextComponent = 'PaperChangeModal';
        }
      } else if (component === 'PaperChangeModal') {
        nextPrecinctIndex = 0;
        nextComponent = 'HandMarkedPaperBallots';
      } else if (component === 'HandMarkedPaperBallots') {
        if (!isLastPrecinct) {
          nextPrecinctIndex = precinctIndex + 1;
        } else {
          endPrinting = true;
        }
      }
    }

    if (endPrinting) {
      setPrintIndex(undefined);
      setPrecinctIds([]);
    } else {
      setPrintIndex({
        precinctIndex: nextPrecinctIndex,
        component: nextComponent,
      });
    }
  }, [election, precinctIds.length, printIndex]);

  async function startPrint(precinctId: string) {
    if (window.kiosk) {
      const printers = await window.kiosk.getPrinterInfo();
      if (printers.some((p) => p.connected)) {
        setPrecinctIds(generatePrecinctIds(precinctId));
        setPrintIndex({ precinctIndex: 0, component: 'TallyReport' });
      } else {
        // eslint-disable-next-line no-alert
        window.alert('Please connect the printer.');
        await logger.log(LogEventId.TestDeckPrinted, userRole, {
          disposition: 'failure',
          message: `Failed to print L&A Package: no printer connected.`,
          result: 'User shown error message, asked to try again.',
          error: 'No printer connected.',
        });
      }
    } else {
      setPrecinctIds(generatePrecinctIds(precinctId));
      setPrintIndex({ precinctIndex: 0, component: 'TallyReport' });
    }
  }

  const onPrecinctTallyReportRendered = useCallback(
    async (numPages) => {
      if (!printIndex) {
        return;
      }

      const precinctId = precinctIds[printIndex.precinctIndex];
      await printer.print({ sides: 'one-sided' });
      await logger.log(LogEventId.TestDeckTallyReportPrinted, userRole, {
        disposition: 'success',
        message: `Test deck tally report printed as part of L&A package for precinct ID: ${precinctId}`,
        precinctId,
      });

      await makeCancelable(sleep(numPages * ONE_SIDED_PAGE_PRINT_TIME_MS));
      advancePrinting();
    },
    [
      advancePrinting,
      printIndex,
      printer,
      logger,
      userRole,
      precinctIds,
      makeCancelable,
    ]
  );

  const onAllBmdPaperBallotsRendered = useCallback(
    async (numBallots) => {
      if (!printIndex) {
        return;
      }

      const precinctId = precinctIds[printIndex.precinctIndex];
      await printer.print({ sides: 'one-sided' });
      await logger.log(LogEventId.TestDeckPrinted, userRole, {
        disposition: 'success',
        message: `BMD paper ballot test deck printed as part of L&A package for precinct ID: ${precinctId}`,
        precinctId,
      });

      await makeCancelable(sleep(numBallots * ONE_SIDED_PAGE_PRINT_TIME_MS));
      advancePrinting();
    },
    [
      advancePrinting,
      userRole,
      logger,
      makeCancelable,
      precinctIds,
      printer,
      printIndex,
    ]
  );

  const onAllHandMarkedPaperBallotsRendered = useCallback(
    async (numBallots) => {
      if (!printIndex) {
        return;
      }

      const precinctId = precinctIds[printIndex.precinctIndex];
      await printer.print({ sides: 'two-sided-long-edge' });
      await logger.log(LogEventId.TestDeckPrinted, userRole, {
        disposition: 'success',
        message: `Hand-marked paper ballot test deck printed as part of L&A package for precinct ID: ${precinctId}`,
        precinctId,
      });

      if (printIndex.precinctIndex < precinctIds.length - 1) {
        await makeCancelable(sleep(numBallots * TWO_SIDED_PAGE_PRINT_TIME_MS));
      } else {
        // For the last print job, rather than waiting for all pages to finish printing, free up
        // the UI from the print modal earlier
        await makeCancelable(sleep(LAST_PRINT_JOB_SLEEP_MS));
      }
      advancePrinting();
    },
    [
      advancePrinting,
      printIndex,
      printer,
      logger,
      userRole,
      precinctIds,
      makeCancelable,
    ]
  );

  const currentPrecinctId = printIndex
    ? precinctIds[printIndex.precinctIndex]
    : '';
  const currentPrecinct: Precinct | undefined = printIndex
    ? getPrecinctById({
        election,
        precinctId: currentPrecinctId,
      })
    : undefined;

  const { hmpbTargetElementsCreatedForPrecinctId } =
    useCreateHmpbTargetElements({
      containerRef: printBallotRef,
      election,
      precinctId: currentPrecinctId,
      printingHandMarkedPaperBallots:
        printIndex?.component === 'HandMarkedPaperBallots',
    });

  return (
    <React.Fragment>
      {printIndex && currentPrecinct && (
        <PrintingModal
          advancePrinting={advancePrinting}
          currentPrecinct={currentPrecinct}
          election={election}
          precinctIds={precinctIds}
          printIndex={printIndex}
        />
      )}
      <NavigationScreen>
        <Prose maxWidth={false}>
          <h1>{pageTitle}</h1>

          <p>
            Print the L&A Packages for all precincts, or for a specific
            precinct, by selecting a button below.
          </p>
          <HorizontalRule />
          <p>Each Precinct L&A Package prints:</p>
          <ol>
            <li>
              A Precinct Tally Report — the expected results of the precinct.
            </li>
            <li>Pre-voted VxMark test ballots.</li>
            <li>Pre-voted hand-marked test ballots.</li>
            <li>
              Two blank hand-marked test ballots — one remains blank, one is
              hand-marked by an election official to replace a pre-voted
              hand-marked test ballot.
            </li>
            <li>One overvoted hand-marked test ballot.</li>
          </ol>
          <HorizontalRule />
        </Prose>
        <p>
          <Button onPress={() => startPrint('all')} fullWidth>
            <strong>Print Packages for All Precincts</strong>
          </Button>
        </p>
        <ButtonList>
          {[...election.precincts]
            .sort((a, b) =>
              a.name.localeCompare(b.name, undefined, {
                ignorePunctuation: true,
              })
            )
            .map((p) => (
              <Button key={p.id} onPress={() => startPrint(p.id)} fullWidth>
                {p.name}
              </Button>
            ))}
        </ButtonList>
      </NavigationScreen>
      {printIndex?.component === 'TallyReport' && (
        <PrecinctTallyReport
          election={election}
          precinctId={currentPrecinctId}
          onRendered={onPrecinctTallyReportRendered}
        />
      )}
      {printIndex?.component === 'BmdPaperBallots' && (
        <BmdPaperBallotsMemoized
          electionDefinition={electionDefinition}
          onAllRendered={onAllBmdPaperBallotsRendered}
          precinctId={precinctIds[printIndex.precinctIndex]}
        />
      )}
      {printIndex?.component === 'HandMarkedPaperBallots' &&
        hmpbTargetElementsCreatedForPrecinctId === currentPrecinctId && (
          <HandMarkedPaperBallotsMemoized
            election={election}
            electionHash={electionHash}
            precinctId={currentPrecinctId}
            onAllRendered={onAllHandMarkedPaperBallotsRendered}
          />
        )}
    </React.Fragment>
  );
}
