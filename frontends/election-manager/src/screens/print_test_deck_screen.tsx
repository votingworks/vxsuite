import React, { useState, useContext, useCallback } from 'react';
import {
  Election,
  getPrecinctById,
  PrecinctId,
  VotesDict,
} from '@votingworks/types';
import { assert, sleep } from '@votingworks/utils';
import { LogEventId } from '@votingworks/logging';

import { useCancelablePromise, Modal, Prose } from '@votingworks/ui';

import { AppContext } from '../contexts/app_context';

import { Button } from '../components/button';
import { ButtonList } from '../components/button_list';
import { Loading } from '../components/loading';

import { NavigationScreen } from '../components/navigation_screen';

import { HandMarkedPaperBallot } from '../components/hand_marked_paper_ballot';

import {
  generateTestDeckBallots,
  generateBlankBallots,
  generateOvervoteBallot,
} from '../utils/election';

interface TestDeckBallotsParams {
  election: Election;
  electionHash: string;
  precinctId: PrecinctId;
  onAllRendered: (numBallots: number) => void;
}

function TestDeckBallots({
  election,
  electionHash,
  precinctId,
  onAllRendered,
}: TestDeckBallotsParams) {
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
const TestDeckBallotsMemoized = React.memo(TestDeckBallots);

export function PrintTestDeckScreen(): JSX.Element {
  const makeCancelable = useCancelablePromise();
  const { electionDefinition, printer, currentUserSession, logger } =
    useContext(AppContext);
  assert(electionDefinition);
  assert(currentUserSession); // TODO(auth)
  const currentUserType = currentUserSession.type;
  const { election, electionHash } = electionDefinition;
  const [precinctIds, setPrecinctIds] = useState<string[]>([]);
  const [precinctIndex, setPrecinctIndex] = useState<number>();

  const pageTitle = 'Test Decks';

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
        setPrecinctIndex(0);
      } else {
        // eslint-disable-next-line no-alert
        window.alert('please connect the printer.');
        await logger.log(LogEventId.TestDeckPrinted, currentUserType, {
          disposition: 'failure',
          message: `Failed to print test deck: no printer connected.`,
          result: 'User shown error message, asked to try again.',
          error: 'No printer connected.',
        });
      }
    } else {
      setPrecinctIds(generatePrecinctIds(precinctId));
      setPrecinctIndex(0);
    }
  }

  const onAllRendered = useCallback(
    async (numBallots) => {
      if (typeof precinctIndex !== 'number') {
        return;
      }

      await printer.print({ sides: 'two-sided-long-edge' });
      await logger.log(LogEventId.TestDeckPrinted, currentUserType, {
        disposition: 'success',
        message: `Test Deck printed for precinct id: ${precinctIds[precinctIndex]}`,
        precinctId: precinctIds[precinctIndex],
      });

      if (precinctIndex < precinctIds.length - 1) {
        // wait 5s per ballot printed
        // that's how long printing takes in duplex, no reason to get ahead of it.
        await makeCancelable(sleep(numBallots * 5000));
        setPrecinctIndex(precinctIndex + 1);
      } else {
        await makeCancelable(sleep(3000));
        setPrecinctIndex(undefined);
        setPrecinctIds([]);
      }
    },
    [
      precinctIndex,
      printer,
      logger,
      currentUserType,
      precinctIds,
      makeCancelable,
    ]
  );

  const currentPrecinct =
    precinctIndex === undefined
      ? undefined
      : getPrecinctById({ election, precinctId: precinctIds[precinctIndex] });

  return (
    <React.Fragment>
      {precinctIndex !== undefined && currentPrecinct && (
        <Modal
          centerContent
          content={
            <Loading as="p">
              Printing Test Deck
              {precinctIds.length > 1
                ? ` (${precinctIndex + 1} of ${precinctIds.length})`
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
      {precinctIndex !== undefined && (
        <TestDeckBallotsMemoized
          election={election}
          electionHash={electionHash}
          precinctId={precinctIds[precinctIndex]}
          onAllRendered={onAllRendered}
        />
      )}
    </React.Fragment>
  );
}
