import React, { useState, useContext, useCallback, useEffect } from 'react';
import {
  Election,
  getPrecinctById,
  PrecinctId,
  VotesDict,
  Tally,
  VotingMethod,
} from '@votingworks/types';
import { assert, sleep, tallyVotesByContest } from '@votingworks/utils';
import { LogEventId } from '@votingworks/logging';

import { useCancelablePromise, Modal, Prose } from '@votingworks/ui';

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

interface PrecinctTallyReportParams {
  election: Election;
  precinctId: PrecinctId;
  onRendered: (numPages: number) => void;
}

function PrecinctTallyReport({
  election,
  precinctId,
  onRendered,
}: PrecinctTallyReportParams) {
  const ballots = generateTestDeckBallots({ election, precinctId });

  const votes: VotesDict[] = ballots.map((b) => b.votes as VotesDict);
  const testDeckTally: Tally = {
    numberOfBallotsCounted: ballots.length,
    castVoteRecords: new Set(),
    contestTallies: tallyVotesByContest({
      election,
      votes,
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

interface HandMarkedPaperBallotsParams {
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
}: HandMarkedPaperBallotsParams) {
  const ballots = generateTestDeckBallots({ election, precinctId });
  ballots.push(...generateBlankBallots({ election, precinctId, numBlanks: 2 }));

  const overvoteBallot = generateOvervoteBallot({ election, precinctId });
  if (overvoteBallot) ballots.push(overvoteBallot);

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
          ballotStyleId={ballot.ballotStyleId as string}
          election={election}
          electionHash={electionHash}
          isLiveMode={false}
          isAbsentee={false}
          precinctId={ballot.precinctId as string}
          locales={{ primary: 'en-US' }}
          votes={ballot.votes as VotesDict}
          onRendered={() => onRendered()}
        />
      ))}
    </div>
  );
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
const HandMarkedPaperBallotsMemoized = React.memo(HandMarkedPaperBallots);

interface PrintIndex {
  precinctIndex: number;
  component: string;
}

export function PrintTestDeckScreen(): JSX.Element {
  const makeCancelable = useCancelablePromise();
  const { electionDefinition, printer, currentUserSession, logger } =
    useContext(AppContext);
  assert(electionDefinition);
  assert(currentUserSession); // TODO(auth)
  const currentUserType = currentUserSession.type;
  const { election, electionHash } = electionDefinition;
  const [precinctIds, setPrecinctIds] = useState<string[]>([]);
  const [printIndex, setPrintIndex] = useState<PrintIndex | undefined>();

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
        setPrintIndex({ precinctIndex: 0, component: 'tally' });
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
      setPrintIndex({ precinctIndex: 0, component: 'tally' });
    }
  }

  const onPrecinctTallyReportRendered = useCallback(
    async (numPages) => {
      if (!printIndex) {
        return;
      }

      await printer.print({ sides: 'one-sided' });
      await logger.log(LogEventId.TestDeckTallyReportPrinted, currentUserType, {
        disposition: 'success',
        message: `Test deck tally report printed as part of L&A package for precinct id: ${
          precinctIds[printIndex.precinctIndex]
        }`,
        precinctId: precinctIds[printIndex.precinctIndex],
      });

      await makeCancelable(sleep(numPages * 3000));
      setPrintIndex({
        precinctIndex: printIndex.precinctIndex,
        component: 'hmpb',
      });
    },
    [printIndex, printer, logger, currentUserType, precinctIds, makeCancelable]
  );

  const onAllHandMarkedPaperBallotsRendered = useCallback(
    async (numBallots) => {
      if (!printIndex) {
        return;
      }

      await printer.print({ sides: 'two-sided-long-edge' });
      await logger.log(LogEventId.TestDeckPrinted, currentUserType, {
        disposition: 'success',
        message: `Hand-marked paper ballot test deck printed as part of L&A package for precinct id: ${
          precinctIds[printIndex.precinctIndex]
        }`,
        precinctId: precinctIds[printIndex.precinctIndex],
      });

      if (printIndex.precinctIndex < precinctIds.length - 1) {
        // wait 5s per ballot printed
        // that's how long printing takes in duplex, no reason to get ahead of it.
        await makeCancelable(sleep(numBallots * 5000));
        setPrintIndex({
          precinctIndex: printIndex.precinctIndex + 1,
          component: 'tally',
        });
      } else {
        await makeCancelable(sleep(3000));
        setPrintIndex(undefined);
        setPrecinctIds([]);
      }
    },
    [printIndex, printer, logger, currentUserType, precinctIds, makeCancelable]
  );

  const currentPrecinct =
    printIndex === undefined
      ? undefined
      : getPrecinctById({
          election,
          precinctId: precinctIds[printIndex.precinctIndex],
        });

  return (
    <React.Fragment>
      {printIndex !== undefined && currentPrecinct && (
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
      {printIndex !== undefined &&
        (printIndex.component === 'tally' ? (
          <PrecinctTallyReport
            election={election}
            precinctId={precinctIds[printIndex.precinctIndex]}
            onRendered={onPrecinctTallyReportRendered}
          />
        ) : (
          <HandMarkedPaperBallotsMemoized
            election={election}
            electionHash={electionHash}
            precinctId={precinctIds[printIndex.precinctIndex]}
            onAllRendered={onAllHandMarkedPaperBallotsRendered}
          />
        ))}
    </React.Fragment>
  );
}
