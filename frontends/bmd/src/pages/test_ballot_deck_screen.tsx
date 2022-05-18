import React, { useState } from 'react';
import pluralize from 'pluralize';

import {
  BallotStyleId,
  Election,
  ElectionDefinition,
  PrecinctId,
  VotesDict,
} from '@votingworks/types';
import {
  BmdPaperBallot,
  Button,
  ButtonList,
  Loading,
  Main,
  Modal,
  Prose,
  Screen,
} from '@votingworks/ui';
import { find, throwIllegalValue, Printer } from '@votingworks/utils';

import {
  EventTargetFunction,
  MachineConfig,
  PrecinctSelection,
} from '../config/types';

import { ElectionInfo } from '../components/election_info';
import { Sidebar } from '../components/sidebar';
import { TEST_DECK_PRINTING_TIMEOUT_SECONDS } from '../config/globals';

interface Ballot {
  ballotId?: string;
  precinctId: PrecinctId;
  ballotStyleId: BallotStyleId;
  votes: VotesDict;
}

interface GenerateTestDeckParams {
  election: Election;
  precinctId?: PrecinctId;
}

function generateTestDeckBallots({
  election,
  precinctId,
}: GenerateTestDeckParams) {
  const precincts: string[] = precinctId
    ? [precinctId]
    : election.precincts.map((p) => p.id);

  const ballots: Ballot[] = [];

  for (const pId of precincts) {
    const precinct = find(election.precincts, (p) => p.id === pId);
    const precinctBallotStyles = election.ballotStyles.filter((bs) =>
      bs.precincts.includes(precinct.id)
    );

    for (const ballotStyle of precinctBallotStyles) {
      const contests = election.contests.filter(
        (c) =>
          ballotStyle.districts.includes(c.districtId) &&
          ballotStyle.partyId === c.partyId
      );

      const numBallots = Math.max(
        ...contests.map((c) => {
          return c.type === 'yesno'
            ? 2
            : c.type === 'candidate'
            ? c.candidates.length
            : c.type === 'ms-either-neither'
            ? 2
            : /* istanbul ignore next - compile time check for completeness */
              throwIllegalValue(c);
        })
      );

      for (let ballotNum = 0; ballotNum < numBallots; ballotNum += 1) {
        const votes: VotesDict = {};
        for (const contest of contests) {
          /* istanbul ignore else */
          if (contest.type === 'yesno') {
            votes[contest.id] = ballotNum % 2 === 0 ? ['yes'] : ['no'];
          } else if (
            contest.type === 'candidate' &&
            contest.candidates.length > 0 // safety check
          ) {
            votes[contest.id] = [
              contest.candidates[ballotNum % contest.candidates.length],
            ];
          } else if (contest.type === 'ms-either-neither') {
            votes[contest.eitherNeitherContestId] =
              ballotNum % 2 === 0 ? ['yes'] : ['no'];
            votes[contest.pickOneContestId] =
              votes[contest.eitherNeitherContestId];
          }
        }
        ballots.push({
          ballotStyleId: ballotStyle.id,
          precinctId: pId,
          votes,
        });
      }
    }
  }

  return ballots;
}

interface Precinct {
  name: string;
  id: string;
}

interface Props {
  appPrecinct?: PrecinctSelection;
  electionDefinition: ElectionDefinition;
  hideTestDeck: () => void;
  isLiveMode: boolean;
  machineConfig: MachineConfig;
  printer: Printer;
}

const initialPrecinct: Precinct = { id: '', name: '' };

export function TestBallotDeckScreen({
  appPrecinct,
  electionDefinition,
  hideTestDeck,
  isLiveMode,
  machineConfig,
  printer,
}: Props): JSX.Element {
  const { election } = electionDefinition;
  const [ballots, setBallots] = useState<Ballot[]>([]);
  const [precinct, setPrecinct] = useState<Precinct>(initialPrecinct);
  const [showPrinterNotConnected, setShowPrinterNotConnected] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const selectPrecinct: EventTargetFunction = (event) => {
    const { id = '', name = '' } = (event.target as HTMLElement).dataset;
    setPrecinct({ name, id });
    const selectedBallots = generateTestDeckBallots({
      election,
      precinctId: id,
    });
    setBallots(selectedBallots);
  };

  function resetDeck() {
    setBallots([]);
    setPrecinct(initialPrecinct);
  }

  async function handlePrinting() {
    if (window.kiosk) {
      const printers = await window.kiosk.getPrinterInfo();
      if (!printers.some((p) => p.connected)) {
        setShowPrinterNotConnected(true);
        return;
      }
    }
    setIsPrinting(true);

    setTimeout(() => {
      setIsPrinting(false);
    }, (ballots.length + TEST_DECK_PRINTING_TIMEOUT_SECONDS) * 1000);

    await printer.print({ sides: 'one-sided' });
  }

  return (
    <React.Fragment>
      <Screen navLeft>
        <Main padded>
          {ballots.length ? (
            <Prose className="no-print">
              <h1>Test Ballot Decks</h1>
              <p>
                Deck containing{' '}
                <strong>{pluralize('ballot', ballots.length, true)}</strong> for{' '}
                {precinct.name}.
              </p>
              <p>
                <Button large primary onPress={handlePrinting}>
                  Print {ballots.length} ballots
                </Button>
              </p>
              <p>
                <Button small onPress={resetDeck}>
                  Back to Precincts List
                </Button>
              </p>
            </Prose>
          ) : (
            <React.Fragment>
              <Prose id="audiofocus">
                <h1>Test Ballot Decks</h1>
                <p>Select desired precinct.</p>
              </Prose>
              <p>
                <Button
                  data-id=""
                  data-name="All Precincts"
                  fullWidth
                  key="all-precincts"
                  onPress={selectPrecinct}
                >
                  <strong>All Precincts</strong>
                </Button>
              </p>
              <ButtonList data-testid="precincts">
                {election.precincts.map((p) => (
                  <Button
                    data-id={p.id}
                    data-name={p.name}
                    fullWidth
                    key={p.id}
                    onPress={selectPrecinct}
                  >
                    {p.name}
                  </Button>
                ))}
              </ButtonList>
            </React.Fragment>
          )}
        </Main>
        <Sidebar
          appName={machineConfig.appMode.productName}
          centerContent
          title="Election Admin Actions"
          footer={
            election && (
              <ElectionInfo
                electionDefinition={electionDefinition}
                precinctSelection={appPrecinct}
                horizontal
              />
            )
          }
        >
          <Button small onPress={hideTestDeck}>
            Back to Admin Dashboard
          </Button>
        </Sidebar>
      </Screen>
      {ballots.length &&
        ballots.map((ballot, i) => (
          <BmdPaperBallot
            // eslint-disable-next-line react/no-array-index-key
            key={`ballot-${i}`}
            ballotStyleId={ballot.ballotStyleId}
            electionDefinition={electionDefinition}
            isLiveMode={isLiveMode}
            precinctId={ballot.precinctId}
            votes={ballot.votes}
          />
        ))}
      {showPrinterNotConnected && (
        <Modal
          centerContent
          content={
            <Prose>
              <h2>The printer is not connected.</h2>
              <p>Please connect the printer and try again.</p>
            </Prose>
          }
          actions={
            <Button onPress={() => setShowPrinterNotConnected(false)}>
              OK
            </Button>
          }
        />
      )}
      {isPrinting && (
        <Modal
          centerContent
          content={
            <Prose textCenter>
              <Loading as="p">Printing Ballots…</Loading>
            </Prose>
          }
        />
      )}
    </React.Fragment>
  );
}
