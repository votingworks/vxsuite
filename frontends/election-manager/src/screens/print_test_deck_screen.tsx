import React, { useState, useContext, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Election,
  getPrecinctById,
  PrecinctId,
  VotesDict,
} from '@votingworks/types';
import { assert, sleep } from '@votingworks/utils';
import { LogEventId } from '@votingworks/logging';
import { Modal } from '@votingworks/ui';
import { routerPaths } from '../router_paths';

import { AppContext } from '../contexts/app_context';

import { Button } from '../components/button';
import { ButtonList } from '../components/button_list';
import { Prose } from '../components/prose';
import { Loading } from '../components/loading';

import { NavigationScreen } from '../components/navigation_screen';
import { LinkButton } from '../components/link_button';
import { PrecinctReportScreenProps } from '../config/types';

import { HandMarkedPaperBallot } from '../components/hand_marked_paper_ballot';

import { generateTestDeckBallots } from '../utils/election';

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

  let numRendered = 0;
  async function onRendered() {
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

const TestDeckBallotsMemoized = React.memo(TestDeckBallots);

export function PrintTestDeckScreen(): JSX.Element {
  const {
    electionDefinition,
    printer,
    currentUserSession,
    logger,
  } = useContext(AppContext);
  assert(electionDefinition);
  assert(currentUserSession); // TODO(auth)
  const currentUserType = currentUserSession.type;
  const { election, electionHash } = electionDefinition;
  const [precinctIds, setPrecinctIds] = useState<string[]>([]);
  const [precinctIndex, setPrecinctIndex] = useState<number>();

  const {
    precinctId: precinctIdFromParams = '',
  } = useParams<PrecinctReportScreenProps>();
  const precinctId = precinctIdFromParams.trim();

  const pageTitle = 'Test Deck';
  const precinctName =
    precinctId === 'all'
      ? 'All Precincts'
      : getPrecinctById({ election, precinctId })?.name;

  useEffect(() => {
    if (precinctId) {
      const sortedPrecincts = [...election.precincts].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {
          ignorePunctuation: true,
        })
      );
      const newPrecinctIds =
        precinctId === 'all' ? sortedPrecincts.map((p) => p.id) : [precinctId];
      setPrecinctIds(newPrecinctIds);
    } else {
      setPrecinctIds([]);
      setPrecinctIndex(undefined);
    }
  }, [precinctId, election.precincts]);

  async function startPrint() {
    if (window.kiosk) {
      const printers = await window.kiosk.getPrinterInfo();
      if (printers.some((p) => p.connected)) {
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
      setPrecinctIndex(0);
    }
  }

  const onAllRendered = useCallback(
    async (pIndex, numBallots) => {
      await printer.print({ sides: 'two-sided-long-edge' });
      await logger.log(LogEventId.TestDeckPrinted, currentUserType, {
        disposition: 'success',
        message: `Test Deck printed for precinct id: ${precinctIds[pIndex]}`,
        precinctId: precinctIds[pIndex],
      });

      if (pIndex < precinctIds.length - 1) {
        // wait 5s per ballot printed
        // that's how long printing takes in duplex, no reason to get ahead of it.
        await sleep(numBallots * 5000);
        setPrecinctIndex(pIndex + 1);
      } else {
        await sleep(3000);
        setPrecinctIndex(undefined);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setPrecinctIndex, precinctIds]
  );

  const currentPrecinct =
    precinctIndex === undefined
      ? undefined
      : getPrecinctById({ election, precinctId: precinctIds[precinctIndex] });

  if (precinctIds.length > 0) {
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
              <strong>Election:</strong> {election.title}
              <br />
              <strong>Precinct:</strong> {precinctName}
            </p>
            <p>
              <Button onPress={startPrint} primary>
                Print Test Deck
              </Button>
            </p>
            <p>
              <LinkButton small to={routerPaths.printTestDecks}>
                Back to Test Deck list
              </LinkButton>
            </p>
          </Prose>
        </NavigationScreen>
        {precinctIndex !== undefined && (
          <TestDeckBallotsMemoized
            election={election}
            electionHash={electionHash}
            precinctId={precinctIds[precinctIndex]}
            onAllRendered={(numBallots) =>
              onAllRendered(precinctIndex, numBallots)
            }
          />
        )}
      </React.Fragment>
    );
  }

  return (
    <NavigationScreen>
      <Prose>
        <h1>{pageTitle}</h1>
        <p>
          Select desired precinct for <strong>{election.title}</strong>.
        </p>
      </Prose>
      <p>
        <LinkButton
          to={routerPaths.printOneTestDeck({ precinctId: 'all' })}
          fullWidth
        >
          <strong>All Precincts</strong>
        </LinkButton>
      </p>
      <ButtonList>
        {[...election.precincts]
          .sort((a, b) =>
            a.name.localeCompare(b.name, undefined, {
              ignorePunctuation: true,
            })
          )
          .map((p) => (
            <LinkButton
              key={p.id}
              to={routerPaths.printOneTestDeck({ precinctId: p.id })}
              fullWidth
            >
              {p.name}
            </LinkButton>
          ))}
      </ButtonList>
    </NavigationScreen>
  );
}
