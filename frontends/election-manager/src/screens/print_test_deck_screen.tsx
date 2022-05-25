import React, { useState, useContext, useCallback, useEffect } from 'react';
import {
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

const ONE_SIDED_PAGE_PRINT_TIME_MS = 3000;
const TWO_SIDED_PAGE_PRINT_TIME_MS = 5000;
const LAST_PRINT_JOB_SLEEP_MS = 5000;

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
  const ballots = [
    // Account for both the BMD and HMPB test decks
    ...generateTestDeckBallots({ election, precinctId }),
    ...generateTestDeckBallots({ election, precinctId }),
  ];

  const testDeckTally: Tally = {
    numberOfBallotsCounted: ballots.length,
    castVoteRecords: new Set(),
    contestTallies: tallyVotesByContest({
      election,
      votes: ballots.map((b) => b.votes),
    }),
    ballotCountsByVotingMethod: { [VotingMethod.Unknown]: ballots.length },
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

  useEffect(() => {
    onAllRendered(ballots.length);
  }, [ballots, onAllRendered]);

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
          isLiveMode={false}
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
  const [hmpbTargetElementsCreated, setHmpbTargetElementsCreated] =
    useState(false);

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
      setHmpbTargetElementsCreated(true);
    }

    // Cleanup action: Clear the created elements
    return () => {
      if (container) {
        container.innerHTML = '';
        setHmpbTargetElementsCreated(false);
      }
    };
  }, [containerRef, election, precinctId, printingHandMarkedPaperBallots]);

  return { hmpbTargetElementsCreated };
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

interface PrintIndex {
  precinctIndex: number;
  component: 'TallyReport' | 'BmdPaperBallots' | 'HandMarkedPaperBallots';
}

export function PrintTestDeckScreen(): JSX.Element {
  const makeCancelable = useCancelablePromise();
  const {
    electionDefinition,
    printer,
    currentUserSession,
    logger,
    printBallotRef,
  } = useContext(AppContext);
  assert(electionDefinition);
  assert(currentUserSession); // TODO(auth)
  const currentUserType = currentUserSession.type;
  const { election, electionHash } = electionDefinition;
  const [precinctIds, setPrecinctIds] = useState<string[]>([]);
  const [printIndex, setPrintIndex] = useState<PrintIndex>();

  const pageTitle = 'L&A Packages';

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

  async function startPrint(precinctId: string) {
    if (window.kiosk) {
      const printers = await window.kiosk.getPrinterInfo();
      if (printers.some((p) => p.connected)) {
        setPrecinctIds(generatePrecinctIds(precinctId));
        setPrintIndex({ precinctIndex: 0, component: 'TallyReport' });
      } else {
        // eslint-disable-next-line no-alert
        window.alert('please connect the printer.');
        await logger.log(LogEventId.TestDeckPrinted, currentUserType, {
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
      await logger.log(LogEventId.TestDeckTallyReportPrinted, currentUserType, {
        disposition: 'success',
        message: `Test deck tally report printed as part of L&A package for precinct ID: ${precinctId}`,
        precinctId,
      });

      await makeCancelable(sleep(numPages * ONE_SIDED_PAGE_PRINT_TIME_MS));
      setPrintIndex({
        precinctIndex: printIndex.precinctIndex,
        component: 'BmdPaperBallots',
      });
    },
    [printIndex, printer, logger, currentUserType, precinctIds, makeCancelable]
  );

  const onAllBmdPaperBallotsRendered = useCallback(
    async (numBallots) => {
      if (!printIndex) {
        return;
      }

      const precinctId = precinctIds[printIndex.precinctIndex];
      await printer.print({ sides: 'one-sided' });
      await logger.log(LogEventId.TestDeckPrinted, currentUserType, {
        disposition: 'success',
        message: `BMD paper ballot test deck printed as part of L&A package for precinct ID: ${precinctId}`,
        precinctId,
      });

      await makeCancelable(sleep(numBallots * ONE_SIDED_PAGE_PRINT_TIME_MS));
      setPrintIndex({
        precinctIndex: printIndex.precinctIndex,
        component: 'HandMarkedPaperBallots',
      });
    },
    [currentUserType, logger, makeCancelable, precinctIds, printer, printIndex]
  );

  const onAllHandMarkedPaperBallotsRendered = useCallback(
    async (numBallots) => {
      if (!printIndex) {
        return;
      }

      const precinctId = precinctIds[printIndex.precinctIndex];
      await printer.print({ sides: 'two-sided-long-edge' });
      await logger.log(LogEventId.TestDeckPrinted, currentUserType, {
        disposition: 'success',
        message: `Hand-marked paper ballot test deck printed as part of L&A package for precinct ID: ${precinctId}`,
        precinctId,
      });

      if (printIndex.precinctIndex < precinctIds.length - 1) {
        await makeCancelable(sleep(numBallots * TWO_SIDED_PAGE_PRINT_TIME_MS));
        setPrintIndex({
          precinctIndex: printIndex.precinctIndex + 1,
          component: 'TallyReport',
        });
      } else {
        // For the last print job, rather than waiting for all pages to finish printing, free up
        // the UI from the print modal earlier
        await makeCancelable(sleep(LAST_PRINT_JOB_SLEEP_MS));
        setPrintIndex(undefined);
        setPrecinctIds([]);
      }
    },
    [printIndex, printer, logger, currentUserType, precinctIds, makeCancelable]
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

  const { hmpbTargetElementsCreated } = useCreateHmpbTargetElements({
    containerRef: printBallotRef,
    election,
    precinctId: currentPrecinctId,
    printingHandMarkedPaperBallots:
      printIndex?.component === 'HandMarkedPaperBallots',
  });

  return (
    <React.Fragment>
      {printIndex && currentPrecinct && (
        <Modal
          centerContent
          content={
            <Loading as="p">
              Printing L&amp;A Package
              {precinctIds.length > 1
                ? ` (${printIndex.precinctIndex + 1} of ${precinctIds.length})`
                : ''}
              : {currentPrecinct.name}
            </Loading>
          }
        />
      )}
      <NavigationScreen>
        <Prose>
          <h1>{pageTitle}</h1>
          <p>
            Select desired precinct for <strong>{election.title}</strong>.
          </p>
        </Prose>
        <p>
          <Button onPress={() => startPrint('all')} fullWidth>
            <strong>All Precincts</strong>
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
        hmpbTargetElementsCreated && (
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
